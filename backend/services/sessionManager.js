import Session from '../models/Session.js'
import Appointment from '../models/Appointment.js'
import NotificationService from './notificationService.js'

// How long (ms) the auto-close waits after the doctor goes absent before
// actually cancelling the session. 15 minutes gives the doctor time to
// refresh, step away briefly, or recover from a connectivity drop.
const PRESENCE_GRACE_PERIOD_MS = 15 * 60 * 1000

// How long (ms) past appointment.end before the hard auto-close fires.
// Must match the value in scheduleAutoClose and getActiveDoctorSession.
const HARD_GRACE_MS = 30 * 60 * 1000

class SessionManager {
  constructor() {
    this.activeSessions = new Map()  // sessionId → session metadata
    this.sessionTimers = new Map()   // sessionId → auto-close timer handle
  }

  // ─── Time-window validation ───────────────────────────────────────────────

  /**
   * Returns { allowed: true } when a session may be started or joined.
   * Doctors may enter up to 60 minutes before the appointment start time.
   */
  canStartSession(appointment) {
    const now = new Date()
    const appointmentStart = new Date(appointment.start)
    const appointmentEnd = new Date(appointment.end)

    const earlyStartWindow = 60 * 60 * 1000
    const startAllowedTime = new Date(appointmentStart.getTime() - earlyStartWindow)

    if (now < startAllowedTime) {
      return {
        allowed: false,
        reason: 'too_early',
        message: `Session can only be started from ${startAllowedTime.toLocaleString()}`,
        startTime: startAllowedTime
      }
    }

    if (now > appointmentEnd) {
      return {
        allowed: false,
        reason: 'expired',
        message: 'Appointment time has passed',
        endTime: appointmentEnd
      }
    }

    return { allowed: true }
  }

  // ─── Start / resume session ───────────────────────────────────────────────

