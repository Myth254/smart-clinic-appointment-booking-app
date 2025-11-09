import mongoose from 'mongoose'

const availabilitySchema = new mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: function() {
      return !this.isRecurring
    }
  },
  weekday: {
    type: Number,
    min: 0,
    max: 6,
    required: function() {
      return this.isRecurring
    }
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)']
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    type: String,
    enum: ['weekly', 'biweekly', 'monthly']
  },
  slotDurationMinutes: {
    type: Number,
    default: 30
  },
  exceptions: [{
    date: Date,
    reason: String
  }]
}, {
  timestamps: true
})

// Index for efficient queries
availabilitySchema.index({ doctor: 1, date: 1 })
availabilitySchema.index({ doctor: 1, weekday: 1, isRecurring: 1 })

const Availability = mongoose.model('Availability', availabilitySchema)

export default Availability