// In your Appointment.js model file

import mongoose from 'mongoose'

<<<<<<< Updated upstream
const appointmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
=======
const rescheduleSchema = new mongoose.Schema({
  previousStart: Date,
  previousEnd: Date,
  newStart: Date,
  newEnd: Date,
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  changedAt: {
    type: Date,
    default: Date.now
  },
  reason: String
})

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    reason: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'completed', 'cancelled'],
      default: 'pending'
    },
    notes: String,
    rescheduleHistory: [rescheduleSchema]
>>>>>>> Stashed changes
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
  status: {
    type: String,
    enum: ['pending', 'approved', 'completed', 'cancelled', 'no-show'],
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
  toJSON: { virtuals: true }, // ✅ Enable virtuals in JSON
  toObject: { virtuals: true }
})

<<<<<<< Updated upstream
//  Add virtual field for doctor profile
appointmentSchema.virtual('doctorProfile', {
  ref: 'Doctor',
  localField: 'doctor',
  foreignField: 'userId',
  justOne: true
})
//  Virtual populate for patient profile
appointmentSchema.virtual('patientProfile', {
  ref: 'Patient',
  localField: 'patient',
  foreignField: 'userId',
  justOne: true
})
=======
appointmentSchema.index({ doctor: 1, start: 1, end: 1 })
>>>>>>> Stashed changes

//  Virtual populate for doctor profile
appointmentSchema.virtual('doctorProfile', {
  ref: 'Doctor',
  localField: 'doctor',
  foreignField: 'userId',
  justOne: true
})

//  Add indexes for better performance
appointmentSchema.index({ patient: 1, start: -1 })
appointmentSchema.index({ doctor: 1, start: -1 })
appointmentSchema.index({ status: 1, start: -1 })

const Appointment = mongoose.model('Appointment', appointmentSchema)

export default Appointment