// routes/appointmentRoutes.js
import express from 'express'
import {
  createAppointment,
  getAppointments,
  getAppointmentById,
  dismissFollowUpReminder,
  updateAppointmentStatus,
  rescheduleAppointment,
  deleteAppointment,
  checkConflicts,
  getAppointmentsByDoctor,
  getAppointmentsByPatient,
  startAppointmentSession
} from '../controllers/appointmentController.js'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import { validateAppointmentBooking } from '../middlewares/validation.js'

const router = express.Router()

// All routes require authentication
router.use(protect)

// Create appointment (Patient only)
router.post('/', authorize('patient'), validateAppointmentBooking, createAppointment)

// Get all appointments (role-based filtering)
router.get('/', getAppointments)

// Check for conflicts
router.post('/check-conflicts', checkConflicts)

// Get appointments by doctor
router.get('/doctor/:doctorId', authorize('doctor', 'admin'), getAppointmentsByDoctor)

// Get appointments by patient
router.get('/patient/:patientId', authorize('patient', 'admin'), getAppointmentsByPatient)

// Get single appointment
router.get('/:id', getAppointmentById)

// Dismiss follow-up reminder for current patient
router.put('/:id/follow-up-reminder/dismiss', authorize('patient'), dismissFollowUpReminder)

// Update appointment status (Doctor/Admin)
router.put('/:id/status', authorize('doctor', 'admin'), updateAppointmentStatus)

// Reschedule appointment (Patient/Doctor/Admin)
router.put('/:id/reschedule', authorize('patient', 'doctor', 'admin'), rescheduleAppointment)

router.post('/:id/start-session', protect, authorize('doctor'), startAppointmentSession)

// Delete appointment (Admin only)
router.delete('/:id', authorize('admin'), deleteAppointment)

export default router
