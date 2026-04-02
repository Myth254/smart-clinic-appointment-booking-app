// routes/notificationRoutes.js - ENHANCED VERSION
import express from 'express'
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  getUnreadCount,
  sendCustomNotification,
  sendNotificationToRole,
  getNotificationTemplates,
  getNotificationTemplate,
  updateTemplate,
  createTemplate,
  deleteTemplate,
  getNotificationStats,
  getDeliveryStatus,
  retryFailedNotification
} from '../controllers/notificationController.js'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import {
  validateNotificationType,
  notificationRateLimit,
  validateBulkNotification,
  logNotificationAccess,
  checkNotificationExpiry,
  sanitizeNotificationContent,
  validatePriority
} from '../middlewares/notificationMiddleware.js'

const router = express.Router()

// All routes require authentication
router.use(protect)

// ===== USER NOTIFICATION ROUTES =====

// Get user notifications (with logging)
router.get('/', logNotificationAccess, getNotifications)

// Get unread notification count
router.get('/unread-count', getUnreadCount)

// Get notification statistics
router.get('/stats', getNotificationStats)

// Mark all notifications as read
router.put('/mark-all-read', markAllAsRead)

// Clear read notifications
router.delete('/clear-read', clearReadNotifications)

// ✅ Get delivery status for specific notification
router.get(
  '/:id/delivery-status',
  validateNotificationType,
  getDeliveryStatus
)

// Mark specific notification as read (with validation)
router.put(
  '/:id/read',
  validateNotificationType,
  checkNotificationExpiry,
  logNotificationAccess,
  markAsRead
)

// Delete specific notification (with validation)
router.delete(
  '/:id',
  validateNotificationType,
  logNotificationAccess,
  deleteNotification
)

// ===== ADMIN NOTIFICATION ROUTES =====

// Send custom notification to specific users (with validation and rate limiting)
router.post(
  '/send',
  authorize('admin'),
  sanitizeNotificationContent,
  validatePriority,
  validateBulkNotification,
  notificationRateLimit,
  sendCustomNotification
)

// Send notification to all users with specific role
router.post(
  '/send-to-role',
  authorize('admin'),
  sanitizeNotificationContent,
  validatePriority,
  validateBulkNotification,
  sendNotificationToRole
)

// ✅ Retry failed notification
router.post(
  '/:id/retry',
  authorize('admin'),
  retryFailedNotification
)

// ===== NOTIFICATION TEMPLATE ROUTES (Admin only) =====

// Get all notification templates
router.get('/templates', authorize('admin'), getNotificationTemplates)

// Create new template
router.post(
  '/templates',
  authorize('admin'),
  sanitizeNotificationContent,
  createTemplate
)

// Get specific template
router.get('/templates/:key', authorize('admin'), getNotificationTemplate)

// Update template
router.put(
  '/templates/:key',
  authorize('admin'),
  sanitizeNotificationContent,
  updateTemplate
)

// Delete template
router.delete('/templates/:key', authorize('admin'), deleteTemplate)

export default router