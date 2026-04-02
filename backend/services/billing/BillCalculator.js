// services/billing/BillCalculator.js
//
// Central billing service — zero HTTP / Express logic.
// Every function is independently unit-testable.
//
// Architecture: Controllers call these helpers. Models stay thin.
// All writes use Mongoose sessions where possible for atomicity.

import mongoose from 'mongoose'
import Bill from '../../models/Bill.js'

// ─── Fee Schedule ─────────────────────────────────────────────────────────────
// Adjust these to match your clinic pricing.
export const CONSULTATION_FEES = {
  'check-up':     500,
  'follow-up':    600,
  'consultation': 800,
  'emergency':   1000,
}

export const DEFAULT_CONSULTATION_FEE = 800

export const LAB_TEST_FEES = {
  // Hematology
  'Full Blood Count':      500,
  'CBC':                   500,
  'Blood Group':           300,
  'ESR':                   400,
  // Biochemistry
  'Liver Function Test':   800,
  'Renal Function Test':   800,
  'Blood Sugar (Fasting)': 400,
  'HbA1c':                 600,
  // Serology
  'HIV Test':              500,
  'Hepatitis B':           600,
  'Malaria Test':          400,
  // Imaging
  'X-Ray':                1500,
  'Ultrasound':           2500,
  'CT Scan':              8000,
  // Fallback
  DEFAULT:                 500
}

// ─── Status Transition Map ────────────────────────────────────────────────────
// Defines which statuses a bill may legally transition INTO from a given state.
// Used by transitionStatus() to enforce the billing state-machine.
const ALLOWED_TRANSITIONS = {
  draft:         ['pending', 'cancelled'],
  pending:       ['partially_paid', 'paid', 'waived', 'cancelled'],
  partially_paid: ['paid', 'waived', 'cancelled'],
  // Terminal states — no further transitions allowed
  paid:          [],
  waived:        [],
  cancelled:     []
}

// ─── Status Transition ────────────────────────────────────────────────────────
/**
 * Safely move a bill to a new status, validating the transition is legal.
 * Throws (does NOT save) if the transition is invalid.
 *
 * @param {import('mongoose').Document} bill
 * @param {string} newStatus
 */
