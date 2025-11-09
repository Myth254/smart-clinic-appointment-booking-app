import express from 'express'
import {
  getAllClinics,
  getClinicById,
  getDoctorsByClinic,
  createClinic,
  updateClinic,
  deleteClinic,
  updateClinicStatus,
  getClinicStats
} from '../controllers/clinicController.js'
import { protect, authorize } from '../middlewares/authMiddleware.js'

const router = express.Router()

// ===== PUBLIC ROUTES =====
// Get all clinics (with optional filters)
router.get('/', getAllClinics)

// Get clinic by ID
router.get('/:id', getClinicById)

// Get doctors by clinic
router.get('/:id/doctors', getDoctorsByClinic)

// ===== ADMIN ROUTES =====
// Create new clinic
router.post('/', protect, authorize('admin'), createClinic)

// Update clinic
router.put('/:id', protect, authorize('admin'), updateClinic)

// Update clinic status
router.put('/:id/status', protect, authorize('admin'), updateClinicStatus)

// Get clinic statistics
router.get('/:id/stats', protect, authorize('admin'), getClinicStats)

// Delete clinic
router.delete('/:id', protect, authorize('admin'), deleteClinic)

export default router