// middlewares/rateLimiter.js
import rateLimit from 'express-rate-limit'

/**
 * General API rate limiter
 * Limits: 100 requests per 15 minutes per IP
 */
// export const apiLimiter = rateLimit({
//   windowMs: 30 * 60 * 1000, // 30 minutes
//   max: 100, // Limit each IP to 100 requests per windowMs
//   message: {
//     success: false,
//     message: 'Too many requests from this IP, please try again after 30 minutes'
//   },
//   standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
//   legacyHeaders: false, // Disable the `X-RateLimit-*` headers
//   // Skip rate limiting for certain IPs (e.g., internal services)
//   skip: (req) => {
//     const whitelist = process.env.RATE_LIMIT_WHITELIST?.split(',') || []
//     return whitelist.includes(req.ip)
//   }
// })

/**
 * Strict rate limiter for authentication endpoints
 * Limits: 5 requests per 15 minutes per IP
 * Prevents brute force attacks
 */
export const authLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes'
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * Moderate rate limiter for registration
 * Limits: 3 registrations per hour per IP
 */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 7,
  message: {
    success: false,
    message: 'Too many accounts created from this IP, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * Password reset rate limiter
 * Limits: 3 password reset requests per hour per IP
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * Appointment booking rate limiter
 * Limits: 10 bookings per hour per IP
 */
export const appointmentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'Too many appointment bookings, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * Admin operations rate limiter
 * More generous for admin users
 */
export const adminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200,
  message: {
    success: false,
    message: 'Too many admin requests, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * File upload rate limiter
 * Limits: 20 uploads per hour per IP
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    success: false,
    message: 'Too many file uploads, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * Email sending rate limiter
 * Limits: 10 emails per hour per IP
 */
export const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'Too many emails sent, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * Search rate limiter
 * Limits: 50 searches per minute per IP
 */
export const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute
  max: 50,
  message: {
    success: false,
    message: 'Too many search requests, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * Create custom rate limiter
 * @param {Number} windowMs - Time window in milliseconds
 * @param {Number} max - Maximum number of requests
 * @param {String} message - Custom error message
 */
export const createCustomLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message: message || 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
  })
}

const auditLogLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100 // limit each IP to 100 requests per windowMs
})

export default {
  // apiLimiter,
  authLimiter,
  registrationLimiter,
  passwordResetLimiter,
  appointmentLimiter,
  adminLimiter,
  uploadLimiter,
  emailLimiter,
  searchLimiter,
  auditLogLimiter,
  createCustomLimiter
}