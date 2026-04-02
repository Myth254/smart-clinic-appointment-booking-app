// controllers/notificationController.js - ENHANCED VERSION
import mongoose from 'mongoose'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import Setting from '../models/Setting.js'
import NotificationService from '../services/notificationService.js'
import { updateUnreadCount } from '../socket.js'

// @desc    Get user notifications with filtering
// @route   GET /api/notifications
// @access  Private
export const getNotifications = async (req, res) => {
  try {
    const { read, type, priority, limit = 20, offset = 0 } = req.query

    // Build query
    const query = { user: req.user.id, status: 'active' }

    if (read !== undefined) {
      query.read = read === 'true'
    }

    if (type) {
      query.type = type
    }

    if (priority) {
      query.priority = priority
    }

    // ✅ Exclude expired notifications
    query.$or = [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ priority: -1, createdAt: -1 }) // ✅ Sort by priority first
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .populate('relatedId') // ✅ Populate related resource if needed

    // Get total count
    const total = await Notification.countDocuments(query)
    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      status: 'active',
      read: false,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    })

    return res.json({
      notifications,
      unreadCount,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get notifications error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params

    const notification = await Notification.findById(id)

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' })
    }

    // Verify notification belongs to user
    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({
        message: 'Not authorized to update this notification'
      })
    }

    // ✅ Check if already read
    if (notification.read) {
      return res.json({
        message: 'Notification already marked as read',
        notification
      })
    }

    // Update notification
    notification.read = true
    notification.readAt = new Date()
    await notification.save()

    // ✅ Update real-time unread count via Socket.IO
    await updateUnreadCount(req.user.id)

    return res.json({
      message: 'Notification marked as read',
      notification
    })
  } catch (error) {
    console.error('Mark notification as read error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/mark-all-read
// @access  Private
export const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        user: req.user.id,
        status: 'active',
        read: false,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      },
      {
        read: true,
        readAt: new Date()
      }
    )

    // ✅ Update real-time unread count via Socket.IO
    await updateUnreadCount(req.user.id)

    return res.json({
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount
    })
  } catch (error) {
    console.error('Mark all as read error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params

    const notification = await Notification.findById(id)

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' })
    }

    // Verify notification belongs to user
    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({
        message: 'Not authorized to delete this notification'
      })
    }

    await notification.deleteOne()

    // ✅ Update unread count if notification was unread
    if (!notification.read) {
      await updateUnreadCount(req.user.id)
    }

    return res.json({
      message: 'Notification deleted successfully'
    })
  } catch (error) {
    console.error('Delete notification error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Delete all read notifications
// @route   DELETE /api/notifications/clear-read
// @access  Private
export const clearReadNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      user: req.user.id,
      read: true
    })

    return res.json({
      message: 'Read notifications cleared',
      deletedCount: result.deletedCount
    })
  } catch (error) {
    console.error('Clear read notifications error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
export const getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      status: 'active',
      read: false,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    })

    return res.json({ unreadCount })
  } catch (error) {
    console.error('Get unread count error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Send custom notification (Admin only) - WITH TRANSACTION
// @route   POST /api/notifications/send
// @access  Private (Admin)
export const sendCustomNotification = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const {
      userIds,
      title,
      message,
      type = 'system',
      priority = 'normal',
      channels = ['in_app'],
      data
    } = req.body

    // Validate required fields
    if (!title || !message) {
      await session.abortTransaction()
      return res.status(400).json({
        message: 'Title and message are required'
      })
    }

    // Validate notification type
    const validTypes = ['appointment', 'session', 'lab', 'prescription', 'payment', 'medical_record', 'system', 'reminder', 'alert']
    if (!validTypes.includes(type)) {
      await session.abortTransaction()
      return res.status(400).json({
        message: 'Invalid notification type',
        validTypes
      })
    }

    let targetUsers = []

    // If userIds provided, validate them
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      targetUsers = await User.find({
        _id: { $in: userIds },
        status: 'active'
      }).session(session)

      if (targetUsers.length === 0) {
        await session.abortTransaction()
        return res.status(404).json({
          message: 'No valid users found'
        })
      }
    } else {
      // If no userIds, send to all active users
      targetUsers = await User.find({ status: 'active' }).session(session)
    }

    // ✅ Use NotificationService for consistent delivery
    const notificationData = {
      type,
      title,
      message,
      data: data || {},
      priority,
      channels
    }

    const results = await NotificationService.sendToMultiple(
      targetUsers.map(u => u._id),
      notificationData
    )

    await session.commitTransaction()

    return res.status(201).json({
      message: 'Notifications sent successfully',
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      sentTo: targetUsers.map(u => ({
        id: u._id,
        email: u.email,
        name: `${u.firstName} ${u.lastName}`
      }))
    })
  } catch (error) {
    await session.abortTransaction()
    console.error('Send custom notification error:', error)
    return res.status(500).json({ message: error.message })
  } finally {
    session.endSession()
  }
}

// @desc    Send notification to specific role - WITH TRANSACTION
// @route   POST /api/notifications/send-to-role
// @access  Private (Admin)
export const sendNotificationToRole = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const {
      role,
      title,
      message,
      type = 'system',
      priority = 'normal',
      channels = ['in_app'],
      data
    } = req.body

    // Validate required fields
    if (!role || !title || !message) {
      await session.abortTransaction()
      return res.status(400).json({
        message: 'Role, title, and message are required'
      })
    }

    // Validate role
    if (!['patient', 'doctor', 'lab_personnel', 'pharmacy_staff', 'admin'].includes(role)) {
      await session.abortTransaction()
      return res.status(400).json({
        message: 'Invalid role. Must be: patient, doctor, lab_personnel, pharmacy_staff, or admin'
      })
    }

    // Get all active users with the specified role
    const targetUsers = await User.find({
      role,
      status: 'active'
    }).session(session)

    if (targetUsers.length === 0) {
      await session.abortTransaction()
      return res.status(404).json({
        message: `No active ${role}s found`
      })
    }

    // ✅ Use NotificationService
    const results = await NotificationService.sendToRole(role, {
      type,
      title,
      message,
      data: data || {},
      priority,
      channels
    })

    await session.commitTransaction()

    return res.status(201).json({
      message: `Notifications sent to all ${role}s successfully`,
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      role: role
    })
  } catch (error) {
    await session.abortTransaction()
    console.error('Send notification to role error:', error)
    return res.status(500).json({ message: error.message })
  } finally {
    session.endSession()
  }
}

