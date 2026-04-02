import mongoose from 'mongoose'
import User from '../models/User.js'
import Doctor from '../models/Doctor.js'
import Appointment from '../models/Appointment.js'
import MedicalRecord from '../models/MedicalRecord.js'
import Patient from '../models/Patient.js'
import Notification from '../models/Notification.js'
import Clinic from '../models/Clinic.js'
import Availability from '../models/Availability.js'
import AvailabilityRule from '../models/AvailabilityRule.js'
import logAudit from '../utils/auditLogger.js'

const FOLLOW_UP_REMINDER_KIND = 'follow_up_required'

const syncAppointmentFollowUpState = async ({
  appointmentId,
  patientId,
  followUpRequired,
  followUpDate,
  followUpReason,
  followUpNotes
}) => {
  const appointment = await Appointment.findByIdAndUpdate(
    appointmentId,
    {
      $set: {
        isFollowUpRequired: Boolean(followUpRequired),
        followUpDate: followUpRequired ? (followUpDate || null) : null,
        followUpReason: followUpRequired ? (followUpReason || '') : '',
        followUpNotes: followUpRequired ? (followUpNotes || '') : ''
      }
    },
    { new: true }
  )

  if (!appointment) {
    return null
  }

  await Notification.updateMany(
    {
      user: patientId,
      type: 'reminder',
      relatedId: appointment._id,
      relatedModel: 'Appointment',
      status: 'active',
      'metadata.reminderKind': FOLLOW_UP_REMINDER_KIND
    },
    {
      status: 'resolved',
      resolvedAt: new Date()
    }
  )

  if (followUpRequired) {
    await Notification.findOneAndUpdate(
      {
        user: patientId,
        type: 'reminder',
        relatedId: appointment._id,
        relatedModel: 'Appointment',
        status: 'active',
        'metadata.reminderKind': FOLLOW_UP_REMINDER_KIND
      },
      {
        $set: {
          title: 'Follow-Up Appointment Required',
          message: followUpDate
            ? `Your doctor recommended a follow-up appointment by ${new Date(followUpDate).toLocaleDateString()}.`
            : 'Your doctor recommended a follow-up appointment. Please book it when you can.',
          priority: 'high',
          read: false,
          readAt: null,
          status: 'active',
          metadata: {
            reminderKind: FOLLOW_UP_REMINDER_KIND,
            appointmentId,
            followUpDate: followUpDate || null,
            followUpReason: followUpReason || '',
            followUpNotes: followUpNotes || ''
          }
        },
        $setOnInsert: {
          user: patientId,
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

  return appointment
}

// @desc    Get doctor profile
// @route   GET /api/doctor/profile
// @access  Private (Doctor only)
export const getProfile = async (req, res) => {
  try {
    const doctorId = req.user.id

    const user = await User.findById(doctorId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    const doctor = await Doctor.findOne({ userId: doctorId }).populate('clinic')
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' })
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        doctor
      }
    })
  } catch (error) {
    console.error('❌ Error in getProfile:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Update doctor profile
// @route   PUT /api/doctor/profile
// @access  Private (Doctor only)
export const updateProfile = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { firstName, lastName, phoneNumber, specialization, bio, qualifications, experience, consultationFee, languages, certifications, clinicId } = req.body

    // Validate clinic if provided
    if (clinicId) {
      if (!mongoose.Types.ObjectId.isValid(clinicId)) {
        return res.status(400).json({ success: false, message: 'Invalid clinic ID' })
      }

      const clinic = await Clinic.findById(clinicId)
      if (!clinic) {
        return res.status(404).json({ success: false, message: 'Clinic not found' })
      }
    }

    // Update User model
    const userUpdates = {}
    if (firstName) userUpdates.firstName = firstName
    if (lastName) userUpdates.lastName = lastName
    if (phoneNumber) userUpdates.phoneNumber = phoneNumber

    const user = await User.findByIdAndUpdate(
      doctorId,
      userUpdates,
      { new: true, runValidators: true }
    )

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    // Update Doctor model
    const doctorUpdates = {}
    if (specialization) doctorUpdates.specialization = specialization
    if (bio) doctorUpdates.bio = bio
    if (qualifications) doctorUpdates.qualifications = qualifications
    if (experience !== undefined) doctorUpdates.experience = experience
    if (consultationFee !== undefined) doctorUpdates.consultationFee = consultationFee
    if (languages) doctorUpdates.languages = languages
    if (certifications) doctorUpdates.certifications = certifications
    if (clinicId) doctorUpdates.clinic = clinicId

    const doctor = await Doctor.findOneAndUpdate(
      { userId: doctorId },
      doctorUpdates,
      { new: true, runValidators: true }
    ).populate('clinic')

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user,
        doctor
      }
    })
  } catch (error) {
    console.error('❌ Error in updateProfile:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Get doctor statistics
// @route   GET /api/doctor/stats
// @access  Private (Doctor only)
export const getStats = async (req, res) => {
  try {
    const doctorId = new mongoose.Types.ObjectId(req.user.id)
    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      todayAppointments,
      appointmentStats,
      monthPatients,
      confirmedCount,
      pendingCount,
      availabilityRules,
      doctor
    ] = await Promise.all([
      Appointment.find({
        doctor: doctorId,
        start: { $gte: today, $lt: tomorrow }
      }).sort({ start: 1 }).lean(),
      Appointment.aggregate([
        { $match: { doctor: doctorId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Appointment.distinct('patient', {
        doctor: doctorId,
        status: 'completed',
        start: { $gte: monthStart }
      }),
      Appointment.countDocuments({
        doctor: doctorId,
        status: 'approved',
        start: { $gte: now }
      }),
      Appointment.countDocuments({
        doctor: doctorId,
        status: 'pending',
        start: { $gte: now }
      }),
      AvailabilityRule.find({ doctor: doctorId }).lean(),
      Doctor.findOne({ userId: req.user.id }).select('rating totalReviews').lean()
    ])

    const stats = {
      total: 0,
      pending: 0,
      approved: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0
    }

    appointmentStats.forEach(stat => {
      stats.total += stat.count
      if (stat._id === 'pending') stats.pending = stat.count
      if (stat._id === 'approved') stats.approved = stat.count
      if (stat._id === 'completed') stats.completed = stat.count
      if (stat._id === 'cancelled') stats.cancelled = stat.count
      if (stat._id === 'no-show') stats.noShow = stat.count
    })

    const totalAvailabilityMinutes = availabilityRules.reduce((sum, rule) => {
      if (!rule.startTime || !rule.endTime) return sum

      const [startHour, startMinute] = rule.startTime.split(':').map(Number)
      const [endHour, endMinute] = rule.endTime.split(':').map(Number)
      const duration = (endHour * 60 + endMinute) - (startHour * 60 + startMinute)

      return sum + Math.max(0, duration)
    }, 0)

    const availabilityPercent = Math.min(
      100,
      Math.round((totalAvailabilityMinutes / 2400) * 100)
    )

    res.status(200).json({
      success: true,
      data: {
        todayCount: todayAppointments.length,
        nextAppointmentTime: todayAppointments[0]?.start ?? null,
        totalPatients: monthPatients.length,
        confirmedCount,
        pendingCount,
        availabilityPercent,
        appointments: stats,
        rating: doctor?.rating || 0,
        totalReviews: doctor?.totalReviews || 0
      }
    })
  } catch (error) {
    console.error('❌ Error in getStats:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Get doctor appointments
// @route   GET /api/doctor/appointments
// @access  Private (Doctor only)
export const getAppointments = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { status, startDate, endDate } = req.query

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
        populate: {
          path: 'userId',
          select: 'firstName lastName phoneNumber'
        }
      })
      .sort({ start: 1 })

    res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments
    })
  } catch (error) {
    console.error('❌ Error in getAppointments:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Update appointment status
// @route   PUT /api/doctor/appointments/:appointmentId/status
// @access  Private (Doctor only)
export const updateAppointmentStatus = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { appointmentId } = req.params
    const { status, notes } = req.body

    // Validate appointmentId
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment ID' })
    }

    // Validate status
    const validStatuses = ['pending', 'approved', 'cancelled', 'completed', 'no-show']
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' })
    }

    const appointment = await Appointment.findById(appointmentId)
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' })
    }

    // Verify doctor owns this appointment
    if (appointment.doctor.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this appointment' })
    }

    // ✅ Doctors should not be able to cancel appointments
    if (status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Doctors cannot cancel appointments. Patients must cancel through their dashboard.'
      })
    }

    // ✅ Validate state transitions
    const validTransitions = {
      pending: ['approved', 'cancelled'],
      approved: ['completed', 'cancelled', 'no-show'],
      completed: [],
      cancelled: [],
      'no-show': []
    }

    const currentStatus = appointment.status
    const allowedNextStates = validTransitions[currentStatus] || []

    if (status && !allowedNextStates.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from '${currentStatus}' to '${status}'. Valid transitions: ${allowedNextStates.length > 0 ? allowedNextStates.join(', ') : 'none (final state)'}`,
        currentStatus,
        requestedStatus: status,
        allowedTransitions: allowedNextStates
      })
    }

    // Capture previous status for audit
    const previousStatus = appointment.status

    // Update appointment
    const updates = {}
    if (status) updates.status = status
    if (notes) updates.notes = notes

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      updates,
      { new: true, runValidators: true }
    ).populate('patient', 'firstName lastName')

    // Create notification for patient
    await Notification.create({
      user: appointment.patient,
      type: status === 'cancelled' ? 'cancellation' : 'appointment',
      title: `Appointment ${status}`,
      message: `Your appointment has been ${status} by the doctor.${notes ? ` Note: ${notes}` : ''}`,
      data: { appointmentId: appointment._id }
    })

    // Create medical record if completed
    if (status === 'completed') {
      const existingRecord = await MedicalRecord.findOne({ appointment: appointmentId })
      if (!existingRecord) {
        await MedicalRecord.create({
          appointment: appointmentId,
          patient: appointment.patient,
          doctor: doctorId,
          diagnosis: 'Pending diagnosis',
          notes: notes || 'Appointment completed'
        })
      }
    }

    await logAudit({
      userId: doctorId,
      action: 'APPOINTMENT_STATUS_UPDATED',
      resourceType: 'Appointment',
      resourceId: appointmentId,
      details: {
        patientId: appointment.patient,
        previousStatus: previousStatus,  // ✅ Use captured status
        newStatus: status,
        notes: notes
      },
      req,
      status: 'success'
    })

    res.status(200).json({
      success: true,
      message: 'Appointment status updated successfully',
      data: updatedAppointment
    })
  } catch (error) {
    console.error('❌ Error in updateAppointmentStatus:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Add medical notes to appointment
// @route   POST /api/doctor/appointments/:appointmentId/notes
// @access  Private (Doctor only)
export const addMedicalNotes = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { appointmentId } = req.params
    const { diagnosis, symptoms, prescription, labTests, vitalSigns, notes, followUpRequired, followUpDate } = req.body

    // Validate appointmentId
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment ID' })
    }

    const appointment = await Appointment.findById(appointmentId)
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' })
    }

    // Verify doctor owns this appointment
    if (appointment.doctor.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to add notes to this appointment' })
    }

    const patientId = appointment.patient

    // Upsert medical record
    const medicalRecordData = {
      appointment: appointmentId,
      patient: patientId,
      doctor: doctorId,
      diagnosis,
      symptoms,
      prescription,
      labTests,
      vitalSigns,
      notes,
      followUpRequired,
      followUpDate
    }

    const medicalRecord = await MedicalRecord.findOneAndUpdate(
      { appointment: appointmentId },
      medicalRecordData,
      { upsert: true, new: true, runValidators: true }
    )

    // Update appointment status to completed
    await Appointment.findByIdAndUpdate(appointmentId, { status: 'completed' })
    await syncAppointmentFollowUpState({
      appointmentId,
      patientId,
      followUpRequired,
      followUpDate,
      followUpReason: diagnosis,
      followUpNotes: notes
    })

    // Add to patient's medical history if diagnosis is provided
    if (diagnosis) {
      await Patient.findOneAndUpdate(
        { userId: patientId },
        {
          $push: {
            medicalHistory: {
              condition: diagnosis,
              diagnosedDate: new Date(),
              status: 'active',
              notes: notes
            }
          }
        }
      )
    }

    // Notify patient
    await Notification.create({
      user: patientId,
      type: 'appointment',
      title: 'Medical Record Updated',
      message: 'Your doctor has added notes to your appointment.',
      data: { appointmentId, medicalRecordId: medicalRecord._id }
    })

    await logAudit({
      userId: doctorId,
      action: 'MEDICAL_NOTES_ADDED',
      resourceType: 'Appointment',
      resourceId: appointmentId,
      details: {
        patientId: patientId,
        hasDiagnosis: !!diagnosis,
        hasPrescription: !!prescription,
        hasLabTests: !!labTests
      },
      req,
      status: 'success'
    })

    res.status(200).json({
      success: true,
      message: 'Medical notes added successfully',
      data: medicalRecord
    })
  } catch (error) {
    console.error('❌ Error in addMedicalNotes:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Get all patients
// @route   GET /api/doctor/patients
// @access  Private (Doctor only)
export const getPatients = async (req, res) => {
  try {
    const doctorId = mongoose.Types.ObjectId(req.user.id)

    const patients = await Appointment.aggregate([
      { $match: { doctor: doctorId, status: 'completed' } },
      {
        $group: {
          _id: '$patient',
          totalVisits: { $sum: 1 },
          lastVisit: { $max: '$start' }
        }
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
        $lookup: {
          from: 'patients',
          localField: '_id',
          foreignField: 'userId',
          as: 'patientInfo'
        }
      },
      { $unwind: '$userInfo' },
      { $unwind: '$patientInfo' },
      {
        $project: {
          _id: 1,
          totalVisits: 1,
          lastVisit: 1,
          firstName: '$userInfo.firstName',
          lastName: '$userInfo.lastName',
          email: '$userInfo.email',
          phoneNumber: '$userInfo.phoneNumber',
          dateOfBirth: '$patientInfo.dateOfBirth',
          bloodType: '$patientInfo.bloodType'
        }
      },
      { $sort: { lastVisit: -1 } }
    ])

    res.status(200).json({
      success: true,
      count: patients.length,
      data: patients
    })
  } catch (error) {
    console.error('❌ Error in getPatients:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Get patient details
// @route   GET /api/doctor/patients/:patientId
// @access  Private (Doctor only)
export const getPatientDetails = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { patientId } = req.params

    // Validate patientId
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ success: false, message: 'Invalid patient ID' })
    }

    const user = await User.findById(patientId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'Patient not found' })
    }

    const patient = await Patient.findOne({ userId: patientId })
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' })
    }

    const appointments = await Appointment.find({
      patient: patientId,
      doctor: doctorId
    }).sort({ start: -1 })

    const medicalRecords = await MedicalRecord.find({
      patient: patientId,
      doctor: doctorId
    }).sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      data: {
        user,
        patient,
        appointments,
        medicalRecords
      }
    })
  } catch (error) {
    console.error('❌ Error in getPatientDetails:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Get patient medical history
// @route   GET /api/doctor/patients/:patientId/history
// @access  Private (Doctor only)
export const getPatientHistory = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { patientId } = req.params

    // Validate patientId
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ success: false, message: 'Invalid patient ID' })
    }

    const appointments = await Appointment.find({
      patient: patientId,
      doctor: doctorId
    })
      .populate('medicalRecord')
      .sort({ start: -1 })

    const medicalRecords = await MedicalRecord.find({
      patient: patientId,
      doctor: doctorId
    }).sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      data: {
        appointments,
        medicalRecords
      }
    })
  } catch (error) {
    console.error('❌ Error in getPatientHistory:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Get doctor's calendar
// @route   GET /api/doctor/calendar
// @access  Private (Doctor only)
export const getCalendar = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { month, year } = req.query

    const currentDate = new Date()
    const targetMonth = month ? parseInt(month) - 1 : currentDate.getMonth()
    const targetYear = year ? parseInt(year) : currentDate.getFullYear()

    const startOfMonth = new Date(targetYear, targetMonth, 1)
    const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999)

    const appointments = await Appointment.find({
      doctor: doctorId,
      start: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('patient', 'firstName lastName')

    const availability = await Availability.find({
      doctor: doctorId,
      $or: [
        {
          date: { $gte: startOfMonth, $lte: endOfMonth }
        },
        { isRecurring: true }
      ]
    })

    res.status(200).json({
      success: true,
      data: {
        appointments,
        availability,
        month: targetMonth + 1,
        year: targetYear
      }
    })
  } catch (error) {
    console.error('❌ Error in getCalendar:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Get all doctors
// @route   GET /api/doctor/all
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
