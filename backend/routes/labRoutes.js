// routes/labRoutes.js
import express from 'express'
import { protect, checkPermission, authorize } from '../middlewares/authMiddleware.js'
import { PERMISSIONS } from '../utils/permissions.js'
import {
  createLabRequest,
  getLabRequests,
  getLabRequestById,
  assignLabRequest,
  updateLabRequestStatus,
  uploadLabResults,
  addLabComment,
  rejectLabRequest
} from '../controllers/labController.js'

const router = express.Router()

// All routes require authentication
router.use(protect)

// @desc    Create lab request
// @route   POST /api/v1/lab/requests
// @access  Doctor only
router.post(
  '/requests',
  checkPermission(PERMISSIONS.REQUEST_LABS),
  createLabRequest
)

// @desc    Get lab requests (filtered by role)
// @route   GET /api/v1/lab/requests
// @access  Doctor (own) | Lab Personnel (assigned/pending) | Admin (all)
//
// ✅ FIX #9 — REMOVED patient permissions:
//   ❌ PERMISSIONS.VIEW_LAB_RESULTS      (patients were seeing raw lab data)
//   ❌ PERMISSIONS.VIEW_OWN_LAB_REQUESTS (patients were seeing raw lab requests)
//
// Patients now obtain their lab results ONLY through the finalized
// MedicalRecord.resolvedLabResults[] array, not through this endpoint.
// The labController.getLabRequests already gates patients out at the
// query-building level (role === 'patient' → query.patient = userId returns
// nothing because patients are no longer granted the permissions to reach here).
router.get(
  '/requests',
  checkPermission(
    PERMISSIONS.VIEW_LAB_REQUESTS,  // Lab personnel
    PERMISSIONS.REQUEST_LABS,        // Doctor
    PERMISSIONS.VIEW_ALL_RECORDS     // Admin
  ),
  getLabRequests
)

// @desc    Get single lab request
// @route   GET /api/v1/lab/requests/:id
// @access  Doctor (own) | Lab Personnel (assigned) | Admin
//
// ✅ FIX #9 — REMOVED patient permissions (same reason as above).
//   Patients viewing a single raw LabRequest is now blocked at the
//   permission layer rather than relying solely on canAccessLabRequest().
router.get(
  '/requests/:id',
  checkPermission(
    PERMISSIONS.VIEW_LAB_REQUESTS,  // Lab personnel
    PERMISSIONS.REQUEST_LABS,        // Doctor
    PERMISSIONS.VIEW_ALL_RECORDS     // Admin
  ),
  getLabRequestById
)

// @desc    Assign lab request to self
// @route   PATCH /api/v1/lab/requests/:id/assign
// @access  Lab Personnel | Admin
router.patch(
  '/requests/:id/assign',
  checkPermission(PERMISSIONS.VIEW_LAB_REQUESTS),
  authorize('lab_personnel', 'admin'),
  assignLabRequest
)

// @desc    Update lab request status
// @route   PATCH /api/v1/lab/requests/:id/status
// @access  Lab Personnel only
router.patch(
  '/requests/:id/status',
  checkPermission(PERMISSIONS.UPDATE_LAB_STATUS),
  updateLabRequestStatus
)

// @desc    Upload lab results
// @route   POST /api/v1/lab/requests/:id/results
// @access  Lab Personnel only
router.post(
  '/requests/:id/results',
  checkPermission(PERMISSIONS.UPLOAD_LAB_RESULTS),
  uploadLabResults
)

// @desc    Add comment to lab request
// @route   POST /api/v1/lab/requests/:id/comments
// @access  Doctor | Lab Personnel | Admin
router.post(
  '/requests/:id/comments',
  checkPermission(
    PERMISSIONS.COMMENT_TO_DOCTOR,
    PERMISSIONS.REQUEST_LABS,
    PERMISSIONS.VIEW_ALL_RECORDS
  ),
  addLabComment
)

// @desc    Reject lab request
// @route   PATCH /api/v1/lab/requests/:id/reject
// @access  Lab Personnel | Admin
router.patch(
  '/requests/:id/reject',
  checkPermission(PERMISSIONS.UPDATE_LAB_STATUS),
  authorize('lab_personnel', 'admin'),
  rejectLabRequest
)

export default router