// models/Notification.js - ENHANCED VERSION
import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'appointment',
      'session',
      'lab',
      'prescription',
      'payment',
      'medical_record',
      'system',
      'reminder',
      'alert'
    ],
    index: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'resolved'],
    default: 'active',
    index: true
  },
  resolvedAt: Date,

  // Priority level
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal',
    index: true
  },

  // Related resource
  relatedId: {
    type: mongoose.Schema.Types.ObjectId
  },
  relatedModel: {
    type: String,
    enum: [
      'Appointment',
      'Session',
      'LabRequest',
      'Prescription',
      'Payment',
      'MedicalRecord',
      'User'
    ]
  },

  // Read status
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date
  },

  // ✅ NEW: Delivery tracking
  deliveryStatus: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed', 'bounced'],
    default: 'pending',
    index: true
  },
  deliveryError: String,
  retryCount: {
    type: Number,
    default: 0
  },
  lastRetryAt: Date,

  // ✅ NEW: Multi-channel delivery
  channels: [{
    type: {
      type: String,
      enum: ['email', 'sms', 'push', 'in_app']
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed']
    },
    sentAt: Date,
    deliveredAt: Date,
    error: String
  }],

  // Action data (for actionable notifications)
  actionUrl: String,
  actionLabel: String,

  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    alias: 'data'
  },

  // Expiry
  expiresAt: Date
}, {
  timestamps: true
})

// Indexes for efficient queries
notificationSchema.index({ user: 1, read: 1, createdAt: -1 })
notificationSchema.index({ user: 1, type: 1, createdAt: -1 })
notificationSchema.index({ user: 1, status: 1, createdAt: -1 })
notificationSchema.index({ priority: -1, createdAt: -1 })
notificationSchema.index({ deliveryStatus: 1, retryCount: 1 })
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL index

// Virtual for related resource
notificationSchema.virtual('related', {
  refPath: 'relatedModel',
  localField: 'relatedId',
  foreignField: '_id',
  justOne: true
})

// Mark as read
notificationSchema.methods.markAsRead = async function() {
  this.read = true
  this.readAt = new Date()
  return this.save()
}

notificationSchema.methods.resolve = async function() {
  this.status = 'resolved'
  this.resolvedAt = new Date()
  return this.save()
}

// Check if notification is expired
notificationSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > this.expiresAt
}

// Check if can retry
notificationSchema.methods.canRetry = function() {
  return this.deliveryStatus === 'failed' && this.retryCount < 3
}

// Retry delivery
notificationSchema.methods.retry = async function() {
  if (!this.canRetry()) {
    throw new Error('Cannot retry this notification')
  }

  this.deliveryStatus = 'pending'
  this.retryCount += 1
  this.lastRetryAt = new Date()
  return this.save()
}

// Static method to get unread count for user
notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({
    user: userId,
    status: 'active',
    read: false,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  })
}

// Static method to mark all as read for user
notificationSchema.statics.markAllAsRead = async function(userId) {
  return await this.updateMany(
    { user: userId, status: 'active', read: false },
    { read: true, readAt: new Date() }
  )
}

notificationSchema.statics.resolveActive = async function(filter) {
  return await this.updateMany(
    {
      ...filter,
      status: 'active'
    },
    {
      status: 'resolved',
      resolvedAt: new Date()
    }
  )
}

// Static method to delete old read notifications
notificationSchema.statics.cleanupOld = async function(daysOld = 30) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  return await this.deleteMany({
    read: true,
    createdAt: { $lt: cutoffDate }
  })
}

// Static method to get notification stats for user
notificationSchema.statics.getUserStats = async function(userId) {
  const stats = await this.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(userId) }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        unread: {
          $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] }
        }
      }
    }
  ])

  const totalUnread = await this.getUnreadCount(userId)

  return {
    totalUnread,
    byType: stats
  }
}

// Pre-save middleware to set delivery status
notificationSchema.pre('save', function(next) {
  // Set initial channel status if channels exist
  if (this.isNew && this.channels && this.channels.length > 0) {
    this.channels.forEach(channel => {
      if (!channel.status) {
        channel.status = 'pending'
      }
    })
  }
  next()
})

const Notification = mongoose.model('Notification', notificationSchema)

export default Notification
