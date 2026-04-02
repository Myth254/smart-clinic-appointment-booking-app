// middlewares/notificationMiddleware.js
import Notification from '../models/Notification.js'

/**
 * Validate notification type is appropriate for user role
 */
export const validateNotificationType = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id)

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' })
    }

    // Check ownership
    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to access this notification' })
    }

    // Validate notification type for user role
    const allowedTypes = {
      patient: ['appointment', 'session', 'lab', 'prescription', 'payment', 'medical_record', 'reminder', 'alert'],
      doctor: ['appointment', 'session', 'lab', 'prescription', 'medical_record', 'reminder', 'alert'],
      lab_personnel: ['lab', 'system', 'alert'],
      pharmacy_staff: ['prescription', 'system', 'alert'],
      admin: ['system', 'alert', 'appointment', 'lab', 'prescription', 'payment', 'medical_record']
    }

    const userAllowedTypes = allowedTypes[req.user.role] || []

    if (!userAllowedTypes.includes(notification.type)) {
      return res.status(403).json({
        message: 'Invalid notification type for your role',
        allowed: userAllowedTypes,
        received: notification.type
      })
    }

    // Attach notification to request for downstream use
    req.notification = notification
    next()
  } catch (error) {
    console.error('Validate notification type error:', error)
    res.status(500).json({ message: 'Server error validating notification' })
  }
}

/**
 * Rate limit notification creation (prevent spam)
 */
export const notificationRateLimit = async (req, res, next) => {
  try {
    const userId = req.user.id
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    // Count notifications created by this user in last 5 minutes
    const recentCount = await Notification.countDocuments({
      user: userId,
      createdAt: { $gte: fiveMinutesAgo }
    })

    // Allow max 20 notifications per 5 minutes
    if (recentCount > 20) {
      return res.status(429).json({
        message: 'Too many notifications. Please wait before creating more.',
        retryAfter: 300 // seconds
      })
    }

    next()
  } catch (error) {
    console.error('Notification rate limit error:', error)
    // Don't block on rate limit errors
    next()
  }
}

/**
 * Validate bulk notification request (admin only)
 */
export const validateBulkNotification = (req, res, next) => {
  const { userIds, title, message, type } = req.body

  if (!title || !message) {
    return res.status(400).json({
      message: 'Title and message are required'
    })
  }

  if (title.length > 200) {
    return res.status(400).json({
      message: 'Title must be 200 characters or less'
    })
  }

  if (message.length > 1000) {
    return res.status(400).json({
      message: 'Message must be 1000 characters or less'
    })
  }

  const validTypes = ['appointment', 'session', 'lab', 'prescription', 'payment', 'medical_record', 'system', 'reminder', 'alert']
  if (type && !validTypes.includes(type)) {
    return res.status(400).json({
      message: 'Invalid notification type',
      validTypes
    })
  }

  if (userIds && !Array.isArray(userIds)) {
    return res.status(400).json({
      message: 'userIds must be an array'
    })
  }

  if (userIds && userIds.length > 1000) {
    return res.status(400).json({
      message: 'Cannot send to more than 1000 users at once. Use role-based sending instead.'
    })
  }

  next()
}

/**
 * Log notification access for audit trail
 */
/**
 * Log notification access for audit trail
 */
export const logNotificationAccess = (req, res, next) => {
  const originalSend = res.send

  // Map HTTP verbs to domain audit actions
  const getNotificationAuditAction = (method) => {
    switch (method) {
    case 'GET':
      return 'notifications_retrieved'
    case 'POST':
      return 'notification_sent'
    case 'PATCH':
      return 'notification_read'
    case 'DELETE':
      return 'notification_deleted'
    default:
      return 'notifications_retrieved'
    }
  }

  res.send = function (data) {
    // Only log successful responses
    if (res.statusCode >= 200 && res.statusCode < 300) {

      // Hard guard: audit logs require authenticated user
      if (!req.user || !req.user.id) {
        return originalSend.call(this, data)
      }

      const auditPayload = {
        userId: req.user.id,
        action: getNotificationAuditAction(req.method),
        resourceType: 'Notification',
        resourceId: req.params?.id,
        details: {
          endpoint: req.originalUrl,
          method: req.method,
          role: req.user.role
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'success'
      }

      // Fire-and-forget audit logging
      setImmediate(async () => {
        try {
          const { default: logAudit } = await import('../utils/auditLogger.js')
          await logAudit(auditPayload)
        } catch (error) {
          console.error('Audit log error:', error)
        }
      })
    }

    return originalSend.call(this, data)
  }

  next()
}


/**
 * Check if notification is expired
 */
export const checkNotificationExpiry = async (req, res, next) => {
  if (!req.notification) {
    return next()
  }

  if (req.notification.expiresAt && new Date() > req.notification.expiresAt) {
    return res.status(410).json({
      message: 'This notification has expired',
      expiredAt: req.notification.expiresAt
    })
  }

  next()
}

/**
 * Sanitize notification content (prevent XSS)
 */
export const sanitizeNotificationContent = (req, res, next) => {
  if (req.body.title) {
    // Remove HTML tags and scripts
    req.body.title = req.body.title
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim()
  }

  if (req.body.message) {
    // Remove HTML tags and scripts
    req.body.message = req.body.message
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim()
  }

  next()
}

/**
 * Validate notification priority
 */
export const validatePriority = (req, res, next) => {
  const { priority } = req.body

  if (priority) {
    const validPriorities = ['low', 'normal', 'high', 'urgent']

    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        message: 'Invalid priority level',
        validPriorities
      })
    }

    // Only admins can create urgent notifications
    if (priority === 'urgent' && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Only administrators can create urgent notifications'
      })
    }
  }

  next()
}

export default {
  validateNotificationType,
  notificationRateLimit,
  validateBulkNotification,
  logNotificationAccess,
  checkNotificationExpiry,
  sanitizeNotificationContent,
  validatePriority
}