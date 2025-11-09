<<<<<<< Updated upstream
// routes/availabilityRoutes.js
import express from 'express'
import {
  getAvailability,
  setAvailability,
  updateAvailability,
  deleteAvailability,
  blockAvailability,
  getAvailableSlots,
  checkSlotAvailability,
  debugAvailability
} from '../controllers/availabilityController.js'
import { protect, authorize } from '../middlewares/authMiddleware.js'

const router = express.Router()

// ===== PUBLIC/AUTHENTICATED ROUTES =====
// Get available slots for a doctor on a specific date (authenticated users can book)
router.get('/slots/:doctorId/:date', protect, getAvailableSlots)

// Check if specific slot is available
router.post('/check-slot', protect, checkSlotAvailability)

// ===== DOCTOR ROUTES =====
// Get doctor's own availability
router.get('/rules/:doctorId', protect, getAvailability)

// Get doctor's exceptions
router.get('/exceptions/:doctorId', protect, authorize('doctor', 'admin'), getAvailability)

// Create availability rule (Doctor only)
router.post('/rules', protect, authorize('doctor', 'admin'), setAvailability)

// Update availability rule (Doctor/Admin)
router.put('/rules/:availabilityId', protect, authorize('doctor', 'admin'), updateAvailability)

// Delete availability rule (Doctor/Admin)
router.delete('/rules/:availabilityId', protect, authorize('doctor', 'admin'), deleteAvailability)

// Create availability exception (block time)
router.post('/exceptions', protect, authorize('doctor', 'admin'), blockAvailability)

// Update availability exception (Doctor/Admin)
router.put('/exceptions/:availabilityId', protect, authorize('doctor', 'admin'), updateAvailability)

// Delete availability exception (Doctor/Admin)
router.delete('/exceptions/:availabilityId', protect, authorize('doctor', 'admin'), deleteAvailability)

// Block specific date/time
router.post('/block', protect, authorize('doctor', 'admin'), blockAvailability)

router.get('/debug/:doctorId/:date', protect, debugAvailability)
=======
import express from 'express'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import {
  createRule,
  getRulesForDoctor,
  getAvailableSlotsForDoctorOnDate,
  deleteRule
} from '../controllers/availabilityController.js'

const router = express.Router()

router.post('/rules', protect, authorize('doctor'), createRule) // doctor creates their own rules
router.get('/rules/:doctorId', protect, getRulesForDoctor)
router.get('/slots/:doctorId/:date', protect, getAvailableSlotsForDoctorOnDate) // date: YYYY-MM-DD
router.delete('/rules/:id', protect, authorize('doctor'), deleteRule)
>>>>>>> Stashed changes

export default router