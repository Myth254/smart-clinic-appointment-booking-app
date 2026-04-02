// controllers/sessionController.js
//
// Changes from previous version:
//   • onSessionStart() called inside createSession() and startSession()
//   • onSessionComplete() called inside completeSession()
//   • Billing failures are non-blocking (never crash a session action)
//   • All other logic is unchanged

import Session from '../models/Session.js'
import Appointment from '../models/Appointment.js'
import MedicalRecord from '../models/MedicalRecord.js'
import NotificationService from '../services/notificationService.js'
import BillCalculator from '../services/billing/BillCalculator.js'  // ✅ NEW
import mongoose from 'mongoose'
import logAudit from '../utils/auditLogger.js'
import SessionManager from '../services/sessionManager.js'

const _extractObjectIdValue = (value) => {
  if (!value) return value
  return value?._id || value
}

const _extractObjectIdString = (value) => {
  const objectId = _extractObjectIdValue(value)
  return objectId ? String(objectId) : undefined
}

// ─── Shared billing helper ────────────────────────────────────────────────────
// Non-blocking — billing failures log but never reject the session action.
const _triggerSessionStartBilling = async ({ appointment, session }) => {
  try {
    await BillCalculator.onSessionStart({
      appointmentId:   _extractObjectIdString(appointment),
      sessionId:       _extractObjectIdString(session),
      doctorId:        _extractObjectIdString(session.doctor),
      patientId:       _extractObjectIdString(appointment.patient),
      appointmentType: appointment.appointmentType || appointment.type
    })
  } catch (err) {
    console.error('⚠️  [BILLING] Session-start billing hook failed (non-blocking):', err.message)
  }
}

