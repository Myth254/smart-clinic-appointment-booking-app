import express from 'express'
import { protect, checkPermission, authorize } from '../middlewares/authMiddleware.js'
import { PERMISSIONS } from '../utils/permissions.js'
import {
  createPrescription,
  getPrescriptions,
  getPrescriptionById,
  confirmAvailability,
  markReadyForPickup,
  dispensePrescription,
  addPrescriptionComment,
  cancelPrescription,
  getPharmacyStats,
  approveAlternative
} from '../controllers/pharmacyController.js'

const router = express.Router()

// All routes require authentication
router.use(protect)

// @desc    Create prescription
// @route   POST /api/pharmacy/prescriptions
// @access  Doctor only
router.post(
  '/prescriptions',
  checkPermission(PERMISSIONS.CREATE_PRESCRIPTIONS),
  createPrescription
)

// @desc    Get prescriptions (filtered by role)
// @route   GET /api/pharmacy/prescriptions
// @access  Doctor (own), Pharmacy Staff (active), Patient (own), Admin (all)
router.get(
  '/prescriptions',
  checkPermission(
    PERMISSIONS.VIEW_PRESCRIPTIONS,
    PERMISSIONS.CREATE_PRESCRIPTIONS,
    PERMISSIONS.PICKUP_PRESCRIPTIONS,
    PERMISSIONS.VIEW_ALL_RECORDS
  ),
  getPrescriptions
)

// @desc    Get single prescription
// @route   GET /api/pharmacy/prescriptions/:id
// @access  Doctor (own), Pharmacy Staff, Patient (own), Admin
router.get(
  '/prescriptions/:id',
  checkPermission(
    PERMISSIONS.VIEW_PRESCRIPTIONS,
    PERMISSIONS.CREATE_PRESCRIPTIONS,
    PERMISSIONS.PICKUP_PRESCRIPTIONS,
    PERMISSIONS.VIEW_ALL_RECORDS
  ),
  getPrescriptionById
)

// @desc    Confirm drug availability
// @route   PATCH /api/pharmacy/prescriptions/:id/confirm-availability
// @access  Pharmacy Staff only
router.patch(
  '/prescriptions/:id/confirm-availability',
  checkPermission(PERMISSIONS.CONFIRM_MEDICATION_AVAILABILITY),
  confirmAvailability
)

// @desc    Mark prescription ready for pickup
// @route   PATCH /api/pharmacy/prescriptions/:id/ready
// @access  Pharmacy Staff only
router.patch(
  '/prescriptions/:id/ready',
  checkPermission(PERMISSIONS.SET_READY_FOR_PICKUP),
  markReadyForPickup
)

// @desc    Dispense prescription
// @route   PATCH /api/pharmacy/prescriptions/:id/dispense
// @access  Pharmacy Staff only
router.patch(
  '/prescriptions/:id/dispense',
  checkPermission(PERMISSIONS.MARK_DISPENSED),
  dispensePrescription
)

// @desc    Add comment to prescription
// @route   POST /api/pharmacy/prescriptions/:id/comments
// @access  Doctor, Pharmacy Staff, Admin
router.post(
  '/prescriptions/:id/comments',
  checkPermission(
    PERMISSIONS.VIEW_PRESCRIPTIONS,
    PERMISSIONS.CREATE_PRESCRIPTIONS,
    PERMISSIONS.VIEW_ALL_RECORDS
  ),
  addPrescriptionComment
)

// @desc    Cancel prescription
// @route   PATCH /api/pharmacy/prescriptions/:id/cancel
// @access  Doctor or Patient (own)
router.patch(
  '/prescriptions/:id/cancel',
  checkPermission(
    PERMISSIONS.CREATE_PRESCRIPTIONS,
    PERMISSIONS.PICKUP_PRESCRIPTIONS
  ),
  cancelPrescription
)

// @desc    Get pharmacy dashboard stats
// @route   GET /api/pharmacy/stats
// @access  Pharmacy Staff, Admin
router.get(
  '/stats',
  checkPermission(
    PERMISSIONS.VIEW_PRESCRIPTIONS,
    PERMISSIONS.VIEW_ALL_RECORDS
  ),
  authorize('pharmacy_staff', 'admin'),
  getPharmacyStats
)

router.patch(
  '/prescriptions/:id/approve-alternative',
  protect,
  checkPermission(PERMISSIONS.CREATE_PRESCRIPTIONS),
  approveAlternative
)

export default router