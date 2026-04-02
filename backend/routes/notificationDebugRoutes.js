/* eslint-disable no-unused-vars */
// routes/notificationDebugRoutes.js
// TEMPORARY DEBUG ROUTES - Remove in production!
import express from 'express'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import { emitNotification } from '../socket.js'
import mongoose from 'mongoose'

let io

const router = express.Router()

// ===== DEBUG ROUTES - ONLY FOR DEVELOPMENT =====

/**
 * @route   GET /api/notifications/debug/check
 * @desc    Check notification system health
 * @access  Private
 */
router.get('/debug/check', protect, async (req, res) => {
  try {
    const userId = req.user.id

    // 1. Check database connection
    const dbConnected = mongoose.connection.readyState === 1

    // 2. Check user exists
    const user = await User.findById(userId)

    // 3. Check notifications for user
    const notifications = await Notification.find({ user: userId }).limit(10)
    const unreadCount = await Notification.countDocuments({
      user: userId,
      read: false
    })

    // 4. Check notification stats
    const stats = await Notification.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] } },
          byType: { $push: '$type' },
          byPriority: { $push: '$priority' }
        }
      }
    ])

    // 5. Check Socket.IO status
    const socketStatus = {
      available: typeof io !== 'undefined',
      connected: io ? io.sockets.sockets.size : 0
    }

    return res.json({
      status: 'healthy',
      timestamp: new Date(),
      database: {
        connected: dbConnected,
        status: dbConnected ? 'connected' : 'disconnected'
      },
      user: {
        id: userId,
        email: user?.email,
        role: user?.role,
        exists: !!user
      },
      notifications: {
        total: notifications.length,
        unreadCount,
        sample: notifications.slice(0, 3),
        stats: stats[0] || {}
      },
      socket: socketStatus,
      endpoints: {
        getNotifications: '/api/notifications',
        getUnreadCount: '/api/notifications/unread-count',
        markAsRead: '/api/notifications/:id/read',
        createTest: '/api/notifications/debug/create-test'
      }
    })

  } catch (error) {
    console.error('Debug check error:', error)
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

/**
 * @route   POST /api/notifications/debug/create-test
 * @desc    Create a test notification for current user
 * @access  Private
 */
router.post('/debug/create-test', protect, async (req, res) => {
  try {
    const { type, priority, title, message } = req.body

    const testNotification = await Notification.create({
      user: req.user.id,
      type: type || 'system',
      title: title || '🧪 Test Notification',
      message: message || `This is a test notification created at ${new Date().toLocaleString()}`,
      priority: priority || 'normal',
      read: false,
      channels: [{
        type: 'in_app',
        status: 'delivered',
        deliveredAt: new Date()
      }],
      metadata: {
        isTest: true,
        createdVia: 'debug-endpoint',
        timestamp: new Date()
      }
    })

    // Emit via socket
    try {
      emitNotification(req.user.id, testNotification)
      console.log('✅ Test notification emitted via socket')
    } catch (socketError) {
      console.warn('⚠️ Socket emission failed:', socketError.message)
    }

    return res.status(201).json({
      success: true,
      message: 'Test notification created',
      notification: testNotification,
      instructions: {
        frontend: 'Check your notification bell - you should see this notification',
        unreadCount: 'Unread count should have increased by 1',
        socket: 'If socket is connected, notification appeared immediately'
      }
    })

  } catch (error) {
    console.error('Create test notification error:', error)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * @route   POST /api/notifications/debug/create-multiple
 * @desc    Create multiple test notifications at once
 * @access  Private
 */
router.post('/debug/create-multiple', protect, async (req, res) => {
  try {
    const { count = 5 } = req.body
    const userId = req.user.id

    const notificationTypes = [
      { type: 'appointment', title: 'Appointment Reminder', priority: 'high' },
      { type: 'lab', title: 'Lab Results Ready', priority: 'normal' },
      { type: 'prescription', title: 'Prescription Ready', priority: 'normal' },
      { type: 'payment', title: 'Payment Received', priority: 'low' },
      { type: 'system', title: 'System Update', priority: 'normal' },
      { type: 'reminder', title: 'Medication Reminder', priority: 'high' },
      { type: 'alert', title: 'Important Alert', priority: 'urgent' }
    ]

    const notifications = []
    for (let i = 0; i < Math.min(count, 20); i++) {
      const template = notificationTypes[i % notificationTypes.length]

      const notification = await Notification.create({
        user: userId,
        type: template.type,
        title: `${template.title} #${i + 1}`,
        message: `Test notification ${i + 1} created at ${new Date().toLocaleString()}`,
        priority: template.priority,
        read: i % 3 === 0, // Mark every 3rd as read
        readAt: i % 3 === 0 ? new Date() : undefined,
        channels: [{
          type: 'in_app',
          status: 'delivered',
          deliveredAt: new Date()
        }],
        metadata: {
          isTest: true,
          batch: true,
          number: i + 1
        }
      })

      notifications.push(notification)

      // Emit via socket (only unread ones)
      if (!notification.read) {
        try {
          emitNotification(userId, notification)
        } catch (socketError) {
          console.warn('Socket emission failed:', socketError.message)
        }
      }

      // Small delay between notifications
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const unreadCount = notifications.filter(n => !n.read).length

    return res.status(201).json({
      success: true,
      message: `Created ${notifications.length} test notifications`,
      notifications: notifications.map(n => ({
        id: n._id,
        type: n.type,
        title: n.title,
        read: n.read
      })),
      summary: {
        total: notifications.length,
        unread: unreadCount,
        read: notifications.length - unreadCount
      }
    })

  } catch (error) {
    console.error('Create multiple test notifications error:', error)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * @route   DELETE /api/notifications/debug/clear-all
 * @desc    Delete all notifications for current user (DANGEROUS!)
 * @access  Private
 */
router.delete('/debug/clear-all', protect, async (req, res) => {
  try {
    const result = await Notification.deleteMany({ user: req.user.id })

    return res.json({
      success: true,
      message: 'All notifications deleted',
      deletedCount: result.deletedCount
    })

  } catch (error) {
    console.error('Clear all notifications error:', error)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * @route   DELETE /api/notifications/debug/clear-test
 * @desc    Delete only test notifications
 * @access  Private
 */
router.delete('/debug/clear-test', protect, async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      user: req.user.id,
      'metadata.isTest': true
    })

    return res.json({
      success: true,
      message: 'Test notifications deleted',
      deletedCount: result.deletedCount
    })

  } catch (error) {
    console.error('Clear test notifications error:', error)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * @route   POST /api/notifications/debug/test-socket
 * @desc    Test socket emission
 * @access  Private
 */
router.post('/debug/test-socket', protect, async (req, res) => {
  try {
    const testData = {
      _id: 'socket-test-' + Date.now(),
      title: 'Socket Test Notification',
      message: 'If you see this immediately, Socket.IO is working!',
      type: 'system',
      priority: 'high',
      read: false,
      createdAt: new Date()
    }

    emitNotification(req.user.id, testData)

    return res.json({
      success: true,
      message: 'Socket emission attempted',
      data: testData,
      instructions: 'Check your frontend - notification should appear immediately without refresh'
    })

  } catch (error) {
    console.error('Test socket error:', error)
    return res.status(500).json({
      success: false,
      message: error.message,
      note: 'Socket.IO might not be properly initialized'
    })
  }
})

/**
 * @route   GET /api/notifications/debug/stats
 * @desc    Get detailed notification statistics
 * @access  Private (Admin only for production)
 */
router.get('/debug/stats', protect, async (req, res) => {
  try {
    const userId = req.user.id

    const stats = await Notification.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                unread: { $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] } },
                read: { $sum: { $cond: [{ $eq: ['$read', true] }, 1, 0] } }
              }
            }
          ],
          byType: [
            {
              $group: {
                _id: '$type',
                count: { $sum: 1 },
                unread: { $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] } }
              }
            },
            { $sort: { count: -1 } }
          ],
          byPriority: [
            {
              $group: {
                _id: '$priority',
                count: { $sum: 1 },
                unread: { $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] } }
              }
            },
            { $sort: { count: -1 } }
          ],
          recent: [
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            {
              $project: {
                title: 1,
                type: 1,
                priority: 1,
                read: 1,
                createdAt: 1
              }
            }
          ]
        }
      }
    ])

    return res.json({
      success: true,
      stats: stats[0]
    })

  } catch (error) {
    console.error('Get stats error:', error)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

export default router

// ===== ADD TO YOUR MAIN APP =====
/*
// In your server.js or app.js:

import notificationDebugRoutes from './routes/notificationDebugRoutes.js';

// ONLY in development
if (process.env.NODE_ENV === 'development') {
  app.use('/api/notifications', notificationDebugRoutes);
  console.log('🔧 Debug routes enabled at /api/notifications/debug/*');
}
*/