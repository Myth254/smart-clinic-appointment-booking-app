// middlewares/authMiddleware.js
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

<<<<<<< Updated upstream
// @desc    Protect routes - verify JWT token
export const protect = async (req, res, next) => {
  try {
    let token

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1]
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token provided' })
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      // Get user from token (exclude password)
=======
// 🔒 Verify token and attach user to request
export const protect = async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1]

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      // Find user without password
>>>>>>> Stashed changes
      req.user = await User.findById(decoded.id).select('-password')

      if (!req.user) {
        return res.status(401).json({ message: 'User not found, token invalid' })
      }

      // Check if user is active
      if (req.user.status !== 'active') {
        return res.status(403).json({ message: 'Account is not active' })
      }

      req.user.id = req.user._id.toString()

      next()
    } catch (error) {
      console.error('Token verification failed:', error)
      return res.status(401).json({ message: 'Not authorized, token failed' })
    }
  } catch (error) {
    console.error('Auth middleware error:', error)
    res.status(500).json({ message: 'Server error in authentication' })
  }
}

// @desc    Authorize specific roles
// @usage   authorize('admin', 'doctor')
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. This route requires one of the following roles: ${roles.join(', ')}`
      })
    }

    next()
  }
}

// @desc    Check for specific permissions
// @usage   checkPermission('create_medical_records', 'update_medical_records')
export const checkPermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    // Admin has all permissions
    if (req.user.role === 'admin') {
      return next()
    }

    // Check if user has any of the required permissions
    const hasPermission = requiredPermissions.some(permission =>
      req.user.permissions.includes(permission)
    )

    if (!hasPermission) {
      return res.status(403).json({
        message: 'Access denied. Insufficient permissions.',
        requiredPermissions
      })
    }

    next()
  }
}

// @desc    Require all specified permissions
// @usage   requireAllPermissions('view_lab_requests', 'update_lab_status')
export const requireAllPermissions = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    // Admin has all permissions
    if (req.user.role === 'admin') {
      return next()
    }

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every(permission =>
      req.user.permissions.includes(permission)
    )

    if (!hasAllPermissions) {
      return res.status(403).json({
        message: 'Access denied. Missing required permissions.',
        requiredPermissions
      })
    }

    next()
  }
}

// @desc    Check resource ownership (for patients)
// @usage   checkOwnership('userId') - checks if req.params.userId matches req.user.id
export const checkOwnership = (resourceUserField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    // Admin can access all resources
    if (req.user.role === 'admin') {
      return next()
    }

    // For patients, verify they're accessing their own data
    if (req.user.role === 'patient') {
      const resourceUserId = req.params[resourceUserField] || req.body[resourceUserField]

      if (resourceUserId && resourceUserId !== req.user.id) {
        return res.status(403).json({
          message: 'Access denied. You can only access your own resources.'
        })
      }
    }

    next()
  }
}

// @desc    Check doctor assignment to resource
// @usage   Used to verify doctor can only modify records they're assigned to
export const checkDoctorAssignment = async (resourceModel, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    // Admin can access all resources
    if (req.user.role === 'admin') {
      return next()
    }

    // Only applies to doctors
    if (req.user.role !== 'doctor') {
      return next()
    }

    try {
      const resourceId = req.params[resourceIdParam]
      const resource = await resourceModel.findById(resourceId)

      if (!resource) {
        return res.status(404).json({ message: 'Resource not found' })
      }

      // Check if doctor is assigned to this resource
      const doctorField = resource.doctor || resource.assignedDoctor || resource.doctorId

      if (doctorField && doctorField.toString() !== req.user.id) {
        return res.status(403).json({
          message: 'Access denied. You can only access resources assigned to you.'
        })
      }

      next()
    } catch (error) {
<<<<<<< Updated upstream
      console.error('Check doctor assignment error:', error)
      return res.status(500).json({ message: 'Server error checking permissions' })
    }
  }
}

// @desc    Clinic staff only (doctor, lab_personnel, pharmacy_staff)
export const clinicStaffOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' })
  }

  const allowedRoles = ['doctor', 'lab_personnel', 'pharmacy_staff', 'admin']

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      message: 'Access denied. Clinic staff only.'
    })
  }

  next()
}

// @desc    Admin only middleware
export const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' })
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' })
  }

  next()
}

// @desc    Optional authentication - sets req.user if token is valid
export const optionalAuth = async (req, res, next) => {
  try {
    let token

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1]
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = await User.findById(decoded.id).select('-password')
      } catch (error) {
        console.log('Optional auth: Invalid token provided', error?.message || '')
      }
    }

    next()
  } catch (error) {
    console.error('Optional auth middleware error:', error)
=======
      console.error('Auth Middleware Error:', error.message)
      return res.status(401).json({ message: 'Not authorized, invalid token' })
    }
  } else {
    return res.status(401).json({ message: 'Not authorized, no token provided' })
  }
}

// 🧩 Restrict access by role(s)
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' })
    }

    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: `Access denied: Requires role(s): ${roles.join(', ')}` })
    }

    next()
  }
}

// 🔐 For clarity, you can still export a shorthand admin-only check
export const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
>>>>>>> Stashed changes
    next()
  }
<<<<<<< Updated upstream
}

// @desc    Patient only middleware
export const patientOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' })
  }

  if (req.user.role !== 'patient' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Patients only.' })
  }

  next()
}

// @desc    Lab personnel only middleware
export const labPersonnelOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' })
  }

  if (req.user.role !== 'lab_personnel' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Lab personnel only.' })
  }

  next()
}

// @desc    Pharmacy staff only middleware
export const pharmacyStaffOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' })
  }

  if (req.user.role !== 'pharmacy_staff' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Pharmacy staff only.' })
  }

  next()
=======
>>>>>>> Stashed changes
}