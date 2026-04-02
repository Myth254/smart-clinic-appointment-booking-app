// controllers/billingController.js
//
// New endpoints vs the original:
//   • GET  /bills/appointment/:appointmentId  — fetch the bill for a session
//   • POST /bills                             — manual bill creation (doctor)
//   • PATCH /bills/:id/discount               — apply admin discount
//
// All original endpoints retained unchanged.

import mongoose from 'mongoose'
import Bill from '../models/Bill.js'
import Appointment from '../models/Appointment.js'
import BillCalculator from '../services/billing/BillCalculator.js'
import logAudit from '../utils/auditLogger.js'

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create a bill for an appointment (manual trigger / fallback)
//          The primary creation path is via BillCalculator.onSessionStart()
//          called automatically from sessionController.
// @route   POST /api/v1/billing/bills
// @access  Private (Doctor)
// ─────────────────────────────────────────────────────────────────────────────
export const createBill = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { appointmentId, sessionId } = req.body

    if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ success: false, message: 'Valid appointmentId is required' })
    }

    const appointment = await Appointment.findById(appointmentId)
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' })
    if (appointment.doctor.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized for this appointment' })
    }

    // Idempotent — return existing bill if already created
    const existing = await Bill.findOne({ appointment: appointmentId })
      .populate('patient', 'firstName lastName email phoneNumber')
      .populate('doctor',  'firstName lastName')
    if (existing) {
      return res.status(200).json({ success: true, message: 'Bill already exists', data: existing })
    }

    const { bill } = await BillCalculator.onSessionStart({
      appointmentId:   String(appointment._id),
      sessionId:       sessionId || null,
      doctorId,
      patientId:       String(appointment.patient),
      appointmentType: appointment.appointmentType || appointment.type
    })

    const populated = await bill.populate([
      { path: 'patient',     select: 'firstName lastName email phoneNumber' },
      { path: 'doctor',      select: 'firstName lastName' },
      { path: 'appointment', select: 'appointmentType date status' }
    ])

    await logAudit({
      userId: doctorId, action: 'BILL_CREATED', resourceType: 'Bill', resourceId: bill._id,
      details: { appointmentId, consultationFee: bill.consultationFee, patientId: appointment.patient },
      req, status: 'success'
    })

    return res.status(201).json({ success: true, message: 'Bill created successfully', data: populated })
  } catch (error) {
    console.error('❌ createBill error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get bill by appointment ID (doctor / session view)
// @route   GET /api/v1/billing/bills/appointment/:appointmentId
// @access  Private (Doctor | Admin)
// ─────────────────────────────────────────────────────────────────────────────
export const getBillByAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params
    const userId   = req.user.id
    const userRole = req.user.role

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment ID' })
    }

    const bill = await Bill.findOne({ appointment: appointmentId })
      .populate('patient',       'firstName lastName email phoneNumber')
      .populate('doctor',        'firstName lastName')
      .populate('appointment',   'appointmentType date status')
      .populate('medicalRecord', 'diagnosis status finalizedAt')
      .populate('payments',      'mpesaReceiptNumber amount status completedAt')

    if (!bill) return res.status(404).json({ success: false, message: 'No bill found for this appointment' })

    if (userRole === 'doctor' && bill.doctor._id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }
    if (userRole === 'patient' && bill.patient._id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    return res.json({ success: true, data: bill })
  } catch (error) {
    console.error('❌ getBillByAppointment error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all bills for the authenticated patient
// @route   GET /api/v1/billing/bills/my-bills
// @access  Private (Patient)
// ─────────────────────────────────────────────────────────────────────────────
export const getMyBills = async (req, res) => {
  try {
    const patientId = req.user.id
    const { status, limit = 20, offset = 0 } = req.query

    const query = { patient: patientId }
    if (status) query.status = status

    const [bills, total] = await Promise.all([
      Bill.find(query)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Number(limit))
        .populate('doctor',      'firstName lastName')
        .populate('appointment', 'appointmentType date')
        .populate('payments',    'mpesaReceiptNumber amount status completedAt')
        .lean(),
      Bill.countDocuments(query)
    ])

    return res.json({
      success: true,
      data:    bills.map(_formatBillForPatient),
      pagination: {
        total,
        limit:   Number(limit),
        offset:  Number(offset),
        hasMore: total > Number(offset) + Number(limit)
      }
    })
  } catch (error) {
    console.error('❌ getMyBills error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get a single bill by ID
// @route   GET /api/v1/billing/bills/:id
// @access  Private (Patient=own | Doctor=own | Admin=any)
// ─────────────────────────────────────────────────────────────────────────────
export const getBillById = async (req, res) => {
  try {
    const userId   = req.user.id
    const userRole = req.user.role
    const { id }   = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bill ID' })
    }

    const bill = await Bill.findById(id)
      .populate('patient',       'firstName lastName email phoneNumber')
      .populate('doctor',        'firstName lastName')
      .populate('appointment',   'appointmentType date status')
      .populate('medicalRecord', 'diagnosis status finalizedAt')
      .populate('payments',      'mpesaReceiptNumber amount status completedAt phoneNumber')

    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' })

    if (userRole === 'patient' && bill.patient._id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }
    if (userRole === 'doctor' && bill.doctor._id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    return res.json({ success: true, data: bill })
  } catch (error) {
    console.error('❌ getBillById error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Add a line item to a draft bill
// @route   PATCH /api/v1/billing/bills/:id/add-line-item
// @access  Private (Doctor | Pharmacy Staff | Admin)
// ─────────────────────────────────────────────────────────────────────────────
export const addLineItem = async (req, res) => {
  try {
    const { id } = req.params
    const { type, description, quantity = 1, unitCost, referenceId } = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bill ID' })
    }
    if (!type || unitCost === null || unitCost === undefined) {
      return res.status(400).json({ success: false, message: 'type and unitCost are required' })
    }

    const bill = await Bill.findById(id)
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' })

    if (!bill.isEditable()) {
      return res.status(400).json({
        success: false,
        message: `Bill is "${bill.status}" — only draft bills accept new line items`
      })
    }

    const updated = await BillCalculator.addLineItem(bill, {
      type, description,
      quantity:    Number(quantity),
      unitCost:    Number(unitCost),
      referenceId: referenceId || null
    })

    await logAudit({
      userId: req.user.id, action: 'BILL_LINE_ITEM_ADDED',
      resourceType: 'Bill', resourceId: bill._id,
      details: { type, description, unitCost, quantity },
      req, status: 'success'
    })

    return res.json({ success: true, message: 'Line item added and totals updated', data: updated })
  } catch (error) {
    console.error('❌ addLineItem error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Apply a discount to a draft bill
// @route   PATCH /api/v1/billing/bills/:id/discount
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
export const applyDiscount = async (req, res) => {
  try {
    const { id } = req.params
    const { discount, notes } = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bill ID' })
    }
    if (discount === undefined || isNaN(discount) || discount < 0) {
      return res.status(400).json({ success: false, message: 'discount must be a non-negative number' })
    }

    const bill = await Bill.findById(id)
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' })
    if (!['draft', 'pending'].includes(bill.status)) {
      return res.status(400).json({ success: false, message: `Cannot apply discount to a "${bill.status}" bill` })
    }

    bill.discount = Number(discount)
    if (notes) bill.notes = notes
    BillCalculator.recompute(bill)
    await bill.save()

    await logAudit({
      userId: req.user.id, action: 'BILL_DISCOUNT_APPLIED',
      resourceType: 'Bill', resourceId: bill._id,
      details: { discount, totalAmount: bill.totalAmount },
      req, status: 'success'
    })

    return res.json({ success: true, message: 'Discount applied', data: bill })
  } catch (error) {
    console.error('❌ applyDiscount error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Finalize bill (draft → pending)
// @route   PATCH /api/v1/billing/bills/:id/finalize
// @access  Private (Doctor)
// ─────────────────────────────────────────────────────────────────────────────
export const finalizeBill = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { id }   = req.params
    const { medicalRecordId } = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bill ID' })
    }

    const bill = await Bill.findById(id)
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' })
    if (bill.doctor.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to finalize this bill' })
    }
    if (bill.status !== 'draft') {
      return res.status(400).json({ success: false, message: `Bill is already "${bill.status}"` })
    }

    const updated = await BillCalculator.finalizeBill(bill, medicalRecordId)

    await logAudit({
      userId: doctorId, action: 'BILL_FINALIZED', resourceType: 'Bill', resourceId: bill._id,
      details: { totalAmount: updated.totalAmount, medicalRecordId },
      req, status: 'success'
    })

    return res.json({ success: true, message: 'Bill finalized — patient can now pay', data: updated })
  } catch (error) {
    console.error('❌ finalizeBill error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Admin revenue / billing statistics
// @route   GET /api/v1/billing/stats
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
export const getBillingStats = async (req, res) => {
  try {
    const { from, to } = req.query
    const [revenueStats, statusBreakdown] = await Promise.all([
      Bill.getRevenueStats(from, to),
      Bill.getStatusSummary()
    ])
    return res.json({
      success: true,
      data: {
        revenue:         revenueStats[0] || { totalRevenue: 0, consultationTotal: 0, medicationTotal: 0, labTotal: 0, count: 0 },
        statusBreakdown: statusBreakdown
      }
    })
  } catch (error) {
    console.error('❌ getBillingStats error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Waive a bill (Admin only)
// @route   PATCH /api/v1/billing/bills/:id/waive
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
export const waiveBill = async (req, res) => {
  try {
    const { id }    = req.params
    const { notes } = req.body

    const bill = await Bill.findById(id)
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' })

    try {
      BillCalculator.transitionStatus(bill, 'waived')
    } catch (transErr) {
      return res.status(400).json({ success: false, message: transErr.message })
    }

    bill.notes      = notes || 'Waived by admin'
    bill.balanceDue = 0
    await bill.save()

    await logAudit({
      userId: req.user.id, action: 'BILL_WAIVED', resourceType: 'Bill', resourceId: bill._id,
      details: { notes, totalAmount: bill.totalAmount },
      req, status: 'success'
    })

    return res.json({ success: true, message: 'Bill waived', data: bill })
  } catch (error) {
    console.error('❌ waiveBill error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helper — shapes a Bill document into the patient-dashboard format
// ─────────────────────────────────────────────────────────────────────────────
const _formatBillForPatient = (bill) => ({
  _id:        bill._id,
  billNumber: bill.billNumber,
  sessionRef: `Medical Session – ${bill.appointment?.appointmentType || 'Consultation'}`,
  date:        bill.createdAt,
  doctor:      bill.doctor ? `Dr. ${bill.doctor.firstName} ${bill.doctor.lastName}` : 'Unknown',
  breakdown: {
    consultationFee: bill.consultationFee,
    pharmacyCharges: bill.medicationTotal,
    labFees:         bill.labTotal
  },
  subtotal:    bill.subtotal,
  discount:    bill.discount,
  totalAmount: bill.totalAmount,
  amountPaid:  bill.amountPaid,
  balanceDue:  bill.balanceDue,
  status:      bill.status,
  finalizedAt: bill.finalizedAt,
  paidAt:      bill.paidAt,
  lineItems:   bill.lineItems,
  payments:    bill.payments
})

export default {
  createBill, getBillByAppointment, getMyBills, getBillById,
  addLineItem, applyDiscount, finalizeBill, getBillingStats, waiveBill
}