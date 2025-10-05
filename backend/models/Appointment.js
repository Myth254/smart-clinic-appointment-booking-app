import mongoose from 'mongoose'

const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dateTime: {
      type: Date,
      required: [true, 'Appointment date and time is required'],
    },
    status: {
      type: String,
      enum: ['booked', 'cancelled', 'completed'],
      default: 'booked',
    },
    notes: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
)

// Ensure a doctor can't have two appointments at the same time
appointmentSchema.index({ doctorId: 1, dateTime: 1 }, { unique: true })

export default mongoose.model('Appointment', appointmentSchema)