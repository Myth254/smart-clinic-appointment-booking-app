// routes/adminRoutes.js
import express from 'express'
import {
  getDashboardStats,
  getAppointmentAnalytics,
  getRevenueAnalytics,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  resetUserPassword,
  getAllDoctors,
  getAllAppointments,
  getSystemSettings,
  updateSystemSettings,
  getRecentUsers
} from '../controllers/adminController.js'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import { validateAdminUserCreation } from '../middlewares/validation.js'

const router = express.Router()

// All routes require admin authentication
router.use(protect, authorize('admin'))

// ===== DASHBOARD & ANALYTICS =====
// Get dashboard statistics
router.get('/stats', getDashboardStats)

// Get appointment analytics
router.get('/analytics/appointments', getAppointmentAnalytics)

// Get revenue analytics
router.get('/analytics/revenue', getRevenueAnalytics)

// ===== USER MANAGEMENT =====
// Get all users with filtering and pagination
router.get('/users', getAllUsers)

// Get recent user registrations
router.get('/users/recent', getRecentUsers)

// Create new user (patient, doctor, or admin)
router.post('/users', validateAdminUserCreation, createUser)

// Get specific user by ID with detailed stats
router.get('/users/:id', getUserById)

// Update user information
router.put('/users/:id', updateUser)

// Update user status (active/inactive/suspended)
router.put('/users/:id/status', updateUserStatus)

// Reset user password
router.put('/users/:id/reset-password', resetUserPassword)

// Delete user account
router.delete('/users/:id', deleteUser)

// ===== DOCTOR MANAGEMENT =====
// Get all doctors with stats
router.get('/doctors', getAllDoctors)

// ===== APPOINTMENT MANAGEMENT =====
// Get all appointments (admin oversight)
router.get('/appointments', getAllAppointments)

// ===== SYSTEM SETTINGS =====
// Get system settings
router.get('/settings', getSystemSettings)

// Update system settings
router.put('/settings', updateSystemSettings)

export default router