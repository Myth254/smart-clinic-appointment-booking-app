<<<<<<< Updated upstream
// routes/appointmentRoutes.js
import express from 'express'
import {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  rescheduleAppointment,
  deleteAppointment,
  checkConflicts,
  getAppointmentsByDoctor,
  getAppointmentsByPatient
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

// Update appointment status (Doctor/Admin)
router.put('/:id/status', authorize('doctor', 'admin'), updateAppointmentStatus)

// Reschedule appointment (Patient/Doctor/Admin)
router.put('/:id/reschedule', authorize('patient', 'doctor', 'admin'), rescheduleAppointment)

// Delete appointment (Admin only)
router.delete('/:id', authorize('admin'), deleteAppointment)
=======
import express from 'express'
import {
  createAppointment,
  getDoctorAppointments,
  getPatientAppointments,
  getAppointments,
  updateAppointmentStatus,
  deleteAppointment,
} from '../controllers/appointmentController.js'
import { protect, adminOnly } from '../middlewares/authMiddleware.js'

const router = express.Router()

// Patient creates and views their appointments
router.post('/', protect, createAppointment)
router.get('/patient', protect, getPatientAppointments)

// Doctor can view their own appointments
router.get('/doctor', protect, getDoctorAppointments)

// Admin-only routes
router.get('/', protect, adminOnly, getAppointments)
router.put('/:id/status', protect, updateAppointmentStatus)
router.delete('/:id', protect, adminOnly, deleteAppointment)
>>>>>>> Stashed changes

export default router