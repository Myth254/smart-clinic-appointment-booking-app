import mongoose from 'mongoose'

const settingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: [true, 'Key is required'],
    unique: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Value is required']
  },
  category: {
    type: String,
    enum: ['general', 'email', 'notification', 'appointment', 'payment', 'security'],
    default: 'general'
  },
  description: String,
  isPublic: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
})

const Setting = mongoose.model('Setting', settingSchema)

export default Setting