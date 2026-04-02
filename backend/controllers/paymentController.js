// controllers/paymentController.js
//
// Billing changes:
//   • initiateMpesaPayment() — accepts { billId, phoneNumber } as primary payload.
//     Legacy { amount, referenceId, type } still supported for backward compat.
//   • mpesaCallback() — calls BillCalculator.applyPayment() for bill payments,
//     then emits socket events and triggers notifications.
//   • All other handlers unchanged.

import axios  from 'axios'
import Bill   from '../models/Bill.js'
import Payment from '../models/Payment.js'
import BillCalculator from '../services/billing/BillCalculator.js'
import NotificationService from '../services/notificationService.js'
import logAudit from '../utils/auditLogger.js'

// ─── M-Pesa Configuration ─────────────────────────────────────────────────────
const getMpesaConfig = () => ({
  consumerKey:       process.env.MPESA_CONSUMER_KEY,
  consumerSecret:    process.env.MPESA_CONSUMER_SECRET,
  businessShortCode: process.env.MPESA_SHORTCODE,
  passkey:           process.env.MPESA_PASSKEY,
  callbackURL:       `${process.env.BASE_URL}/api/v1/payments/mpesa/callback`,
  environment:       process.env.MPESA_ENVIRONMENT || 'sandbox'
})

const getMpesaBaseUrl = (config = getMpesaConfig()) => (
  config.environment === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke'
)

// ─── Helpers ──────────────────────────────────────────────────────────────────
const createHttpError = (statusCode, message, details = null) => {
  const error = new Error(message)
  error.statusCode = statusCode
  if (details) error.details = details
  return error
}

const ensureMpesaConfig = (config = getMpesaConfig()) => {
  const requiredConfig = {
    MPESA_CONSUMER_KEY: config.consumerKey,
    MPESA_CONSUMER_SECRET: config.consumerSecret,
    MPESA_SHORTCODE: config.businessShortCode,
    MPESA_PASSKEY: config.passkey,
    BASE_URL: process.env.BASE_URL
  }

  const missing = Object.entries(requiredConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length) {
    throw createHttpError(
      500,
      `Missing M-Pesa configuration: ${missing.join(', ')}`,
      { missing }
    )
  }
}

