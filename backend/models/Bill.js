// models/Bill.js
import mongoose from 'mongoose'

// ─── Line Item Sub-Schema ────────────────────────────────────────────────────
// Each charge is stored as a line item so the patient sees a full,
// itemised breakdown.  Three types exist:
//   consultation  → added at session start (one-off)
//   lab           → added when lab results are uploaded
//   medication    → added when pharmacy DISPENSES (NOT when prescribed)
const lineItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      // ✅ "medication" replaces the old "pharmacy" label used by some controllers.
      // Keeping both values in sync: lineItem.type === 'medication' aligns with
      // Bill.medicationTotal and BillCalculator._sumByType('medication').
      enum: ['consultation', 'medication', 'lab'],
      required: true
    },
    description: { type: String, required: true },
    quantity:    { type: Number, default: 1, min: 1 },
    unitCost:    { type: Number, required: true, min: 0 },
    totalCost:   { type: Number, required: true, min: 0 },
    // Links back to the Prescription or LabRequest that generated this charge.
    // null for consultation fees.
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    addedAt:     { type: Date, default: Date.now }
  },
  { _id: true }
)

// ─── Bill Schema ─────────────────────────────────────────────────────────────
const billSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      unique: true
      // Auto-generated in pre-save hook (timestamp + rand — collision-safe)
    },

    // ── Relationships ──────────────────────────────────────────────────────
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Patient is required'],
      index: true
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Doctor is required']
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: [true, 'Appointment is required'],
      unique: true     // ← one bill per appointment (enforced at DB level too)
    },
    medicalRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalRecord',
      default: null
    },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      default: null
    },

    // ── Line Items ─────────────────────────────────────────────────────────
    lineItems: [lineItemSchema],

    // ── Aggregated Totals ──────────────────────────────────────────────────
    // Recomputed by BillCalculator.recompute() every time a line item is added.
    consultationFee: { type: Number, default: 0, min: 0 },
    medicationTotal: { type: Number, default: 0, min: 0 },
    labTotal:        { type: Number, default: 0, min: 0 },
    subtotal:        { type: Number, default: 0, min: 0 },
    discount:        { type: Number, default: 0, min: 0 },
    totalAmount:     { type: Number, default: 0, min: 0 },

    // ── Payment Tracking ───────────────────────────────────────────────────
    amountPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },

    // ── Status ─────────────────────────────────────────────────────────────
    // Allowed transitions (enforced in BillCalculator.transitionStatus):
    //   draft          → pending   (session finalised)
    //   pending        → partially_paid | paid | waived | cancelled
    //   partially_paid → paid | waived | cancelled
    //   paid / waived / cancelled → terminal (no further transitions)
    status: {
      type: String,
      enum: ['draft', 'pending', 'partially_paid', 'paid', 'waived', 'cancelled'],
      default: 'draft',
      index: true
    },

    // ── Linked Payments ────────────────────────────────────────────────────
    payments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }],

    // ── Lifecycle Timestamps ───────────────────────────────────────────────
    finalizedAt: { type: Date, default: null },
    paidAt:      { type: Date, default: null },

    notes: { type: String, default: '' }
  },
  { timestamps: true }
)

// ─── Indexes ─────────────────────────────────────────────────────────────────
billSchema.index({ patient: 1, createdAt: -1 })
billSchema.index({ status: 1, patient: 1 })

// ─── Pre-save: collision-safe bill number ─────────────────────────────────────
// Using timestamp + random suffix instead of countDocuments() (not atomic).
billSchema.pre('save', async function (next) {
  if (!this.billNumber) {
    const d     = new Date()
    const year  = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const ms    = Date.now().toString()
    const rand  = String(Math.floor(Math.random() * 9000) + 1000)
    this.billNumber = `BILL${year}${month}${ms}${rand}`
  }
  next()
})

// ─── Instance Methods ─────────────────────────────────────────────────────────

/** True if the patient can initiate a payment. */
billSchema.methods.isPayable = function () {
  return ['pending', 'partially_paid'].includes(this.status)
}

/** True if new line items can still be appended. */
billSchema.methods.isEditable = function () {
  return this.status === 'draft'
}

/**
 * Check whether a given line item has already been added for a reference.
 * Prevents duplicate charges (e.g., same lab request billed twice).
 *
 * @param {string} refId    Mongoose ObjectId string of the source document
 * @param {string} type     'consultation' | 'lab' | 'medication'
 * @returns {boolean}
 */
billSchema.methods.hasLineItemForRef = function (refId, type) {
  if (!refId) return false
  return this.lineItems.some(
    (item) => item.type === type && String(item.referenceId) === String(refId)
  )
}

// ─── Static Methods ───────────────────────────────────────────────────────────

/** Aggregate revenue stats for the admin dashboard. */
billSchema.statics.getRevenueStats = async function (from = null, to = null) {
  const match = { status: 'paid' }
  if (from || to) {
    match.paidAt = {}
    if (from) match.paidAt.$gte = new Date(from)
    if (to)   match.paidAt.$lte = new Date(to)
  }
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue:      { $sum: '$totalAmount' },
        consultationTotal: { $sum: '$consultationFee' },
        medicationTotal:   { $sum: '$medicationTotal' },
        labTotal:          { $sum: '$labTotal' },
        count:             { $sum: 1 }
      }
    }
  ])
}

/**
 * Status distribution + totals breakdown (admin dashboard widget).
 */
billSchema.statics.getStatusSummary = async function () {
  return this.aggregate([
    {
      $group: {
        _id:   '$status',
        count: { $sum: 1 },
        total: { $sum: '$totalAmount' },
        paid:  { $sum: '$amountPaid' }
      }
    },
    { $sort: { _id: 1 } }
  ])
}

const Bill = mongoose.model('Bill', billSchema)

export default Bill