/* eslint-disable no-unused-vars */
// controllers/appointmentController.js
import mongoose from 'mongoose'
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
import Session from '../models/Session.js'
import logAudit from '../utils/auditLogger.js'

const FOLLOW_UP_REMINDER_KIND = 'follow_up_required'

const buildFollowUpReminderMessage = (appointment) => {
  if (!appointment.followUpDate) {
    return 'Your doctor recommended a follow-up appointment. Please book it when you can.'
  }

  return `Your doctor recommended a follow-up appointment by ${new Date(appointment.followUpDate).toLocaleDateString()}.`
}

const upsertFollowUpReminder = async (appointment) => {
  if (!appointment?.patient || !appointment?.isFollowUpRequired) {
    return null
  }

  return await Notification.findOneAndUpdate(
    {
      user: appointment.patient,
      type: 'reminder',
      relatedId: appointment._id,
      relatedModel: 'Appointment',
      status: 'active',
      'metadata.reminderKind': FOLLOW_UP_REMINDER_KIND
    },
    {
      $set: {
        status: 'active',
        title: 'Follow-Up Appointment Required',
        message: buildFollowUpReminderMessage(appointment),
        priority: 'high',
        read: false,
        readAt: null,
        metadata: {
          reminderKind: FOLLOW_UP_REMINDER_KIND,
          appointmentId: appointment._id,
          followUpDate: appointment.followUpDate,
          followUpReason: appointment.followUpReason || '',
          followUpNotes: appointment.followUpNotes || ''
        }
      },
      $setOnInsert: {
        user: appointment.patient,
        type: 'reminder',
        relatedId: appointment._id,
        relatedModel: 'Appointment'
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  )
}

const resolveFollowUpReminders = async ({ appointmentId, userId }) => {
  const filter = {
    type: 'reminder',
    relatedId: appointmentId,
    relatedModel: 'Appointment',
    'metadata.reminderKind': FOLLOW_UP_REMINDER_KIND
  }

  if (userId) {
    filter.user = userId
  }

  return await Notification.resolveActive(filter)
}

// @desc    Create appointment (Patient)
// @route   POST /api/appointments
// @access  Private (Patient)
export const createAppointment = async (req, res) => {
  try {
    const {
      doctorId,
      start,
      end,
      reason,
      type,
      notes,
      followUpOf,
      status: clientStatus
    } = req.body

    // ✅ FIX BUG #3: Explicitly reject if client tries to set status
    if (clientStatus !== undefined) {
      return res.status(400).json({
        message: 'Cannot manually set appointment status. Appointment status is managed by the backend.'
      })
    }

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

    if (followUpOf !== undefined && !mongoose.Types.ObjectId.isValid(followUpOf)) {
      return res.status(400).json({
        message: 'Invalid followUpOf reference'
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

    let originalFollowUpAppointment = null
    if (followUpOf) {
      originalFollowUpAppointment = await Appointment.findById(followUpOf)

      if (!originalFollowUpAppointment) {
        return res.status(404).json({ message: 'Original follow-up appointment not found' })
      }

      if (originalFollowUpAppointment.patient.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: 'Not authorized to book a follow-up for this appointment' })
      }
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

    // ✅ Add maximum booking window (3 months in advance)
    const maxBookingDate = new Date()
    maxBookingDate.setMonth(maxBookingDate.getMonth() + 3)

    if (startDate > maxBookingDate) {
      return res.status(400).json({
        message: 'Cannot book appointments more than 3 months in advance',
        maxBookingDate: maxBookingDate.toISOString()
      })
    }

    // Get date components in UTC
    const dateISO = startDate.toISOString().slice(0, 10)
    const weekday = startDate.getUTCDay()
    const timeStr = `${String(startDate.getUTCHours()).padStart(2, '0')}:${String(startDate.getUTCMinutes()).padStart(2, '0')}`

    console.log('📅 Booking request:', { dateISO, weekday, timeStr, start, end })

    // ── Availability checks (no lock needed — these are read-only guards) ──
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

    const availabilityRule = await AvailabilityRule.findOne({
      doctor: doctorId,
      weekday: weekday
    })

    if (!availabilityRule) {
      return res.status(400).json({
        message: `Doctor has not configured availability for ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday]}s. Please choose another date.`
      })
    }

    const allowedSlots = generateTimeSlots(
      dateISO,
      availabilityRule.startTime,
      availabilityRule.endTime,
      availabilityRule.slotDurationMinutes || 30
    )

    console.log('🎰 Generated slots:', allowedSlots.length)

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

    // Calculate duration before the atomic write
    const duration = Math.round((endDate - startDate) / (1000 * 60))

    // ── Atomic guard: collapse conflict-check + insert into one DB operation ──
    //
    // findOneAndUpdate with upsert:true is a single atomic op — MongoDB
    // evaluates the filter AND performs the insert in one indivisible step,
    // so no concurrent request can slip through.
    //
    // We use new:true (return the post-op doc) and NO rawResult, because
    // rawResult's shape is inconsistent across Mongoose versions (null vs
    // object on insert) and caused Cannot read properties of null errors.
    //
    // Conflict detection logic:
    //   • If a doc already existed for this slot, $setOnInsert is a no-op and
    //     the returned doc's patient will NOT be the current user → 409.
    //   • If we did the insert, the returned doc's patient IS the current user → 201.
    //   • E11000 from the unique index is the final safety net → 409.

    let appointment
    const initialStatus = followUpOf ? 'pending_confirmation' : 'pending'
    const appointmentType = followUpOf ? 'follow-up' : (type || 'consultation')
    try {
      const resultDoc = await Appointment.findOneAndUpdate(
        {
          doctor: doctorId,
          start: startDate,
          end: endDate,
          status: { $in: ['pending', 'pending_confirmation', 'approved', 'in_progress', 'completed'] }
        },
        {
          $setOnInsert: {
            patient: req.user.id,
            doctor: doctorId,
            start: startDate,
            end: endDate,
            duration,
            reason,
            type: appointmentType,
            notes: notes || '',
            status: initialStatus,
            followUpOf: followUpOf || null,
            isFollowUpRequired: false
          }
        },
        {
          upsert: true,
          new: true,          // always returns the doc — never null
          runValidators: true
        }
      )

      // If the slot was already taken, $setOnInsert was a no-op and the
      // returned doc belongs to a different patient.
      if (resultDoc.patient.toString() !== req.user.id.toString()) {
        return res.status(409).json({
          message: 'This time slot was just booked by another patient. Please choose a different time.',
          conflict: true
        })
      }

      appointment = resultDoc

    } catch (err) {
      // ── Second-layer safety net ──────────────────────────────────────────
      // The unique index 'unique_active_time_slot' catches any race that slips
      // past the upsert (e.g. direct DB writes, future code paths, replica
      // edge cases). Translate E11000 into a clean 409 — never a raw 500.
      if (err.code === 11000) {
        return res.status(409).json({
          message: 'This time slot was just booked by another patient. Please choose a different time.',
          conflict: true
        })
      }
      throw err
    }

    try {
      if (originalFollowUpAppointment) {
        await Appointment.findOneAndUpdate(
          { _id: originalFollowUpAppointment._id, patient: req.user.id },
          { $set: { isFollowUpRequired: false } }
        )

        await resolveFollowUpReminders({
          appointmentId: originalFollowUpAppointment._id,
          userId: req.user.id
        })
      }

      // ── Audit log ──────────────────────────────────────────────────────────
      await logAudit({
        userId: req.user.id,
        action: 'appointment_created',
        resourceType: 'Appointment',
        resourceId: appointment._id,
        details: {
          doctorId,
          start: startDate,
          end: endDate,
          reason,
          type: appointmentType,
          followUpOf: followUpOf || null
        },
        req
      }).catch(err => console.error('Audit log error:', err))

      // Populate for response
      await appointment.populate([
        { path: 'patient', select: 'firstName lastName email phoneNumber' },
        { path: 'doctor', select: 'firstName lastName email phoneNumber' }
      ])

      // Get full user details
      const patientUser = await User.findById(req.user.id)

      // Create notifications (with error handling)
      await Notification.create({
        user: req.user.id,
        type: 'appointment',
        title: followUpOf ? 'Follow-Up Appointment Booked' : 'Appointment Booked',
        message: `Your appointment with Dr. ${doctorUser.firstName} ${doctorUser.lastName} has been booked for ${startDate.toLocaleString()}.`,
        data: { appointmentId: appointment._id },
        read: false
      }).catch(err => {
        console.error('❌ Failed to create patient notification:', err)
      // Don't fail the appointment creation
      })

      await Notification.create({
        user: doctorId,
        type: 'appointment',
        title: followUpOf ? 'New Follow-Up Appointment Request' : 'New Appointment Request',
        message: `${patientUser.firstName} ${patientUser.lastName} has requested an appointment for ${startDate.toLocaleString()}.`,
        data: { appointmentId: appointment._id, followUpOf: followUpOf || null },
        read: false
      }).catch(err => {
        console.error('❌ Failed to create doctor notification:', err)
      // Don't fail the appointment creation
      })

      // Send confirmation email (with better error handling)
      sendAppointmentConfirmation({
        patientEmail: patientUser.email,
        patientName: `${patientUser.firstName} ${patientUser.lastName}`,
        doctorName: `Dr. ${doctorUser.firstName} ${doctorUser.lastName}`,
        date: startDate.toLocaleDateString(),
        time: startDate.toLocaleTimeString()
      })
        .then(() => console.log('✅ Confirmation email sent to:', patientUser.email))
        .catch(err => {
          console.error('❌ Failed to send confirmation email:', err.message)
        // Email failure should not block appointment creation
        })

      console.log('✅ Appointment created successfully:', appointment._id)

      return res.status(201).json({
        message: 'Appointment created successfully',
        appointment
      })
    } catch (postWriteError) {
      // Post-write steps (notifications, email, audit) must not roll back the
      // booking — the slot is already reserved. Log and continue.
      console.error('❌ Post-booking step failed:', postWriteError)
      return res.status(201).json({
        message: 'Appointment created successfully',
        appointment
      })
    }
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
    // ✅ FIXED: Increased default limit from 10 to 1000 for dashboard
    const { status, startDate, endDate, doctorId, patientId, limit = 1000, offset = 0 } = req.query

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

    // ✅ ADDED: Comprehensive logging for debugging
    console.log('═════════════════════════════════════════════')
    console.log('🔍 GET APPOINTMENTS REQUEST')
    console.log('═════════════════════════════════════════════')
    console.log('👤 User:', {
      id: req.user.id,
      role: req.user.role,
      email: req.user.email
    })
    console.log('📊 Query:', JSON.stringify(query, null, 2))
    console.log('🔧 Pagination:', { limit: parseInt(limit), offset: parseInt(offset) })

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
      .populate({
        path: 'followUpOf',
        select: 'start end status followUpDate type'
      })
      .sort({ start: 1 })  // ✅ FIXED: Ascending order (upcoming appointments first)
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    console.log('✅ Query executed successfully')
    console.log('📋 Found appointments:', appointments.length)

    // Status breakdown
    const statusBreakdown = appointments.reduce((acc, apt) => {
      acc[apt.status] = (acc[apt.status] || 0) + 1
      return acc
    }, {})
    console.log('📊 Status breakdown:', statusBreakdown)

    // Today's appointments
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const todayCount = appointments.filter(apt => {
      const aptDate = new Date(apt.start)
      return aptDate >= today && aptDate < tomorrow
    }).length
    console.log('📅 Today\'s appointments in result:', todayCount)
    console.log('═════════════════════════════════════════════\n')

    // Get total count
    const total = await Appointment.countDocuments(query)

    let activeFollowUpRemindersByAppointmentId = new Map()
    if (req.user.role === 'patient' && appointments.length > 0) {
      const reminderDocs = await Notification.find({
        user: req.user.id,
        type: 'reminder',
        relatedModel: 'Appointment',
        relatedId: { $in: appointments.map(apt => apt._id) },
        status: 'active',
        'metadata.reminderKind': FOLLOW_UP_REMINDER_KIND
      })
        .select('_id relatedId title message createdAt priority read status metadata')
        .lean()

      activeFollowUpRemindersByAppointmentId = new Map(
        reminderDocs.map(notification => [String(notification.relatedId), notification])
      )
    }

    // ✅ Transform appointments to include specialization at doctor level
    const transformedAppointments = appointments.map(apt => {
      const aptObj = apt.toObject()

      // Add specialization directly to doctor object for easier frontend access
      if (aptObj.doctorProfile?.specialization) {
        aptObj.doctor.specialization = aptObj.doctorProfile.specialization
      }

      // Remove the virtual field from response to keep it clean
      delete aptObj.doctorProfile

      const activeReminder = activeFollowUpRemindersByAppointmentId.get(String(aptObj._id))
      if (activeReminder) {
        aptObj.activeFollowUpReminder = activeReminder
      }

      return aptObj
    })

    // ✅ LOG AUDIT: Appointments Retrieved
    await logAudit({
      userId: req.user.id,
      action: 'appointments_retrieved',
      resourceType: 'Appointment',
      details: {
        filters: { status, startDate, endDate, doctorId, patientId },
        recordsReturned: appointments.length
      },
      req
    }).catch(err => console.error('Audit log error:', err))

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
      .populate({
        path: 'followUpOf',
        select: 'start end status followUpDate type'
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

    if (req.user.role === 'patient') {
      const activeReminder = await Notification.findOne({
        user: req.user.id,
        type: 'reminder',
        relatedId: appointment._id,
        relatedModel: 'Appointment',
        status: 'active',
        'metadata.reminderKind': FOLLOW_UP_REMINDER_KIND
      })
        .select('_id title message createdAt priority read status metadata')
        .lean()

      if (activeReminder) {
        appointmentData.activeFollowUpReminder = activeReminder
      }
    }

    // ✅ LOG AUDIT: Appointment Retrieved
    await logAudit({
      userId: req.user.id,
      action: 'appointment_viewed',
      resourceType: 'Appointment',
      resourceId: id,
      details: {
        doctorId: appointment.doctor._id,
        patientId: appointment.patient._id,
        status: appointment.status
      },
      req
    }).catch(err => console.error('Audit log error:', err))

    return res.json({
      appointment: appointmentData,
      medicalRecord: medicalRecord || null
    })
  } catch (error) {
    console.error('Get appointment error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Dismiss active follow-up reminder for an appointment
// @route   PUT /api/appointments/:id/follow-up-reminder/dismiss
// @access  Private (Patient)
export const dismissFollowUpReminder = async (req, res) => {
  try {
    const { id } = req.params

    const appointment = await Appointment.findById(id)

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    if (appointment.patient.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorized to dismiss this reminder' })
    }

    await resolveFollowUpReminders({
      appointmentId: appointment._id,
      userId: req.user.id
    })

    return res.json({
      message: 'Follow-up reminder dismissed successfully'
    })
  } catch (error) {
    console.error('Dismiss follow-up reminder error:', error)
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

    const validStatuses = ['pending', 'pending_confirmation', 'approved', 'in_progress', 'completed', 'cancelled', 'no-show']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' })
    }

    const appointment = await Appointment.findById(id)
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName email')

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    // ✅ FIX BUG #4: Comprehensive authorization check
    const isDoctor = req.user.role === 'doctor'
    const isAdmin = req.user.role === 'admin'
    const isAssignedDoctor = appointment.doctor._id.toString() === req.user.id

    // Only doctors and admins can update appointment status
    if (!isDoctor && !isAdmin) {
      return res.status(403).json({
        message: 'Only doctors and administrators can update appointment status'
      })
    }

    // Doctors can only update their own appointments
    if (isDoctor && !isAssignedDoctor) {
      return res.status(403).json({
        message: 'Not authorized to update this appointment'
      })
    }

    // Doctors should not be able to set status to 'cancelled'
    // (cancellation should be done through separate endpoint by patient/admin)
    if (isDoctor && status === 'cancelled') {
      return res.status(400).json({
        message: 'Doctors cannot cancel appointments. Patients must cancel through their dashboard.'
      })
    }

    // ✅ FIX BUG #2: Validate state transitions
    const validTransitions = {
      pending: ['approved', 'cancelled'],
      pending_confirmation: ['approved', 'cancelled'],
      approved: ['in_progress', 'completed', 'cancelled', 'no-show'],
      in_progress: ['completed', 'cancelled', 'no-show'],
      completed: [],
      cancelled: [],
      'no-show': []
    }

    const currentStatus = appointment.status
    const allowedNextStates = validTransitions[currentStatus] || []

    if (!allowedNextStates.includes(status)) {
      return res.status(400).json({
        message: `Cannot transition from '${currentStatus}' to '${status}'. Valid transitions: ${allowedNextStates.length > 0 ? allowedNextStates.join(', ') : 'none (final state)'}`,
        currentStatus,
        requestedStatus: status,
        allowedTransitions: allowedNextStates
      })
    }

    // ✅ FIX BUG #1: Capture previous status BEFORE updating
    const previousStatus = appointment.status

    // Update appointment
    appointment.status = status
    if (notes) {
      appointment.notes = notes
    }
    await appointment.save()

    if (['cancelled', 'completed', 'no-show'].includes(status) || appointment.isFollowUpRequired === false) {
      await resolveFollowUpReminders({
        appointmentId: appointment._id,
        userId: appointment.patient._id
      })
    }

    // ✅ LOG AUDIT: Now with correct previous status
    await logAudit({
      userId: req.user.id,
      action: 'appointment_status_updated',
      resourceType: 'Appointment',
      resourceId: id,
      details: {
        previousStatus: previousStatus,  // ✅ Correct - captured before update
        newStatus: status,
        notes: notes || null,
        patientId: appointment.patient._id,
        doctorId: appointment.doctor._id
      },
      req
    }).catch(err => console.error('Audit log error:', err))

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
export const rescheduleAppointment = async (req, res) => {
  try {
    const { id } = req.params
    const { newStart, newEnd, reason } = req.body

    if (!newStart || !newEnd) {
      return res.status(400).json({
        message: 'New start and end times are required'
      })
    }

    const appointment = await Appointment.findById(id)
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName email')

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

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

    // ── Validate new date against doctor availability ────────────────────────
    const dateISO = newStartDate.toISOString().slice(0, 10)
    const weekday = newStartDate.getUTCDay()

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

    // ── Atomic reschedule: conflict check + save in one transaction ──────────
    // Without a transaction, a concurrent booking could pass the conflict check
    // and write before this save completes — leaving two appointments on the
    // same slot. snapshot readConcern ensures we see committed data only.
    const rescheduleSession = await mongoose.startSession()
    rescheduleSession.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    })

    let oldStart, oldEnd
    try {
      // Re-check for conflicts inside the transaction
      const conflict = await Appointment.findOne({
        _id: { $ne: id },
        doctor: appointment.doctor._id,
        status: { $nin: ['cancelled', 'no-show'] },
        start: { $lt: newEndDate },
        end: { $gt: newStartDate }
      }).session(rescheduleSession)

      if (conflict) {
        await rescheduleSession.abortTransaction()
        rescheduleSession.endSession()
        return res.status(409).json({
          message: 'The new time slot is already booked. Please choose a different time.',
          conflict: true
        })
      }

      oldStart = appointment.start
      oldEnd = appointment.end

      appointment.start = newStartDate
      appointment.end = newEndDate
      appointment.duration = Math.round((newEndDate - newStartDate) / (1000 * 60))
      appointment.status = 'pending'
      await appointment.save({ session: rescheduleSession })

      await rescheduleSession.commitTransaction()
      rescheduleSession.endSession()

    } catch (err) {
      if (rescheduleSession.inTransaction()) {
        await rescheduleSession.abortTransaction()
        rescheduleSession.endSession()
      }
      // Unique index fired — a concurrent write won the race
      if (err.code === 11000) {
        return res.status(409).json({
          message: 'The new time slot was just booked by another patient. Please choose a different time.',
          conflict: true
        })
      }
      throw err
    }

    // ✅ LOG AUDIT: Appointment Rescheduled
    await logAudit({
      userId: req.user.id,
      action: 'appointment_rescheduled',
      resourceType: 'Appointment',
      resourceId: id,
      details: {
        oldStart,
        oldEnd,
        newStart: newStartDate,
        newEnd: newEndDate,
        reason: reason || null,
        patientId: appointment.patient._id,
        doctorId: appointment.doctor._id
      },
      req
    }).catch(err => console.error('Audit log error:', err))

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
      message: 'Appointment rescheduled successfully',
      appointment
    })
  } catch (error) {
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

    // ✅ LOG AUDIT: Appointment Deleted
    await logAudit({
      userId: req.user.id,
      action: 'appointment_deleted',
      resourceType: 'Appointment',
      resourceId: id,
      details: {
        doctorId: appointment.doctor,
        patientId: appointment.patient,
        status: appointment.status,
        start: appointment.start,
        end: appointment.end
      },
      req
    }).catch(err => console.error('Audit log error:', err))

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

    // ✅ LOG AUDIT: Conflict Check Performed
    await logAudit({
      userId: req.user.id,
      action: 'appointment_conflict_checked',
      resourceType: 'Appointment',
      details: {
        doctorId,
        start: proposedStart,
        end: proposedEnd,
        conflictFound: !!conflict
      },
      req
    }).catch(err => console.error('Audit log error:', err))

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

    // ✅ LOG AUDIT: Doctor's Appointments Retrieved
    await logAudit({
      userId: req.user.id,
      action: 'doctor_appointments_retrieved',
      resourceType: 'Appointment',
      details: {
        doctorId,
        filters: { status, startDate, endDate },
        recordsReturned: appointments.length
      },
      req
    }).catch(err => console.error('Audit log error:', err))

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

    // ✅ LOG AUDIT: Patient's Appointments Retrieved
    await logAudit({
      userId: req.user.id,
      action: 'patient_appointments_retrieved',
      resourceType: 'Appointment',
      details: {
        patientId,
        filters: { status, startDate, endDate },
        recordsReturned: appointments.length
      },
      req
    }).catch(err => console.error('Audit log error:', err))

    return res.json(appointments)
  } catch (error) {
    console.error('Get appointments by patient error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Start appointment session (idempotent)
// @route   POST /api/appointments/:id/start-session
// @access  Private (Doctor only)
export const startAppointmentSession = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { id: appointmentId } = req.params

    const appointment = await Appointment.findById(appointmentId)
      .populate('patient', 'firstName lastName email')
      .populate('doctor',  'firstName lastName email')

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' })
    }

    // ── Time-window validation ─────────────────────────────────────────────
    const now          = new Date()
    const earlyWindow  = 60 * 60 * 1000  // allow start up to 1 h early
    const gracePeriod  = 30 * 60 * 1000  // allow start up to 30 min after end

    if (now < new Date(appointment.start.getTime() - earlyWindow)) {
      return res.status(400).json({
        success: false,
        message: `Appointment starts at ${appointment.start.toLocaleString()}. You can open it up to 1 hour early.`
      })
    }

    if (now > new Date(appointment.end.getTime() + gracePeriod)) {
      return res.status(400).json({
        success: false,
        message: 'This appointment has passed. Cannot start a session for a past appointment.'
      })
    }

    // ── Ownership check ────────────────────────────────────────────────────
    if (appointment.doctor._id.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to start this session.' })
    }

    // ── Status guard ───────────────────────────────────────────────────────
    // 'in_progress' is allowed here so a doctor can click "Resume" after a
    // browser refresh without getting blocked.
    if (!['approved', 'in_progress'].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: `Appointment status is '${appointment.status}'. Only approved appointments can be started.`
      })
    }

    // ── IDEMPOTENT SESSION CHECK ───────────────────────────────────────────
    //
    // Root cause of the reported bug:
    //   1. Session.create()  — succeeded, document persisted in MongoDB.
    //   2. appointment.save() — threw ValidationError because 'in_progress'
    //      was missing from the Appointment.status enum (fixed in Appointment.js).
    //   3. On standalone Mongo the abortTransaction() does NOT roll back the
    //      Session, so an orphaned Session survives in the DB.
    //   4. Doctor retried → old code returned 400 "Session already exists".
    //
    // Fix: if a session already exists for this appointment, return it with
    // HTTP 200 so the doctor lands on the consultation page cleanly.
    // A COMPLETED session is explicitly blocked from reopening.
    const existingSession = await Session.findOne({ appointment: appointmentId })
      .populate('patient',      'firstName lastName email phoneNumber')
      .populate('doctor',       'firstName lastName specialization')
      .populate('appointment')
      .populate('labRequests')
      .populate('prescriptions')
      .populate('medicalRecord')

    if (existingSession) {
      if (existingSession.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'This session has already been completed and cannot be reopened.'
        })
      }

      console.log(`↩️  Resuming session ${existingSession._id} for appointment ${appointmentId}`)
      return res.status(200).json({
        success: true,
        message: 'Resuming existing session',
        data: { session: existingSession, appointment }
      })
    }

    // ── Create new session atomically with appointment status update ───────
    const mongoSession = await mongoose.startSession()
    mongoSession.startTransaction()

    let session
    try {
      const [created] = await Session.create(
        [{
          appointment: appointmentId,
          patient:     appointment.patient._id,
          doctor:      doctorId,
          status:      'in_progress',
          startTime:   new Date()
        }],
        { session: mongoSession }
      )
      session = created

      // 'in_progress' is now valid in Appointment.status enum (see Appointment.js fix)
      appointment.status = 'in_progress'
      await appointment.save({ session: mongoSession })

      await mongoSession.commitTransaction()
    } catch (txErr) {
      await mongoSession.abortTransaction()
      throw txErr
    } finally {
      mongoSession.endSession()
    }

    await session.populate([
      { path: 'patient',  select: 'firstName lastName email phoneNumber' },
      { path: 'doctor',   select: 'firstName lastName specialization' },
      { path: 'appointment' }
    ])

    // Notify patient
    await Notification.create({
      user:    appointment.patient._id,
      type:    'session_started',
      title:   'Session Started',
      message: `Your appointment with Dr. ${appointment.doctor.lastName} has started.`,
      data:    { sessionId: session._id, appointmentId },
      read:    false
    }).catch(err => console.error('Notification error:', err))

    return res.status(201).json({
      success: true,
      message: 'Session started successfully',
      data:    { session, appointment }
    })
  } catch (error) {
    console.error('Start session error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}
