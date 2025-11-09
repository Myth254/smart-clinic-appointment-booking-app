import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['appointment', 'reminder', 'cancellation', 'rescheduled', 'message', 'system'],
    required: true
  },
  title: {
    type: String,
    required: [true, 'Title is required']
  },
  message: {
    type: String,
    required: [true, 'Message is required']
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  sentAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// Index for efficient queries
notificationSchema.index({ user: 1, read: 1, sentAt: -1 })

const Notification = mongoose.model('Notification', notificationSchema)

export default Notification