const getMpesaToken = async () => {
  const config = getMpesaConfig()
  ensureMpesaConfig(config)
  const auth     = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64')
  const response = await axios.get(
    `${getMpesaBaseUrl(config)}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  )
  return response.data.access_token
}

const generatePassword = () => {
  const config = getMpesaConfig()
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3)
  const password  = Buffer.from(
    `${config.businessShortCode}${config.passkey}${timestamp}`
  ).toString('base64')
  return { password, timestamp }
}

const formatKenyanPhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    throw createHttpError(400, 'Phone number is required')
  }

  let p = phone.replace(/\D/g, '')
  if (p.startsWith('0')) p = '254' + p.substring(1)
  if (p.length === 9) p = '254' + p

  if (!/^254[17]\d{8}$/.test(p)) {
    throw createHttpError(400, 'Phone number must be a valid Kenyan number (07XXXXXXXX or 2547XXXXXXXX)')
  }

  return p
}

const getMpesaErrorResponse = (error) => {
  const upstreamStatus = error.response?.status
  const upstreamData = error.response?.data

  if (error.statusCode) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      error: error.details || error.message
    }
  }

  if (upstreamStatus >= 400 && upstreamStatus < 500) {
    return {
      statusCode: upstreamStatus,
      message:
        upstreamData?.errorMessage ||
        upstreamData?.ResponseDescription ||
        'M-Pesa rejected the payment request',
      error: upstreamData || error.message
    }
  }

  if (upstreamStatus >= 500) {
    return {
      statusCode: 502,
      message:
        upstreamData?.errorMessage ||
        upstreamData?.ResponseDescription ||
        'M-Pesa service is temporarily unavailable',
      error: upstreamData || error.message
    }
  }

  return {
    statusCode: 500,
    message: error.message || 'Failed to initiate payment',
    error: error.details || error.message
  }
}

const REFERENCE_MODEL_MAP = {
  bill:         'Bill',
  lab:          'LabRequest',
  prescription: 'Prescription',
  appointment:  'Appointment'
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Initiate M-Pesa STK Push
// @route   POST /api/v1/payments/mpesa/stk-push
// @access  Private
//
// Primary payload:  { billId, phoneNumber }
// Legacy payload:   { amount, phoneNumber, referenceId, type }
// ─────────────────────────────────────────────────────────────────────────────
export const initiateMpesaPayment = async (req, res) => {
  try {
    const userId = req.user.id
    const {
      billId,
      phoneNumber,
      amount: legacyAmount,
      referenceId: legacyRefId,
      type: legacyType
    } = req.body

    let amount, referenceId, referenceType, referenceModel, accountRef, transactionDesc, formattedPhone

    // ── New path: consolidated Bill ───────────────────────────────────────
    if (billId) {
      const bill = await Bill.findById(billId).populate('patient', 'phoneNumber firstName lastName')
      if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' })
      if (bill.patient._id.toString() !== userId)
        return res.status(403).json({ success: false, message: 'This bill does not belong to you' })
      if (!bill.isPayable())
        return res.status(400).json({ success: false, message: `Bill is "${bill.status}" — only pending or partially_paid bills can be paid` })
      if (bill.balanceDue <= 0)
        return res.status(400).json({ success: false, message: 'Bill balance is already zero' })

      amount          = bill.balanceDue
      referenceId     = bill._id
      referenceType   = 'bill'
      referenceModel  = REFERENCE_MODEL_MAP.bill
      accountRef      = bill.billNumber
      transactionDesc = `Bill ${bill.billNumber}`
      formattedPhone  = formatKenyanPhone(phoneNumber || bill.patient.phoneNumber)

    // ── Legacy path: individual lab/prescription/appointment ──────────────
    } else if (legacyAmount && legacyRefId && legacyType) {
      if (!['lab', 'prescription', 'appointment'].includes(legacyType)) {
        return res.status(400).json({ success: false, message: 'Invalid payment type' })
      }
      amount          = legacyAmount
      referenceId     = legacyRefId
      referenceType   = legacyType
      referenceModel  = REFERENCE_MODEL_MAP[legacyType]
      accountRef      = legacyRefId
      transactionDesc = `Payment for ${legacyType} ${legacyRefId}`
      formattedPhone  = formatKenyanPhone(phoneNumber)

    } else {
      return res.status(400).json({
        success: false,
        message: 'Provide either { billId, phoneNumber } or legacy { amount, phoneNumber, referenceId, type }'
      })
    }

    // ── STK Push ──────────────────────────────────────────────────────────
    const config = getMpesaConfig()
    ensureMpesaConfig(config)
    const token = await getMpesaToken()
    const { password, timestamp } = generatePassword()

    const stkPayload = {
      BusinessShortCode: config.businessShortCode,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(amount),
      PartyA:            formattedPhone,
      PartyB:            config.businessShortCode,
      PhoneNumber:       formattedPhone,
      CallBackURL:       config.callbackURL,
      AccountReference:  String(accountRef),
      TransactionDesc:   transactionDesc
    }

    console.log('📱 STK Push →', { amount: stkPayload.Amount, phone: formattedPhone, ref: accountRef })

    const stkResponse = await axios.post(
      `${getMpesaBaseUrl(config)}/mpesa/stkpush/v1/processrequest`,
      stkPayload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )

    // ── Create pending Payment record ─────────────────────────────────────
    const payment = await Payment.create({
      user:                   userId,
      amount,
      phoneNumber:            formattedPhone,
      referenceType,
      referenceId,
      referenceModel,
      mpesaCheckoutRequestId: stkResponse.data.CheckoutRequestID,
      mpesaMerchantRequestId: stkResponse.data.MerchantRequestID,
      status:                 'pending',
      transactionType:        'payment'
    })

    // Track payment reference on the bill immediately
    if (billId) {
      await Bill.findByIdAndUpdate(billId, { $addToSet: { payments: payment._id } })
    }

    await NotificationService.paymentNotifications.paymentRequested(
      userId, amount, `${referenceType} payment`, referenceId
    )

    await logAudit({
      userId, action: 'PAYMENT_INITIATED', resourceType: 'Payment', resourceId: payment._id,
      details: { amount, phoneNumber: formattedPhone, referenceType, referenceId, checkoutRequestId: stkResponse.data.CheckoutRequestID },
      req, status: 'success'
    })

    return res.status(200).json({
      success: true,
      message: 'STK Push sent. Please check your phone.',
      data: {
        checkoutRequestId:   stkResponse.data.CheckoutRequestID,
        merchantRequestId:   stkResponse.data.MerchantRequestID,
        responseCode:        stkResponse.data.ResponseCode,
        responseDescription: stkResponse.data.ResponseDescription,
        customerMessage:     stkResponse.data.CustomerMessage,
        paymentId:           payment._id
      }
    })
  } catch (error) {
    const errorResponse = getMpesaErrorResponse(error)
    console.error('❌ M-Pesa STK Push error:', {
      statusCode: errorResponse.statusCode,
      message: errorResponse.message,
      details: error.response?.data || error.details || error.message
    })

    return res.status(errorResponse.statusCode).json({
      success: false,
      message: errorResponse.message,
      error: errorResponse.error
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    M-Pesa Callback Handler
// @route   POST /api/v1/payments/mpesa/callback
// @access  Public (Safaricom servers — no auth token)
// ─────────────────────────────────────────────────────────────────────────────
export const mpesaCallback = async (req, res) => {
  // Always respond 200 immediately — Safaricom retries if we don't.
  // All processing happens asynchronously in the background.
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' })

  let payment    = null
  let ResultCode = null
  let ResultDesc = null

  try {
    const callbackData = req.body?.Body?.stkCallback
    if (!callbackData) {
      console.warn('⚠️  M-Pesa callback: missing stkCallback body')
      return
    }

    ResultCode = callbackData.ResultCode
    ResultDesc = callbackData.ResultDesc
    const { CheckoutRequestID, CallbackMetadata } = callbackData

    // Find the pending payment created at STK Push time
    payment = await Payment.findOne({ mpesaCheckoutRequestId: CheckoutRequestID })
    if (!payment) {
      console.warn(`⚠️  M-Pesa callback: no payment found for checkout ${CheckoutRequestID}`)
      return
    }

    // ── SUCCESS ───────────────────────────────────────────────────────────
    if (ResultCode === 0 && CallbackMetadata) {
      const meta    = {}
      const items   = CallbackMetadata.Item || []
      items.forEach(item => { meta[item.Name] = item.Value })

      payment.mpesaReceiptNumber  = meta.MpesaReceiptNumber
      payment.mpesaTransactionId  = meta.MpesaReceiptNumber
      payment.resultCode          = ResultCode
      payment.resultDescription   = ResultDesc
      payment.status              = 'completed'
      payment.completedAt         = new Date()
      payment.transactionDate     = meta.TransactionDate
        ? new Date(String(meta.TransactionDate)) : new Date()

      await payment.save()

      // ── Update the linked Bill ─────────────────────────────────────────
      if (payment.referenceType === 'bill') {
        try {
          const bill = await Bill.findById(payment.referenceId)
          if (bill) {
            await BillCalculator.applyPayment(bill, payment.amount, payment._id)
            console.log(`✅ [BILLING] Bill ${bill.billNumber} → ${bill.status} (balance: KES ${bill.balanceDue})`)

            // Notify patient on full payment
            if (bill.status === 'paid') {
              await NotificationService.paymentNotifications?.paymentSuccess?.(
                String(bill.patient), payment.amount, bill.billNumber
              ).catch(() => {})
            }
          } else {
            console.warn(`⚠️  M-Pesa callback: bill ${payment.referenceId} not found`)
          }
        } catch (billErr) {
          console.error('❌ M-Pesa callback: failed to update bill:', billErr.message)
        }
      }

      await logAudit({
        userId:       String(payment.user),
        action:       'PAYMENT_COMPLETED',
        resourceType: 'Payment',
        resourceId:   payment._id,
        details: { amount: payment.amount, receiptNumber: payment.mpesaReceiptNumber, referenceType: payment.referenceType },
        status: 'success'
      })

    // ── FAILURE ───────────────────────────────────────────────────────────
    } else {
      payment.status            = 'failed'
      payment.resultCode        = ResultCode
      payment.resultDescription = ResultDesc
      payment.failedAt          = new Date()
      await payment.save()

      await NotificationService.paymentNotifications?.paymentFailed?.(
        String(payment.user), payment.amount, ResultDesc
      ).catch(() => {})

      await logAudit({
        userId:       String(payment.user),
        action:       'PAYMENT_FAILED',
        resourceType: 'Payment',
        resourceId:   payment._id,
        details: { resultCode: ResultCode, resultDescription: ResultDesc },
        status: 'failure'
      })
    }
  } catch (error) {
    console.error('❌ M-Pesa callback handler error:', error.message)
    // Never rethrow — response already sent to Safaricom
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Query M-Pesa transaction status
// @route   GET /api/v1/payments/mpesa/query/:checkoutRequestId
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
export const queryMpesaTransaction = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params
    const payment = await Payment.findOne({ mpesaCheckoutRequestId: checkoutRequestId })
      .populate('user', 'firstName lastName')

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' })
    }
    if (payment.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    // Optionally query Safaricom for live status if payment is still pending
    let liveStatus = null
    if (payment.status === 'pending') {
      try {
        const config = getMpesaConfig()
        ensureMpesaConfig(config)
        const token = await getMpesaToken()
        const { password, timestamp } = generatePassword()
        const queryResponse = await axios.post(
          `${getMpesaBaseUrl(config)}/mpesa/stkpushquery/v1/query`,
          {
            BusinessShortCode: config.businessShortCode,
            Password:          password,
            Timestamp:         timestamp,
            CheckoutRequestID: checkoutRequestId
          },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        liveStatus = queryResponse.data
      } catch (queryErr) {
        console.warn('⚠️  M-Pesa status query failed:', queryErr.message)
      }
    }

    return res.json({ success: true, data: { payment, liveStatus } })
  } catch (error) {
    console.error('❌ Query M-Pesa transaction error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get user payment history
// @route   GET /api/v1/payments/history
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
export const getPaymentHistory = async (req, res) => {
  try {
    const userId  = req.user.id
    const { status, limit = 20, offset = 0 } = req.query

    const query = { user: userId }
    if (status) query.status = status

    const [payments, total] = await Promise.all([
      Payment.find(query)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Number(limit))
        .populate('user', 'firstName lastName'),
      Payment.countDocuments(query)
    ])

    return res.json({
      success: true,
      data: payments,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: total > Number(offset) + Number(limit)
      }
    })
  } catch (error) {
    console.error('❌ Get payment history error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get payment by ID
// @route   GET /api/v1/payments/:id
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
export const getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).populate('user', 'firstName lastName email')
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' })
    if (payment.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }
    return res.json({ success: true, data: payment })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Payment statistics (Admin only)
// @route   GET /api/v1/payments/stats
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
export const getPaymentStats = async (req, res) => {
  try {
    const [byType, totalRevenue] = await Promise.all([
      Payment.getStatsByType(),
      Payment.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ])
    ])
    return res.json({
      success: true,
      data: {
        byType,
        totalRevenue:  totalRevenue[0]?.total  || 0,
        totalPayments: totalRevenue[0]?.count  || 0
      }
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Retry a failed payment
// @route   POST /api/v1/payments/:paymentId/retry
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
export const retryPayment = async (req, res) => {
  try {
    const { paymentId } = req.params
    const payment = await Payment.findById(paymentId)

    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' })
    if (payment.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Access denied' })
    if (payment.status !== 'failed') {
      return res.status(400).json({ success: false, message: `Cannot retry a "${payment.status}" payment` })
    }

    // Delegate to initiateMpesaPayment logic by synthesising a request body
    if (payment.referenceType === 'bill') {
      req.body = { billId: String(payment.referenceId), phoneNumber: payment.phoneNumber }
    } else {
      req.body = {
        amount:      payment.amount,
        phoneNumber: payment.phoneNumber,
        referenceId: String(payment.referenceId),
        type:        payment.referenceType
      }
    }

    return initiateMpesaPayment(req, res)
  } catch (error) {
    console.error('❌ Retry payment error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

export default {
  initiateMpesaPayment,
  mpesaCallback,
  queryMpesaTransaction,
  getPaymentHistory,
  getPaymentById,
  getPaymentStats,
  retryPayment
}
