import express from 'express'
import {
  getAllSpecialties,
  getSpecialtyById,
  getDoctorsBySpecialty,
  createSpecialty,
  updateSpecialty,
  deleteSpecialty,
  updateSpecialtyStatus,
  getSpecialtyStats,
  getPopularSpecialties
} from '../controllers/specialtyController.js'
import { protect, authorize } from '../middlewares/authMiddleware.js'

const router = express.Router()

// ===== PUBLIC ROUTES =====
// Get popular specialties
router.get('/popular', getPopularSpecialties)

// Get all specialties (with optional filters)
router.get('/', getAllSpecialties)

// Get specialty by ID
router.get('/:id', getSpecialtyById)

// Get doctors by specialty name
router.get('/:specialtyName/doctors', getDoctorsBySpecialty)

// ===== ADMIN ROUTES =====
// Create new specialty
router.post('/', protect, authorize('admin'), createSpecialty)

// Update specialty
router.put('/:id', protect, authorize('admin'), updateSpecialty)

// Update specialty status
router.put('/:id/status', protect, authorize('admin'), updateSpecialtyStatus)

// Get specialty statistics
router.get('/:id/stats', protect, authorize('admin'), getSpecialtyStats)

// Delete specialty
router.delete('/:id', protect, authorize('admin'), deleteSpecialty)

export default router