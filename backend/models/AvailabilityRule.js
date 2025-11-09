import mongoose from 'mongoose'

const availabilityRuleSchema = new mongoose.Schema({
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // weekday: 0 (Sunday) - 6 (Saturday)
  weekday: { type: Number, min: 0, max: 6, required: true },
  startTime: { type: String, required: true }, // "09:00" (HH:mm)
  endTime: { type: String, required: true },   // "17:00"
  slotDurationMinutes: { type: Number, default: 30 } // default slot duration
}, { timestamps: true })

export default mongoose.model('AvailabilityRule', availabilityRuleSchema)