// controllers/adminController.js - COMPLETE SYNCHRONIZED VERSION
import User from '../models/User.js'
import Patient from '../models/Patient.js'
import Doctor from '../models/Doctor.js'
import Appointment from '../models/Appointment.js'
import MedicalRecord from '../models/MedicalRecord.js'
import Availability from '../models/Availability.js'
import Session from '../models/Session.js'
import Bill from '../models/Bill.js'
import LabRequest from '../models/LabRequest.js'
import Prescription from '../models/Prescription.js'
import Payment from '../models/Payment.js'
import Notification from '../models/Notification.js'
import AuditLog from '../models/AuditLog.js'
import Setting from '../models/Setting.js'
import { LabPersonnel } from '../models/LabPersonnel.js'
import { PharmacyStaff } from '../models/PharmacyStaff.js'
import logAudit from '../utils/auditLogger.js'
import sendEmail from '../utils/sendEmail.js'
import { createNotification } from '../utils/notificationHelper.js'

// ========== DASHBOARD & ANALYTICS ==========

export const getDashboardStats = async (req, res) => {
  try {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const totalPatients = await User.countDocuments({ role: 'patient', status: 'active' })
    const totalDoctors = await User.countDocuments({ role: 'doctor', status: 'active' })
    const totalAdmins = await User.countDocuments({ role: 'admin', status: 'active' })
    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: startOfMonth },
      status: 'active'
    })
    const [newPatientsThisMonth, newDoctorsThisMonth] = await Promise.all([
      User.countDocuments({
        role: 'patient',
        status: 'active',
        createdAt: { $gte: startOfMonth }
      }),
      User.countDocuments({
        role: 'doctor',
        status: 'active',
        createdAt: { $gte: startOfMonth }
      })
    ])

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
    const activeSessions = await Session.countDocuments({ status: 'in_progress' })

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
    const billRevenueData = await Bill.aggregate([
      {
        $match: {
          status: { $in: ['paid', 'partially_paid'] },
          updatedAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: '$amountPaid' },
          consultation: { $sum: '$consultationFee' },
          lab: { $sum: '$labTotal' },
          medication: { $sum: '$medicationTotal' },
          billCount: { $sum: 1 }
        }
      }
    ])
    const billRevenue = billRevenueData[0] || {
      totalPaid: 0,
      consultation: 0,
      lab: 0,
      medication: 0,
      billCount: 0
    }

    const lastMonthBillData = await Bill.aggregate([
      {
        $match: {
          status: { $in: ['paid', 'partially_paid'] },
          updatedAt: { $gte: startOfLastMonth, $lt: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: '$amountPaid' }
        }
      }
    ])
    const lastMonthRevenue = lastMonthBillData[0]?.totalPaid || 0
    const revenueGrowthRate = lastMonthRevenue > 0
      ? parseFloat((((billRevenue.totalPaid || 0) - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(2))
      : 0

    const lastMonthUsers = await User.countDocuments({
      createdAt: { $gte: lastMonth, $lt: startOfMonth }
    })
    const userGrowthRate = lastMonthUsers > 0
      ? ((newUsersThisMonth - lastMonthUsers) / lastMonthUsers * 100).toFixed(2)
      : 0

    await logAudit({
      userId: req.user.id,
      action: 'dashboard_stats_viewed',
      resourceType: 'Dashboard',
      details: {
        totalUsers: totalPatients + totalDoctors + totalAdmins,
        totalAppointments,
        totalRevenue: billRevenue.totalPaid || revenue.totalRevenue || 0
      },
      req
    }).catch(err => console.error('Audit log error:', err))

    return res.json({
      users: {
        totalPatients,
        totalDoctors,
        totalAdmins,
        total: totalPatients + totalDoctors + totalAdmins,
        newThisMonth: newUsersThisMonth,
        newPatientsThisMonth,
        newDoctorsThisMonth,
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
        completedAppointments: revenue.count || 0,
        actual: {
          thisMonth: billRevenue.totalPaid || 0,
          consultation: billRevenue.consultation || 0,
          lab: billRevenue.lab || 0,
          medication: billRevenue.medication || 0,
          billCount: billRevenue.billCount || 0,
          growthRate: revenueGrowthRate
        }
      },
      sessions: {
        active: activeSessions
      }
    })
  } catch (error) {
    console.error('Get dashboard stats error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const getAppointmentAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    let dateFormat
    switch (groupBy) {
    case 'week':
      dateFormat = '%Y-W%V'
      break
    case 'month':
      dateFormat = '%Y-%m'
      break
    default:
      dateFormat = '%Y-%m-%d'
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

    await logAudit({
      userId: req.user.id,
      action: 'analytics_report_viewed',
      resourceType: 'Analytics',
      details: {
        reportType: 'appointments',
        period: { start, end },
        groupBy,
        recordsReturned: analytics.length
      },
      req
    }).catch(err => console.error('Audit log error:', err))

    return res.json({
      period: { start, end, groupBy },
      data: analytics
    })
  } catch (error) {
    console.error('Get appointment analytics error:', error)
    return res.status(500).json({ message: error.message })
  }
}

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

    await logAudit({
      userId: req.user.id,
      action: 'analytics_report_viewed',
      resourceType: 'Analytics',
      details: {
        reportType: 'revenue',
        period: { start, end },
        groupBy,
        totalRevenue,
        recordCount: analytics.length
      },
      req
    }).catch(err => console.error('Audit log error:', err))

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

// ========== USER MANAGEMENT ==========

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

    const filter = {}

    const FILTERABLE_ROLES = ['patient', 'doctor', 'admin', 'lab_personnel', 'pharmacy_staff']
    if (role && FILTERABLE_ROLES.includes(role)) {
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

    await logAudit({
      userId: req.user.id,
      action: 'users_list_retrieved',
      resourceType: 'User',
      details: {
        filters: { role, status, search },
        recordsReturned: users.length,
        totalRecords: total,
        pagination: { page, limit }
      },
      req
    }).catch(err => console.error('Audit log error:', err))

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

    await logAudit({
      userId: req.user.id,
      action: 'user_details_viewed',
      resourceType: 'User',
      resourceId: id,
      details: {
        targetUserRole: user.role,
        targetUserEmail: user.email
      },
      req
    }).catch(err => console.error('Audit log error:', err))

    return res.json({
      user,
      ...additionalData
    })
  } catch (error) {
    console.error('Get user by ID error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const createUser = async (req, res) => {
  let createdUser = null

  try {
    const {
      firstName, lastName, email, phoneNumber, password, role,
      // Patient
      dateOfBirth, address, emergencyContact,
      // Doctor
      specialization, clinic, qualifications, bio,
      // Lab personnel
      labSpecialization, experience, assignedLabs,
      // Pharmacy staff
      licenseNumber, licenseExpiry, pharmacyRole, pharmacySpecializations
    } = req.body

    if (!firstName || !lastName || !email || !password || !phoneNumber || !role) {
      return res.status(400).json({ message: 'All required fields must be provided' })
    }

    const VALID_ROLES = ['doctor', 'admin', 'patient', 'lab_personnel', 'pharmacy_staff']
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }

    if (role === 'doctor' && !specialization) {
      return res.status(400).json({ message: 'Specialization is required for doctors' })
    }
    if (role === 'patient' && !dateOfBirth) {
      return res.status(400).json({ message: 'Date of birth is required for patients' })
    }
    if (role === 'lab_personnel') {
      if (!labSpecialization) return res.status(400).json({ message: 'Lab specialization is required' })
      if (!clinic) return res.status(400).json({ message: 'Clinic is required for lab personnel' })
    }
    if (role === 'pharmacy_staff') {
      if (!licenseNumber) return res.status(400).json({ message: 'License number is required' })
      if (!licenseExpiry) return res.status(400).json({ message: 'License expiry is required' })
      if (!pharmacyRole) return res.status(400).json({ message: 'Pharmacy role is required' })
      if (!clinic) return res.status(400).json({ message: 'Clinic is required for pharmacy staff' })
    }

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' })
    }

    createdUser = await User.create({ firstName, lastName, email, phoneNumber, password, role })

    let profile = null

    if (role === 'patient') {
      let ecObj = {}
      if (typeof emergencyContact === 'string' && emergencyContact.trim()) {
        ecObj = { name: 'Emergency Contact', phoneNumber: emergencyContact.trim() }
      } else if (emergencyContact && typeof emergencyContact === 'object') {
        ecObj = emergencyContact
      }
      if (!ecObj.name || !ecObj.phoneNumber) {
        throw new Error('Emergency contact must include a name and phone number')
      }
      profile = await Patient.create({
        userId: createdUser._id,
        dateOfBirth,
        address: address || {},
        emergencyContact: ecObj
      })
    } else if (role === 'doctor') {
      const clinicId = clinic && clinic.trim() !== '' ? clinic : null
      profile = await Doctor.create({
        userId: createdUser._id,
        specialization,
        clinic: clinicId,
        qualifications: qualifications || [],
        bio: bio || ''
      })
    } else if (role === 'lab_personnel') {
      profile = await LabPersonnel.create({
        userId: createdUser._id,
        specialization: labSpecialization,
        clinic,
        experience: experience ? parseInt(experience) : 0,
        assignedLabs: Array.isArray(assignedLabs) ? assignedLabs : []
      })
    } else if (role === 'pharmacy_staff') {
      const specs = Array.isArray(pharmacySpecializations)
        ? pharmacySpecializations
        : (pharmacySpecializations
          ? pharmacySpecializations.split(',').map(s => s.trim()).filter(Boolean)
          : [])
      profile = await PharmacyStaff.create({
        userId: createdUser._id,
        clinic,
        licenseNumber,
        licenseExpiry,
        role: pharmacyRole,
        specializations: specs
      })
    }

    await logAudit({
      userId: req.user.id,
      action: 'user_created',
      resourceType: 'User',
      resourceId: createdUser._id,
      details: { role, email, createdBy: req.user.email },
      req
    }).catch(err => console.error('Audit log error:', err))

    let emailSent = false

    try {
      const emailResult = await sendEmail({
        to: email,
        subject: 'Your SCAS account has been created',
        text: `Hello ${firstName},\n\nYour account has been created with the role: ${role}.\nPlease log in and change your password.\n\nSCAS Team`
      })

      emailSent = Boolean(emailResult?.messageId)
      if (!emailSent) {
        console.warn(`Welcome email not delivered for user ${createdUser._id} (${email})`)
      }
    } catch (emailErr) {
      console.error('Welcome email failed:', emailErr.message)
    }

    return res.status(201).json({
      success: true,
      message: emailSent
        ? 'User created successfully'
        : 'User created successfully, but the welcome email was not delivered',
      email: {
        sent: emailSent
      },
      user: createdUser,
      profile
    })
  } catch (error) {
    if (createdUser) {
      try {
        await User.findByIdAndDelete(createdUser._id)
        console.warn(`Rolled back User ${createdUser._id} due to profile creation failure`)
      } catch (rollbackErr) {
        console.error('Rollback failed — orphaned User record:', createdUser._id, rollbackErr.message)
      }
    }
    console.error('Create user error:', error)
    return res.status(500).json({ message: error.message })
  }
}

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

    if (role && !['doctor', 'admin', 'patient'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email })
      if (emailExists) {
        return res.status(400).json({ message: 'Email already exists' })
      }
    }

    if (firstName) user.firstName = firstName
    if (lastName) user.lastName = lastName
    if (email) user.email = email
    if (phoneNumber) user.phoneNumber = phoneNumber
    if (status) user.status = status
    if (role) user.role = role

    await user.save()

    if (user.role === 'doctor' && specialization) {
      await Doctor.findOneAndUpdate(
        { userId: user._id },
        { specialization },
        { upsert: true }
      )
    }

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

    await logAudit({
      userId: req.user.id,
      action: 'user_updated',
      resourceType: 'User',
      resourceId: id,
      details: { updatedFields: Object.keys(req.body) },
      req
    })

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

    await logAudit({
      userId: req.user.id,
      action: 'user_status_updated',
      resourceType: 'User',
      resourceId: id,
      details: {
        targetUserEmail: user.email,
        targetUserRole: user.role,
        newStatus: status,
        appointmentsCancelled: status !== 'active'
      },
      req
    }).catch(err => console.error('Audit log error:', err))

    return res.json({
      message: 'User status updated successfully',
      user
    })
  } catch (error) {
    console.error('Update user status error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params

    const user = await User.findById(id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' })
    }

    const deletedUserInfo = {
      id: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role
    }

    if (user.role === 'doctor') {
      await Doctor.deleteOne({ userId: user._id })
      await Availability.deleteMany({ doctor: user._id })
      await Appointment.updateMany(
        { doctor: user._id, status: { $nin: ['completed', 'cancelled'] } },
        {
          status: 'cancelled',
          cancellationReason: 'Doctor account deleted'
        }
      )
    } else if (user.role === 'patient') {
      await Patient.deleteOne({ userId: user._id })
      await Appointment.updateMany(
        { patient: user._id, status: { $nin: ['completed', 'cancelled'] } },
        {
          status: 'cancelled',
          cancellationReason: 'Patient account deleted'
        }
      )
    } else if (user.role === 'lab_personnel') {
      await LabPersonnel.deleteOne({ userId: user._id })
    } else if (user.role === 'pharmacy_staff') {
      await PharmacyStaff.deleteOne({ userId: user._id })
    }

    await Notification.deleteMany({ user: user._id })

    await user.deleteOne()

    await logAudit({
      userId: req.user.id,
      action: 'user_deleted',
      resourceType: 'User',
      resourceId: id,
      details: {
        deletedUser: deletedUserInfo,
        cascadeDeletes: {
          role: user.role,
          profilesDeleted: user.role === 'doctor' || user.role === 'patient',
          appointmentsCancelled: true
        }
      },
      req
    }).catch(err => console.error('Audit log error:', err))

    return res.json({
      message: `User (${user.role}) deleted successfully`,
      deletedUser: deletedUserInfo
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return res.status(500).json({ message: error.message })
  }
}

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

    await logAudit({
      userId: req.user.id,
      action: 'user_password_reset',
      resourceType: 'User',
      resourceId: id,
      details: {
        targetUserEmail: user.email,
        targetUserName: `${user.firstName} ${user.lastName}`
      },
      req
    })

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

// ========== DOCTOR MANAGEMENT ==========

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

// ========== APPOINTMENT MANAGEMENT ==========

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

export const approveAppointment = async (req, res) => {
  try {
    const { id } = req.params
    const { notes } = req.body

    const appointment = await Appointment.findById(id)
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName email')

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    if (appointment.status !== 'pending') {
      return res.status(400).json({
        message: `Cannot approve appointment with status: ${appointment.status}`
      })
    }

    appointment.status = 'approved'
    appointment.approvedBy = req.user.id
    appointment.approvedAt = new Date()
    if (notes) appointment.adminNotes = notes
    await appointment.save()

    await createNotification({
      userId: appointment.patient._id,
      type: 'appointment',
      title: 'Appointment Approved',
      message: `Your appointment with Dr. ${appointment.doctor.lastName} on ${appointment.start.toLocaleDateString()} has been approved.`,
      relatedId: appointment._id,
      relatedModel: 'Appointment'
    })

    await createNotification({
      userId: appointment.doctor._id,
      type: 'appointment',
      title: 'New Appointment Confirmed',
      message: `Appointment with ${appointment.patient.firstName} ${appointment.patient.lastName} on ${appointment.start.toLocaleDateString()} has been approved.`,
      relatedId: appointment._id,
      relatedModel: 'Appointment'
    })

    await logAudit({
      userId: req.user.id,
      action: 'appointment_approved',
      resourceType: 'Appointment',
      resourceId: id,
      details: {
        patientId: appointment.patient._id,
        doctorId: appointment.doctor._id,
        appointmentDate: appointment.start,
        notes
      },
      req
    })

    return res.json({
      success: true,
      message: 'Appointment approved successfully',
      appointment
    })
  } catch (error) {
    console.error('Approve appointment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const rejectAppointment = async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    if (!reason) {
      return res.status(400).json({ message: 'Rejection reason is required' })
    }

    const appointment = await Appointment.findById(id)
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName email')

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    appointment.status = 'cancelled'
    appointment.cancellationReason = reason
    appointment.cancelledBy = req.user.id
    appointment.cancelledAt = new Date()
    await appointment.save()

    await createNotification({
      userId: appointment.patient._id,
      type: 'appointment',
      title: 'Appointment Rejected',
      message: `Your appointment request has been rejected. Reason: ${reason}`,
      relatedId: appointment._id,
      relatedModel: 'Appointment'
    })

    await logAudit({
      userId: req.user.id,
      action: 'appointment_rejected',
      resourceType: 'Appointment',
      resourceId: id,
      details: {
        patientId: appointment.patient._id,
        doctorId: appointment.doctor._id,
        reason
      },
      req
    })

    return res.json({
      success: true,
      message: 'Appointment rejected',
      appointment
    })
  } catch (error) {
    console.error('Reject appointment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const getAppointmentDetails = async (req, res) => {
  try {
    const { id } = req.params

    const appointment = await Appointment.findById(id)
      .populate('patient', 'firstName lastName email phoneNumber')
      .populate('doctor', 'firstName lastName email phoneNumber specialization')

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    const session = await Session.findOne({ appointment: id })
      .populate('labRequests')
      .populate('medicalRecord')

    const patientHistory = await Appointment.find({
      patient: appointment.patient._id,
      status: 'completed'
    })
      .sort({ start: -1 })
      .limit(5)
      .select('start reason status')

    await logAudit({
      userId: req.user.id,
      action: 'appointment_details_viewed',
      resourceType: 'Appointment',
      resourceId: id,
      req
    })

    return res.json({
      success: true,
      appointment,
      session,
      patientHistory
    })
  } catch (error) {
    console.error('Get appointment details error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// ========== SESSION OVERSIGHT ==========

export const getAllSessions = async (req, res) => {
  try {
    const {
      status,
      doctorId,
      patientId,
      startDate,
      endDate,
      limit = 20,
      offset = 0
    } = req.query

    const filter = {}

    if (status) filter.status = status
    if (doctorId) filter.doctor = doctorId
    if (patientId) filter.patient = patientId

    if (startDate || endDate) {
      filter.createdAt = {}
      if (startDate) filter.createdAt.$gte = new Date(startDate)
      if (endDate) filter.createdAt.$lte = new Date(endDate)
    }

    const sessions = await Session.find(filter)
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName email specialization')
      .populate('appointment', 'start reason')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    const total = await Session.countDocuments(filter)

    const completedSessions = await Session.countDocuments({ ...filter, status: 'completed' })
    const inProgressSessions = await Session.countDocuments({ ...filter, status: 'in_progress' })

    await logAudit({
      userId: req.user.id,
      action: 'sessions_list_retrieved',
      resourceType: 'Session',
      details: {
        filters: { status, doctorId, patientId },
        recordsReturned: sessions.length,
        totalRecords: total
      },
      req
    })

    return res.json({
      success: true,
      sessions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      },
      metrics: {
        completed: completedSessions,
        inProgress: inProgressSessions,
        completionRate: total > 0 ? ((completedSessions / total) * 100).toFixed(2) : 0
      }
    })
  } catch (error) {
    console.error('Get all sessions error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const getSessionDetails = async (req, res) => {
  try {
    const { id } = req.params

    const session = await Session.findById(id)
      .populate('patient', 'firstName lastName email phoneNumber dateOfBirth')
      .populate('doctor', 'firstName lastName email specialization')
      .populate('appointment')
      .populate('labRequests')
      .populate('medicalRecord')
      .populate('prescriptions')

    if (!session) {
      return res.status(404).json({ message: 'Session not found' })
    }

    await logAudit({
      userId: req.user.id,
      action: 'session_details_viewed',
      resourceType: 'Session',
      resourceId: id,
      req
    })

    return res.json({
      success: true,
      session
    })
  } catch (error) {
    console.error('Get session details error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// ========== LAB OVERSIGHT ==========

export const getLabRequestDetails = async (req, res) => {
  try {
    const { id } = req.params

    const labRequest = await LabRequest.findById(id)
      .populate('patient', 'firstName lastName email phoneNumber')
      .populate('doctor', 'firstName lastName email specialization')
      .populate('assignedTo', 'firstName lastName email')
      .populate('session')

    if (!labRequest) {
      return res.status(404).json({ message: 'Lab request not found' })
    }

    const payment = await Payment.findOne({
      referenceType: 'lab',
      referenceId: id
    })

    await logAudit({
      userId: req.user.id,
      action: 'lab_request_details_viewed',
      resourceType: 'LabRequest',
      resourceId: id,
      req
    })

    return res.json({
      success: true,
      labRequest,
      payment
    })
  } catch (error) {
    console.error('Get lab request details error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const reassignLabRequest = async (req, res) => {
  try {
    const { id } = req.params
    const { personnelId, reason } = req.body

    if (!personnelId) {
      return res.status(400).json({ message: 'Personnel ID is required' })
    }

    const personnel = await User.findById(personnelId)
    if (!personnel || personnel.role !== 'lab_personnel') {
      return res.status(400).json({ message: 'Invalid lab personnel' })
    }

    const labRequest = await LabRequest.findById(id)
      .populate('patient', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')

    if (!labRequest) {
      return res.status(404).json({ message: 'Lab request not found' })
    }

    const oldAssignee = labRequest.assignedTo

    labRequest.assignedTo = personnelId
    labRequest.assignedAt = new Date()
    labRequest.comments.push({
      user: req.user.id,
      text: `Reassigned by admin. Reason: ${reason || 'Administrative decision'}`,
      type: 'note'
    })
    await labRequest.save()

    await createNotification({
      userId: personnelId,
      type: 'lab',
      title: 'Lab Request Assigned',
      message: `You have been assigned lab request ${labRequest.requestNumber}`,
      relatedId: id,
      relatedModel: 'LabRequest'
    })

    if (oldAssignee) {
      await createNotification({
        userId: oldAssignee._id,
        type: 'lab',
        title: 'Lab Request Reassigned',
        message: `Lab request ${labRequest.requestNumber} has been reassigned`,
        relatedId: id,
        relatedModel: 'LabRequest'
      })
    }

    await logAudit({
      userId: req.user.id,
      action: 'lab_request_reassigned',
      resourceType: 'LabRequest',
      resourceId: id,
      details: {
        oldAssignee: oldAssignee?._id,
        newAssignee: personnelId,
        reason
      },
      req
    })

    return res.json({
      success: true,
      message: 'Lab request reassigned successfully',
      labRequest
    })
  } catch (error) {
    console.error('Reassign lab request error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const escalateLabRequest = async (req, res) => {
  try {
    const { id } = req.params
    const { priority, reason } = req.body

    if (!priority || !['urgent', 'stat', 'emergency'].includes(priority)) {
      return res.status(400).json({ message: 'Valid priority is required' })
    }

    const labRequest = await LabRequest.findById(id)
      .populate('assignedTo', 'firstName lastName email')
      .populate('doctor', 'firstName lastName email')

    if (!labRequest) {
      return res.status(404).json({ message: 'Lab request not found' })
    }

    const oldPriority = labRequest.priority

    labRequest.priority = priority
    labRequest.comments.push({
      user: req.user.id,
      text: `Priority escalated from ${oldPriority} to ${priority}. Reason: ${reason}`,
      type: 'note'
    })
    await labRequest.save()

    if (labRequest.assignedTo) {
      await createNotification({
        userId: labRequest.assignedTo._id,
        type: 'lab',
        title: 'URGENT: Lab Request Escalated',
        message: `Lab request ${labRequest.requestNumber} has been escalated to ${priority.toUpperCase()} priority`,
        relatedId: id,
        relatedModel: 'LabRequest'
      })
    }

    await createNotification({
      userId: labRequest.doctor._id,
      type: 'lab',
      title: 'Lab Request Priority Updated',
      message: `Lab request ${labRequest.requestNumber} priority changed to ${priority}`,
      relatedId: id,
      relatedModel: 'LabRequest'
    })

    await logAudit({
      userId: req.user.id,
      action: 'lab_request_escalated',
      resourceType: 'LabRequest',
      resourceId: id,
      details: {
        oldPriority,
        newPriority: priority,
        reason
      },
      req
    })

    return res.json({
      success: true,
      message: 'Lab request escalated successfully',
      labRequest
    })
  } catch (error) {
    console.error('Escalate lab request error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const getLabMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    const totalRequests = await LabRequest.countDocuments({
      createdAt: { $gte: start, $lte: end }
    })

    const statusBreakdown = await LabRequest.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ])

    const avgTurnaroundTime = await LabRequest.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: { $gte: start, $lte: end }
        }
      },
      {
        $project: {
          turnaroundTime: {
            $divide: [
              { $subtract: ['$completedAt', '$requestedAt'] },
              1000 * 60 * 60
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgHours: { $avg: '$turnaroundTime' }
        }
      }
    ])

    return res.json({
      success: true,
      period: { start, end },
      metrics: {
        total: totalRequests,
        statusBreakdown: statusBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count
          return acc
        }, {}),
        averageTurnaroundHours: avgTurnaroundTime[0]?.avgHours || 0
      }
    })
  } catch (error) {
    console.error('Get lab metrics error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// ========== PHARMACY OVERSIGHT ==========

export const getPrescriptionDetails = async (req, res) => {
  try {
    const { id } = req.params

    const prescription = await Prescription.findById(id)
      .populate('patient', 'firstName lastName email phoneNumber')
      .populate('doctor', 'firstName lastName email specialization')
      .populate('confirmedBy', 'firstName lastName email')
      .populate('dispensedBy', 'firstName lastName email')

    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' })
    }

    const payment = await Payment.findOne({
      referenceType: 'prescription',
      referenceId: id
    })

    await logAudit({
      userId: req.user.id,
      action: 'prescription_details_viewed',
      resourceType: 'Prescription',
      resourceId: id,
      req
    })

    return res.json({
      success: true,
      prescription,
      payment
    })
  } catch (error) {
    console.error('Get prescription details error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const getPharmacyMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    const totalPrescriptions = await Prescription.countDocuments({
      createdAt: { $gte: start, $lte: end }
    })

    const statusBreakdown = await Prescription.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ])

    const avgFulfillmentTime = await Prescription.aggregate([
      {
        $match: {
          status: 'dispensed',
          dispensedAt: { $gte: start, $lte: end }
        }
      },
      {
        $project: {
          fulfillmentTime: {
            $divide: [
              { $subtract: ['$dispensedAt', '$createdAt'] },
              1000 * 60 * 60
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgHours: { $avg: '$fulfillmentTime' }
        }
      }
    ])

    return res.json({
      success: true,
      period: { start, end },
      metrics: {
        total: totalPrescriptions,
        statusBreakdown: statusBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count
          return acc
        }, {}),
        averageFulfillmentHours: avgFulfillmentTime[0]?.avgHours || 0
      }
    })
  } catch (error) {
    console.error('Get pharmacy metrics error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// ========== PAYMENT OVERSIGHT ==========

export const getAllPayments = async (req, res) => {
  try {
    const {
      status,
      type,
      userId,
      startDate,
      endDate,
      limit = 20,
      offset = 0
    } = req.query

    const filter = {}

    if (status) filter.status = status
    if (type) filter.referenceType = type
    if (userId) filter.user = userId

    if (startDate || endDate) {
      filter.transactionDate = {}
      if (startDate) filter.transactionDate.$gte = new Date(startDate)
      if (endDate) filter.transactionDate.$lte = new Date(endDate)
    }

    const payments = await Payment.find(filter)
      .populate('user', 'firstName lastName email phoneNumber')
      .populate('referenceId')
      .sort({ transactionDate: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    const total = await Payment.countDocuments(filter)

    const totalAmount = await Payment.aggregate([
      { $match: { ...filter, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])

    await logAudit({
      userId: req.user.id,
      action: 'payments_list_retrieved',
      resourceType: 'Payment',
      details: {
        filters: { status, type, userId },
        recordsReturned: payments.length,
        totalRecords: total
      },
      req
    })

    return res.json({
      success: true,
      payments,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      },
      summary: {
        totalAmount: totalAmount[0]?.total || 0
      }
    })
  } catch (error) {
    console.error('Get all payments error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const reconcilePayment = async (req, res) => {
  try {
    const { id } = req.params
    const { actualAmount, notes, status } = req.body

    const payment = await Payment.findById(id)
      .populate('user', 'firstName lastName email')

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' })
    }

    const oldAmount = payment.amount
    const oldStatus = payment.status

    if (actualAmount !== undefined) payment.amount = actualAmount
    if (status) payment.status = status
    if (notes) payment.adminNotes = notes
    payment.processedBy = req.user.id

    await payment.save()

    await logAudit({
      userId: req.user.id,
      action: 'payment_reconciled',
      resourceType: 'Payment',
      resourceId: id,
      details: {
        oldAmount,
        newAmount: actualAmount,
        oldStatus,
        newStatus: status,
        notes
      },
      req
    })

    return res.json({
      success: true,
      message: 'Payment reconciled successfully',
      payment
    })
  } catch (error) {
    console.error('Reconcile payment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const unlockService = async (req, res) => {
  try {
    const { id } = req.params
    const { serviceType } = req.body

    if (!serviceType || !['lab', 'prescription'].includes(serviceType)) {
      return res.status(400).json({ message: 'Valid service type required (lab/prescription)' })
    }

    const payment = await Payment.findById(id)

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' })
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({ message: 'Payment must be completed to unlock service' })
    }

    let updatedResource
    if (serviceType === 'lab') {
      updatedResource = await LabRequest.findByIdAndUpdate(
        payment.referenceId,
        { paymentStatus: 'paid' },
        { new: true }
      )
    } else if (serviceType === 'prescription') {
      updatedResource = await Prescription.findByIdAndUpdate(
        payment.referenceId,
        { paymentStatus: 'paid' },
        { new: true }
      )
    }

    await logAudit({
      userId: req.user.id,
      action: 'service_unlocked_manually',
      resourceType: 'Payment',
      resourceId: id,
      details: {
        serviceType,
        serviceId: payment.referenceId
      },
      req
    })

    return res.json({
      success: true,
      message: `${serviceType} service unlocked successfully`,
      payment,
      updatedResource
    })
  } catch (error) {
    console.error('Unlock service error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// ========== NOTIFICATION MONITORING ==========

export const getFailedNotifications = async (req, res) => {
  try {
    const { limit = 20, offset = 0, startDate, endDate } = req.query

    const filter = { deliveryStatus: 'failed' }

    if (startDate || endDate) {
      filter.createdAt = {}
      if (startDate) filter.createdAt.$gte = new Date(startDate)
      if (endDate) filter.createdAt.$lte = new Date(endDate)
    }

    const notifications = await Notification.find(filter)
      .populate('user', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    const total = await Notification.countDocuments(filter)

    return res.json({
      success: true,
      notifications,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get failed notifications error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const retryNotification = async (req, res) => {
  try {
    const { id } = req.params

    const notification = await Notification.findById(id)

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' })
    }

    notification.deliveryStatus = 'pending'
    notification.retryCount = (notification.retryCount || 0) + 1
    await notification.save()

    await logAudit({
      userId: req.user.id,
      action: 'notification_retried',
      resourceType: 'Notification',
      resourceId: id,
      details: {
        retryCount: notification.retryCount
      },
      req
    })

    return res.json({
      success: true,
      message: 'Notification retry initiated',
      notification
    })
  } catch (error) {
    console.error('Retry notification error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// ========== WORKFLOW ANALYTICS ==========

export const getWorkflowMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    const appointmentToCompletion = await Appointment.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: 'completed'
        }
      },
      {
        $lookup: {
          from: 'sessions',
          localField: '_id',
          foreignField: 'appointment',
          as: 'session'
        }
      },
      {
        $unwind: '$session'
      },
      {
        $project: {
          timeToCompletion: {
            $divide: [
              { $subtract: ['$session.endTime', '$createdAt'] },
              1000 * 60 * 60
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgHours: { $avg: '$timeToCompletion' },
          minHours: { $min: '$timeToCompletion' },
          maxHours: { $max: '$timeToCompletion' }
        }
      }
    ])

    const labTurnaround = await LabRequest.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: { $gte: start, $lte: end }
        }
      },
      {
        $unwind: '$tests'
      },
      {
        $project: {
          category: '$tests.category',
          turnaroundTime: {
            $divide: [
              { $subtract: ['$completedAt', '$requestedAt'] },
              1000 * 60 * 60
            ]
          }
        }
      },
      {
        $group: {
          _id: '$category',
          avgHours: { $avg: '$turnaroundTime' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { avgHours: -1 }
      }
    ])

    const prescriptionTimes = await Prescription.aggregate([
      {
        $match: {
          status: 'dispensed',
          dispensedAt: { $gte: start, $lte: end }
        }
      },
      {
        $project: {
          fulfillmentTime: {
            $divide: [
              { $subtract: ['$dispensedAt', '$createdAt'] },
              1000 * 60 * 60
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgHours: { $avg: '$fulfillmentTime' },
          minHours: { $min: '$fulfillmentTime' },
          maxHours: { $max: '$fulfillmentTime' }
        }
      }
    ])

    const paymentStats = await Payment.aggregate([
      {
        $match: {
          transactionDate: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ])

    const totalPayments = paymentStats.reduce((sum, stat) => sum + stat.count, 0)
    const successfulPayments = paymentStats.find(s => s._id === 'completed')?.count || 0

    return res.json({
      success: true,
      period: { start, end },
      metrics: {
        appointmentToCompletion: appointmentToCompletion[0] || {
          avgHours: 0,
          minHours: 0,
          maxHours: 0
        },
        labTurnaround,
        prescriptionFulfillment: prescriptionTimes[0] || {
          avgHours: 0,
          minHours: 0,
          maxHours: 0
        },
        paymentSuccessRate: totalPayments > 0
          ? ((successfulPayments / totalPayments) * 100).toFixed(2)
          : 0,
        paymentBreakdown: paymentStats
      }
    })
  } catch (error) {
    console.error('Get workflow metrics error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const getBottleneckAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    const pendingAppointments = await Appointment.aggregate([
      {
        $match: {
          status: 'pending',
          createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'doctor',
          foreignField: '_id',
          as: 'doctorInfo'
        }
      },
      {
        $unwind: '$doctorInfo'
      },
      {
        $project: {
          waitTime: {
            $divide: [
              { $subtract: [new Date(), '$createdAt'] },
              1000 * 60 * 60
            ]
          },
          doctorName: {
            $concat: ['$doctorInfo.firstName', ' ', '$doctorInfo.lastName']
          },
          patientId: '$patient'
        }
      },
      {
        $sort: { waitTime: -1 }
      },
      {
        $limit: 10
      }
    ])

    const stuckLabRequests = await LabRequest.aggregate([
      {
        $match: {
          status: { $in: ['pending', 'processing'] },
          requestedAt: { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) }
        }
      },
      {
        $project: {
          waitTime: {
            $divide: [
              { $subtract: [new Date(), '$requestedAt'] },
              1000 * 60 * 60
            ]
          },
          requestNumber: 1,
          priority: 1,
          status: 1,
          tests: { $size: '$tests' }
        }
      },
      {
        $sort: { waitTime: -1 }
      },
      {
        $limit: 10
      }
    ])

    const stuckPrescriptions = await Prescription.aggregate([
      {
        $match: {
          status: { $nin: ['dispensed', 'completed', 'cancelled'] },
          createdAt: { $lt: new Date(Date.now() - 72 * 60 * 60 * 1000) }
        }
      },
      {
        $project: {
          waitTime: {
            $divide: [
              { $subtract: [new Date(), '$createdAt'] },
              1000 * 60 * 60
            ]
          },
          prescriptionNumber: 1,
          status: 1,
          medications: { $size: '$medications' }
        }
      },
      {
        $sort: { waitTime: -1 }
      },
      {
        $limit: 10
      }
    ])

    const doctorWorkload = await Appointment.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $in: ['pending', 'approved', 'in_progress'] }
        }
      },
      {
        $group: {
          _id: '$doctor',
          activeAppointments: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'doctorInfo'
        }
      },
      {
        $unwind: '$doctorInfo'
      },
      {
        $project: {
          doctorName: {
            $concat: ['$doctorInfo.firstName', ' ', '$doctorInfo.lastName']
          },
          activeAppointments: 1
        }
      },
      {
        $sort: { activeAppointments: -1 }
      },
      {
        $limit: 10
      }
    ])

    const labPersonnelWorkload = await LabRequest.aggregate([
      {
        $match: {
          status: { $in: ['assigned', 'processing'] },
          assignedTo: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$assignedTo',
          activeRequests: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'personnelInfo'
        }
      },
      {
        $unwind: '$personnelInfo'
      },
      {
        $project: {
          personnelName: {
            $concat: ['$personnelInfo.firstName', ' ', '$personnelInfo.lastName']
          },
          activeRequests: 1
        }
      },
      {
        $sort: { activeRequests: -1 }
      }
    ])

    return res.json({
      success: true,
      period: { start, end },
      bottlenecks: {
        pendingAppointments: {
          count: pendingAppointments.length,
          items: pendingAppointments
        },
        stuckLabRequests: {
          count: stuckLabRequests.length,
          items: stuckLabRequests
        },
        stuckPrescriptions: {
          count: stuckPrescriptions.length,
          items: stuckPrescriptions
        }
      },
      workload: {
        doctors: doctorWorkload,
        labPersonnel: labPersonnelWorkload
      }
    })
  } catch (error) {
    console.error('Get bottleneck analysis error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// ========== SYSTEM SETTINGS ==========

export const getSystemSettings = async (req, res) => {
  try {
    const settings = await Setting.find()

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

    await logAudit({
      userId: req.user.id,
      action: 'system_setting_updated',
      resourceType: 'Setting',
      resourceId: setting._id,
      details: {
        key,
        value,
        category
      },
      req
    })

    return res.json({
      message: 'Setting updated successfully',
      setting
    })
  } catch (error) {
    console.error('Update system settings error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// ========== AUDIT LOGS ==========

export const getAuditLogs = async (req, res) => {
  try {
    const {
      userId,
      action,
      resourceType,
      startDate,
      endDate,
      status,
      limit = 50,
      offset = 0
    } = req.query

    const filter = {}

    if (userId) filter.user = userId
    if (action) filter.action = action
    if (resourceType) filter.resourceType = resourceType
    if (status) filter.status = status

    if (startDate || endDate) {
      filter.timestamp = {}
      if (startDate) filter.timestamp.$gte = new Date(startDate)
      if (endDate) filter.timestamp.$lte = new Date(endDate)
    }

    const logs = await AuditLog.find(filter)
      .populate('user', 'firstName lastName email role')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    const total = await AuditLog.countDocuments(filter)

    return res.json({
      success: true,
      logs,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get audit logs error:', error)
    return res.status(500).json({ message: error.message })
  }
}

export const getAuditLogById = async (req, res) => {
  try {
    const { id } = req.params

    const log = await AuditLog.findById(id)
      .populate('user', 'firstName lastName email role phoneNumber')

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found'
      })
    }

    return res.json({
      success: true,
      data: log
    })
  } catch (error) {
    console.error('Get audit log error:', error)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

export const getAuditStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    const totalLogs = await AuditLog.countDocuments({
      timestamp: { $gte: start, $lte: end }
    })

    const successfulActions = await AuditLog.countDocuments({
      timestamp: { $gte: start, $lte: end },
      status: 'success'
    })

    const failedActions = await AuditLog.countDocuments({
      timestamp: { $gte: start, $lte: end },
      status: 'failure'
    })

    const topActions = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ])

    const topUsers = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$user',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $unwind: '$userInfo'
      },
      {
        $project: {
          userName: {
            $concat: ['$userInfo.firstName', ' ', '$userInfo.lastName']
          },
          userEmail: '$userInfo.email',
          count: 1
        }
      }
    ])

    const dailyTrend = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ])

    const resourceBreakdown = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$resourceType',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ])

    return res.json({
      success: true,
      period: { start, end },
      summary: {
        total: totalLogs,
        successful: successfulActions,
        failed: failedActions,
        successRate: totalLogs > 0
          ? ((successfulActions / totalLogs) * 100).toFixed(2)
          : 0
      },
      topActions,
      topUsers,
      dailyTrend,
      resourceBreakdown
    })
  } catch (error) {
    console.error('Get audit stats error:', error)
    return res.status(500).json({ message: error.message })
  }
}
