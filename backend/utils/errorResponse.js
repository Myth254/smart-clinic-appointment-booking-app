// utils/errorResponse.js

/**
 * Custom Error Response Class
 * Extends the native Error class with HTTP status codes
 */
class ErrorResponse extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
    this.success = false

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Pre-defined error responses for common scenarios
 */

// 400 - Bad Request Errors
export const badRequest = (message = 'Bad Request') => {
  return new ErrorResponse(message, 400)
}

export const validationError = (message = 'Validation Error') => {
  return new ErrorResponse(message, 400)
}

export const invalidInput = (field) => {
  return new ErrorResponse(`Invalid ${field} provided`, 400)
}

export const missingField = (field) => {
  return new ErrorResponse(`${field} is required`, 400)
}

// 401 - Unauthorized Errors
export const unauthorized = (message = 'Not authorized to access this resource') => {
  return new ErrorResponse(message, 401)
}

export const invalidCredentials = () => {
  return new ErrorResponse('Invalid email or password', 401)
}

export const tokenExpired = () => {
  return new ErrorResponse('Token expired. Please login again', 401)
}

export const invalidToken = () => {
  return new ErrorResponse('Invalid token. Please login again', 401)
}

export const noToken = () => {
  return new ErrorResponse('No token provided. Please login', 401)
}

// 403 - Forbidden Errors
export const forbidden = (message = 'Access denied') => {
  return new ErrorResponse(message, 403)
}

export const insufficientPermissions = () => {
  return new ErrorResponse('You do not have permission to perform this action', 403)
}

export const accountSuspended = () => {
  return new ErrorResponse('Your account has been suspended. Please contact support', 403)
}

// 404 - Not Found Errors
export const notFound = (resource = 'Resource') => {
  return new ErrorResponse(`${resource} not found`, 404)
}

export const userNotFound = () => {
  return new ErrorResponse('User not found', 404)
}

export const appointmentNotFound = () => {
  return new ErrorResponse('Appointment not found', 404)
}

export const doctorNotFound = () => {
  return new ErrorResponse('Doctor not found', 404)
}

export const patientNotFound = () => {
  return new ErrorResponse('Patient not found', 404)
}

// 409 - Conflict Errors
export const conflict = (message = 'Resource conflict') => {
  return new ErrorResponse(message, 409)
}

export const duplicateEntry = (field) => {
  return new ErrorResponse(`${field} already exists`, 409)
}

export const timeSlotConflict = () => {
  return new ErrorResponse('This time slot is already booked', 409)
}

export const emailExists = () => {
  return new ErrorResponse('Email already registered', 409)
}

// 422 - Unprocessable Entity
export const unprocessableEntity = (message = 'Unable to process request') => {
  return new ErrorResponse(message, 422)
}

export const invalidDateFormat = () => {
  return new ErrorResponse('Invalid date format provided', 422)
}

export const pastDateNotAllowed = () => {
  return new ErrorResponse('Cannot book appointments in the past', 422)
}

// 429 - Too Many Requests
export const tooManyRequests = (message = 'Too many requests. Please try again later') => {
  return new ErrorResponse(message, 429)
}

// 500 - Internal Server Errors
export const internalServerError = (message = 'Internal server error') => {
  return new ErrorResponse(message, 500)
}

export const databaseError = () => {
  return new ErrorResponse('Database operation failed', 500)
}

export const emailSendError = () => {
  return new ErrorResponse('Failed to send email', 500)
}

// 503 - Service Unavailable
export const serviceUnavailable = (service = 'Service') => {
  return new ErrorResponse(`${service} is currently unavailable`, 503)
}

/**
 * Create custom error response
 * @param {String} message - Error message
 * @param {Number} statusCode - HTTP status code
 * @returns {ErrorResponse} Error response object
 */
export const createError = (message, statusCode = 500) => {
  return new ErrorResponse(message, statusCode)
}

/**
 * Format validation errors from express-validator
 * @param {Array} errors - Array of validation errors
 * @returns {ErrorResponse} Formatted error response
 */
export const formatValidationErrors = (errors) => {
  const messages = errors.map(err => `${err.path}: ${err.msg}`).join(', ')
  return new ErrorResponse(messages, 400)
}

/**
 * Handle mongoose errors
 * @param {Error} error - Mongoose error
 * @returns {ErrorResponse} Formatted error response
 */
export const handleMongooseError = (error) => {
  // Duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0]
    return duplicateEntry(field)
  }

  // Validation error
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors)
      .map(err => err.message)
      .join(', ')
    return validationError(messages)
  }

  // Cast error (invalid ObjectId)
  if (error.name === 'CastError') {
    return notFound('Resource')
  }

  return internalServerError()
}

/**
 * Handle JWT errors
 * @param {Error} error - JWT error
 * @returns {ErrorResponse} Formatted error response
 */
export const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return invalidToken()
  }

  if (error.name === 'TokenExpiredError') {
    return tokenExpired()
  }

  return unauthorized()
}

/**
 * Success response helper
 * @param {Object} res - Express response object
 * @param {Object} data - Response data
 * @param {String} message - Success message
 * @param {Number} statusCode - HTTP status code (default: 200)
 */
export const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  })
}

/**
 * Paginated response helper
 * @param {Object} res - Express response object
 * @param {Array} data - Response data array
 * @param {Object} pagination - Pagination info
 * @param {String} message - Success message
 */
export const paginatedResponse = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      total: pagination.total,
      page: pagination.page,
      limit: pagination.limit,
      pages: Math.ceil(pagination.total / pagination.limit),
      hasMore: pagination.page * pagination.limit < pagination.total
    }
  })
}

/**
 * Error response helper
 * @param {Object} res - Express response object
 * @param {ErrorResponse|Error} error - Error object
 */
export const errorResponse = (res, error) => {
  const statusCode = error.statusCode || 500
  const message = error.message || 'Internal server error'

  return res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack
    })
  })
}

/**
 * Async wrapper to catch errors in async route handlers
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
export const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export default ErrorResponse