export const transitionStatus = (bill, newStatus) => {
  const allowed = ALLOWED_TRANSITIONS[bill.status] ?? []
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid bill status transition: "${bill.status}" → "${newStatus}". ` +
      `Allowed: [${allowed.join(', ') || 'none'}]`
    )
  }
  bill.status = newStatus
}

// ─── Core Arithmetic ─────────────────────────────────────────────────────────
/**
 * Pure calculation — does NOT touch the database.
 *
 * @param {number} consultationFee
 * @param {number} medicationTotal
 * @param {number} labTestTotal
 * @param {number} [discount=0]
 * @returns {{ consultationFee, medicationTotal, labTestTotal, subtotal, discount, totalAmount, balanceDue }}
 */
export const calculate = (
  consultationFee,
  medicationTotal,
  labTestTotal,
  discount = 0
) => {
  const subtotal    = consultationFee + medicationTotal + labTestTotal
  const totalAmount = Math.max(0, subtotal - discount)
  return { consultationFee, medicationTotal, labTestTotal, subtotal, discount, totalAmount, balanceDue: totalAmount }
}

// ─── Recompute from Line Items ────────────────────────────────────────────────
/**
 * Recalculate all totals on a Bill document from its lineItems array.
 * Mutates the Mongoose document in-place — call bill.save() afterwards.
 *
 * @param {import('mongoose').Document} bill
 */
export const recompute = (bill) => {
  bill.consultationFee = _sumByType(bill.lineItems, 'consultation')
  bill.medicationTotal = _sumByType(bill.lineItems, 'medication')
  bill.labTotal        = _sumByType(bill.lineItems, 'lab')
  bill.subtotal        = bill.consultationFee + bill.medicationTotal + bill.labTotal
  bill.totalAmount     = Math.max(0, bill.subtotal - (bill.discount || 0))
  bill.balanceDue      = Math.max(0, bill.totalAmount - (bill.amountPaid || 0))
}

// ─── Add Line Item ────────────────────────────────────────────────────────────
/**
 * Append a single charge to a bill, recompute totals, and persist.
 *
 * Guards against:
 *   1. Non-draft bills (throws — use forceAddLineItem for post-finalization)
 *   2. Duplicate referenceId+type combos (idempotent — skips silently)
 *
 * @param {import('mongoose').Document} bill  Mongoose Bill document (not lean)
 * @param {{ type, description, quantity, unitCost, referenceId? }} item
 * @param {{ allowPostFinalization?: boolean }} [opts]
 * @returns {Promise<import('mongoose').Document>}  saved bill
 */
export const addLineItem = async (
  bill,
  { type, description, quantity = 1, unitCost, referenceId = null },
  { allowPostFinalization = false } = {}
) => {
  if (!bill) throw new Error('BillCalculator.addLineItem: bill document is required')
  if (!['consultation', 'medication', 'lab'].includes(type)) {
    throw new Error(`BillCalculator.addLineItem: invalid type "${type}"`)
  }
  if (unitCost === null || unitCost === undefined || isNaN(unitCost)) {
    throw new Error('BillCalculator.addLineItem: unitCost must be a number')
  }

  // ── Editable guard ────────────────────────────────────────────────────────
  if (!bill.isEditable() && !allowPostFinalization) {
    throw new Error(
      `Bill ${bill.billNumber} is "${bill.status}" and cannot accept new line items ` +
      `(only draft bills are editable). Use allowPostFinalization=true for pharmacy charges.`
    )
  }

  // ── Duplicate guard ───────────────────────────────────────────────────────
  // Prevents double-charging (e.g., pharmacy staff calling dispense twice).
  if (referenceId && bill.hasLineItemForRef(referenceId, type)) {
    console.log(
      `ℹ️  BillCalculator: skipping duplicate ${type} charge for ref ${referenceId} ` +
      `on bill ${bill.billNumber}`
    )
    return bill  // idempotent — return unchanged
  }

  const totalCost = Math.max(0, quantity * unitCost)
  bill.lineItems.push({ type, description, quantity, unitCost, totalCost, referenceId, addedAt: new Date() })

  recompute(bill)
  return bill.save()
}

// ─── Apply Payment ────────────────────────────────────────────────────────────
/**
 * Record a payment against the bill and update status accordingly.
 * Called from the M-Pesa callback handler.
 *
 * Supports partial payments: if balanceDue > 0 after applying, status = 'partially_paid'.
 *
 * @param {import('mongoose').Document} bill
 * @param {number}                       amount       Amount confirmed by M-Pesa
 * @param {string}                       paymentId    Payment._id to push into bill.payments
 * @returns {Promise<import('mongoose').Document>}
 */
export const applyPayment = async (bill, amount, paymentId) => {
  if (!bill) throw new Error('BillCalculator.applyPayment: bill document is required')
  if (!amount || amount <= 0) throw new Error('BillCalculator.applyPayment: amount must be > 0')

  bill.amountPaid = (bill.amountPaid || 0) + amount
  bill.balanceDue = Math.max(0, bill.totalAmount - bill.amountPaid)

  // Determine new status (validate against transition map)
  const nextStatus = bill.balanceDue === 0 ? 'paid' : 'partially_paid'
  try {
    transitionStatus(bill, nextStatus)
  } catch {
    // If the bill is already "paid" and a duplicate callback arrives, skip gracefully
    if (bill.status === 'paid') {
      console.warn(`⚠️  applyPayment: bill ${bill.billNumber} is already paid — skipping duplicate callback`)
      return bill
    }
    throw new Error(`Cannot apply payment to a "${bill.status}" bill`)
  }

  if (bill.status === 'paid') bill.paidAt = new Date()

  if (paymentId && !bill.payments.map(String).includes(String(paymentId))) {
    bill.payments.push(paymentId)
  }

  return bill.save()
}

// ─── Finalize Bill ────────────────────────────────────────────────────────────
/**
 * Lock a bill (draft → pending) when the doctor finalises the session.
 * Also links the medicalRecord reference.
 * Idempotent: already-pending bills are returned as-is.
 *
 * @param {import('mongoose').Document} bill
 * @param {string} [medicalRecordId]
 * @returns {Promise<import('mongoose').Document>}
 */
export const finalizeBill = async (bill, medicalRecordId) => {
  if (!bill) throw new Error('BillCalculator.finalizeBill: bill document is required')

  if (bill.status !== 'draft') {
    // Idempotent: already finalised — return as-is
    console.log(`ℹ️  BillCalculator.finalizeBill: bill ${bill.billNumber} is already "${bill.status}" — no-op`)
    return bill
  }

  recompute(bill)           // ensure totals are current before locking
  transitionStatus(bill, 'pending')
  if (medicalRecordId) bill.medicalRecord = medicalRecordId
  bill.finalizedAt = new Date()

  return bill.save()
}

// ─── Billing Event Hooks ──────────────────────────────────────────────────────
// These are the four lifecycle events the system cares about.
// Each hook is safe to call multiple times (idempotent).
//
// Usage in controllers:
//   import BillingEvents from '../services/billing/BillCalculator.js'
//   await BillingEvents.onSessionStart({ appointmentId, sessionId, doctorId, appointmentType })
//   await BillingEvents.onLabRequested({ appointmentId, labRequestId, testNames, estimatedCost })
//   await BillingEvents.onPharmacyDispense({ appointmentId, prescriptionId, medications })
//   await BillingEvents.onSessionComplete({ appointmentId, medicalRecordId })

/**
 * EVENT: Doctor opens a session.
 * Creates a Bill in "draft" status with the consultation fee pre-loaded.
 * Safe to call on session resume — returns the existing bill without changes.
 *
 * @param {{ appointmentId, sessionId?, doctorId, patientId, appointmentType? }} params
 * @returns {Promise<{ bill, created: boolean }>}
 */
export const onSessionStart = async ({ appointmentId, sessionId, doctorId, patientId, appointmentType }) => {
  if (!appointmentId) throw new Error('BillingEvents.onSessionStart: appointmentId required')

  // ── Idempotency guard ──────────────────────────────────────────────────────
  const existing = await Bill.findOne({ appointment: appointmentId })
  if (existing) {
    console.log(`ℹ️  Bill ${existing.billNumber} already exists for appointment ${appointmentId}`)
    return { bill: existing, created: false }
  }

  const fee = resolveConsultationFee(appointmentType)

  let bill

  try {
    bill = await Bill.create({
      patient:     patientId,
      doctor:      doctorId,
      appointment: appointmentId,
      session:     sessionId || null,
      lineItems: [{
        type:        'consultation',
        description: `${appointmentType || 'Consultation'} fee`,
        quantity:    1,
        unitCost:    fee,
        totalCost:   fee
      }],
      consultationFee: fee,
      subtotal:        fee,
      totalAmount:     fee,
      balanceDue:      fee,
      status:          'draft'
    })
  } catch (error) {
    if (error?.code !== 11000) throw error

    const concurrentBill = await Bill.findOne({ appointment: appointmentId })
    if (!concurrentBill) throw error

    console.log(
      `ℹ️  [BILLING] Concurrent create detected — returning existing bill ` +
      `${concurrentBill.billNumber} for appointment ${appointmentId}`
    )

    return { bill: concurrentBill, created: false }
  }

  console.log(`✅  [BILLING] Bill ${bill.billNumber} (KES ${fee}) created → appointment ${appointmentId}`)
  _logBillingEvent('SESSION_STARTED', bill._id, { appointmentId, fee })

  return { bill, created: true }
}

/**
 * EVENT: Doctor requests a lab test.
 * Adds a lab fee line item to the draft bill immediately.
 * Safe to call even if no bill exists (logs a warning, does not throw).
 *
 * @param {{ appointmentId, labRequestId, testNames: string[], estimatedCost: number }} params
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const onLabRequested = async ({ appointmentId, labRequestId, testNames = [], estimatedCost }) => {
  if (!appointmentId || !labRequestId) {
    console.warn('⚠️  BillingEvents.onLabRequested: appointmentId and labRequestId required')
    return null
  }

  const resolvedCost = (estimatedCost && estimatedCost > 0)
    ? estimatedCost
    : resolveLabFee(testNames)

  const bill = await Bill.findOne({ appointment: appointmentId, status: 'draft' })
  if (!bill) {
    console.warn(`⚠️  [BILLING] No draft bill for appointment ${appointmentId} — lab fee skipped`)
    return null
  }

  // Duplicate guard is inside addLineItem
  const updated = await addLineItem(bill, {
    type:        'lab',
    description: `Lab: ${testNames.join(', ')}`,
    quantity:    1,
    unitCost:    resolvedCost,
    referenceId: labRequestId
  })

  console.log(`✅  [BILLING] Lab fee KES ${resolvedCost} added to bill ${bill.billNumber}`)
  _logBillingEvent('LAB_CHARGE_ADDED', bill._id, { labRequestId, estimatedCost: resolvedCost })

  return updated
}

/**
 * EVENT: Pharmacy dispenses medication.
 * Adds a medication line item to the bill — even if already finalized,
 * since dispensing can happen after session completion.
 *
 * Strategy:
 *   1. Look for a draft bill first (session still open)
 *   2. Fall back to any non-terminal bill for this appointment
 *      (pending / partially_paid — allows post-session pharmacy charges)
 *
 * @param {{ appointmentId, prescriptionId, medications: Array, totalCost?: number }} params
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const onPharmacyDispense = async ({ appointmentId, prescriptionId, medications = [], totalCost }) => {
  if (!appointmentId || !prescriptionId) {
    console.warn('⚠️  BillingEvents.onPharmacyDispense: appointmentId and prescriptionId required')
    return null
  }

  // Allow pharmacy charges on both draft and post-finalized bills
  const bill = await Bill.findOne({
    appointment: appointmentId,
    status: { $in: ['draft', 'pending', 'partially_paid'] }
  }).sort({ createdAt: -1 })

  if (!bill) {
    console.warn(`⚠️  [BILLING] No payable bill for appointment ${appointmentId} — medication charge skipped`)
    return null
  }

  // Calculate cost from medications array if totalCost not explicitly given
  const medCost = totalCost ?? _computeMedicationCost(medications)

  if (!medCost || medCost <= 0) {
    console.warn(`⚠️  [BILLING] Zero medication cost for prescription ${prescriptionId} — skipping`)
    return null
  }

  const medNames = medications.map(m => m.drugName || m.name).filter(Boolean).join(', ') || 'Medications'

  // allowPostFinalization=true because dispensing can happen after session close
  const updated = await addLineItem(
    bill,
    {
      type:        'medication',
      description: `Medications: ${medNames}`,
      quantity:    1,
      unitCost:    medCost,
      referenceId: prescriptionId
    },
    { allowPostFinalization: true }
  )

  console.log(`✅  [BILLING] Medication cost KES ${medCost} added to bill ${bill.billNumber}`)
  _logBillingEvent('PHARMACY_CHARGE_ADDED', bill._id, { prescriptionId, medCost })

  return updated
}

/**
 * EVENT: Doctor finalises the session / medical record.
 * Transitions the bill from draft → pending, locking it for payment.
 *
 * @param {{ appointmentId, medicalRecordId? }} params
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const onSessionComplete = async ({ appointmentId, medicalRecordId }) => {
  if (!appointmentId) throw new Error('BillingEvents.onSessionComplete: appointmentId required')

  const bill = await Bill.findOne({ appointment: appointmentId })
  if (!bill) {
    console.warn(`⚠️  [BILLING] No bill found for appointment ${appointmentId} on session complete`)
    return null
  }

  if (bill.status !== 'draft') {
    console.log(`ℹ️  [BILLING] Bill ${bill.billNumber} already "${bill.status}" — skipping finalize`)
    return bill
  }

  const finalized = await finalizeBill(bill, medicalRecordId)
  console.log(`✅  [BILLING] Bill ${finalized.billNumber} finalized → KES ${finalized.totalAmount}`)
  _logBillingEvent('BILL_FINALIZED', finalized._id, { totalAmount: finalized.totalAmount, medicalRecordId })

  return finalized
}

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

/**
 * Find the active bill for an appointment.
 * @param {string} appointmentId
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const getBillForAppointment = (appointmentId) =>
  Bill.findOne({ appointment: appointmentId })

/**
 * Find a payable (pending / partially_paid) bill for an appointment.
 * @param {string} appointmentId
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const getPayableBill = (appointmentId) =>
  Bill.findOne({ appointment: appointmentId, status: { $in: ['pending', 'partially_paid'] } })

/**
 * Resolve the consultation fee for an appointment type string.
 * @param {string} appointmentType  e.g. 'check-up'
 * @returns {number}
 */
export const resolveConsultationFee = (appointmentType) =>
  CONSULTATION_FEES[appointmentType] ?? DEFAULT_CONSULTATION_FEE

/**
 * Resolve total lab fee from ordered test names.
 * Falls back to DEFAULT per unmatched test so billing does not collapse to zero.
 *
 * @param {string[]} testNames
 * @returns {number}
 */
export const resolveLabFee = (testNames = []) => {
  if (!Array.isArray(testNames) || testNames.length === 0) {
    return LAB_TEST_FEES.DEFAULT
  }

  return testNames.reduce((total, name) => {
    const normalizedName = typeof name === 'string' ? name.trim() : ''
    const fee = LAB_TEST_FEES[normalizedName] ?? LAB_TEST_FEES.DEFAULT
    return total + fee
  }, 0)
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

const _sumByType = (items, type) =>
  items.filter(i => i.type === type).reduce((sum, i) => sum + (i.totalCost || 0), 0)

/**
 * Compute total medication cost from dispensed medication objects.
 * Supports two shapes:
 *   { unitCost, dispensedQuantity } — from pharmacy dispense payload
 *   { estimatedCost }              — fallback
 */
const _computeMedicationCost = (medications) =>
  medications.reduce((sum, med) => {
    const qty  = med.dispensedQuantity || med.quantity || 1
    const cost = med.unitCost || med.estimatedCost || 0
    return sum + qty * cost
  }, 0)

/**
 * Structured billing event log.
 * Replace console.log with your preferred logger (winston, pino, etc.).
 */
const _logBillingEvent = (event, billId, meta = {}) => {
  console.log(JSON.stringify({
    level:   'info',
    service: 'BillingService',
    event,
    billId:  String(billId),
    ts:      new Date().toISOString(),
    ...meta
  }))
}

// ─── Default Export ───────────────────────────────────────────────────────────
export default {
  // Fee schedule
  CONSULTATION_FEES,
  DEFAULT_CONSULTATION_FEE,
  LAB_TEST_FEES,

  // Core helpers (used directly by controllers)
  calculate,
  recompute,
  addLineItem,
  applyPayment,
  finalizeBill,
  transitionStatus,
  getBillForAppointment,
  getPayableBill,
  resolveConsultationFee,
  resolveLabFee,

  // Event hooks (semantic API for controller integration)
  onSessionStart,
  onLabRequested,
  onPharmacyDispense,
  onSessionComplete,
}