const _triggerSessionCompleteBilling = async ({ appointmentId, medicalRecordId }) => {
  try {
    await BillCalculator.onSessionComplete({ appointmentId, medicalRecordId })
  } catch (err) {
    console.error('⚠️  [BILLING] Session-complete billing hook failed (non-blocking):', err.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// startSession  (delegates to SessionManager — now handles resume)
// ─────────────────────────────────────────────────────────────────────────────
export const startSession = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { appointmentId } = req.body

    const { session, resumed } = await SessionManager.startSession(appointmentId, doctorId)

    // onSessionStart() is idempotent: if a bill already exists it returns
    // the existing one without creating a duplicate.
    const appointment = await Appointment.findById(appointmentId)
    if (appointment) await _triggerSessionStartBilling({ appointment, session })

    await logAudit({
      userId: doctorId,
      action: resumed ? 'SESSION_RESUMED' : 'SESSION_STARTED',
      resourceType: 'Session',
      resourceId: session._id,
      details: { appointmentId, patientId: session.patient._id, resumed },
      req,
      status: 'success'
    })

    return res.status(resumed ? 200 : 201).json({
      success: true,
      message: resumed ? 'Session resumed successfully' : 'Session started successfully',
      resumed,
      data: session
    })
  } catch (error) {
    console.error('Start session error:', error)
    return res.status(400).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getActiveDoctorSession
// ─────────────────────────────────────────────────────────────────────────────
export const getActiveDoctorSession = async (req, res) => {
  try {
    const doctorId = req.user.id
    const session  = await SessionManager.getActiveDoctorSession(doctorId)

    if (!session) {
      return res.status(200).json({ success: true, hasActiveSession: false, data: null })
    }

    const appointmentEnd = new Date(session.appointment.end)
    const remainingTime  = Math.max(0, appointmentEnd - new Date())

    if (remainingTime === 0) {
      return res.status(200).json({ success: true, hasActiveSession: false, data: null })
    }

    return res.status(200).json({ success: true, hasActiveSession: true, remainingTime, data: session })
  } catch (error) {
    console.error('Get active doctor session error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createSession  (legacy — idempotent: resumes active, blocks completed)
// ─────────────────────────────────────────────────────────────────────────────
export const createSession = async (req, res) => {
  try {
    const doctorId = req.user.id
    const {
      appointmentId, patientId, complaints, vitalSigns,
      clinicalObservations, provisionalDiagnosis
    } = req.body

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment ID' })
    }

    const appointment = await Appointment.findById(appointmentId)
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' })
    }
    if (appointment.doctor.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized for this appointment' })
    }

    // ── IDEMPOTENT CHECK ──────────────────────────────────────────────────
    const existingSession = await Session.findOne({ appointment: appointmentId })
    if (existingSession) {
      if (existingSession.status === 'completed') {
        return res.status(400).json({ success: false, message: 'Session already completed for this appointment.' })
      }
      existingSession.doctorPresent       = true
      existingSession.lastDoctorActivity  = new Date()
      existingSession.reconnectCount      = (existingSession.reconnectCount || 0) + 1
      await existingSession.save()
      await existingSession.populate([
        { path: 'patient', select: 'firstName lastName email' },
        { path: 'doctor',  select: 'firstName lastName specialization' },
        { path: 'appointment' }
      ])

      await _triggerSessionStartBilling({ appointment, session: existingSession })

      return res.status(200).json({ success: true, message: 'Resuming existing session', resumed: true, data: existingSession })
    }
    // ─────────────────────────────────────────────────────────────────────

    const session = await Session.create({
      appointment: appointmentId,
      patient:     patientId || appointment.patient,
      doctor:      doctorId,
      complaints,
      vitalSigns,
      clinicalObservations,
      provisionalDiagnosis,
      status:             'in_progress',
      startTime:          new Date(),
      doctorPresent:      true,
      lastDoctorActivity: new Date(),
      reconnectCount:     0
    })

    await Appointment.findByIdAndUpdate(appointmentId, { status: 'in_progress' })

    await session.populate([
      { path: 'patient', select: 'firstName lastName email' },
      { path: 'doctor',  select: 'firstName lastName specialization' },
      { path: 'appointment' }
    ])

    // ✅ BILLING HOOK
    await _triggerSessionStartBilling({ appointment, session })

    await NotificationService.send({
      userId:  session.patient._id,
      type:    'appointment',
      title:   'Session Started',
      message: `Your appointment session with Dr. ${req.user.firstName} ${req.user.lastName} has started.`,
      data:    { sessionId: session._id, appointmentId },
      priority: 'normal',
      channels: [{ type: 'in_app' }]
    })

    await logAudit({
      userId: doctorId,
      action: 'SESSION_CREATED',
      resourceType: 'Session',
      resourceId: session._id,
      details: { appointmentId, patientId: session.patient, sessionStatus: 'in_progress' },
      req,
      status: 'success'
    })

    return res.status(201).json({ success: true, message: 'Session created successfully', resumed: false, data: session })
  } catch (error) {
    console.error('Create session error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// updateSession
// ─────────────────────────────────────────────────────────────────────────────
export const updateSession = async (req, res) => {
  try {
    const { sessionId } = req.params
    const doctorId      = req.user.id
    const updates       = req.body

    const session = await SessionManager.updateSession(sessionId, updates, doctorId)

    await logAudit({
      userId: doctorId, action: 'SESSION_UPDATED', resourceType: 'Session',
      resourceId: sessionId, details: { updatedFields: Object.keys(updates) },
      req, status: 'success'
    })

    return res.json({ success: true, message: 'Session updated successfully', data: session })
  } catch (error) {
    console.error('Update session error:', error)
    return res.status(400).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// completeSession — auto-creates MedicalRecord + finalizes bill
// ─────────────────────────────────────────────────────────────────────────────
export const completeSession = async (req, res) => {
  try {
    const { sessionId } = req.params
    const doctorId      = req.user.id

    const session = await SessionManager.completeSession(sessionId, doctorId)
    const appointmentRef = _extractObjectIdValue(session.appointment)
    const patientRef = _extractObjectIdValue(session.patient)
    const doctorRef = _extractObjectIdValue(session.doctor)

    // Auto-create a draft MedicalRecord if none exists yet
    let medicalRecordId = null
    try {
      const existingRecord = await MedicalRecord.findOne({ appointment: appointmentRef })
      if (existingRecord) {
        medicalRecordId = existingRecord._id
      } else {
        const record = await MedicalRecord.create({
          appointment: appointmentRef,
          patient:     patientRef,
          doctor:      doctorRef,
          diagnosis:   session.provisionalDiagnosis || 'To be finalized',
          vitalSigns:  session.vitalSigns,
          notes:       session.sessionNotes,
          status:      'draft'
        })
        await Session.findByIdAndUpdate(sessionId, { medicalRecord: record._id })
        medicalRecordId = record._id
        console.log(`📋 Draft MedicalRecord ${record._id} created for session ${sessionId}`)
      }
    } catch (recordErr) {
      console.error('Auto-create MedicalRecord failed (non-fatal):', recordErr.message)
    }

    // ✅ BILLING HOOK — finalize the bill (draft → pending)
    await _triggerSessionCompleteBilling({
      appointmentId:   _extractObjectIdString(session.appointment),
      medicalRecordId: medicalRecordId ? String(medicalRecordId) : undefined
    })

    await logAudit({
      userId: doctorId, action: 'SESSION_COMPLETED', resourceType: 'Session',
      resourceId: sessionId, details: { duration: session.duration, endTime: session.endTime },
      req, status: 'success'
    })

    return res.json({ success: true, message: 'Session completed successfully', data: session })
  } catch (error) {
    console.error('Complete session error:', error)
    return res.status(400).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Remaining handlers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export const getActiveSession = async (req, res) => {
  try {
    const { appointmentId } = req.params
    const session = await SessionManager.getActiveSession(appointmentId)
    if (!session) return res.status(404).json({ success: false, message: 'No active session found' })
    const status = await SessionManager.checkSessionStatus(session._id)
    return res.json({ success: true, data: session, sessionStatus: status })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

export const checkSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params
    const status = await SessionManager.checkSessionStatus(sessionId)
    return res.json({ success: true, data: status })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

export const getSessionByAppointment = async (req, res) => {
  try {
    const userId   = req.user.id
    const userRole = req.user.role
    const { appointmentId } = req.params

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment ID' })
    }

    const session = await Session.findOne({ appointment: appointmentId })
      .populate('patient',     'firstName lastName email phoneNumber')
      .populate('doctor',      'firstName lastName specialization')
      .populate('appointment')
      .populate('labRequests')
      .populate('medicalRecord')
      .populate('prescriptions')

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' })

    if (userRole === 'patient' && session.patient._id.toString() !== userId)
      return res.status(403).json({ success: false, message: 'Not authorized' })
    if (userRole === 'doctor' && session.doctor._id.toString() !== userId)
      return res.status(403).json({ success: false, message: 'Not authorized' })

    return res.json({ success: true, data: session })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

export const getSessionById = async (req, res) => {
  try {
    const { sessionId } = req.params
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, message: 'Invalid session ID' })
    }
    const session = await Session.findById(sessionId)
      .populate('patient',     'firstName lastName email phoneNumber')
      .populate('doctor',      'firstName lastName specialization')
      .populate('appointment')
      .populate('labRequests')
      .populate('medicalRecord')
      .populate('prescriptions')

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' })

    const userId   = req.user.id
    const userRole = req.user.role
    if (userRole === 'patient' && session.patient._id.toString() !== userId)
      return res.status(403).json({ success: false, message: 'Not authorized' })
    if (userRole === 'doctor' && session.doctor._id.toString() !== userId)
      return res.status(403).json({ success: false, message: 'Not authorized' })

    return res.json({ success: true, data: session })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

export const getDoctorSessions = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { status, startDate, endDate } = req.query
    const query = { doctor: doctorId }
    if (status) query.status = status
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate)   query.createdAt.$lte = new Date(endDate)
    }
    const sessions = await Session.find(query)
      .populate('patient', 'firstName lastName email phoneNumber')
      .populate('appointment')
      .sort({ createdAt: -1 })
    return res.json({ success: true, count: sessions.length, data: sessions })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

export const addLabRequestToSession = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { sessionId } = req.params
    const { labRequestId } = req.body

    if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(labRequestId)) {
      return res.status(400).json({ success: false, message: 'Invalid session or lab request ID' })
    }

    const session = await Session.findById(sessionId)
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' })
    if (session.doctor.toString() !== doctorId) return res.status(403).json({ success: false, message: 'Not authorized' })

    if (!session.labRequests.includes(labRequestId)) {
      session.labRequests.push(labRequestId)
      await session.save()
    }

    return res.json({ success: true, message: 'Lab request added to session', data: session })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

export const autosaveSession = async (req, res) => {
  try {
    const { sessionId } = req.params
    const doctorId      = req.user.id

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, message: 'Invalid session ID' })
    }

    const session = await Session.findById(sessionId)
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' })
    if (session.doctor.toString() !== doctorId) return res.status(403).json({ success: false, message: 'Not authorized' })
    if (session.status !== 'in_progress') return res.status(400).json({ success: false, message: 'Cannot autosave completed or cancelled session' })

    const allowedFields = ['complaints', 'vitalSigns', 'clinicalObservations', 'provisionalDiagnosis', 'sessionNotes']
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'vitalSigns') session.vitalSigns = { ...session.vitalSigns, ...req.body[field] }
        else session[field] = req.body[field]
      }
    })

    session.lastSaved          = new Date()
    session.lastDoctorActivity = new Date()
    session.doctorPresent      = true
    await session.save()

    return res.json({ success: true, message: 'Session auto-saved', data: { sessionId: session._id, lastSaved: session.lastSaved } })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

export const extendSession = async (req, res) => {
  try {
    const { sessionId }  = req.params
    const doctorId       = req.user.id
    const { extraMinutes } = req.body

    if (![15, 30].includes(Number(extraMinutes))) {
      return res.status(400).json({ success: false, message: 'extraMinutes must be 15 or 30' })
    }

    const result = await SessionManager.extendSession(sessionId, doctorId, Number(extraMinutes))

    await logAudit({
      userId: doctorId, action: 'SESSION_EXTENDED', resourceType: 'Session',
      resourceId: sessionId, details: { extraMinutes, newEnd: result.newEnd },
      req, status: 'success'
    })

    return res.json({ success: true, message: `Session extended by ${extraMinutes} minutes`, data: result })
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message })
  }
}

export default {
  startSession, getActiveDoctorSession, createSession, updateSession,
  completeSession, extendSession, getActiveSession, checkSessionStatus,
  getSessionByAppointment, getSessionById, getDoctorSessions,
  addLabRequestToSession, autosaveSession
}
