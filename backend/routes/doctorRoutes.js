import express from 'express'
import {
  getProfile,
  updateProfile,
  getStats,
  getAppointments,
  updateAppointmentStatus,
  addMedicalNotes,
  getPatients,
  getPatientDetails,
  getPatientHistory,
  getCalendar,
  getAllDoctors
} from '../controllers/doctorController.js'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import {
  validateProfileUpdate,
  validateMedicalRecord
} from '../middlewares/validation.js'

const router = express.Router()

// All routes require authentication and doctor role
router.use(protect)

router.use(authorize('doctor'))

// Public route to get all doctors
router.get('/all', getAllDoctors)

// Profile routes
router.get('/profile', getProfile)
router.put('/profile', validateProfileUpdate, updateProfile)

// Stats route
router.get('/stats', getStats)

// Appointment routes
router.get('/appointments', getAppointments)
router.put('/appointments/:appointmentId/status', updateAppointmentStatus)
router.post('/appointments/:appointmentId/notes', validateMedicalRecord, addMedicalNotes)

// Patient routes
router.get('/patients', getPatients)
router.get('/patients/:patientId', getPatientDetails)
router.get('/patients/:patientId/history', getPatientHistory)

// Calendar route
router.get('/calendar', getCalendar)

export default router