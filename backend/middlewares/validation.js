// middlewares/validation.js
import { body, validationResult } from 'express-validator'

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation error',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    })
  }
  next()
}

// Registration validation
export const validateRegistration = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),

  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('phoneNumber')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\+?[1-9]\d{1,14}$/).withMessage('Please provide a valid phone number'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  body('role')
    .optional()
    .isIn(['patient', 'doctor', 'admin']).withMessage('Invalid role specified'),

  // Patient-specific validation
  body('dateOfBirth')
    .if(body('role').equals('patient'))
    .notEmpty().withMessage('Date of birth is required for patients')
    .isISO8601().withMessage('Please provide a valid date')
    .custom((value) => {
      const birthDate = new Date(value)
      const today = new Date()
      if (birthDate > today) {
        throw new Error('Date of birth cannot be in the future')
      }
      return true
    }),

  // Doctor-specific validation
  body('specialization')
    .if(body('role').equals('doctor'))
    .notEmpty().withMessage('Specialization is required for doctors')
    .isLength({ min: 3, max: 100 }).withMessage('Specialization must be between 3 and 100 characters'),

  handleValidationErrors
]

// Login validation
export const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),

  handleValidationErrors
]

// Reset password validation
export const validateResetPassword = [
  body('token')
    .notEmpty().withMessage('Reset token is required'),

  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  handleValidationErrors
]

// Update profile validation
export const validateProfileUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),

  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),

  body('phoneNumber')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/).withMessage('Please provide a valid phone number'),

  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  handleValidationErrors
]

// Appointment booking validation
export const validateAppointmentBooking = [
  body('doctorId')
    .notEmpty().withMessage('Doctor ID is required')
    .isMongoId().withMessage('Invalid doctor ID'),

  body('start')
    .notEmpty().withMessage('Appointment start time is required')
    .isISO8601().withMessage('Please provide a valid date and time'),

  body('end')
    .notEmpty().withMessage('Appointment end time is required')
    .isISO8601().withMessage('Please provide a valid date and time'),

  body('reason')
    .notEmpty().withMessage('Reason for appointment is required')
    .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters'),

  body('type')
    .optional()
    .isIn(['consultation', 'follow-up', 'checkup', 'emergency', 'routine']).withMessage('Invalid appointment type'),

  handleValidationErrors
]

// Availability validation
export const validateAvailability = [
  body('startTime')
    .notEmpty().withMessage('Start time is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),

  body('endTime')
    .notEmpty().withMessage('End time is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format'),

  body('weekday')
    .if(body('isRecurring').equals(true))
    .notEmpty().withMessage('Weekday is required for recurring availability')
    .isInt({ min: 0, max: 6 }).withMessage('Weekday must be between 0 (Sunday) and 6 (Saturday)'),

  body('date')
    .if(body('isRecurring').not().equals(true))
    .notEmpty().withMessage('Date is required for one-time availability')
    .isISO8601().withMessage('Please provide a valid date'),

  body('slotDurationMinutes')
    .optional()
    .isInt({ min: 15, max: 120 }).withMessage('Slot duration must be between 15 and 120 minutes'),

  handleValidationErrors
]

// Medical record validation
export const validateMedicalRecord = [
  body('appointmentId')
    .notEmpty().withMessage('Appointment ID is required')
    .isMongoId().withMessage('Invalid appointment ID'),

  body('diagnosis')
    .notEmpty().withMessage('Diagnosis is required')
    .isLength({ min: 10, max: 1000 }).withMessage('Diagnosis must be between 10 and 1000 characters'),

  body('prescription')
    .optional()
    .isArray().withMessage('Prescription must be an array'),

  body('prescription.*.medication')
    .if(body('prescription').exists())
    .notEmpty().withMessage('Medication name is required'),

  body('notes')
    .optional()
    .isLength({ max: 2000 }).withMessage('Notes must not exceed 2000 characters'),

  handleValidationErrors
]

// Admin user creation validation
export const validateAdminUserCreation = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),

  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('phoneNumber')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\+?[1-9]\d{1,14}$/).withMessage('Please provide a valid phone number'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),

  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['patient', 'doctor', 'admin']).withMessage('Invalid role specified'),

  body('specialization')
    .if(body('role').equals('doctor'))
    .notEmpty().withMessage('Specialization is required for doctors'),

  handleValidationErrors
]

export default {
  validateRegistration,
  validateLogin,
  validateResetPassword,
  validateProfileUpdate,
  validateAppointmentBooking,
  validateAvailability,
  validateMedicalRecord,
  validateAdminUserCreation
}