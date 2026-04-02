// routes/billingRoutes.js
import express from 'express'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import {
  createBill,
  getBillByAppointment,
  getMyBills,
  getBillById,
  addLineItem,
  applyDiscount,
  finalizeBill,
  getBillingStats,
  waiveBill
} from '../controllers/billingController.js'

const router = express.Router()
router.use(protect)

// ── /stats must come BEFORE /:id to avoid wildcard capture ───────────────────
// @route   GET /api/v1/billing/stats
// @access  Admin
router.get('/stats', authorize('admin'), getBillingStats)

// ── Patient dashboard ─────────────────────────────────────────────────────────
// @route   GET /api/v1/billing/bills/my-bills
// @access  Patient
router.get('/bills/my-bills', authorize('patient'), getMyBills)

// ── Doctor creates bill manually (fallback — normally auto-created on session start)
// @route   POST /api/v1/billing/bills
// @access  Doctor
router.post('/bills', authorize('doctor'), createBill)

// ── Fetch bill by appointment ID (live session view in doctor dashboard)
// @route   GET /api/v1/billing/bills/appointment/:appointmentId
// @access  Doctor | Admin
router.get(
  '/bills/appointment/:appointmentId',
  authorize('doctor', 'admin'),
  getBillByAppointment
)

// ── Fetch single bill by _id ──────────────────────────────────────────────────
// @route   GET /api/v1/billing/bills/:id
// @access  Patient | Doctor | Admin
router.get('/bills/:id', authorize('patient', 'doctor', 'admin'), getBillById)

// ── Add a line item to a draft bill ──────────────────────────────────────────
// @route   PATCH /api/v1/billing/bills/:id/add-line-item
// @access  Doctor | Pharmacy Staff | Admin
router.patch(
  '/bills/:id/add-line-item',
  authorize('doctor', 'pharmacy_staff', 'admin'),
  addLineItem
)

// ── Apply discount (admin privilege) ─────────────────────────────────────────
// @route   PATCH /api/v1/billing/bills/:id/discount
// @access  Admin
router.patch('/bills/:id/discount', authorize('admin'), applyDiscount)

// ── Lock bill (draft → pending) after session finalization ───────────────────
// @route   PATCH /api/v1/billing/bills/:id/finalize
// @access  Doctor
router.patch('/bills/:id/finalize', authorize('doctor'), finalizeBill)

// ── Admin: waive a bill ───────────────────────────────────────────────────────
// @route   PATCH /api/v1/billing/bills/:id/waive
// @access  Admin
router.patch('/bills/:id/waive', authorize('admin'), waiveBill)

export default router