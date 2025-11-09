// middlewares/errorHandler.js

/**
 * Global error handling middleware
 * Catches all errors thrown in the application and formats them consistently
 */
export const errorHandler = (err, req, res, next) => {
  let error = { ...err }
  error.message = err.message

  // Log error for debugging (in development)
  if (process.env.NODE_ENV === 'development') {
    console.error('Error Stack:', err.stack)
    console.error('Error Details:', err)
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found'
    error = {
      message,
      statusCode: 404
    }
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]
    const message = `${field} already exists`
    error = {
      message,
      statusCode: 400
    }
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map(val => val.message)
      .join(', ')
    error = {
      message,
      statusCode: 400
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please login again.'
    error = {
      message,
      statusCode: 401
    }
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired. Please login again.'
    error = {
      message,
      statusCode: 401
    }
  }

  // Send error response
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      error: err
    })
  })
  next()
}

/**
 * Not Found middleware
 * Handles 404 errors for routes that don't exist
 */
export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`)
  res.status(404)
  next(error)
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors automatically
 * Usage: router.get('/', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

export default errorHandler