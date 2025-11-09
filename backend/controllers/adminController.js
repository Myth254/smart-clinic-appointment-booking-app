/* eslint-disable no-unused-vars */
// controllers/adminController.js
import User from '../models/User.js'
import Patient from '../models/Patient.js'
import Doctor from '../models/Doctor.js'
import Appointment from '../models/Appointment.js'
import MedicalRecord from '../models/MedicalRecord.js'
import Availability from '../models/Availability.js'
import Notification from '../models/Notification.js'
import Clinic from '../models/Clinic.js'
import Specialty from '../models/Specialty.js'
import Setting from '../models/Setting.js'
import sendEmail from '../utils/sendEmail.js'

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private (Admin)
export const getDashboardStats = async (req, res) => {
  try {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // User statistics
    const totalPatients = await User.countDocuments({ role: 'patient', status: 'active' })
    const totalDoctors = await User.countDocuments({ role: 'doctor', status: 'active' })
    const totalAdmins = await User.countDocuments({ role: 'admin', status: 'active' })
    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: startOfMonth },
      status: 'active'
    })

    // Appointment statistics
    const totalAppointments = await Appointment.countDocuments()
    const completedAppointments = await Appointment.countDocuments({ status: 'completed' })
    const pendingAppointments = await Appointment.countDocuments({ status: 'pending' })
    const upcomingAppointments = await Appointment.countDocuments({
      start: { $gte: now },
      status: { $in: ['pending', 'approved'] }
    })
    const appointmentsThisMonth = await Appointment.countDocuments({
      createdAt: { $gte: startOfMonth }
    })

    // Revenue calculation (if applicable)
    const revenueData = await Appointment.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $lookup: {
          from: 'doctors',
          localField: 'doctor',
          foreignField: 'userId',
          as: 'doctorInfo'
        }
      },
      {
        $unwind: { path: '$doctorInfo', preserveNullAndEmptyArrays: true }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$doctorInfo.consultationFee' },
          count: { $sum: 1 }
        }
      }
    ])

    const revenue = revenueData[0] || { totalRevenue: 0, count: 0 }

    // Growth metrics
    const lastMonthUsers = await User.countDocuments({
      createdAt: { $gte: lastMonth, $lt: startOfMonth }
    })
    const userGrowthRate = lastMonthUsers > 0
      ? ((newUsersThisMonth - lastMonthUsers) / lastMonthUsers * 100).toFixed(2)
      : 0

    return res.json({
      users: {
        totalPatients,
        totalDoctors,
        totalAdmins,
        total: totalPatients + totalDoctors + totalAdmins,
        newThisMonth: newUsersThisMonth,
        growthRate: parseFloat(userGrowthRate)
      },
      appointments: {
        total: totalAppointments,
        completed: completedAppointments,
        pending: pendingAppointments,
        upcoming: upcomingAppointments,
        thisMonth: appointmentsThisMonth
      },
      revenue: {
        thisMonth: revenue.totalRevenue || 0,
        completedAppointments: revenue.count || 0
      }
    })
  } catch (error) {
    console.error('Get dashboard stats error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get appointment analytics
// @route   GET /api/admin/analytics/appointments
// @access  Private (Admin)
export const getAppointmentAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    // Determine date format based on groupBy
    let dateFormat
    switch (groupBy) {
    case 'week':
      dateFormat = '%Y-W%V' // Year-Week
      break
    case 'month':
      dateFormat = '%Y-%m' // Year-Month
      break
    default:
      dateFormat = '%Y-%m-%d' // Year-Month-Day
    }

    const analytics = await Appointment.aggregate([
      {
        $match: {
          start: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$start' } },
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          approved: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ])

    return res.json({
      period: { start, end, groupBy },
      data: analytics
    })
  } catch (error) {
    console.error('Get appointment analytics error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get revenue analytics
// @route   GET /api/admin/analytics/revenue
// @access  Private (Admin)
export const getRevenueAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    let dateFormat
    switch (groupBy) {
    case 'day':
      dateFormat = '%Y-%m-%d'
      break
    case 'week':
      dateFormat = '%Y-W%V'
      break
    default:
      dateFormat = '%Y-%m'
    }

    const analytics = await Appointment.aggregate([
      {
        $match: {
          status: 'completed',
          start: { $gte: start, $lte: end }
        }
      },
      {
        $lookup: {
          from: 'doctors',
          localField: 'doctor',
          foreignField: 'userId',
          as: 'doctorInfo'
        }
      },
      {
        $unwind: { path: '$doctorInfo', preserveNullAndEmptyArrays: true }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$start' } },
          revenue: { $sum: '$doctorInfo.consultationFee' },
          appointmentCount: { $sum: 1 },
          averageFee: { $avg: '$doctorInfo.consultationFee' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ])

    const totalRevenue = analytics.reduce((sum, item) => sum + (item.revenue || 0), 0)
    const totalAppointments = analytics.reduce((sum, item) => sum + item.appointmentCount, 0)

    return res.json({
      period: { start, end, groupBy },
      summary: {
        totalRevenue,
        totalAppointments,
        averagePerAppointment: totalAppointments > 0 ? totalRevenue / totalAppointments : 0
      },
      data: analytics
    })
  } catch (error) {
    console.error('Get revenue analytics error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get all users with filtering and pagination
// @route   GET /api/admin/users
// @access  Private (Admin)
export const getAllUsers = async (req, res) => {
  try {
    const {
      role,
      status,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query

    // Build filter object
    const filter = {}

    if (role && ['patient', 'doctor', 'admin'].includes(role)) {
      filter.role = role
    }

    if (status && ['active', 'inactive', 'suspended'].includes(status)) {
      filter.status = status
    }

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ]
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const sortOrder = order === 'asc' ? 1 : -1

    const users = await User.find(filter)
      .select('-password')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await User.countDocuments(filter)

    return res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get all users error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get user by ID with detailed stats
// @route   GET /api/admin/users/:id
// @access  Private (Admin)
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params

    const user = await User.findById(id).select('-password')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    let additionalData = {}

    if (user.role === 'doctor') {
      const doctorProfile = await Doctor.findOne({ userId: user._id }).populate('clinic')

      const appointmentStats = await Appointment.aggregate([
        { $match: { doctor: user._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])

      const availabilityCount = await Availability.countDocuments({ doctor: user._id })
      const totalPatients = await Appointment.distinct('patient', {
        doctor: user._id,
        status: 'completed'
      })

      additionalData = {
        profile: doctorProfile,
        appointmentStats: appointmentStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count
          return acc
        }, {}),
        availabilityRules: availabilityCount,
        uniquePatients: totalPatients.length
      }
    } else if (user.role === 'patient') {
      const patientProfile = await Patient.findOne({ userId: user._id })

      const appointmentStats = await Appointment.aggregate([
        { $match: { patient: user._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])

      const medicalRecordsCount = await MedicalRecord.countDocuments({ patient: user._id })

      additionalData = {
        profile: patientProfile,
        appointmentStats: appointmentStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count
          return acc
        }, {}),
        medicalRecords: medicalRecordsCount
      }
    }

    return res.json({
      user,
      ...additionalData
    })
  } catch (error) {
    console.error('Get user by ID error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Create user (Admin creates any role)
// @route   POST /api/admin/users
// @access  Private (Admin)
export const createUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role,
      // Patient fields
      dateOfBirth,
      address,
      emergencyContact,
      // Doctor fields
      specialization,
      clinic,
      qualifications,
      bio
    } = req.body

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !phoneNumber || !role) {
      return res.status(400).json({ message: 'All required fields must be provided' })
    }

    if (!['doctor', 'admin', 'patient'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }

    if (role === 'doctor' && !specialization) {
      return res.status(400).json({ message: 'Specialization is required for doctors' })
    }

    if (role === 'patient' && !dateOfBirth) {
      return res.status(400).json({ message: 'Date of birth is required for patients' })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' })
    }

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role
    })

    // Create role-specific profile
    if (role === 'patient') {
      await Patient.create({
        userId: user._id,
        dateOfBirth,
        address: address || {},
        emergencyContact: emergencyContact || {}
      })
    } else if (role === 'doctor') {
      await Doctor.create({
        userId: user._id,
        specialization,
        clinic: clinic || null,
        qualifications: qualifications || [],
        bio: bio || ''
      })
    }

    // Create welcome notification
    await Notification.create({
      user: user._id,
      type: 'system',
      title: 'Welcome to MediBook',
      message: `Your ${role} account has been created by an administrator.`,
      read: false
    })

    // Send welcome email
    const roleText = role.charAt(0).toUpperCase() + role.slice(1)
    try {
      await sendEmail({
        to: user.email,
        subject: `Your MediBook ${roleText} Account`,
        html: `
          <h3>Hello ${role === 'doctor' ? 'Dr.' : ''} ${user.lastName},</h3>
          <p>Your MediBook ${role} account has been created successfully by an administrator.</p>
          ${role === 'doctor' ? `<p><strong>Specialization:</strong> ${specialization}</p>` : ''}
          <p><strong>Login Details:</strong></p>
          <ul>
            <li>Email: ${user.email}</li>
            <li>Temporary Password: ${password}</li>
          </ul>
          <p><strong>Important:</strong> Please change your password after your first login.</p>
          <p>Best regards,<br/>MediBook Team</p>
        `
      })
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError)
    }

    return res.status(201).json({
      message: `${roleText} account created successfully`,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role
      }
    })
  } catch (error) {
    console.error('Create user error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private (Admin)
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      role,
      status,
      specialization
    } = req.body

    const user = await User.findById(id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Validate role if provided
    if (role && !['doctor', 'admin', 'patient'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }

    // Check email uniqueness
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email })
      if (emailExists) {
        return res.status(400).json({ message: 'Email already exists' })
      }
    }

    // Update user fields
    if (firstName) user.firstName = firstName
    if (lastName) user.lastName = lastName
    if (email) user.email = email
    if (phoneNumber) user.phoneNumber = phoneNumber
    if (status) user.status = status
    if (role) user.role = role

    await user.save()

    // Update role-specific profiles if needed
    if (user.role === 'doctor' && specialization) {
      await Doctor.findOneAndUpdate(
        { userId: user._id },
        { specialization },
        { upsert: true }
      )
    }

    // Send notification email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Account Information Updated',
        html: `
          <h3>Hello ${user.firstName},</h3>
          <p>Your MediBook account information has been updated by an administrator.</p>
          <p>If you did not request this change, please contact support immediately.</p>
          <p>Best regards,<br/>MediBook Team</p>
        `
      })
    } catch (emailError) {
      console.error('Failed to send update notification:', emailError)
    }

    return res.json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status
      }
    })
  } catch (error) {
    console.error('Update user error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Update user status
// @route   PUT /api/admin/users/:id/status
// @access  Private (Admin)
export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!status || !['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Valid status is required' })
    }

    const user = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).select('-password')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // If suspending or deactivating, cancel pending appointments
    if (status !== 'active') {
      const filter = user.role === 'doctor'
        ? { doctor: user._id, status: { $in: ['pending', 'approved'] } }
        : { patient: user._id, status: { $in: ['pending', 'approved'] } }

      await Appointment.updateMany(
        filter,
        {
          status: 'cancelled',
          cancellationReason: `User account ${status}`
        }
      )
    }

    return res.json({
      message: 'User status updated successfully',
      user
    })
  } catch (error) {
    console.error('Update user status error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin)
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params

    const user = await User.findById(id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Prevent self-deletion
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' })
    }

    // Handle cascade operations based on role
    if (user.role === 'doctor') {
      // Delete doctor profile
      await Doctor.deleteOne({ userId: user._id })

      // Delete availability
      await Availability.deleteMany({ doctor: user._id })

      // Cancel doctor's appointments
      await Appointment.updateMany(
        { doctor: user._id, status: { $nin: ['completed', 'cancelled'] } },
        {
          status: 'cancelled',
          cancellationReason: 'Doctor account deleted'
        }
      )
    } else if (user.role === 'patient') {
      // Delete patient profile
      await Patient.deleteOne({ userId: user._id })

      // Cancel patient's appointments
      await Appointment.updateMany(
        { patient: user._id, status: { $nin: ['completed', 'cancelled'] } },
        {
          status: 'cancelled',
          cancellationReason: 'Patient account deleted'
        }
      )
    }

    // Delete user's notifications
    await Notification.deleteMany({ user: user._id })

    // Delete the user
    await user.deleteOne()

    return res.json({
      message: `User (${user.role}) deleted successfully`,
      deletedUser: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role
      }
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Reset user password
// @route   PUT /api/admin/users/:id/reset-password
// @access  Private (Admin)
export const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params
    const { newPassword } = req.body

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters long'
      })
    }

    const user = await User.findById(id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    user.password = newPassword
    await user.save()

    // Send notification
    try {
      await sendEmail({
        to: user.email,
        subject: 'Your Password Has Been Reset',
        html: `
          <h3>Hello ${user.firstName},</h3>
          <p>Your MediBook account password has been reset by an administrator.</p>
          <p><strong>New Temporary Password:</strong> ${newPassword}</p>
          <p><strong>Important:</strong> Please change your password after logging in.</p>
          <p>If you did not request this change, please contact support immediately.</p>
          <p>Best regards,<br/>MediBook Team</p>
        `
      })
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError)
    }

    return res.json({
      message: 'Password reset successfully',
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`
      }
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get all doctors with stats
// @route   GET /api/admin/doctors
// @access  Private (Admin)
export const getAllDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .populate('userId', 'firstName lastName email phoneNumber status createdAt')
      .populate('clinic', 'name address phoneNumber')

    const doctorsWithStats = await Promise.all(
      doctors.map(async (doctor) => {
        const appointmentCount = await Appointment.countDocuments({
          doctor: doctor.userId._id
        })

        const pendingCount = await Appointment.countDocuments({
          doctor: doctor.userId._id,
          status: 'pending'
        })

        const completedCount = await Appointment.countDocuments({
          doctor: doctor.userId._id,
          status: 'completed'
        })

        const uniquePatients = await Appointment.distinct('patient', {
          doctor: doctor.userId._id,
          status: 'completed'
        })

        return {
          ...doctor.toObject(),
          stats: {
            totalAppointments: appointmentCount,
            pendingAppointments: pendingCount,
            completedAppointments: completedCount,
            uniquePatients: uniquePatients.length
          }
        }
      })
    )

    return res.json(doctorsWithStats)
  } catch (error) {
    console.error('Get all doctors error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get all appointments (admin view)
// @route   GET /api/admin/appointments
// @access  Private (Admin)
export const getAllAppointments = async (req, res) => {
  try {
    const { status, doctorId, patientId, startDate, endDate, limit = 20, offset = 0 } = req.query

    const filter = {}

    if (status) filter.status = status
    if (doctorId) filter.doctor = doctorId
    if (patientId) filter.patient = patientId

    if (startDate || endDate) {
      filter.start = {}
      if (startDate) filter.start.$gte = new Date(startDate)
      if (endDate) filter.start.$lte = new Date(endDate)
    }

    const appointments = await Appointment.find(filter)
      .populate('patient', 'firstName lastName email phoneNumber')
      .populate('doctor', 'firstName lastName email phoneNumber')
      .sort({ start: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    const total = await Appointment.countDocuments(filter)

    return res.json({
      appointments,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get all appointments error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get system settings
// @route   GET /api/admin/settings
// @access  Private (Admin)
export const getSystemSettings = async (req, res) => {
  try {
    const settings = await Setting.find()

    // Organize by category
    const organized = settings.reduce((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = {}
      }
      acc[setting.category][setting.key] = {
        value: setting.value,
        description: setting.description,
        isPublic: setting.isPublic
      }
      return acc
    }, {})

    return res.json(organized)
  } catch (error) {
    console.error('Get system settings error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Update system settings
// @route   PUT /api/admin/settings
// @access  Private (Admin)
export const updateSystemSettings = async (req, res) => {
  try {
    const { key, value, category, description, isPublic } = req.body

    if (!key || value === undefined) {
      return res.status(400).json({
        message: 'Key and value are required'
      })
    }

    const setting = await Setting.findOneAndUpdate(
      { key },
      {
        value,
        category: category || 'general',
        description,
        isPublic: isPublic !== undefined ? isPublic : false
      },
      { upsert: true, new: true }
    )

    return res.json({
      message: 'Setting updated successfully',
      setting
    })
  } catch (error) {
    console.error('Update system settings error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get recent registrations
// @route   GET /api/admin/users/recent
// @access  Private (Admin)
export const getRecentUsers = async (req, res) => {
  try {
    const { days = 7, limit = 10 } = req.query

    const dateThreshold = new Date()
    dateThreshold.setDate(dateThreshold.getDate() - parseInt(days))

    const users = await User.find({
      createdAt: { $gte: dateThreshold }
    })
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))

    return res.json(users)
  } catch (error) {
    console.error('Get recent users error:', error)
    return res.status(500).json({ message: error.message })
  }
}