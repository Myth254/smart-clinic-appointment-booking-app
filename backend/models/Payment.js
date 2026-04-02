// models/Payment.js
import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema(
  {
    // User who made the payment
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    currency: {
      type: String,
      default: 'KES'
    },

    paymentMethod: {
      type: String,
      enum: ['M-Pesa', 'Card', 'Cash', 'Insurance', 'Bank Transfer'],
      default: 'M-Pesa'
    },

    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
      default: 'pending'
    },

    transactionType: {
      type: String,
      enum: ['payment', 'refund', 'deposit'],
      default: 'payment'
    },

    // ✅ UPDATED: "bill" added as a valid referenceType.
    //    Patients now pay against a consolidated Bill document instead of
    //    individual lab/prescription records.
    referenceType: {
      type: String,
      enum: ['lab', 'prescription', 'appointment', 'bill', 'other'],  // ✅ "bill" added
      required: true
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'referenceModel'
    },

    // ✅ UPDATED: "Bill" added as a valid referenceModel for dynamic population.
    referenceModel: {
      type: String,
      enum: ['LabRequest', 'Prescription', 'Appointment', 'Bill'],    // ✅ "Bill" added
      required: function () {
        return ['lab', 'prescription', 'appointment', 'bill'].includes(this.referenceType)
      }
    },

    // M-Pesa specific fields
    mpesaCheckoutRequestId:  String,
    mpesaMerchantRequestId:  String,
    mpesaReceiptNumber:      String,
    mpesaTransactionId:      String,

    phoneNumber: {
      type: String,
      required: true
    },

    transactionDate: {
      type: Date,
      default: Date.now
    },

    resultCode:        Number,
    resultDescription: String,

    description: String,
    notes:       String,

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    refund: {
      refundedAt:   Date,
      refundAmount: Number,
      refundReason: String,
      refundedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },

    receiptUrl:    String,
    receiptNumber: String,

    // Lifecycle timestamps
    processingAt: Date,
    completedAt:  Date,
    failedAt:     Date,
    cancelledAt:  Date,

    adminNotes:  String,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  {
    timestamps: true
  }
)

// ─── Indexes ─────────────────────────────────────────────────────────────────
paymentSchema.index({ user: 1, createdAt: -1 })
paymentSchema.index({ status: 1 })
paymentSchema.index({ referenceType: 1, referenceId: 1 })
paymentSchema.index({ mpesaCheckoutRequestId: 1 })
paymentSchema.index({ mpesaReceiptNumber: 1 })
paymentSchema.index({ transactionDate: -1 })

// ─── Virtual ─────────────────────────────────────────────────────────────────
paymentSchema.virtual('reference', {
  refPath:     'referenceModel',
  localField:  'referenceId',
  foreignField: '_id',
  justOne:     true
})

// ─── Pre-save: set referenceModel from referenceType ─────────────────────────
paymentSchema.pre('save', function (next) {
  const map = {
    lab:          'LabRequest',
    prescription: 'Prescription',
    appointment:  'Appointment',
    bill:         'Bill'          // ✅ NEW
  }
  if (map[this.referenceType]) {
    this.referenceModel = map[this.referenceType]
  }

  // Status → timestamp
  if (this.isModified('status')) {
    const now = new Date()
    switch (this.status) {
    case 'processing': this.processingAt = now; break
    case 'completed':  this.completedAt  = now; break
    case 'failed':     this.failedAt     = now; break
    case 'cancelled':  this.cancelledAt  = now; break
    }
  }

  next()
})

// ─── Pre-save: generate receipt number ───────────────────────────────────────
paymentSchema.pre('save', async function (next) {
  if (this.isNew && !this.receiptNumber) {
    const d     = new Date()
    const year  = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const count = await this.constructor.countDocuments()
    this.receiptNumber = `PAY${year}${month}${String(count + 1).padStart(6, '0')}`
  }
  next()
})

// ─── Instance Methods ─────────────────────────────────────────────────────────
paymentSchema.methods.isSuccessful  = function () { return this.status === 'completed' && this.resultCode === 0 }
paymentSchema.methods.isPending     = function () { return ['pending', 'processing'].includes(this.status) }
paymentSchema.methods.canBeRefunded = function () { return this.status === 'completed' && !this.refund?.refundedAt }

// ─── Static Methods ───────────────────────────────────────────────────────────
paymentSchema.statics.getUserTotalSpent = async function (userId, dateFrom = null, dateTo = null) {
  const query = { user: userId, status: 'completed' }
  if (dateFrom || dateTo) {
    query.completedAt = {}
    if (dateFrom) query.completedAt.$gte = dateFrom
    if (dateTo)   query.completedAt.$lte = dateTo
  }
  const result = await this.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ])
  return result[0] || { total: 0, count: 0 }
}

paymentSchema.statics.getStatsByType = async function (userId = null) {
  const match = { status: 'completed' }
  if (userId) match.user = userId
  return this.aggregate([
    { $match: match },
    { $group: { _id: '$referenceType', count: { $sum: 1 }, total: { $sum: '$amount' }, avgAmount: { $avg: '$amount' } } }
  ])
}

const Payment = mongoose.model('Payment', paymentSchema)

export default Payment