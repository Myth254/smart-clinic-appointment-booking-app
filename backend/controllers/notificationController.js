// controllers/notificationController.js
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import Setting from '../models/Setting.js'
import sendEmail from '../utils/sendEmail.js'

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
export const getNotifications = async (req, res) => {
  try {
    const { read, type, limit = 20, offset = 0 } = req.query

    // Build query
    const query = { user: req.user.id }

    if (read !== undefined) {
      query.read = read === 'true'
    }

    if (type) {
      query.type = type
    }

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ sentAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    // Get total count
    const total = await Notification.countDocuments(query)
    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      read: false
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

    // Update notification
    notification.read = true
    notification.readAt = new Date()
    await notification.save()

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
      { user: req.user.id, read: false },
      {
        read: true,
        readAt: new Date()
      }
    )

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
      read: false
    })

    return res.json({ unreadCount })
  } catch (error) {
    console.error('Get unread count error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Send custom notification (Admin only)
// @route   POST /api/notifications/send
// @access  Private (Admin)
export const sendCustomNotification = async (req, res) => {
  try {
    const {
      userIds,
      title,
      message,
      type = 'system',
      sendEmail: shouldSendEmail = false,
      sendSMS: shouldSendSMS = false,
      data
    } = req.body

    // Validate required fields
    if (!title || !message) {
      return res.status(400).json({
        message: 'Title and message are required'
      })
    }

    // Validate notification type
    const validTypes = ['appointment', 'reminder', 'cancellation', 'rescheduled', 'message', 'system']
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        message: 'Invalid notification type'
      })
    }

    let targetUsers = []

    // If userIds provided, validate them
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      targetUsers = await User.find({
        _id: { $in: userIds },
        status: 'active'
      })

      if (targetUsers.length === 0) {
        return res.status(404).json({
          message: 'No valid users found'
        })
      }
    } else {
      // If no userIds, send to all active users
      targetUsers = await User.find({ status: 'active' })
    }

    // Create notifications in bulk
    const notifications = targetUsers.map(user => ({
      user: user._id,
      type,
      title,
      message,
      data: data || {},
      read: false,
      sentAt: new Date()
    }))

    const createdNotifications = await Notification.insertMany(notifications)

    // Send emails if requested
    if (shouldSendEmail) {
      const emailPromises = targetUsers.map(user =>
        sendEmail({
          to: user.email,
          subject: title,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>${title}</h2>
              <p>${message}</p>
              <hr style="border: 1px solid #eee; margin: 20px 0;">
              <p style="font-size: 12px; color: #666;">
                This is an automated notification from MediBook.
              </p>
            </div>
          `
        }).catch(err => {
          console.error(`Failed to send email to ${user.email}:`, err)
          return null
        })
      )

      await Promise.allSettled(emailPromises)
    }

    // TODO: Implement SMS sending if shouldSendSMS is true
    if (shouldSendSMS) {
      console.log('SMS sending not implemented yet')
    }

    return res.status(201).json({
      message: 'Notifications sent successfully',
      count: createdNotifications.length,
      sentTo: targetUsers.map(u => ({
        id: u._id,
        email: u.email,
        name: `${u.firstName} ${u.lastName}`
      }))
    })
  } catch (error) {
    console.error('Send custom notification error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Send notification to specific role
// @route   POST /api/notifications/send-to-role
// @access  Private (Admin)
export const sendNotificationToRole = async (req, res) => {
  try {
    const {
      role,
      title,
      message,
      type = 'system',
      sendEmail: shouldSendEmail = false,
      data
    } = req.body

    // Validate required fields
    if (!role || !title || !message) {
      return res.status(400).json({
        message: 'Role, title, and message are required'
      })
    }

    // Validate role
    if (!['patient', 'doctor', 'admin'].includes(role)) {
      return res.status(400).json({
        message: 'Invalid role. Must be: patient, doctor, or admin'
      })
    }

    // Get all active users with the specified role
    const targetUsers = await User.find({
      role,
      status: 'active'
    })

    if (targetUsers.length === 0) {
      return res.status(404).json({
        message: `No active ${role}s found`
      })
    }

    // Create notifications
    const notifications = targetUsers.map(user => ({
      user: user._id,
      type,
      title,
      message,
      data: data || {},
      read: false,
      sentAt: new Date()
    }))

    const createdNotifications = await Notification.insertMany(notifications)

    // Send emails if requested
    if (shouldSendEmail) {
      const emailPromises = targetUsers.map(user =>
        sendEmail({
          to: user.email,
          subject: title,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>${title}</h2>
              <p>Hello ${user.firstName},</p>
              <p>${message}</p>
              <hr style="border: 1px solid #eee; margin: 20px 0;">
              <p style="font-size: 12px; color: #666;">
                This message was sent to all ${role}s in the system.
              </p>
            </div>
          `
        }).catch(err => {
          console.error(`Failed to send email to ${user.email}:`, err)
          return null
        })
      )

      await Promise.allSettled(emailPromises)
    }

    return res.status(201).json({
      message: `Notifications sent to all ${role}s successfully`,
      count: createdNotifications.length,
      role: role
    })
  } catch (error) {
    console.error('Send notification to role error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get notification templates
// @route   GET /api/notifications/templates
// @access  Private (Admin)
export const getNotificationTemplates = async (req, res) => {
  try {
    const templates = await Setting.find({
      category: 'notification'
    }).sort({ key: 1 })

    // Organize templates by key
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

// @desc    Get specific notification template
// @route   GET /api/notifications/templates/:key
// @access  Private (Admin)
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

// @desc    Update notification template
// @route   PUT /api/notifications/templates/:key
// @access  Private (Admin)
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

// @desc    Create notification template
// @route   POST /api/notifications/templates
// @access  Private (Admin)
export const createTemplate = async (req, res) => {
  try {
    const { key, value, description } = req.body

    if (!key || !value) {
      return res.status(400).json({
        message: 'Key and value are required'
      })
    }

    // Check if template already exists
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

// @desc    Delete notification template
// @route   DELETE /api/notifications/templates/:key
// @access  Private (Admin)
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

// @desc    Get notification statistics
// @route   GET /api/notifications/stats
// @access  Private
export const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user.id

    const stats = await Notification.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: {
            $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] }
          },
          read: {
            $sum: { $cond: [{ $eq: ['$read', true] }, 1, 0] }
          },
          byType: {
            $push: '$type'
          }
        }
      }
    ])

    const typeStats = await Notification.aggregate([
      { $match: { user: userId } },
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
      }, {})
    })
  } catch (error) {
    console.error('Get notification stats error:', error)
    return res.status(500).json({ message: error.message })
  }
}