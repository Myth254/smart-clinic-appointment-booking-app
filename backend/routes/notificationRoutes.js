// routes/notificationRoutes.js
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
  getNotificationStats
} from '../controllers/notificationController.js'
import { protect, authorize } from '../middlewares/authMiddleware.js'

const router = express.Router()

// All routes require authentication
router.use(protect)

// ===== USER NOTIFICATION ROUTES =====
// Get user notifications
router.get('/', getNotifications)

// Get unread notification count
router.get('/unread-count', getUnreadCount)

// Get notification statistics
router.get('/stats', getNotificationStats)

// Mark all notifications as read
router.put('/mark-all-read', markAllAsRead)

// Clear read notifications
router.delete('/clear-read', clearReadNotifications)

// Mark specific notification as read
router.put('/:id/read', markAsRead)

// Delete specific notification
router.delete('/:id', deleteNotification)

// ===== ADMIN NOTIFICATION ROUTES =====
// Send custom notification to specific users
router.post('/send', authorize('admin'), sendCustomNotification)

// Send notification to all users with specific role
router.post('/send-to-role', authorize('admin'), sendNotificationToRole)

// ===== NOTIFICATION TEMPLATE ROUTES (Admin only) =====
// Get all notification templates
router.get('/templates', authorize('admin'), getNotificationTemplates)

// Create new template
router.post('/templates', authorize('admin'), createTemplate)

// Get specific template
router.get('/templates/:key', authorize('admin'), getNotificationTemplate)

// Update template
router.put('/templates/:key', authorize('admin'), updateTemplate)

// Delete template
router.delete('/templates/:key', authorize('admin'), deleteTemplate)

export default router