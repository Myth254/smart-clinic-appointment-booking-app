// models/Appointment.js
import mongoose from 'mongoose'

const appointmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  start: {
    type: Date,
    required: true
  },
  end: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['consultation', 'follow-up', 'checkup', 'emergency', 'routine'],
    default: 'consultation'
  },
  followUpOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null
  },
  isFollowUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date,
    default: null
  },
  followUpReason: {
    type: String,
    default: ''
  },
  followUpNotes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    // ✅ FIX: 'in_progress' was missing from this enum.
    // Without it, appointment.save() threw a Mongoose ValidationError after
    // Session.create() had already persisted — leaving an orphaned Session
    // document in the DB. On retry the doctor hit "Session already exists".
    enum: ['pending', 'pending_confirmation', 'approved', 'in_progress', 'completed', 'cancelled', 'no-show'],
    default: 'pending'
  },
  notes: {
    type: String,
    default: ''
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: {
    type: Date
  },
  cancellationReason: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

appointmentSchema.virtual('patientProfile', {
  ref: 'Patient',
  localField: 'patient',
  foreignField: 'userId',
  justOne: true
})

appointmentSchema.virtual('doctorProfile', {
  ref: 'Doctor',
  localField: 'doctor',
  foreignField: 'userId',
  justOne: true
})

appointmentSchema.index({ patient: 1, start: -1 })
appointmentSchema.index({ doctor: 1, start: -1 })
appointmentSchema.index({ status: 1, start: -1 })
appointmentSchema.index({ followUpOf: 1 })
appointmentSchema.index({ patient: 1, isFollowUpRequired: 1, followUpDate: 1 })

appointmentSchema.index(
  { doctor: 1, status: 1, start: 1, end: 1 },
  { name: 'conflict_check_index' }
)

appointmentSchema.index(
  { doctor: 1, start: 1, end: 1 },
  {
    unique: true,
    // 'cancelled' and 'no-show' are intentionally excluded so freed slots
    // can be re-booked. This index is the final safety net — it fires when
    // the atomic upsert in createAppointment somehow races (e.g. direct DB
    // writes, future code paths). Always translate E11000 → HTTP 409.
    partialFilterExpression: {
      status: { $in: ['pending', 'pending_confirmation', 'approved', 'completed', 'in_progress'] }
    },
    name: 'unique_active_time_slot'
  }
)

// Enforce writes on the primary replica, journaled, so the unique index
// is always evaluated against the authoritative data set.
appointmentSchema.set('writeConcern', { w: 'majority', j: true })

const Appointment = mongoose.model('Appointment', appointmentSchema)
export default Appointment
