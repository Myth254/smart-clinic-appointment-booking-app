/* eslint-disable no-unused-vars */
// controllers/authController.js
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Patient from '../models/Patient.js'
import Doctor from '../models/Doctor.js'
import { LabPersonnel } from '../models/LabPersonnel.js'
import { PharmacyStaff } from '../models/PharmacyStaff.js'
import Notification from '../models/Notification.js'
import generateToken, { generateRefreshToken } from '../utils/generateToken.js'
import sendEmail from '../utils/sendEmail.js'
import logAudit from '../utils/auditLogger.js'

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public (for patients) / Private (for staff - admin only)
const registerUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role,
      // Patient-specific fields
      dateOfBirth,
      address,
      emergencyContact,
      // Doctor-specific fields
      specialization,
      clinic,
      qualifications,
      bio,
      // Lab Personnel fields
      labSpecialization,
      certifications,
      experience,
      assignedLabs,
      // Pharmacy Staff fields
      licenseNumber,
      licenseExpiry,
      pharmacyRole,
      pharmacySpecializations
    } = req.body

    // Validate required fields
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      return res.status(400).json({
        message: 'Please provide all required fields'
      })
    }

    // Check if user exists
    const userExists = await User.findOne({ email })
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' })
    }

    // Validate role
    const userRole = role || 'patient'
    const validRoles = ['patient', 'doctor', 'lab_personnel', 'pharmacy_staff', 'admin']

    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ message: 'Invalid role specified' })
    }

    // Only admins can create staff/admin accounts
    const staffRoles = ['doctor', 'lab_personnel', 'pharmacy_staff', 'admin']
    if (staffRoles.includes(userRole) && req.user?.role !== 'admin') {
      return res.status(403).json({
        message: 'Only administrators can create staff or admin accounts'
      })
    }

    // Create base user
    const user = await User.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role: userRole,
      assignedClinic: clinic || null,
      department: specialization || labSpecialization || pharmacyRole || null
    })

    // Create role-specific profile
    if (userRole === 'patient') {
      // Validate patient-specific required fields
      if (!dateOfBirth) {
        await User.findByIdAndDelete(user._id)
        return res.status(400).json({
          message: 'Date of birth is required for patient registration'
        })
      }

      await Patient.create({
        userId: user._id,
        dateOfBirth,
        address: address || {},
        emergencyContact: emergencyContact || {},
        medicalHistory: [],
        allergies: [],
      })
    }
    else if (userRole === 'doctor') {
      // Validate doctor-specific required fields
      if (!specialization) {
        await User.findByIdAndDelete(user._id)
        return res.status(400).json({
          message: 'Specialization is required for doctor registration'
        })
      }

      if (!clinic) {
        await User.findByIdAndDelete(user._id)
        return res.status(400).json({
          message: 'Clinic assignment is required for doctor registration'
        })
      }

      await Doctor.create({
        userId: user._id,
        specialization,
        clinic,
        qualifications: qualifications || [],
        bio: bio || '',
        rating: 0,
        totalReviews: 0,
        status: 'active',
      })
    }
    else if (userRole === 'lab_personnel') {
      // Validate lab personnel required fields
      if (!labSpecialization) {
        await User.findByIdAndDelete(user._id)
        return res.status(400).json({
          message: 'Lab specialization is required for lab personnel'
        })
      }

      if (!clinic) {
        await User.findByIdAndDelete(user._id)
        return res.status(400).json({
          message: 'Clinic assignment is required for lab personnel'
        })
      }

      await LabPersonnel.create({
        userId: user._id,
        clinic,
        specialization: labSpecialization,
        certifications: certifications || [],
        qualifications: qualifications || [],
        experience: experience || 0,
        status: 'active',
        assignedLabs: assignedLabs || []
      })
    }
    else if (userRole === 'pharmacy_staff') {
      // Validate pharmacy staff required fields
      if (!licenseNumber || !licenseExpiry || !pharmacyRole) {
        await User.findByIdAndDelete(user._id)
        return res.status(400).json({
          message: 'License number, expiry date, and role are required for pharmacy staff'
        })
      }

      if (!clinic) {
        await User.findByIdAndDelete(user._id)
        return res.status(400).json({
          message: 'Clinic assignment is required for pharmacy staff'
        })
      }

      await PharmacyStaff.create({
        userId: user._id,
        clinic,
        licenseNumber,
        licenseExpiry,
        role: pharmacyRole,
        certifications: certifications || [],
        qualifications: qualifications || [],
        experience: experience || 0,
        status: 'active',
        specializations: pharmacySpecializations || []
      })
    }

    // Create welcome notification
    await Notification.create({
      user: user._id,
      type: 'system',
      title: 'Welcome to MediBook!',
      message: `Hello ${firstName}, welcome to MediBook. Your ${userRole.replace('_', ' ')} account has been successfully created.`,
      read: false,
    })

    // Send welcome email
    const roleDisplayName = userRole.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    sendEmail({
      to: user.email,
      subject: 'Welcome to MediBook',
      html: `
        <h1>Welcome to MediBook, ${firstName}!</h1>
        <p>Your ${roleDisplayName} account has been successfully created.</p>
        <p>You can now log in using your email address and the password provided during registration.</p>
        ${userRole === 'patient' ? '<p>Book appointments and manage your health records easily.</p>' : ''}
        ${userRole === 'doctor' ? '<p>Manage your appointments and patient records.</p>' : ''}
        ${userRole === 'lab_personnel' ? '<p>Process lab requests and upload results.</p>' : ''}
        ${userRole === 'pharmacy_staff' ? '<p>Manage prescriptions and medication dispensing.</p>' : ''}
        <p>If this account was created by an administrator, please change your password immediately after your first login.</p>
      `
    }).catch(err => console.error('Email send error:', err))

    // Generate tokens
    const accessToken = generateToken(user._id, user.role)
    const refreshToken = generateRefreshToken(user._id)

    await logAudit({
      userId: user._id,
      action: 'USER_REGISTERED',
      resourceType: 'User',
      resourceId: user._id,
      details: {
        email: user.email,
        role: user.role,
        registeredBy: req.user?.id || 'self'
      },
      req,
      status: 'success'
    })

    return res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        permissions: user.permissions
      },
      token: accessToken,
      refreshToken: refreshToken,
    })
  } catch (error) {
    console.error('Registration error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        message: 'Please provide email and password'
      })
    }

    const user = await User.findOne({ email }).select('+password')

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    const isPasswordMatch = await user.comparePassword(password)
    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    // Check account status AFTER verifying credentials to prevent email enumeration
    if (user.status !== 'active') {
      return res.status(403).json({
        message: 'Your account is currently inactive or suspended. Please contact support.'
      })
    }

    // Update last login
    user.lastLogin = new Date()
    await user.save()

    // Create login notification
    await Notification.create({
      user: user._id,
      type: 'system',
      title: 'New Login',
      message: `Login detected at ${new Date().toLocaleString()}`,
      read: false,
    })

    const accessToken = generateToken(user._id, user.role)
    const refreshToken = generateRefreshToken(user._id)

    await logAudit({
      userId: user._id,
      action: 'USER_LOGIN',
      resourceType: 'User',
      resourceId: user._id,
      details: {
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin
      },
      req,
      status: 'success'
    })

    return res.json({
      message: 'Login successful',
      token: accessToken,
      refreshToken: refreshToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        permissions: user.permissions,
        clinicStaffType: user.clinicStaffType,
        assignedClinic: user.assignedClinic
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    await logAudit({
      userId: null,
      action: 'USER_LOGIN_FAILED',
      resourceType: 'User',
      resourceId: null,
      details: {
        email: '',
        reason: 'Invalid credentials'
      },
      req,
      status: 'failure',
      errorMessage: 'Invalid email or password'
    })
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    let profile = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      permissions: user.permissions,
      clinicStaffType: user.clinicStaffType,
      assignedClinic: user.assignedClinic,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }

    // Fetch role-specific profile
    if (user.role === 'patient') {
      const patientProfile = await Patient.findOne({ userId: user._id })
      if (patientProfile) {
        profile.patientProfile = patientProfile
      }
    } else if (user.role === 'doctor') {
      const doctorProfile = await Doctor.findOne({ userId: user._id })
        .populate('clinic', 'name address phoneNumber email')
      if (doctorProfile) {
        profile.doctorProfile = doctorProfile
      }
    } else if (user.role === 'lab_personnel') {
      const labProfile = await LabPersonnel.findOne({ userId: user._id })
        .populate('clinic', 'name address phoneNumber email')
      if (labProfile) {
        profile.labProfile = labProfile
      }
    } else if (user.role === 'pharmacy_staff') {
      const pharmacyProfile = await PharmacyStaff.findOne({ userId: user._id })
        .populate('clinic', 'name address phoneNumber email')
      if (pharmacyProfile) {
        profile.pharmacyProfile = pharmacyProfile
      }
    }

    return res.json(profile)
  } catch (error) {
    console.error('Get profile error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Logout user (optional - for token blacklisting)
// @route   POST /api/auth/logout
// @access  Private
const logoutUser = async (req, res) => {
  try {
    // If implementing token blacklisting, add token to blacklist here
    // For now, just return success (client will remove token)

    return res.json({
      message: 'Logout successful',
    })
  } catch (error) {
    console.error('Logout error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Forgot password - send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ message: 'Please provide email address' })
    }

    // Find user by email
    const user = await User.findOne({ email })

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({
        message: 'If an account exists with this email, a password reset link has been sent.',
      })
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex')

    // Hash token before saving to database
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex')

    // Set token and expiration (10 minutes)
    const resetPasswordExpire = Date.now() + 10 * 60 * 1000

    await User.updateOne(
      { _id: user._id },
      {
        resetPasswordToken,
        resetPasswordExpire
      }
    )

    // Create reset URL (use environment variable for client URL)
    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password/${resetToken}`

    // Create notification
    await Notification.create({
      user: user._id,
      type: 'system',
      title: 'Password Reset Request',
      message: 'A password reset has been requested for your account.',
      read: false,
    })

    // Send email with reset link
    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Reset Request - MediBook',
        html: `
          <h2>Password Reset Request</h2>
          <p>Hello ${user.firstName},</p>
          <p>You requested a password reset for your MediBook account.</p>
          <p>Please click the link below to reset your password:</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <p>This link will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <p>Best regards,<br>MediBook Team</p>
        `
      })

      return res.json({
        message: 'If an account exists with this email, a password reset link has been sent.',
      })
    } catch (emailError) {
      // Rollback token if email fails
      await User.updateOne(
        { _id: user._id },
        {
          $unset: { resetPasswordToken: 1, resetPasswordExpire: 1 }
        }
      )

      console.error('Email send error:', emailError)
      return res.status(500).json({
        message: 'Error sending email. Please try again later.'
      })
    }
  } catch (error) {
    console.error('Forgot password error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({
        message: 'Please provide token and new password'
      })
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters long'
      })
    }

    // Hash the token from URL
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex')

    // Find user with valid token and not expired
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    })

    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired reset token'
      })
    }

    // Set new password (will be hashed by pre-save hook)
    user.password = newPassword
    user.resetPasswordToken = undefined
    user.resetPasswordExpire = undefined

    await user.save()

    // Create notification
    await Notification.create({
      user: user._id,
      type: 'system',
      title: 'Password Changed',
      message: 'Your password has been successfully changed.',
      read: false,
    })

    // Send confirmation email
    sendEmail({
      to: user.email,
      subject: 'Password Changed - MediBook',
      html: `
        <h2>Password Changed Successfully</h2>
        <p>Hello ${user.firstName},</p>
        <p>Your password has been successfully changed.</p>
        <p>If you didn't make this change, please contact support immediately.</p>
        <p>Best regards,<br>MediBook Team</p>
      `
    }).catch(err => console.error('Email send error:', err))

    await logAudit({
      userId: user._id,
      action: 'PASSWORD_RESET',
      resourceType: 'User',
      resourceId: user._id,
      details: {
        email: user.email,
        resetMethod: 'token'
      },
      req,
      status: 'success'
    })

    return res.json({
      message: 'Password reset successful. You can now login with your new password.',
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Refresh access token
// @route   POST /api/auth/refresh-token
// @access  Public
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body

    if (!token) {
      return res.status(400).json({ message: 'Refresh token is required' })
    }

    // Verify refresh token (implement your own refresh token logic)
    // This is a simplified version
    // In production, store refresh tokens in database with expiration

    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_key_here')

      const user = await User.findById(decoded.id)

      if (!user || user.status !== 'active') {
        return res.status(401).json({ message: 'Invalid refresh token' })
      }

      // Generate new access token and refresh token
      const newAccessToken = generateToken(user._id, user.role)
      const newRefreshToken = generateRefreshToken(user._id)

      return res.json({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        message: 'Token refreshed successfully',
      })
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' })
    }
  } catch (error) {
    console.error('Refresh token error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  forgotPassword,
  resetPassword,
  refreshToken
}