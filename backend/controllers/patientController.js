// controllers/patientController.js
import User from '../models/User.js'
import Patient from '../models/Patient.js'
import Doctor from '../models/Doctor.js'
import Appointment from '../models/Appointment.js'
import MedicalRecord from '../models/MedicalRecord.js'
import Notification from '../models/Notification.js'
import Prescription from '../models/Prescription.js'
import Bill from '../models/Bill.js'
import Availability from '../models/Availability.js'
import { sendAppointmentConfirmation, sendAppointmentCancellation } from '../utils/sendEmail.js'
import logAudit from '../utils/auditLogger.js'

// @desc    Get patient profile
// @route   GET /api/patients/:id
// @access  Private (Patient or Admin)
export const getProfile = async (req, res) => {
  try {
    const { id } = req.params

    // Check authorization (user can only view their own profile unless admin)
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Not authorized to view this profile'
      })
    }

    // Get user info
    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (user.role !== 'patient') {
      return res.status(400).json({ message: 'User is not a patient' })
    }

    // Get patient profile
    const patientProfile = await Patient.findOne({ userId: id })
    if (!patientProfile) {
      return res.status(404).json({ message: 'Patient profile not found' })
    }

    return res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      profile: {
        dateOfBirth: patientProfile.dateOfBirth,
        address: patientProfile.address,
        emergencyContact: patientProfile.emergencyContact,
        medicalHistory: patientProfile.medicalHistory,
        allergies: patientProfile.allergies,
        bloodType: patientProfile.bloodType,
        insurance: patientProfile.insurance,
      }
    })
  } catch (error) {
    console.error('Get profile error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Update patient profile
// @route   PUT /api/patients/:id
// @access  Private (Patient or Admin)
export const updateProfile = async (req, res) => {
  try {
    const { id } = req.params

    // Check authorization
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Not authorized to update this profile'
      })
    }

    const {
      firstName,
      lastName,
      phoneNumber,
      email,
      dateOfBirth,
      address,
      emergencyContact,
      allergies,
      bloodType,
      insurance
    } = req.body

    // Update user info
    const userUpdateData = {}
    if (firstName) userUpdateData.firstName = firstName
    if (lastName) userUpdateData.lastName = lastName
    if (phoneNumber) userUpdateData.phoneNumber = phoneNumber
    if (email) userUpdateData.email = email

    const updatedUser = await User.findByIdAndUpdate(
      id,
      userUpdateData,
      { new: true, runValidators: true }
    )

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Update patient profile
    const patientUpdateData = {}
    if (dateOfBirth) patientUpdateData.dateOfBirth = dateOfBirth
    if (address) patientUpdateData.address = address
    if (emergencyContact) patientUpdateData.emergencyContact = emergencyContact
    if (allergies) patientUpdateData.allergies = allergies
    if (bloodType) patientUpdateData.bloodType = bloodType
    if (insurance) patientUpdateData.insurance = insurance

    const updatedPatient = await Patient.findOneAndUpdate(
      { userId: id },
      patientUpdateData,
      { new: true, runValidators: true }
    )

    await logAudit({
      userId: id,
      action: 'PROFILE_UPDATED',
      resourceType: 'Patient',
      resourceId: id,
      details: {
        updatedFields: Object.keys(req.body),
        updatedBy: req.user._id
      },
      req,
      status: 'success'
    })

    return res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
      },
      profile: updatedPatient
    })
  } catch (error) {
    console.error('Update profile error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get patient statistics
// @route   GET /api/patients/:id/stats
// @access  Private (Patient or Admin)
export const getStats = async (req, res) => {
  try {
    const { id } = req.params

    // Check authorization
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Not authorized to view these statistics'
      })
    }

    const now = new Date()

    const [
      totalAppointments,
      upcomingAppointments,
      completedAppointments,
      cancelledAppointments,
      medicalRecordsCount,
      activePrescriptions,
      pendingPayments,
      unreadNotifications
    ] = await Promise.all([
      Appointment.countDocuments({ patient: id }),
      Appointment.find({
        patient: id,
        status: { $in: ['pending', 'approved'] },
        start: { $gte: now }
      }).sort({ start: 1 }),
      Appointment.countDocuments({
        patient: id,
        status: 'completed'
      }),
      Appointment.countDocuments({
        patient: id,
        status: 'cancelled'
      }),
      MedicalRecord.countDocuments({ patient: id }),
      Prescription.countDocuments({
        patient: id,
        status: { $in: ['new', 'pending_pharmacy', 'ready_for_pickup'] }
      }),
      Bill.countDocuments({
        patient: id,
        status: { $in: ['pending', 'partially_paid'] }
      }),
      Notification.countDocuments({
        user: id,
        read: false
      })
    ])

    // Next appointment
    const nextAppointment = upcomingAppointments[0] || null
    const nextAppointmentDays = nextAppointment
      ? Math.max(0, Math.ceil((new Date(nextAppointment.start) - now) / 86400000))
      : 0

    if (nextAppointment) {
      await nextAppointment.populate([
        { path: 'doctor', select: 'firstName lastName specialization' },
        { path: 'doctor', populate: { path: 'userId', select: 'firstName lastName' } }
      ])
    }

    return res.json({
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      upcomingCount: upcomingAppointments.length,
      nextAppointmentDays,
      medicalRecordsCount,
      activePrescriptions,
      pendingPayments,
      unreadNotifications,
      nextAppointment: nextAppointment ? {
        id: nextAppointment._id,
        date: nextAppointment.start,
        doctor: nextAppointment.doctor,
        reason: nextAppointment.reason,
        status: nextAppointment.status
      } : null
    })
  } catch (error) {
    console.error('Get stats error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get patient appointments
// @route   GET /api/patients/:id/appointments
// @access  Private (Patient or Admin)
export const getAppointments = async (req, res) => {
  try {
    const { id } = req.params
    const { status, limit = 10, offset = 0, startDate, endDate } = req.query

    // Check authorization
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Not authorized to view these appointments'
      })
    }

    // Build query
    const query = { patient: id }

    if (status && status !== 'all') {
      if (status === 'upcoming') {
        query.status = { $in: ['pending', 'approved'] }
        query.start = { $gte: new Date() }
      } else if (status === 'past') {
        query.start = { $lt: new Date() }
      } else {
        query.status = status
      }
    }

    // Date range filter
    if (startDate || endDate) {
      query.start = {}
      if (startDate) query.start.$gte = new Date(startDate)
      if (endDate) query.start.$lte = new Date(endDate)
    }

    // Get appointments with pagination
    const appointments = await Appointment.find(query)
      .populate({
        path: 'doctor',
        select: 'firstName lastName specialization phoneNumber',
        populate: {
          path: 'userId',
          select: 'firstName lastName phoneNumber'
        }
      })
      .sort({ start: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    // Get total count for pagination
    const total = await Appointment.countDocuments(query)

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
    console.error('Get appointments error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Book new appointment
// @route   POST /api/patients/:id/appointments
// @access  Private (Patient)
export const bookAppointment = async (req, res) => {
  try {
    const { id } = req.params
    const { doctorId, start, end, reason, type, notes } = req.body

    // Check authorization
    if (req.user._id.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to book appointments for this patient'
      })
    }

    // Validate required fields
    if (!doctorId || !start || !end || !reason) {
      return res.status(400).json({
        message: 'Please provide doctorId, start, end, and reason'
      })
    }

    // Validate doctor exists
    const doctor = await Doctor.findOne({ userId: doctorId })
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' })
    }

    const doctorUser = await User.findById(doctorId)
    if (!doctorUser || doctorUser.role !== 'doctor') {
      return res.status(400).json({ message: 'Invalid doctor ID' })
    }

    // Check doctor status
    if (doctor.status !== 'active') {
      return res.status(400).json({
        message: 'Doctor is currently not accepting appointments'
      })
    }

    const appointmentStart = new Date(start)
    const appointmentEnd = new Date(end)
    const now = new Date()

    // Validate appointment is in the future
    if (appointmentStart < now) {
      return res.status(400).json({
        message: 'Cannot book appointments in the past'
      })
    }

    // Validate end time is after start time
    if (appointmentEnd <= appointmentStart) {
      return res.status(400).json({
        message: 'End time must be after start time'
      })
    }

    // Check for appointment conflicts
    const conflict = await Appointment.findOne({
      doctor: doctorId,
      status: { $nin: ['cancelled', 'no-show'] },
      $or: [
        {
          start: { $lt: appointmentEnd },
          end: { $gt: appointmentStart }
        }
      ]
    })

    if (conflict) {
      return res.status(400).json({
        message: 'This time slot is not available. Please choose another time.'
      })
    }

    // Check doctor availability
    const dayOfWeek = appointmentStart.getDay()
    const timeString = appointmentStart.toTimeString().slice(0, 5) // HH:MM format

    const availability = await Availability.findOne({
      doctor: doctorId,
      $or: [
        // Recurring availability
        {
          isRecurring: true,
          weekday: dayOfWeek,
          startTime: { $lte: timeString },
          endTime: { $gte: timeString },
          isAvailable: true
        },
        // Specific date availability
        {
          isRecurring: false,
          date: {
            $gte: new Date(appointmentStart.setHours(0, 0, 0, 0)),
            $lt: new Date(appointmentStart.setHours(23, 59, 59, 999))
          },
          startTime: { $lte: timeString },
          endTime: { $gte: timeString },
          isAvailable: true
        }
      ]
    })

    if (!availability) {
      return res.status(400).json({
        message: 'Doctor is not available at this time. Please check availability.'
      })
    }

    // Calculate duration in minutes
    const duration = Math.round((appointmentEnd - appointmentStart) / (1000 * 60))

    // Create appointment
    const appointment = await Appointment.create({
      patient: id,
      doctor: doctorId,
      start: appointmentStart,
      end: appointmentEnd,
      duration,
      reason,
      type: type || 'consultation',
      notes: notes || '',
      status: 'pending'
    })

    // Populate appointment data for response
    await appointment.populate([
      { path: 'patient', select: 'firstName lastName phoneNumber' },
      { path: 'doctor', select: 'firstName lastName specialization' }
    ])

    // Create notifications
    const patientUser = await User.findById(id)

    // Notification for patient
    await Notification.create({
      user: id,
      type: 'appointment',
      title: 'Appointment Booked',
      message: `Your appointment with Dr. ${doctorUser.firstName} ${doctorUser.lastName} has been booked for ${appointmentStart.toLocaleString()}.`,
      data: { appointmentId: appointment._id },
      read: false
    })

    // Notification for doctor
    await Notification.create({
      user: doctorId,
      type: 'appointment',
      title: 'New Appointment Request',
      message: `${patientUser.firstName} ${patientUser.lastName} has requested an appointment for ${appointmentStart.toLocaleString()}.`,
      data: { appointmentId: appointment._id },
      read: false
    })

    // Send confirmation email to patient
    sendAppointmentConfirmation({
      patientEmail: patientUser.email,
      patientName: `${patientUser.firstName} ${patientUser.lastName}`,
      doctorName: `Dr. ${doctorUser.firstName} ${doctorUser.lastName}`,
      date: appointmentStart.toLocaleDateString(),
      time: appointmentStart.toLocaleTimeString()
    }).catch(err => console.error('Email send error:', err))

    await logAudit({
      userId: id,
      action: 'APPOINTMENT_BOOKED',
      resourceType: 'Appointment',
      resourceId: appointment._id,
      details: {
        doctorId: doctorId,
        appointmentDate: appointmentStart,
        reason: reason,
        type: type,
        duration: duration
      },
      req,
      status: 'success'
    })

    return res.status(201).json({
      message: 'Appointment booked successfully',
      appointment
    })
  } catch (error) {
    console.error('Book appointment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Reschedule appointment
// @route   PUT /api/patients/:id/appointments/:appointmentId
// @access  Private (Patient)
export const rescheduleAppointment = async (req, res) => {
  try {
    const { id, appointmentId } = req.params
    const { start, end } = req.body

    // Check authorization
    if (req.user._id.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to reschedule this appointment'
      })
    }

    if (!start || !end) {
      return res.status(400).json({
        message: 'Please provide new start and end times'
      })
    }

    // Find appointment
    const appointment = await Appointment.findById(appointmentId)
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    // Verify appointment belongs to patient
    if (appointment.patient.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to reschedule this appointment'
      })
    }

    // Check if appointment can be rescheduled
    if (appointment.status === 'completed') {
      return res.status(400).json({
        message: 'Cannot reschedule completed appointments'
      })
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({
        message: 'Cannot reschedule cancelled appointments'
      })
    }

    const newStart = new Date(start)
    const newEnd = new Date(end)
    const now = new Date()

    // Validate new time is in the future
    if (newStart < now) {
      return res.status(400).json({
        message: 'Cannot reschedule to a time in the past'
      })
    }

    // Check for conflicts with the new time
    const conflict = await Appointment.findOne({
      _id: { $ne: appointmentId }, // Exclude current appointment
      doctor: appointment.doctor,
      status: { $nin: ['cancelled', 'no-show'] },
      $or: [
        {
          start: { $lt: newEnd },
          end: { $gt: newStart }
        }
      ]
    })

    if (conflict) {
      return res.status(400).json({
        message: 'The new time slot is not available'
      })
    }

    // Calculate new duration
    const duration = Math.round((newEnd - newStart) / (1000 * 60))

    // Update appointment
    appointment.start = newStart
    appointment.end = newEnd
    appointment.duration = duration
    await appointment.save()

    // Populate for response
    await appointment.populate([
      { path: 'patient', select: 'firstName lastName' },
      { path: 'doctor', select: 'firstName lastName' }
    ])

    // Get user details
    const patientUser = await User.findById(id)

    // Create notifications
    await Notification.create({
      user: id,
      type: 'rescheduled',
      title: 'Appointment Rescheduled',
      message: `Your appointment has been rescheduled to ${newStart.toLocaleString()}.`,
      data: { appointmentId: appointment._id },
      read: false
    })

    await Notification.create({
      user: appointment.doctor,
      type: 'rescheduled',
      title: 'Appointment Rescheduled',
      message: `${patientUser.firstName} ${patientUser.lastName} has rescheduled their appointment to ${newStart.toLocaleString()}.`,
      data: { appointmentId: appointment._id },
      read: false
    })

    return res.json({
      message: 'Appointment rescheduled successfully',
      appointment
    })
  } catch (error) {
    console.error('Reschedule appointment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Cancel appointment
// @route   DELETE /api/patients/:id/appointments/:appointmentId
// @access  Private (Patient)
export const cancelAppointment = async (req, res) => {
  try {
    const { id, appointmentId } = req.params
    const { reason } = req.body

    // Check authorization
    if (req.user._id.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to cancel this appointment'
      })
    }

    // Find appointment
    const appointment = await Appointment.findById(appointmentId)
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    // Verify appointment belongs to patient
    if (appointment.patient.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to cancel this appointment'
      })
    }

    // Check if appointment can be cancelled
    if (appointment.status === 'completed') {
      return res.status(400).json({
        message: 'Cannot cancel completed appointments'
      })
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({
        message: 'Appointment is already cancelled'
      })
    }

    // Update appointment status
    appointment.status = 'cancelled'
    appointment.cancelledBy = id
    appointment.cancelledAt = new Date()
    appointment.cancellationReason = reason || 'Cancelled by patient'
    await appointment.save()

    // Get user details
    const patientUser = await User.findById(id)
    const doctorUser = await User.findById(appointment.doctor)

    // Create notifications
    await Notification.create({
      user: id,
      type: 'cancellation',
      title: 'Appointment Cancelled',
      message: 'Your appointment has been cancelled successfully.',
      data: { appointmentId: appointment._id },
      read: false
    })

    await Notification.create({
      user: appointment.doctor,
      type: 'cancellation',
      title: 'Appointment Cancelled',
      message: `${patientUser.firstName} ${patientUser.lastName} has cancelled their appointment scheduled for ${appointment.start.toLocaleString()}.`,
      data: { appointmentId: appointment._id },
      read: false
    })

    // Send cancellation email
    sendAppointmentCancellation({
      patientEmail: patientUser.email,
      patientName: `${patientUser.firstName} ${patientUser.lastName}`,
      doctorName: `Dr. ${doctorUser.firstName} ${doctorUser.lastName}`,
      date: appointment.start.toLocaleDateString(),
      time: appointment.start.toLocaleTimeString(),
      reason: reason || 'No reason provided'
    }).catch(err => console.error('Email send error:', err))

    await logAudit({
      userId: id,
      action: 'APPOINTMENT_CANCELLED',
      resourceType: 'Appointment',
      resourceId: appointmentId,
      details: {
        doctorId: appointment.doctor,
        appointmentDate: appointment.start,
        cancellationReason: reason,
        cancelledBy: 'patient'
      },
      req,
      status: 'success'
    })

    return res.json({
      message: 'Appointment cancelled successfully',
      appointment
    })
  } catch (error) {
    console.error('Cancel appointment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get patient medical records
// @route   GET /api/patients/:id/medical-records
// @access  Private (Patient or Admin)
export const getMedicalRecords = async (req, res) => {
  try {
    const { id } = req.params
    const { limit = 10, offset = 0 } = req.query

    // Check authorization
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Not authorized to view these medical records'
      })
    }

    // Get medical records
    const records = await MedicalRecord.find({ patient: id })
      .populate({
        path: 'doctor',
        select: 'firstName lastName specialization'
      })
      .populate({
        path: 'appointment',
        select: 'start end type status'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    // Get total count
    const total = await MedicalRecord.countDocuments({ patient: id })

    return res.json({
      records,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get medical records error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get specific medical record
// @route   GET /api/patients/:id/medical-records/:recordId
// @access  Private (Patient or Admin)
export const getMedicalRecordById = async (req, res) => {
  try {
    const { id, recordId } = req.params

    // Check authorization
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Not authorized to view this medical record'
      })
    }

    const record = await MedicalRecord.findById(recordId)
      .populate({
        path: 'doctor',
        select: 'firstName lastName specialization',
        populate: { path: 'userId', select: 'firstName lastName phoneNumber email' }
      })
      .populate({
        path: 'appointment',
        select: 'start end type status reason'
      })

    if (!record) {
      return res.status(404).json({ message: 'Medical record not found' })
    }

    // Verify record belongs to patient
    if (record.patient.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to view this medical record'
      })
    }

    return res.json(record)
  } catch (error) {
    console.error('Get medical record error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get patient notifications
// @route   GET /api/patients/:id/notifications
// @access  Private (Patient)
export const getNotifications = async (req, res) => {
  try {
    const { id } = req.params
    const { read, limit = 20, offset = 0 } = req.query

    // Check authorization
    if (req.user._id.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to view these notifications'
      })
    }

    // Build query
    const query = { user: id }
    if (read !== undefined) {
      query.read = read === 'true'
    }

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ sentAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    // Get total count
    const total = await Notification.countDocuments(query)
    const unreadCount = await Notification.countDocuments({ user: id, read: false })

    return res.json({
      notifications,
      unreadCount,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get notifications error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Mark notification as read
// @route   PUT /api/patients/:id/notifications/:notificationId/read
// @access  Private (Patient)
export const markNotificationRead = async (req, res) => {
  try {
    const { id, notificationId } = req.params

    // Check authorization
    if (req.user._id.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to update this notification'
      })
    }

    const notification = await Notification.findById(notificationId)

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' })
    }

    // Verify notification belongs to user
    if (notification.user.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to update this notification'
      })
    }

    notification.read = true
    notification.readAt = new Date()
    await notification.save()

    return res.json({
      message: 'Notification marked as read',
      notification
    })
  } catch (error) {
    console.error('Mark notification read error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get unread notifications count
// @route   GET /api/patients/:id/notifications/unread-count
// @access  Private (Patient)
export const getUnreadCount = async (req, res) => {
  try {
    const { id } = req.params

    // Check authorization
    if (req.user._id.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to view this information'
      })
    }

    const unreadCount = await Notification.countDocuments({
      user: id,
      read: false
    })

    return res.json({ unreadCount })
  } catch (error) {
    console.error('Get unread count error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Mark all notifications as read
// @route   PUT /api/patients/:id/notifications/mark-all-read
// @access  Private (Patient)
export const markAllNotificationsRead = async (req, res) => {
  try {
    const { id } = req.params

    // Check authorization
    if (req.user._id.toString() !== id) {
      return res.status(403).json({
        message: 'Not authorized to update these notifications'
      })
    }

    await Notification.updateMany(
      { user: id, read: false },
      { read: true, readAt: new Date() }
    )

    return res.json({
      message: 'All notifications marked as read'
    })
  } catch (error) {
    console.error('Mark all read error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get all doctors
// @route   GET /api/v1/patient/doctor/all
// @access  Public
export const getAllDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .populate('userId', 'firstName lastName email phoneNumber') // Populate user details
      .populate('clinic', 'name location') // Populate clinic details
      .select('-__v') // Exclude the `__v` field

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors
    })
  } catch (error) {
    console.error('❌ Error in getAllDoctors:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}
