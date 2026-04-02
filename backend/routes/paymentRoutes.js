// routes/paymentRoutes.js
import express from 'express'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import {
  initiateMpesaPayment,
  mpesaCallback,
  queryMpesaTransaction,
  getPaymentHistory,
  getPaymentById,
  getPaymentStats,
  retryPayment
} from '../controllers/paymentController.js'

const router = express.Router()

// ── Public — Safaricom calls this after PIN confirmation (no auth token) ──────
router.post('/mpesa/callback', mpesaCallback)

// ── All routes below require authentication ───────────────────────────────────
router.use(protect)

// @route   POST /api/v1/payments/mpesa/stk-push
// @access  Private
// Body: { billId, phoneNumber }  or legacy { amount, phoneNumber, referenceId, type }
router.post('/mpesa/stk-push', initiateMpesaPayment)

// @route   GET /api/v1/payments/mpesa/query/:checkoutRequestId
// @access  Private
router.get('/mpesa/query/:checkoutRequestId', queryMpesaTransaction)

// @route   GET /api/v1/payments/history
// @access  Private
router.get('/history', getPaymentHistory)

// ✅ /stats MUST be before /:id — prevents Express matching "stats" as an id param
// @route   GET /api/v1/payments/stats
// @access  Private (Admin)
router.get('/stats', authorize('admin'), getPaymentStats)

// @route   POST /api/v1/payments/:paymentId/retry
// @access  Private
router.post('/:paymentId/retry', retryPayment)

// @route   GET /api/v1/payments/:id   ← wildcard must come last
// @access  Private
router.get('/:id', getPaymentById)

export default router