// routes/patientRoutes.js
import express from 'express'
import {
  getProfile,
  updateProfile,
  getStats,
  getAppointments,
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
  getMedicalRecords,
  getMedicalRecordById,
  getNotifications,
  markNotificationRead,
  getUnreadCount,
  markAllNotificationsRead,
  getAllDoctors
} from '../controllers/patientController.js'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import {
  validateProfileUpdate,
  validateAppointmentBooking
} from '../middlewares/validation.js'

const router = express.Router()

// All routes are protected and require authentication
router.use(protect)

// Public route to get all doctors
router.get('/doctors', getAllDoctors)

// Profile routes
router.get('/:id', authorize('patient', 'admin'), getProfile)
router.put('/:id', authorize('patient'), validateProfileUpdate, updateProfile)
router.get('/:id/stats', authorize('patient', 'admin'), getStats)

// Appointment routes
router.get('/:id/appointments', authorize('patient', 'admin'), getAppointments)
router.post('/:id/appointments', authorize('patient'), validateAppointmentBooking, bookAppointment)
router.put('/:id/appointments/:appointmentId', authorize('patient'), rescheduleAppointment)
router.delete('/:id/appointments/:appointmentId', authorize('patient'), cancelAppointment)

// Medical records routes
router.get('/:id/medical-records', authorize('patient', 'admin'), getMedicalRecords)
router.get('/:id/medical-records/:recordId', authorize('patient', 'admin'), getMedicalRecordById)

// Notification routes
router.get('/:id/notifications', authorize('patient'), getNotifications)
router.get('/:id/notifications/unread-count', authorize('patient'), getUnreadCount)
router.put('/:id/notifications/:notificationId/read', authorize('patient'), markNotificationRead)
router.put('/:id/notifications/mark-all-read', authorize('patient'), markAllNotificationsRead)

export default router