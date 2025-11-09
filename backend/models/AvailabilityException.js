import mongoose from 'mongoose'

const availabilityExceptionSchema = new mongoose.Schema({
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true }, // 'YYYY-MM-DD' (ISO date string)
  isAvailable: { type: Boolean, default: false }, // false: day off; true: available despite rule
  // optional override slots for the date (array of {start, end} in "HH:mm")
  slots: [
    {
      startTime: String,
      endTime: String
    }
  ]
}, { timestamps: true })

export default mongoose.model('AvailabilityException', availabilityExceptionSchema)
