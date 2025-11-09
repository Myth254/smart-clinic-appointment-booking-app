// routes/authRoutes.js
import express from 'express'
import {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  forgotPassword,
  resetPassword,
  refreshToken
} from '../controllers/authController.js'
import { protect } from '../middlewares/authMiddleware.js'
import { validateRegistration, validateLogin, validateResetPassword } from '../middlewares/validation.js'
import { authLimiter, registrationLimiter, passwordResetLimiter } from '../middlewares/rateLimiter.js'

const router = express.Router()

// Public routes
router.post('/register', registrationLimiter, validateRegistration, registerUser)
router.post('/login', authLimiter, validateLogin, loginUser)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', passwordResetLimiter, validateResetPassword, resetPassword)
router.post('/refresh-token', refreshToken)

// Protected routes
router.get('/me', protect, getMe)
router.post('/logout', protect, logoutUser)

export default router