  /**
   * Starts a new session for the given appointment, OR resumes an existing
   * in-progress session when the owning doctor reconnects.
   *
   * @returns {{ session: Session, resumed: boolean }}
   */
  async startSession(appointmentId, doctorId) {
    try {
      const appointment = await Appointment.findById(appointmentId)
        .populate('patient', 'firstName lastName email')
        .populate('doctor', 'firstName lastName email')

      if (!appointment) {
        throw new Error('Appointment not found')
      }

      if (appointment.doctor._id.toString() !== doctorId) {
        throw new Error('Not authorized to start this session')
      }

      const timeCheck = this.canStartSession(appointment)
      if (!timeCheck.allowed) {
        throw new Error(timeCheck.message)
      }

      let session = await Session.findOne({ appointment: appointmentId })

      // ── RESUME PATH ──────────────────────────────────────────────────────
      if (session && session.status === 'in_progress') {
        if (session.doctor.toString() !== doctorId) {
          throw new Error('Session already in progress by another doctor')
        }

        session.doctorPresent = true
        session.lastDoctorActivity = new Date()
        session.reconnectCount = (session.reconnectCount || 0) + 1
        await session.save()

        await session.populate([
          { path: 'patient', select: 'firstName lastName email phoneNumber' },
          { path: 'doctor', select: 'firstName lastName specialization' },
          { path: 'appointment' }
        ])

        // Re-hydrate the in-memory map so timer/heartbeat logic keeps working
        this.activeSessions.set(session._id.toString(), {
          sessionId: session._id,
          appointmentId,
          doctorId,
          patientId: appointment.patient._id,
          startTime: session.startTime,
          endTime: appointment.end
        })

        console.log(`🔄 Session resumed: ${session._id} (reconnect #${session.reconnectCount})`)
        return { session, resumed: true }
      }

      if (session && session.status === 'completed') {
        throw new Error('Session already completed')
      }

      // ── CREATE PATH ──────────────────────────────────────────────────────
      if (!session) {
        session = await Session.create({
          appointment: appointmentId,
          patient: appointment.patient._id,
          doctor: doctorId,
          status: 'in_progress',
          startTime: new Date(),
          doctorPresent: true,
          lastDoctorActivity: new Date(),
          reconnectCount: 0
        })
      } else {
        // Cancelled session being restarted within the same appointment window
        session.status = 'in_progress'
        session.startTime = new Date()
        session.doctorPresent = true
        session.lastDoctorActivity = new Date()
        await session.save()
      }

      appointment.status = 'in_progress'
      await appointment.save()

      this.activeSessions.set(session._id.toString(), {
        sessionId: session._id,
        appointmentId,
        doctorId,
        patientId: appointment.patient._id,
        startTime: session.startTime,
        endTime: appointment.end
      })

      this.scheduleAutoClose(session._id, appointment.end)

      await session.populate([
        { path: 'patient', select: 'firstName lastName email phoneNumber' },
        { path: 'doctor', select: 'firstName lastName specialization' },
        { path: 'appointment' }
      ])

      const { io } = await import('../socket.js')

      io.to(`patient-${appointment.patient._id}`).emit('session:started', {
        sessionId: session._id,
        appointmentId,
        doctor: {
          id: appointment.doctor._id,
          name: `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`
        },
        startTime: session.startTime
      })

      io.to(`doctor-${doctorId}`).emit('session:active', {
        sessionId: session._id,
        appointmentId,
        patient: {
          id: appointment.patient._id,
          name: `${appointment.patient.firstName} ${appointment.patient.lastName}`
        }
      })

      io.to('admin-dashboard').emit('session:started', {
        sessionId: session._id,
        appointmentId,
        doctorName: `Dr. ${appointment.doctor.lastName}`,
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`
      })

      await NotificationService.send({
        userId: appointment.patient._id,
        type: 'session_started',
        title: 'Medical Session Started',
        message: `Dr. ${appointment.doctor.lastName} has started your consultation session.`,
        data: { sessionId: session._id, appointmentId },
        priority: 'high',
        channels: ['in_app', 'push']
      })

      console.log(`✅ Session started: ${session._id} for appointment ${appointmentId}`)
      return { session, resumed: false }

    } catch (error) {
      console.error('Start session error:', error)
      throw error
    }
  }

  // ─── Auto-close scheduling ────────────────────────────────────────────────

  /**
   * Schedules a presence check at `endTime + HARD_GRACE_MS`.
   * Also emits a 5-minute warning before appointment.end.
   */
  scheduleAutoClose(sessionId, endTime) {
    // Clear any existing timer for this session (e.g. on reconnect or extend)
    const existing = this.sessionTimers.get(sessionId.toString())
    if (existing) clearTimeout(existing)

    const now = new Date()
    const closeTime = new Date(new Date(endTime).getTime() + HARD_GRACE_MS)
    const delay = closeTime - now

    if (delay <= 0) {
      // Already past the hard deadline — close immediately
      this.autoCloseSession(sessionId)
      return
    }

    const timerId = setTimeout(async () => {
      await this.autoCloseSession(sessionId)
    }, delay)

    this.sessionTimers.set(sessionId.toString(), timerId)
    console.log(`⏰ Auto-close check scheduled for session ${sessionId} at ${closeTime.toLocaleString()}`)

    // 5-minute warning fires at appointment.end − 5 min
    const warningAt = new Date(new Date(endTime).getTime() - 5 * 60 * 1000)
    const warningDelay = warningAt - now
    if (warningDelay > 0) {
      const meta = this.activeSessions.get(sessionId.toString())
      setTimeout(async () => {
        try {
          const { io } = await import('../socket.js')
          const doctorId = meta?.doctorId || (await Session.findById(sessionId))?.doctor
          if (doctorId) {
            io.to(`doctor-${doctorId}`).emit('session:expiring_soon', {
              sessionId,
              minutesLeft: 5,
              appointmentEnd: endTime
            })
            console.log(`⚠️ session:expiring_soon emitted for session ${sessionId}`)
          }
        } catch (err) {
          console.warn('Warning timer socket emit failed:', err.message)
        }
      }, warningDelay)
    }
  }

  /**
   * Presence-aware session terminator.
   * If the doctor was active within PRESENCE_GRACE_PERIOD_MS, the check is
   * rescheduled rather than closing immediately.
   */
  async autoCloseSession(sessionId) {
    try {
      const session = await Session.findById(sessionId)
        .populate('patient', 'firstName lastName email')
        .populate('doctor', 'firstName lastName email')

      if (!session || session.status !== 'in_progress') {
        return
      }

      // ── PRESENCE CHECK ───────────────────────────────────────────────────
      if (session.lastDoctorActivity) {
        const timeSinceActivity = Date.now() - new Date(session.lastDoctorActivity).getTime()
        if (timeSinceActivity < PRESENCE_GRACE_PERIOD_MS) {
          const rescheduleDelay = PRESENCE_GRACE_PERIOD_MS - timeSinceActivity
          console.log(
            `⏳ Doctor recently active on session ${sessionId}, ` +
            `rescheduling close check in ${Math.round(rescheduleDelay / 60000)} min`
          )
          const timerId = setTimeout(async () => {
            await this.autoCloseSession(sessionId)
          }, rescheduleDelay)
          this.sessionTimers.set(sessionId.toString(), timerId)
          return
        }
      }

      console.log(`⚠️ Auto-closing session ${sessionId} — doctor absent beyond grace period`)

      session.status = 'cancelled'
      session.endTime = new Date()
      session.doctorPresent = false
      await session.save()

      await Appointment.findByIdAndUpdate(session.appointment, {
        status: 'cancelled',
        cancellationReason: 'Session not completed within allocated time'
      })

      this.activeSessions.delete(sessionId.toString())
      this.sessionTimers.delete(sessionId.toString())

      const { io } = await import('../socket.js')

      io.to(`doctor-${session.doctor._id}`).emit('session:auto_closed', {
        sessionId,
        reason: 'Time limit exceeded'
      })

      io.to(`patient-${session.patient._id}`).emit('session:cancelled', {
        sessionId,
        reason: 'Session time expired'
      })

      io.to('admin-dashboard').emit('session:auto_closed', {
        sessionId,
        doctorName: `Dr. ${session.doctor.lastName}`,
        patientName: `${session.patient.firstName} ${session.patient.lastName}`
      })

      await NotificationService.send({
        userId: session.doctor._id,
        type: 'session_expired',
        title: 'Session Auto-Closed',
        message: 'Your session was automatically closed as it exceeded the allocated time.',
        data: { sessionId },
        priority: 'high',
        channels: ['in_app', 'email']
      })

      await NotificationService.send({
        userId: session.patient._id,
        type: 'session_cancelled',
        title: 'Session Ended',
        message: 'Your consultation session was ended. Please contact the clinic to reschedule.',
        data: { sessionId },
        priority: 'high',
        channels: ['in_app', 'email']
      })

    } catch (error) {
      console.error('Auto-close session error:', error)
    }
  }

  // ─── Update session ───────────────────────────────────────────────────────

  async updateSession(sessionId, updates, userId) {
    try {
      const session = await Session.findById(sessionId)

      if (!session || session.status !== 'in_progress') {
        throw new Error('Session not active')
      }

      // ✅ FIX Bug 3: Re-fetch appointment fresh from DB to pick up any concurrent
      // extendSession() writes, and use the hard grace window (not just appointment.end)
      // before deciding the session has expired. This prevents autosave from racing
      // with extendSession and incorrectly triggering autoCloseSession mid-extension.
      const appointment = await Appointment.findById(session.appointment)
      const isExpiredPastGrace = Date.now() > new Date(appointment.end).getTime() + HARD_GRACE_MS
      if (isExpiredPastGrace) {
        await this.autoCloseSession(sessionId)
        throw new Error('Session time has expired')
      }

      Object.assign(session, updates)
      session.lastSaved = new Date()
      session.lastDoctorActivity = new Date()
      session.doctorPresent = true
      await session.save()

      const { io } = await import('../socket.js')

      const updateData = {
        sessionId,
        updates,
        updatedBy: userId,
        timestamp: new Date()
      }

      io.to(`doctor-${session.doctor}`).emit('session:updated', updateData)
      io.to(`patient-${session.patient}`).emit('session:progress', {
        sessionId,
        message: 'Your doctor is updating your medical session',
        timestamp: new Date()
      })
      io.to('admin-dashboard').emit('session:updated', updateData)

      return session

    } catch (error) {
      console.error('Update session error:', error)
      throw error
    }
  }

  // ─── Complete session ─────────────────────────────────────────────────────

  /**
   * The ONLY legitimate termination path — explicitly invoked by the doctor.
   *
   * ✅ FIX Bug 2: Made idempotent — if the session is already completed
   * (e.g. a double-fire from the frontend clicking Finalize twice) we return
   * the existing session record rather than throwing "Session is not active".
   * This prevents the spurious 400 errors shown in the screenshot that occurred
   * when the doctor extended time and the frontend fired completeSession twice.
   */
  async completeSession(sessionId, doctorId) {
    try {
      const session = await Session.findById(sessionId)
        .populate('patient', 'firstName lastName email')
        .populate('doctor', 'firstName lastName email')
        .populate('appointment')

      if (!session) {
        throw new Error('Session not found')
      }

      if (session.doctor._id.toString() !== doctorId) {
        throw new Error('Not authorized')
      }

      // ✅ FIX Bug 2: Idempotent guard — already completed means we succeeded
      // on a prior call. Return gracefully instead of throwing.
      if (session.status === 'completed') {
        console.warn(`⚠️ completeSession called on already-completed session ${sessionId} — returning existing record`)
        return session
      }

      if (session.status !== 'in_progress') {
        throw new Error('Session is not active')
      }

      session.status = 'completed'
      session.endTime = new Date()
      session.doctorPresent = false
      await session.save()

      await Appointment.findByIdAndUpdate(session.appointment._id, {
        status: 'completed'
      })

      this.activeSessions.delete(sessionId.toString())

      // Clear the auto-close timer — doctor completed it properly
      const timer = this.sessionTimers.get(sessionId.toString())
      if (timer) {
        clearTimeout(timer)
        this.sessionTimers.delete(sessionId.toString())
        console.log(`🗑️ Auto-close timer cleared for completed session ${sessionId}`)
      }

      const { io } = await import('../socket.js')

      io.to(`doctor-${session.doctor._id}`).emit('session:completed', {
        sessionId,
        duration: session.duration,
        completedAt: session.endTime
      })

      io.to(`patient-${session.patient._id}`).emit('session:completed', {
        sessionId,
        message: 'Your consultation has been completed',
        completedAt: session.endTime
      })

      io.to('admin-dashboard').emit('session:completed', {
        sessionId,
        doctorName: `Dr. ${session.doctor.lastName}`,
        patientName: `${session.patient.firstName} ${session.patient.lastName}`,
        duration: session.duration
      })

      await NotificationService.send({
        userId: session.patient._id,
        type: 'session_completed',
        title: 'Consultation Completed',
        message: 'Your medical consultation has been completed. Your records are being finalized.',
        data: { sessionId, appointmentId: session.appointment._id },
        priority: 'normal',
        channels: ['in_app', 'email']
      })

      console.log(`✅ Session completed: ${sessionId}`)
      return session

    } catch (error) {
      console.error('Complete session error:', error)
      throw error
    }
  }

  // ─── Query helpers ────────────────────────────────────────────────────────

  /**
   * Used by the dashboard on page load to restore the session modal.
   * Ghost-session fix: validates appointment window before returning.
   */
  async getActiveDoctorSession(doctorId) {
    const session = await Session.findOne({
      doctor: doctorId,
      status: 'in_progress'
    }).populate([
      { path: 'patient', select: 'firstName lastName email phoneNumber' },
      { path: 'doctor', select: 'firstName lastName specialization' },
      { path: 'appointment' },
      { path: 'labRequests' },
      { path: 'prescriptions' }
    ])

    if (!session) return null

    const appointmentEnd = new Date(session.appointment.end)
    const hardDeadline   = new Date(appointmentEnd.getTime() + HARD_GRACE_MS)

    if (Date.now() > hardDeadline.getTime()) {
      console.log(
        `🧹 Force-closing stale session ${session._id} — appointment ended ` +
        `${Math.round((Date.now() - appointmentEnd.getTime()) / 60000)} min ago`
      )
      session.status        = 'cancelled'
      session.endTime       = new Date()
      session.doctorPresent = false
      await session.save()

      await Appointment.findByIdAndUpdate(session.appointment._id, {
        status:             'cancelled',
        cancellationReason: 'Session not completed within allocated time'
      })

      return null
    }

    return session
  }

  /** Used by appointment-specific lookups and the socket join handler. */
  async getActiveSession(appointmentId) {
    return await Session.findOne({
      appointment: appointmentId,
      status: 'in_progress'
    }).populate([
      { path: 'patient', select: 'firstName lastName email phoneNumber' },
      { path: 'doctor', select: 'firstName lastName specialization' },
      { path: 'appointment' },
      { path: 'labRequests' },
      { path: 'prescriptions' }
    ])
  }

  // ─── Status check ─────────────────────────────────────────────────────────

  async checkSessionStatus(sessionId) {
    const session = await Session.findById(sessionId).populate('appointment')

    if (!session) {
      return { exists: false }
    }

    if (session.status !== 'in_progress') {
      return {
        exists: true,
        active: false,
        status: session.status
      }
    }

    const appointment = session.appointment
    const timeCheck = this.canStartSession(appointment)

    if (!timeCheck.allowed && timeCheck.reason === 'expired') {
      await this.autoCloseSession(sessionId)
      return {
        exists: true,
        active: false,
        status: 'expired',
        reason: 'Time limit exceeded'
      }
    }

    return {
      exists: true,
      active: true,
      status: 'in_progress',
      doctorPresent: session.doctorPresent,
      remainingTime: new Date(appointment.end) - new Date()
    }
  }

  // ─── Extend session ───────────────────────────────────────────────────────

  /**
   * Extends the appointment end time by `extraMinutes` (15 or 30).
   * Reschedules the auto-close timer and re-emits the warning at the new
   * -5 min threshold so the doctor gets a fresh prompt if they extend again.
   *
   * ✅ FIX Bug 1: Always upsert the activeSessions map entry — don't guard
   * with `if (meta)`. After a server restart or any path that didn't call
   * startSession(), the map entry is absent. Without this fix, meta.endTime
   * stays stale and scheduleAutoClose/canStartSession use the old end time,
   * causing the auto-close to fire (or the session to look expired) even
   * though the doctor just extended it.
   */
  async extendSession(sessionId, doctorId, extraMinutes) {
    const session = await Session.findById(sessionId).populate('appointment')

    if (!session) throw new Error('Session not found')
    if (session.status !== 'in_progress') throw new Error('Session is not active')
    if (session.doctor.toString() !== doctorId) throw new Error('Not authorized')

    const currentEnd = new Date(session.appointment.end)
    const newEnd = new Date(currentEnd.getTime() + extraMinutes * 60_000)

    // Persist the new end time on the appointment
    await Appointment.findByIdAndUpdate(session.appointment._id, { end: newEnd })

    // ✅ FIX Bug 1: Upsert the in-memory metadata unconditionally so that
    // canStartSession(), scheduleAutoClose(), and the warning timer all use
    // the updated end time — even after a server restart that cleared the map.
    const existingMeta = this.activeSessions.get(sessionId.toString())
    if (existingMeta) {
      existingMeta.endTime = newEnd
    } else {
      this.activeSessions.set(sessionId.toString(), {
        sessionId:     session._id,
        appointmentId: session.appointment._id,
        doctorId:      session.doctor.toString(),
        patientId:     session.patient,
        startTime:     session.startTime,
        endTime:       newEnd
      })
      console.log(`🔁 Re-hydrated activeSessions map entry for session ${sessionId} during extension`)
    }

    // Reschedule auto-close and the new -5 min warning from the new end time
    this.scheduleAutoClose(sessionId, newEnd)

    console.log(`⏩ Session ${sessionId} extended by ${extraMinutes} min — new end: ${newEnd.toLocaleString()}`)
    return { newEnd }
  }

  // ─── Presence management (called from socket.js) ──────────────────────────

  /**
   * Mark the doctor as present and stamp activity.
   * Called on socket reconnect and `doctor:heartbeat` events.
   */
  async markDoctorPresent(sessionId, doctorId) {
    const session = await Session.findById(sessionId)
    if (!session || session.status !== 'in_progress') return null
    if (session.doctor.toString() !== doctorId) return null

    session.doctorPresent = true
    session.lastDoctorActivity = new Date()
    await session.save()
    return session
  }

  /**
   * Mark the doctor as absent (socket disconnect).
   * Does NOT cancel the session — autoCloseSession decides that later
   * based on how long the doctor has been gone.
   */
  async markDoctorAbsent(doctorId) {
    const session = await Session.findOne({ doctor: doctorId, status: 'in_progress' })
    if (!session) return null

    session.doctorPresent = false
    await session.save()

    console.log(`👋 Doctor ${doctorId} disconnected from session ${session._id} — session kept alive`)
    return session
  }
}

export default new SessionManager()