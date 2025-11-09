<<<<<<< Updated upstream
/* eslint-disable no-unused-vars */
// controllers/appointmentController.js
import Appointment from '../models/Appointment.js'
import User from '../models/User.js'
import Doctor from '../models/Doctor.js'
import Patient from '../models/Patient.js'
import Notification from '../models/Notification.js'
import MedicalRecord from '../models/MedicalRecord.js'
import { sendAppointmentConfirmation, sendAppointmentCancellation } from '../utils/sendEmail.js'
import { parseTimeOnDate, generateTimeSlots } from '../utils/availability.js'
import AvailabilityRule from '../models/AvailabilityRule.js'
import AvailabilityException from '../models/AvailabilityException.js'

// @desc    Create appointment (Patient)
// @route   POST /api/appointments
// @access  Private (Patient)
export const createAppointment = async (req, res) => {
  try {
    const { doctorId, start, end, reason, type, notes } = req.body

    // Validate required fields
    if (!doctorId || !start || !end || !reason) {
      return res.status(400).json({
        message: 'Please provide doctorId, start, end, and reason'
      })
    }

    // Validate reason length (10-500 characters)
    if (reason.length < 10 || reason.length > 500) {
      return res.status(400).json({
        message: 'Reason must be between 10 and 500 characters'
      })
    }

    // Validate type if provided
    const validTypes = ['consultation', 'follow-up', 'checkup', 'emergency', 'routine']
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        message: 'Invalid appointment type'
      })
    }

    // ✅ DEBUG LOGGING
    console.log('🔍 CREATE APPOINTMENT DEBUG:')
    console.log('User:', req.user)
    console.log('Doctor ID:', doctorId)

    // Validate doctor
    const doctorUser = await User.findById(doctorId)
    if (!doctorUser || doctorUser.role !== 'doctor') {
      return res.status(400).json({ message: 'Invalid doctor ID' })
    }

    const doctorProfile = await Doctor.findOne({ userId: doctorId })
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found' })
    }

    if (doctorProfile.status !== 'active') {
      return res.status(400).json({
        message: 'Doctor is currently not accepting appointments'
      })
    }

    // ✅ IMPROVED: Check patient profile, create if doesn't exist
    let patientProfile = await Patient.findOne({ userId: req.user.id })

    console.log('🔍 Patient profile lookup:', {
      userId: req.user.id,
      found: !!patientProfile
    })

    if (!patientProfile) {
      console.log('⚡ Patient profile not found, creating...')
      // Get user details for better profile
      const userDetails = await User.findById(req.user.id)

      // Auto-create patient profile
      patientProfile = await Patient.create({
        userId: req.user.id,
        emergencyContact: userDetails.phoneNumber || '',
        bloodType: '',
        allergies: [],
        medicalHistory: []
      })

      console.log('✅ Patient profile auto-created:', patientProfile._id)

      // Optionally notify admins about auto-created profile
      await Notification.create({
        user: req.user.id,
        type: 'info',
        title: 'Profile Created',
        message: 'Your patient profile has been automatically set up. You can update it in your profile settings.',
        read: false
      }).catch(err => console.error('Notification error:', err))
    }

    // Parse and validate dates
    const startDate = new Date(start)
    const endDate = new Date(end)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' })
    }

    if (startDate >= endDate) {
      return res.status(400).json({ message: 'End time must be after start time' })
    }

    if (startDate < new Date()) {
      return res.status(400).json({ message: 'Cannot book appointments in the past' })
    }

    // Get date components in UTC
    const dateISO = startDate.toISOString().slice(0, 10)
    const weekday = startDate.getUTCDay()
    const timeStr = `${String(startDate.getUTCHours()).padStart(2, '0')}:${String(startDate.getUTCMinutes()).padStart(2, '0')}`

    console.log('📅 Booking request:', { dateISO, weekday, timeStr, start, end })

    // Check for exceptions (blocks)
    const exception = await AvailabilityException.findOne({
      doctor: doctorId,
      date: dateISO,
      isAvailable: false
    })

    if (exception) {
      return res.status(400).json({
        message: 'Doctor is not available on this date due to a scheduled exception.'
      })
    }

    // Check for recurring availability rules
    const availabilityRule = await AvailabilityRule.findOne({
      doctor: doctorId,
      weekday: weekday
    })

    if (!availabilityRule) {
      return res.status(400).json({
        message: `Doctor has not configured availability for ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday]}s. Please choose another date.`
      })
    }

    // Generate allowed slots
    const allowedSlots = generateTimeSlots(
      dateISO,
      availabilityRule.startTime,
      availabilityRule.endTime,
      availabilityRule.slotDurationMinutes || 30
    )

    console.log('🎰 Generated slots:', allowedSlots.length)

    // Find matching slot
    const TOLERANCE_MS = 1000
    const matchingSlot = allowedSlots.find(slot => {
      const startDiff = Math.abs(slot.start.getTime() - startDate.getTime())
      const endDiff = Math.abs(slot.end.getTime() - endDate.getTime())
      return startDiff < TOLERANCE_MS && endDiff < TOLERANCE_MS
    })

    if (!matchingSlot) {
      console.log('❌ No matching slot found')
      return res.status(400).json({
        message: 'Requested time slot does not match available appointment times. Please select from the available slots shown.',
        availableSlots: allowedSlots.slice(0, 5).map(s => s.label)
      })
    }

    // Check for conflicts
    const conflict = await Appointment.findOne({
      doctor: doctorId,
      status: { $nin: ['cancelled', 'no-show'] },
      $or: [
        {
          start: { $lt: endDate },
          end: { $gt: startDate }
        }
      ]
    })

    if (conflict) {
      return res.status(400).json({
        message: 'This time slot is already booked. Please choose another time.'
      })
    }

    // Calculate duration
    const duration = Math.round((endDate - startDate) / (1000 * 60))

    // Create appointment
    const appointment = await Appointment.create({
      patient: req.user.id,
      doctor: doctorId,
      start: startDate,
      end: endDate,
      duration,
      reason,
      type: type || 'consultation',
      notes: notes || '',
      status: 'pending'
    })

    // Populate for response
    await appointment.populate([
      { path: 'patient', select: 'firstName lastName email phoneNumber' },
      { path: 'doctor', select: 'firstName lastName email phoneNumber' }
    ])

    // Get full user details
    const patientUser = await User.findById(req.user.id)

    // Create notifications
    await Notification.create({
      user: req.user.id,
      type: 'appointment',
      title: 'Appointment Booked',
      message: `Your appointment with Dr. ${doctorUser.firstName} ${doctorUser.lastName} has been booked for ${startDate.toLocaleString()}.`,
      data: { appointmentId: appointment._id },
      read: false
    })

    await Notification.create({
      user: doctorId,
      type: 'appointment',
      title: 'New Appointment Request',
      message: `${patientUser.firstName} ${patientUser.lastName} has requested an appointment for ${startDate.toLocaleString()}.`,
      data: { appointmentId: appointment._id },
      read: false
    })

    // Send confirmation email
    sendAppointmentConfirmation({
      patientEmail: patientUser.email,
      patientName: `${patientUser.firstName} ${patientUser.lastName}`,
      doctorName: `Dr. ${doctorUser.firstName} ${doctorUser.lastName}`,
      date: startDate.toLocaleDateString(),
      time: startDate.toLocaleTimeString()
    }).catch(err => console.error('Email send error:', err))

    console.log('✅ Appointment created successfully:', appointment._id)

    return res.status(201).json({
      message: 'Appointment created successfully',
      appointment
    })
  } catch (error) {
    console.error('❌ Create appointment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get appointments (Role-based)
// @route   GET /api/appointments
// @access  Private
export const getAppointments = async (req, res) => {
  try {
    const { status, startDate, endDate, doctorId, patientId, limit = 10, offset = 0 } = req.query

    // Build query based on user role
    let query = {}

    if (req.user.role === 'patient') {
      query.patient = req.user.id
    } else if (req.user.role === 'doctor') {
      query.doctor = req.user.id
    }
    // Admin can see all appointments (no filter by default)

    // Apply additional filters
    if (status) {
      query.status = status
    }

    if (doctorId && req.user.role === 'admin') {
      query.doctor = doctorId
    }

    if (patientId && req.user.role === 'admin') {
      query.patient = patientId
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
        path: 'patient',
        select: 'firstName lastName email phoneNumber'
      })
      .populate({
        path: 'doctor',
        select: 'firstName lastName email phoneNumber'
      })
      .populate({
        path: 'doctorProfile', // ✅ Populate the virtual field
        select: 'specialization status'
      })
      .sort({ start: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    // Get total count
    const total = await Appointment.countDocuments(query)

    // ✅ Transform appointments to include specialization at doctor level
    const transformedAppointments = appointments.map(apt => {
      const aptObj = apt.toObject()

      // Add specialization directly to doctor object for easier frontend access
      if (aptObj.doctorProfile?.specialization) {
        aptObj.doctor.specialization = aptObj.doctorProfile.specialization
      }

      // Remove the virtual field from response to keep it clean
      delete aptObj.doctorProfile

      return aptObj
    })

    return res.json({
      appointments: transformedAppointments,
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

// @desc    Get appointment by ID
// @route   GET /api/appointments/:id
// @access  Private
export const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params

    const appointment = await Appointment.findById(id)
      .populate({
        path: 'patient',
        select: 'firstName lastName phoneNumber email' // User fields
      })
      .populate({
        path: 'doctor',
        select: 'firstName lastName specialization phoneNumber email'
      })

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    // Authorization check
    const isPatient = req.user.id === appointment.patient._id.toString()
    const isDoctor = req.user.id === appointment.doctor._id.toString()
    const isAdmin = req.user.role === 'admin'

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({
        message: 'Not authorized to view this appointment'
      })
    }

    // ✅ FIX: Fetch patient profile to get dateOfBirth
    const patientProfile = await Patient.findOne({
      userId: appointment.patient._id
    }).select('dateOfBirth bloodType allergies emergencyContact')

    // Add patient profile data to the patient object
    const appointmentData = appointment.toObject()
    if (patientProfile) {
      appointmentData.patient.dateOfBirth = patientProfile.dateOfBirth
      appointmentData.patient.bloodType = patientProfile.bloodType
      appointmentData.patient.emergencyContact = patientProfile.emergencyContact
    }

    // Get associated medical record if exists
    const medicalRecord = await MedicalRecord.findOne({
      appointment: id
    }).select('diagnosis prescription notes')

    return res.json({
      appointment: appointmentData,
      medicalRecord: medicalRecord || null
    })
  } catch (error) {
    console.error('Get appointment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Update appointment status (Doctor/Admin)
// @route   PUT /api/appointments/:id/status
// @access  Private (Doctor, Admin)
export const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status, notes } = req.body

    if (!status) {
      return res.status(400).json({ message: 'Status is required' })
    }

    const validStatuses = ['pending', 'approved', 'completed', 'cancelled', 'no-show']
=======
import Appointment from '../models/Appointment.js'
import User from '../models/User.js'
import AvailabilityRule from '../models/AvailabilityRule.js'
import AvailabilityException from '../models/AvailabilityException.js'
import { generateTimeSlots, parseTimeOnDate } from '../utils/availability.js'
import sendEmail from '../utils/sendEmail.js'
import { format } from 'date-fns'

// @desc    Get all appointments for logged-in doctor
// @route   GET /api/v1/appointments/doctor
// @access  Doctor
export const getDoctorAppointments = async (req, res) => {
  try {
    // Ensure only doctors can access this route
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Access denied: Doctors only' })
    }

    const appointments = await Appointment.find({ doctor: req.user._id })
      .populate('patient', 'firstName lastName email phoneNumber')
      .sort({ appointmentDate: 1 })

    res.json(appointments)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Get all appointments for logged-in patient
// @route   GET /api/v1/appointments/patient
// @access  Patient
export const getPatientAppointments = async (req, res) => {
  try {
    // Ensure only patients can access this route
    if (req.user.role !== 'patient') {
      return res.status(403).json({ message: 'Access denied: Patients only' })
    }

    const appointments = await Appointment.find({ patient: req.user._id })
      .populate('doctor', 'firstName lastName email specialization')
      .sort({ appointmentDate: 1 })

    res.json(appointments)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

/**
 * @desc    Get all appointments (Admin only)
 * @route   GET /api/v1/appointments
 * @access  Admin
 */
export const getAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('patient', 'firstName lastName email phoneNumber')
      .populate('doctor', 'firstName lastName email specialization')

    res.json(appointments)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

/**
 * @desc    Update appointment status (Admin or Doctor)
 * @route   PUT /api/v1/appointments/:id/status
 * @access  Admin/Doctor
 */
export const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'rescheduled']
>>>>>>> Stashed changes
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' })
    }

    const appointment = await Appointment.findById(id)
<<<<<<< Updated upstream
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName email')
=======
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    // Only admin or the assigned doctor can update status
    if (
      req.user.role !== 'admin' &&
      req.user._id.toString() !== appointment.doctor.toString()
    ) {
      return res.status(403).json({ message: 'Access denied' })
    }

    appointment.status = status
    await appointment.save()

    res.json({
      message: 'Appointment status updated successfully',
      appointment,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

/**
 * @desc    Delete appointment (Admin only)
 * @route   DELETE /api/v1/appointments/:id
 * @access  Admin
 */
export const deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params
    const appointment = await Appointment.findById(id)
>>>>>>> Stashed changes

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

<<<<<<< Updated upstream
    // Authorization: doctor can only update their own appointments
    if (req.user.role === 'doctor' && appointment.doctor._id.toString() !== req.user.id) {
      return res.status(403).json({
        message: 'Not authorized to update this appointment'
      })
    }

    // Update appointment
    appointment.status = status
    if (notes) {
      appointment.notes = notes
    }
    await appointment.save()

    // Get user details
    const patientUser = await User.findById(appointment.patient._id)
    const doctorUser = await User.findById(appointment.doctor._id)

    // Create notification for patient
    let notificationMessage = ''
    if (status === 'approved') {
      notificationMessage = `Your appointment with Dr. ${doctorUser.firstName} ${doctorUser.lastName} has been confirmed for ${appointment.start.toLocaleString()}.`
    } else if (status === 'completed') {
      notificationMessage = `Your appointment with Dr. ${doctorUser.firstName} ${doctorUser.lastName} has been completed.`
    } else if (status === 'cancelled') {
      notificationMessage = `Your appointment with Dr. ${doctorUser.firstName} ${doctorUser.lastName} has been cancelled.`
    }

    if (notificationMessage) {
      await Notification.create({
        user: appointment.patient._id,
        type: status === 'cancelled' ? 'cancellation' : 'appointment',
        title: `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: notificationMessage,
        data: { appointmentId: appointment._id },
        read: false
      })
    }

    // Send email notification
    if (patientUser && patientUser.email) {
      const emailSubject = 'Appointment Status Updated - MediBook'
      const emailHtml = `
        <h3>Hello ${patientUser.firstName},</h3>
        <p>Your appointment with Dr. ${doctorUser.lastName} on ${appointment.start.toLocaleDateString()} at ${appointment.start.toLocaleTimeString()} has been updated.</p>
        <p><strong>Status:</strong> ${status.toUpperCase()}</p>
        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
      `

      sendAppointmentConfirmation({
        patientEmail: patientUser.email,
        patientName: `${patientUser.firstName} ${patientUser.lastName}`,
        doctorName: `Dr. ${doctorUser.firstName} ${doctorUser.lastName}`,
        date: appointment.start.toLocaleDateString(),
        time: appointment.start.toLocaleTimeString()
      }).catch(err => console.error('Email send error:', err))
    }

    return res.json({
      message: 'Appointment status updated successfully',
      appointment
    })
  } catch (error) {
    console.error('Update appointment status error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Reschedule appointment
// @route   PUT /api/appointments/:id/reschedule
// @access  Private (Patient, Doctor, Admin)
=======
    // Only admin can delete
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admins only' })
    }

    await appointment.deleteOne()
    res.json({ message: 'Appointment deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const createAppointment = async (req, res) => {
  try {
    const { doctor: doctorId, start /* ISO string */, end /* ISO string */, reason } = req.body

    if (!doctorId || !start || !end) return res.status(400).json({ message: 'doctor, start and end are required' })

    const doctor = await User.findById(doctorId)
    if (!doctor || doctor.role !== 'doctor') return res.status(400).json({ message: 'Invalid doctor' })

    const startDate = new Date(start)
    const endDate = new Date(end)

    if (startDate >= endDate) return res.status(400).json({ message: 'Invalid start/end times' })

    // 1) Check that slot is within doctor's availability:
    const dateISO = startDate.toISOString().slice(0,10) // YYYY-MM-DD
    // check exception first
    const exception = await AvailabilityException.findOne({ doctor: doctorId, date: dateISO })
    let allowedSlots = []
    if (exception) {
      if (!exception.isAvailable) return res.status(400).json({ message: 'Doctor not available on this date' })
      if (exception.slots && exception.slots.length) {
        allowedSlots = exception.slots.map(s => ({
          start: parseTimeOnDate(dateISO, s.startTime),
          end: parseTimeOnDate(dateISO, s.endTime)
        }))
      }
    }

    // if no exception override, build from rules
    if (allowedSlots.length === 0) {
      const weekday = startDate.getDay()
      const rules = await AvailabilityRule.find({ doctor: doctorId, weekday })
      for (const rule of rules) {
        const slots = generateTimeSlots(dateISO, rule.startTime, rule.endTime, rule.slotDurationMinutes)
        // push each with start/end Date
        allowedSlots = allowedSlots.concat(slots.map(s => ({ start: s.start, end: s.end })))
      }
    }

    // check if requested start/end falls exactly into one of allowedSlots (or is fully contained)
    const isWithinAny = allowedSlots.some(slot => slot.start <= startDate && endDate <= slot.end)
    if (!isWithinAny) return res.status(400).json({ message: 'Requested slot is not within doctor availability' })

    // 2) Check overlapping appointments
    const overlapping = await Appointment.findOne({
      doctor: doctorId,
      $or: [
        { start: { $lt: endDate, $gte: startDate } },
        { end: { $gt: startDate, $lte: endDate } },
        { start: { $lte: startDate }, end: { $gte: endDate } } // existing spans requested
      ]
    })
    if (overlapping) return res.status(400).json({ message: 'Requested slot overlaps an existing appointment' })

    // 3) Create the appointment
    const appointment = await Appointment.create({
      patient: req.user._id,
      doctor: doctorId,
      start: startDate,
      end: endDate,
      reason,
      status: 'pending'
    })

    // Notify doctor (email)
    await sendEmail(
      doctor.email,
      'New Appointment Request',
      `<p>New appointment requested on ${dateISO} at ${startDate.toISOString()}</p>`
    )

    res.status(201).json({ message: 'Appointment created', appointment })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// 🔁 Reschedule an appointment
>>>>>>> Stashed changes
export const rescheduleAppointment = async (req, res) => {
  try {
    const { id } = req.params
    const { newStart, newEnd, reason } = req.body

    if (!newStart || !newEnd) {
<<<<<<< Updated upstream
      return res.status(400).json({
        message: 'New start and end times are required'
      })
=======
      return res.status(400).json({ message: 'New start and end times are required' })
>>>>>>> Stashed changes
    }

    const appointment = await Appointment.findById(id)
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName email')

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

<<<<<<< Updated upstream
    // Check if appointment can be rescheduled
    if (['completed', 'cancelled'].includes(appointment.status)) {
      return res.status(400).json({
        message: `Cannot reschedule ${appointment.status} appointments`
      })
    }

    // Authorization check
    const isPatient = req.user.id === appointment.patient._id.toString()
    const isDoctor = req.user.id === appointment.doctor._id.toString()
    const isAdmin = req.user.role === 'admin'

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({
        message: 'Not authorized to reschedule this appointment'
      })
    }

    // Validate new dates
    const newStartDate = new Date(newStart)
    const newEndDate = new Date(newEnd)

    if (isNaN(newStartDate.getTime()) || isNaN(newEndDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' })
    }

    if (newStartDate >= newEndDate) {
      return res.status(400).json({ message: 'End time must be after start time' })
    }

    if (newStartDate < new Date()) {
      return res.status(400).json({ message: 'Cannot reschedule to a past date' })
    }

    // Check for conflicts at new time (exclude current appointment)
    const conflict = await Appointment.findOne({
      _id: { $ne: id },
      doctor: appointment.doctor._id,
      status: { $nin: ['cancelled', 'no-show'] },
      $or: [
        {
          start: { $lt: newEndDate },
          end: { $gt: newStartDate }
        }
      ]
    })

    if (conflict) {
      return res.status(400).json({
        message: 'The new time slot is already booked'
      })
    }

    // Validate against doctor availability
    const dateISO = newStartDate.toISOString().slice(0, 10)
    const weekday = newStartDate.getUTCDay()
    const timeStr = `${String(newStartDate.getUTCHours()).padStart(2, '0')}:${String(newStartDate.getUTCMinutes()).padStart(2, '0')}`

    // Check for exceptions first
    const exception = await AvailabilityException.findOne({
      doctor: appointment.doctor._id,
      date: dateISO,
      isAvailable: false
    })

    if (exception) {
      return res.status(400).json({
        message: 'Doctor is not available on the new date due to a scheduled exception'
      })
    }

    // Check for recurring availability
    const availabilityRule = await AvailabilityRule.findOne({
      doctor: appointment.doctor._id,
      weekday: weekday
    })

    if (!availabilityRule) {
      return res.status(400).json({
        message: `Doctor has not configured availability for ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday]}s. Please choose another date.`
      })
    }

    // Validate the new time falls within the rule's hours
    const allowedSlots = generateTimeSlots(
      dateISO,
      availabilityRule.startTime,
      availabilityRule.endTime,
      availabilityRule.slotDurationMinutes || 30
    )

    const TOLERANCE_MS = 1000
    const matchingSlot = allowedSlots.find(slot => {
      const startDiff = Math.abs(slot.start.getTime() - newStartDate.getTime())
      const endDiff = Math.abs(slot.end.getTime() - newEndDate.getTime())
      return startDiff < TOLERANCE_MS && endDiff < TOLERANCE_MS
    })

    if (!matchingSlot) {
      return res.status(400).json({
        message: 'The new time does not match available appointment slots. Please select a valid time slot.',
        availableSlots: allowedSlots.slice(0, 5).map(s => s.label) // Show first 5 as examples
      })
    }

    // Update appointment
    const oldStart = appointment.start
    const oldEnd = appointment.end

    appointment.start = newStartDate
    appointment.end = newEndDate
    appointment.duration = Math.round((newEndDate - newStartDate) / (1000 * 60))
    appointment.status = 'pending' // Require reapproval

    await appointment.save()

    // Get user details
    const patientUser = await User.findById(appointment.patient._id)
    const doctorUser = await User.findById(appointment.doctor._id)

    // Create notifications
    await Notification.create({
      user: appointment.patient._id,
      type: 'rescheduled',
      title: 'Appointment Rescheduled',
      message: `Your appointment has been rescheduled to ${newStartDate.toLocaleString()}.`,
      data: { appointmentId: appointment._id },
      read: false
    })

    await Notification.create({
      user: appointment.doctor._id,
      type: 'rescheduled',
      title: 'Appointment Rescheduled',
      message: `${patientUser.firstName} ${patientUser.lastName} has rescheduled their appointment to ${newStartDate.toLocaleString()}.`,
      data: { appointmentId: appointment._id },
      read: false
    })

    return res.json({
=======
    // Authorization check: patient or doctor must own the appointment
    if (
      req.user.role !== 'admin' &&
      req.user._id.toString() !== appointment.patient._id.toString() &&
      req.user._id.toString() !== appointment.doctor._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to reschedule this appointment' })
    }

    const newStartDate = new Date(newStart)
    const newEndDate = new Date(newEnd)

    if (newStartDate >= newEndDate) {
      return res.status(400).json({ message: 'Invalid start/end times' })
    }

    // Check overlapping appointments
    const overlapping = await Appointment.findOne({
      doctor: appointment.doctor._id,
      _id: { $ne: appointment._id }, // exclude current appointment
      $or: [
        { start: { $lt: newEndDate, $gte: newStartDate } },
        { end: { $gt: newStartDate, $lte: newEndDate } },
        { start: { $lte: newStartDate }, end: { $gte: newEndDate } }
      ]
    })

    if (overlapping) {
      return res.status(400).json({ message: 'Requested slot overlaps another appointment' })
    }

    // 2️⃣ Log reschedule history
    appointment.rescheduleHistory.push({
      previousStart: appointment.start,
      previousEnd: appointment.end,
      newStart: newStartDate,
      newEnd: newEndDate,
      changedBy: req.user._id,
      reason
    })

    // 3️⃣ Update appointment details
    appointment.start = newStartDate
    appointment.end = newEndDate
    appointment.status = 'pending' // require reapproval if needed
    await appointment.save()

    // 4️⃣ Email notifications
    const newDateStr = format(newStartDate, 'PPP')
    const newTimeStr = format(newStartDate, 'p')

    // Notify doctor
    await sendEmail(
      appointment.doctor.email,
      'Appointment Rescheduled',
      `
        <p>Hello Dr. ${appointment.doctor.lastName},</p>
        <p>The appointment with <strong>${appointment.patient.firstName} ${appointment.patient.lastName}</strong> has been rescheduled.</p>
        <p><strong>New Time:</strong> ${newDateStr} at ${newTimeStr}</p>
        <p>Reason: ${reason || 'N/A'}</p>
      `
    )

    // Notify patient
    await sendEmail(
      appointment.patient.email,
      'Appointment Rescheduled',
      `
        <p>Dear ${appointment.patient.firstName},</p>
        <p>Your appointment with Dr. ${appointment.doctor.lastName} has been rescheduled.</p>
        <p><strong>New Time:</strong> ${newDateStr} at ${newTimeStr}</p>
        <p>Reason: ${reason || 'N/A'}</p>
      `
    )

    res.json({
>>>>>>> Stashed changes
      message: 'Appointment rescheduled successfully',
      appointment
    })
  } catch (error) {
<<<<<<< Updated upstream
    console.error('Reschedule appointment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Delete appointment (Admin only)
// @route   DELETE /api/appointments/:id
// @access  Private (Admin)
export const deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params

    const appointment = await Appointment.findById(id)

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    await appointment.deleteOne()

    return res.json({ message: 'Appointment deleted successfully' })
  } catch (error) {
    console.error('Delete appointment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Check for appointment conflicts
// @route   POST /api/appointments/check-conflicts
// @access  Private
export const checkConflicts = async (req, res) => {
  try {
    const { doctorId, start, end, excludeAppointmentId } = req.body

    if (!doctorId || !start || !end) {
      return res.status(400).json({
        message: 'Please provide doctorId, start, and end'
      })
    }

    const proposedStart = new Date(start)
    const proposedEnd = new Date(end)

    if (isNaN(proposedStart.getTime()) || isNaN(proposedEnd.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' })
    }

    // Build query
    const query = {
      doctor: doctorId,
      status: { $nin: ['cancelled', 'no-show'] },
      $or: [
        {
          start: { $lt: proposedEnd },
          end: { $gt: proposedStart }
        }
      ]
    }

    // Exclude specific appointment if provided (for rescheduling)
    if (excludeAppointmentId) {
      query._id = { $ne: excludeAppointmentId }
    }

    const conflict = await Appointment.findOne(query)

    return res.json({
      hasConflict: !!conflict,
      conflict: conflict ? {
        id: conflict._id,
        start: conflict.start,
        end: conflict.end,
        status: conflict.status
      } : null
    })
  } catch (error) {
    console.error('Check conflicts error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get appointments by doctor
// @route   GET /api/appointments/doctor/:doctorId
// @access  Private (Doctor, Admin)
export const getAppointmentsByDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params
    const { status, startDate, endDate } = req.query

    // Authorization: doctor can only view their own appointments
    if (req.user.role === 'doctor' && req.user.id !== doctorId) {
      return res.status(403).json({
        message: 'Not authorized to view these appointments'
      })
    }

    const query = { doctor: doctorId }

    if (status) {
      query.status = status
    }

    if (startDate || endDate) {
      query.start = {}
      if (startDate) query.start.$gte = new Date(startDate)
      if (endDate) query.start.$lte = new Date(endDate)
    }

    const appointments = await Appointment.find(query)
      .populate({
        path: 'patient',
        select: 'firstName lastName phoneNumber email'
      })
      .sort({ start: 1 })

    return res.json(appointments)
  } catch (error) {
    console.error('Get appointments by doctor error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get appointments by patient
// @route   GET /api/appointments/patient/:patientId
// @access  Private (Patient, Admin)
export const getAppointmentsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params
    const { status, startDate, endDate } = req.query

    // Authorization: patient can only view their own appointments
    if (req.user.role === 'patient' && req.user.id !== patientId) {
      return res.status(403).json({
        message: 'Not authorized to view these appointments'
      })
    }

    const query = { patient: patientId }

    if (status) {
      query.status = status
    }

    if (startDate || endDate) {
      query.start = {}
      if (startDate) query.start.$gte = new Date(startDate)
      if (endDate) query.start.$lte = new Date(endDate)
    }

    const appointments = await Appointment.find(query)
      .populate({
        path: 'doctor',
        select: 'firstName lastName specialization phoneNumber email',
        populate: {
          path: 'userId',
          select: 'firstName lastName'
        }
      })
      .sort({ start: -1 })

    return res.json(appointments)
  } catch (error) {
    console.error('Get appointments by patient error:', error)
    return res.status(500).json({ message: error.message })
  }
}
=======
    console.error('❌ Reschedule error:', error)
    res.status(500).json({ message: error.message })
  }
}
>>>>>>> Stashed changes