// @desc    Get notification statistics
// @route   GET /api/notifications/stats
// @access  Private
export const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user.id

    const stats = await Notification.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          status: 'active',
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: {
            $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] }
          },
          read: {
            $sum: { $cond: [{ $eq: ['$read', true] }, 1, 0] }
          }
        }
      }
    ])

    const typeStats = await Notification.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          status: 'active',
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          unread: {
            $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] }
          }
        }
      }
    ])

    // ✅ Add priority breakdown
    const priorityStats = await Notification.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          status: 'active',
          read: false,
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        }
      },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ])

    const result = stats[0] || { total: 0, unread: 0, read: 0 }

    return res.json({
      total: result.total,
      unread: result.unread,
      read: result.read,
      byType: typeStats.reduce((acc, stat) => {
        acc[stat._id] = {
          total: stat.count,
          unread: stat.unread
        }
        return acc
      }, {}),
      byPriority: priorityStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count
        return acc
      }, {})
    })
  } catch (error) {
    console.error('Get notification stats error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// ✅ NEW: Get notification delivery status
// @route   GET /api/notifications/:id/delivery-status
// @access  Private
export const getDeliveryStatus = async (req, res) => {
  try {
    const { id } = req.params

    const notification = await Notification.findById(id)

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' })
    }

    // Verify ownership
    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' })
    }

    return res.json({
      notificationId: notification._id,
      deliveryStatus: notification.deliveryStatus,
      channels: notification.channels,
      deliveryError: notification.deliveryError,
      retryCount: notification.retryCount,
      lastRetryAt: notification.lastRetryAt
    })
  } catch (error) {
    console.error('Get delivery status error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// ✅ NEW: Retry failed notification
// @route   POST /api/notifications/:id/retry
// @access  Private (Admin)
export const retryFailedNotification = async (req, res) => {
  try {
    const { id } = req.params

    const notification = await Notification.findById(id)

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' })
    }

    if (!notification.canRetry()) {
      return res.status(400).json({
        message: 'Cannot retry this notification',
        reason: notification.retryCount >= 3 ? 'Max retries exceeded' : 'Not in failed state'
      })
    }

    await notification.retry()

    // Attempt re-delivery
    const user = await User.findById(notification.user)
    if (user) {
      await NotificationService.send({
        userId: user._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.metadata,
        priority: notification.priority,
        channels: notification.channels.map(ch => ch.type)
      })
    }

    return res.json({
      message: 'Notification retry initiated',
      notification
    })
  } catch (error) {
    console.error('Retry notification error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// Template management routes (existing code remains the same)
export const getNotificationTemplates = async (req, res) => {
  try {
    const templates = await Setting.find({
      category: 'notification'
    }).sort({ key: 1 })

    const organized = templates.reduce((acc, template) => {
      acc[template.key] = {
        value: template.value,
        description: template.description,
        updatedAt: template.updatedAt
      }
      return acc
    }, {})

    return res.json({
      templates: organized,
      count: templates.length
    })
  } catch (error) {
    console.error('Get notification templates error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const getNotificationTemplate = async (req, res) => {
  try {
    const { key } = req.params

    const template = await Setting.findOne({
      key,
      category: 'notification'
    })

    if (!template) {
      return res.status(404).json({
        message: 'Template not found'
      })
    }

    return res.json(template)
  } catch (error) {
    console.error('Get notification template error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const updateTemplate = async (req, res) => {
  try {
    const { key } = req.params
    const { value, description } = req.body

    if (!value) {
      return res.status(400).json({
        message: 'Template value is required'
      })
    }

    const template = await Setting.findOneAndUpdate(
      { key, category: 'notification' },
      {
        value,
        description: description || '',
        category: 'notification'
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    )

    return res.json({
      message: 'Template updated successfully',
      template
    })
  } catch (error) {
    console.error('Update template error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const createTemplate = async (req, res) => {
  try {
    const { key, value, description } = req.body

    if (!key || !value) {
      return res.status(400).json({
        message: 'Key and value are required'
      })
    }

    const existingTemplate = await Setting.findOne({
      key,
      category: 'notification'
    })

    if (existingTemplate) {
      return res.status(400).json({
        message: 'Template with this key already exists'
      })
    }

    const template = await Setting.create({
      key,
      value,
      description: description || '',
      category: 'notification',
      isPublic: false
    })

    return res.status(201).json({
      message: 'Template created successfully',
      template
    })
  } catch (error) {
    console.error('Create template error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const deleteTemplate = async (req, res) => {
  try {
    const { key } = req.params

    const template = await Setting.findOneAndDelete({
      key,
      category: 'notification'
    })

    if (!template) {
      return res.status(404).json({
        message: 'Template not found'
      })
    }

    return res.json({
      message: 'Template deleted successfully',
      deletedTemplate: {
        key: template.key,
        value: template.value
      }
    })
  } catch (error) {
    console.error('Delete template error:', error)
    return res.status(500).json({ message: error.message })
  }
}
