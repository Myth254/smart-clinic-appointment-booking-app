// models/Prescription.js
import mongoose from 'mongoose'

const prescriptionSchema = new mongoose.Schema({
  // Reference fields
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Patient is required']
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Doctor is required']
  },
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  medicalRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicalRecord'
  },

  // Prescription details
  prescriptionNumber: {
    type: String,
    unique: true,
    required: true
  },

  medications: [{
    drugName: {
      type: String,
      required: true
    },
    genericName: String,
    dosage: {
      type: String,
      required: true
    },
    strength: String,
    form: {
      type: String,
      enum: ['tablet', 'capsule', 'syrup', 'injection', 'cream', 'ointment', 'drops', 'inhaler', 'other'],
      default: 'tablet'
    },
    quantity: {
      type: Number,
      required: true
    },
    frequency: {
      type: String,
      required: true // e.g., "3 times a day", "Once daily"
    },
    duration: {
      type: String,
      required: true // e.g., "7 days", "2 weeks"
    },
    route: {
      type: String,
      enum: ['oral', 'topical', 'intravenous', 'intramuscular', 'subcutaneous', 'inhalation', 'other'],
      default: 'oral'
    },
    instructions: String,

    // Pharmacy tracking
    availabilityStatus: {
      type: String,
      enum: ['pending', 'available', 'partial', 'unavailable', 'alternative_suggested'],
      default: 'pending'
    },
    alternativeDrug: String,
    alternativeReason: String,
    dispensedQuantity: Number,
    unitCost: {
      type: Number,
      default: 0,
      min: 0
    },
    dispensedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dispensedAt: Date
  }],

  // Status tracking
  status: {
    type: String,
    enum: ['new', 'pending_pharmacy', 'availability_confirmed', 'ready_for_pickup', 'partial_ready', 'dispensed', 'completed', 'cancelled', 'expired'],
    default: 'new'
  },

  // Pharmacy workflow
  pharmacyNotes: String,
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Pharmacy staff
  },
  confirmedAt: Date,
  readyForPickupAt: Date,
  dispensedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Pharmacy staff
  },
  dispensedAt: Date,

  // Patient pickup
  pickedUpBy: String, // Name of person who picked up
  pickedUpAt: Date,
  signatureUrl: String, // Digital signature

  // Refills
  refillsAllowed: {
    type: Number,
    default: 0
  },
  refillsRemaining: {
    type: Number,
    default: 0
  },

  // Instructions
  generalInstructions: String,
  warnings: [String],
  allergies: [String], // Patient allergies to consider

  // Validity
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: Date,

  // Payment
  estimatedCost: Number,
  actualCost: Number,
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'insurance_covered', 'waived'],
    default: 'pending'
  },
  paymentMethod: String,
  paymentReference: String,

  // Notifications
  notificationsSent: [{
    type: {
      type: String,
      enum: ['created', 'confirmed', 'ready', 'reminder', 'expired']
    },
    sentAt: Date,
    channel: {
      type: String,
      enum: ['email', 'sms', 'push', 'in_app']
    }
  }],

  // Communication
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    text: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['note', 'query', 'alternative_suggestion', 'doctor_response'],
      default: 'note'
    }
  }],

  // Attachments
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Cancellation
  cancellationReason: String,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: Date
}, {
  timestamps: true
})

// Indexes
prescriptionSchema.index({ patient: 1, createdAt: -1 })
prescriptionSchema.index({ doctor: 1, createdAt: -1 })
prescriptionSchema.index({ status: 1 })
prescriptionSchema.index({ validUntil: 1 })

// ── Pre-validate hook: generate a collision-safe prescription number ──────────
//
// CRITICAL: must be pre('validate'), NOT pre('save').
//
// Mongoose execution order:
//   pre('validate') → validation (required check) → pre('save') → DB write
//
// The original pre('save') hook ran AFTER validation, meaning prescriptionNumber
// was still undefined when Mongoose checked `required: true` → ValidationError
// with "Path `prescriptionNumber` is required." This was the exact 400/500 error
// seen in the browser console when the doctor clicked "Finalize & Complete".
//
// Moving to pre('validate') guarantees the number is populated before the
// required check fires, so validation always passes.
//
// Number format: RX<YYYY><MM><13-digit ms><4-digit rand>
//   e.g. RX20260325171123456789012345
prescriptionSchema.pre('validate', function (next) {
  if (!this.prescriptionNumber) {
    const date   = new Date()
    const year   = date.getFullYear()
    const month  = String(date.getMonth() + 1).padStart(2, '0')
    const ms     = Date.now().toString()                            // 13 digits
    const rand   = String(Math.floor(Math.random() * 9000) + 1000) // 4 digits
    this.prescriptionNumber = `RX${year}${month}${ms}${rand}`
  }

  // Set refillsRemaining on first creation so it mirrors refillsAllowed.
  // Kept here (pre validate) alongside the number generation so both
  // defaults are applied in the same hook pass.
  if (this.isNew && this.refillsAllowed > 0) {
    this.refillsRemaining = this.refillsAllowed
  }

  next()
})

// Method to check if prescription is expired
prescriptionSchema.methods.isExpired = function () {
  return this.validUntil && new Date() > this.validUntil
}

// Method to check if all medications are available
prescriptionSchema.methods.areAllMedicationsAvailable = function () {
  return this.medications.every(med => med.availabilityStatus === 'available')
}

// Method to check if ready for pickup
prescriptionSchema.methods.isReadyForPickup = function () {
  return ['ready_for_pickup', 'partial_ready'].includes(this.status)
}

const Prescription = mongoose.model('Prescription', prescriptionSchema)

export default Prescription
