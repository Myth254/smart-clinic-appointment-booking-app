// routes/adminRoutes.js - ENHANCED VERSION
import express from 'express'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import { validateAdminUserCreation } from '../middlewares/validation.js'
import {
  // Dashboard & Analytics
  getDashboardStats,
  getAppointmentAnalytics,
  getRevenueAnalytics,

  // User Management
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  resetUserPassword,
  getRecentUsers,

  // Doctor Management
  getAllDoctors,

  //  Appointment Management
  getAllAppointments,
  approveAppointment,
  rejectAppointment,
  getAppointmentDetails,

  // Session Oversight
  getAllSessions,
  getSessionDetails,

  // Lab Oversight
  getLabRequestDetails,
  reassignLabRequest,
  escalateLabRequest,

  // Pharmacy Oversight
  getPrescriptionDetails,

  // Payment Oversight
  getAllPayments,
  reconcilePayment,
  unlockService,

  // Notification Monitoring
  getFailedNotifications,
  retryNotification,

  // Workflow Analytics
  getWorkflowMetrics,
  getBottleneckAnalysis,

  // System Settings
  getSystemSettings,
  updateSystemSettings,

  // Audit Logs
  getAuditLogs,
  getAuditLogById,
  getAuditStats,
  getLabMetrics,
  getPharmacyMetrics
} from '../controllers/adminController.js'
import { cleanupPastAppointments } from '../jobs/appointmentCleanup.js'

const router = express.Router()

// All routes require admin authorization
router.use(protect)
router.use(authorize('admin'))

// ===== DASHBOARD & ANALYTICS =====
router.get('/stats', getDashboardStats)
router.get('/analytics/appointments', getAppointmentAnalytics)
router.get('/analytics/revenue', getRevenueAnalytics)
router.get('/analytics/workflow', getWorkflowMetrics)
router.get('/analytics/bottlenecks', getBottleneckAnalysis)

// ===== USER MANAGEMENT =====
router.get('/users', getAllUsers)
router.post('/users', validateAdminUserCreation, createUser)
router.get('/users/recent', getRecentUsers)
router.get('/users/:id', getUserById)
router.put('/users/:id', updateUser)
router.put('/users/:id/status', updateUserStatus)
router.delete('/users/:id', deleteUser)
router.put('/users/:id/reset-password', resetUserPassword)

// ===== DOCTOR MANAGEMENT =====
router.get('/doctors', getAllDoctors)

// ===== APPOINTMENT MANAGEMENT (ENHANCED) =====
router.get('/appointments', getAllAppointments)
router.post('/appointments/:id/approve', approveAppointment)
router.post('/appointments/:id/reject', rejectAppointment)
router.get('/appointments/:id/details', getAppointmentDetails)

// ===== SESSION OVERSIGHT =====
router.get('/sessions', getAllSessions)
router.get('/sessions/:id', getSessionDetails)

// ===== LAB OVERSIGHT =====
router.get('/lab/metrics', getLabMetrics)
router.get('/lab/requests/:id', getLabRequestDetails)
router.patch('/lab/requests/:id/reassign', reassignLabRequest)
router.patch('/lab/requests/:id/escalate', escalateLabRequest)

// ===== PHARMACY OVERSIGHT =====
router.get('/pharmacy/metrics', getPharmacyMetrics)
router.get('/pharmacy/prescriptions/:id', getPrescriptionDetails)

// ===== PAYMENT OVERSIGHT =====
router.get('/payments', getAllPayments)
router.post('/payments/:id/reconcile', reconcilePayment)
router.post('/payments/:id/unlock', unlockService)

// ===== NOTIFICATION MONITORING =====
router.get('/notifications/failed', getFailedNotifications)
router.post('/notifications/:id/retry', retryNotification)

// ===== SYSTEM SETTINGS =====
router.get('/settings', getSystemSettings)
router.put('/settings', updateSystemSettings)

// ===== AUDIT LOGS =====
router.get('/audit-logs', getAuditLogs)
router.get('/audit-logs/stats', getAuditStats)
router.get('/audit-logs/:id', getAuditLogById)


router.post('/maintenance/cleanup-appointments', async (req, res) => {
  try {
    const count = await cleanupPastAppointments()
    res.json({
      success: true,
      message: `Cleaned up ${count} past appointments`,
      count
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

export default router