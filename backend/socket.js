// socket.js — Enhanced with session persistence and doctor presence tracking
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import User from './models/User.js'
import { createBillForSessionSafe } from './utils/sessionBillingHook.js'

let io

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  })

  // ── Authentication middleware ──────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token

      if (!token) {
        return next(new Error('Authentication token required'))
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const user = await User.findById(decoded.id).select('-password')

      if (!user || user.status !== 'active') {
        return next(new Error('Invalid or inactive user'))
      }

      socket.user = user
      next()
    } catch (error) {
      console.error('Socket authentication error:', error)
      next(new Error('Authentication failed'))
    }
  })

  // ── Connection handler ────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    console.log(`✅ User connected: ${socket.user.firstName} (${socket.user.role})`)

    // Join user-specific notification room
    const userRoom = `user:${socket.user._id}`
    socket.join(userRoom)

    // Join legacy role-based rooms (backward compatibility)
    socket.join(`${socket.user.role}-${socket.user._id}`)

    // Join role-specific pools
    if (socket.user.role === 'admin') {
      socket.join('admin-dashboard')
      socket.join('role:admin')
    } else if (socket.user.role === 'lab_personnel') {
      socket.join('lab-personnel-pool')
      socket.join('role:lab_personnel')
    } else if (socket.user.role === 'pharmacy_staff') {
      socket.join('pharmacy-staff-pool')
      socket.join('role:pharmacy_staff')
    } else if (socket.user.role === 'doctor') {
      socket.join('role:doctor')
    } else if (socket.user.role === 'patient') {
      socket.join('role:patient')
    }

    // Confirm connection to client
    socket.emit('connection:success', {
      userId: socket.user._id,
      role: socket.user.role,
      timestamp: new Date()
    })

    // Send initial unread notification count
    ;(async () => {
      try {
        const Notification = (await import('./models/Notification.js')).default
        const unreadCount = await Notification.countDocuments({
          user: socket.user._id,
          read: false
        })
        socket.emit('notification:unread_count', { count: unreadCount })
      } catch (error) {
        console.error('Error fetching unread count:', error)
      }
    })()

    // ── SESSION PERSISTENCE: Auto-rejoin on reconnect (doctors only) ────────
    //
    // When a doctor's socket connects (or reconnects after a page refresh /
    // navigation), we check whether they have an in-progress session.
    // If they do, we:
    //   1. Re-subscribe their socket to the session room so they keep
    //      receiving session events.
    //   2. Mark them as present in the DB (resets the auto-close grace timer).
    //   3. Emit `session:restore` so the frontend can reopen the modal.
    //
    if (socket.user.role === 'doctor') {
      try {
        const SessionManager = (await import('./services/sessionManager.js')).default
        const activeSession = await SessionManager.getActiveDoctorSession(socket.user._id)

        if (activeSession) {
          // Re-subscribe to session room
          socket.join(`session-${activeSession._id}`)

          // Stamp presence
          await SessionManager.markDoctorPresent(
            activeSession._id.toString(),
            socket.user._id.toString()
          )

          // Tell the frontend to reopen the modal
          const appointmentEnd = new Date(activeSession.appointment.end)
          const remainingTime = Math.max(0, appointmentEnd - new Date())

          socket.emit('session:restore', {
            sessionId: activeSession._id,
            appointmentId: activeSession.appointment._id,
            patient: activeSession.patient,
            remainingTime,
            // Full session data so the modal can hydrate its form fields
            sessionData: activeSession
          })

          console.log(
            `🔄 Doctor ${socket.user.firstName} reconnected — ` +
            `restored to session ${activeSession._id}`
          )
        }
      } catch (err) {
        console.error('Session restore on reconnect error:', err)
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Notification events ───────────────────────────────────────────────

    socket.on('notification:mark_delivered', async (notificationId) => {
      try {
        const Notification = (await import('./models/Notification.js')).default
        const notification = await Notification.findById(notificationId)

        if (notification && notification.user.toString() === socket.user._id.toString()) {
          const channel = notification.channels.find(ch => ch.type === 'push')
          if (channel) {
            channel.status = 'delivered'
            channel.deliveredAt = new Date()
            await notification.save()
          }
        }
      } catch (error) {
        console.error('Mark delivered error:', error)
      }
    })

    socket.on('notification:mark_read', async (notificationId) => {
      try {
        const Notification = (await import('./models/Notification.js')).default
        const notification = await Notification.findById(notificationId)

        if (notification && notification.user.toString() === socket.user._id.toString()) {
          notification.read = true
          notification.readAt = new Date()
          await notification.save()

          const unreadCount = await Notification.countDocuments({
            user: socket.user._id,
            read: false
          })
          socket.emit('notification:unread_count', { count: unreadCount })
        }
      } catch (error) {
        console.error('Mark read error:', error)
        socket.emit('error', { message: 'Failed to mark notification as read' })
      }
    })

    socket.on('notification:mark_all_read', async () => {
      try {
        const Notification = (await import('./models/Notification.js')).default
        await Notification.updateMany(
          { user: socket.user._id, read: false },
          { read: true, readAt: new Date() }
        )

        socket.emit('notification:unread_count', { count: 0 })
        socket.emit('notification:all_marked_read', { success: true })
      } catch (error) {
        console.error('Mark all read error:', error)
        socket.emit('error', { message: 'Failed to mark all as read' })
      }
    })

    // ── Session management ────────────────────────────────────────────────

    socket.on('join:session', async (sessionId) => {
      try {
        const SessionManager = (await import('./services/sessionManager.js')).default
        const status = await SessionManager.checkSessionStatus(sessionId)

        if (status.active) {
          socket.join(`session-${sessionId}`)
          console.log(`👤 ${socket.user.firstName} joined session ${sessionId}`)

          socket.emit('session:joined', {
            sessionId,
            remainingTime: status.remainingTime,
            doctorPresent: status.doctorPresent
          })
        } else {
          socket.emit('session:invalid', {
            sessionId,
            reason: status.reason || 'Session not active'
          })
        }
      } catch (error) {
        console.error('Join session error:', error)
        socket.emit('error', { message: error.message })
      }
    })

    socket.on('leave:session', (sessionId) => {
      socket.leave(`session-${sessionId}`)
      console.log(`👋 ${socket.user.firstName} left session ${sessionId}`)
    })

    socket.on('session:update', async (data) => {
      try {
        const SessionManager = (await import('./services/sessionManager.js')).default
        await SessionManager.updateSession(data.sessionId, data.updates, socket.user._id)
      } catch (error) {
        socket.emit('error', { message: error.message })
      }
    })

    // ── SESSION PERSISTENCE: Doctor heartbeat ────────────────────────────────
    //
    // The frontend sends this event on a regular interval (e.g. every 60s)
    // while the doctor has the session modal open.  It resets the auto-close
    // grace timer, preventing spurious session cancellations caused by the
    // appointment end time passing while the doctor is still consulting.
    //
    // Payload: { sessionId: string }
    //
    socket.on('doctor:heartbeat', async ({ sessionId }) => {
      try {
        if (socket.user.role !== 'doctor') return

        const SessionManager = (await import('./services/sessionManager.js')).default
        await SessionManager.markDoctorPresent(sessionId, socket.user._id.toString())

        socket.emit('doctor:heartbeat_ack', {
          sessionId,
          timestamp: new Date()
        })
      } catch (error) {
        console.error('Doctor heartbeat error:', error)
      }
    })
    // ────────────────────────────────────────────────────────────────────────

    // Heartbeat for session time tracking (existing — patient / doctor)
    socket.on('session:heartbeat', async (sessionId) => {
      try {
        const SessionManager = (await import('./services/sessionManager.js')).default
        const status = await SessionManager.checkSessionStatus(sessionId)
        socket.emit('session:heartbeat_response', status)
      } catch (error) {
        socket.emit('error', { message: error.message })
      }
    })

    // ── ✅ FIX #15: session:start → auto-create Bill ─────────────────────────
    //
    // Payload: { sessionId, appointmentId, doctorId }
    // The frontend emits this the moment the doctor opens the session UI.
    // Bill creation is idempotent — safe to call on every reconnect.
    socket.on('session:start', async ({ sessionId, appointmentId, doctorId }) => {
      console.log(`▶️  session:start — session=${sessionId}, appt=${appointmentId}, doctor=${doctorId}`)

      // 1. Join the session room so real-time events flow correctly
      if (sessionId) {
        socket.join(`session-${sessionId}`)
      }

      // 2. Create the Bill (idempotent — safe to call multiple times)
      if (appointmentId && doctorId) {
        try {
          const bill = await createBillForSessionSafe({ appointmentId, sessionId, doctorId })

          if (bill) {
            // 3. Confirm to the doctor that the bill is ready
            socket.emit('session:bill_created', {
              billId:      bill._id,
              billNumber:  bill.billNumber,
              totalAmount: bill.totalAmount,
              balanceDue:  bill.balanceDue,
              status:      bill.status
            })

            // 4. Broadcast to the admin dashboard so revenue stats stay live
            io.to('admin-dashboard').emit('billing:bill_opened', {
              billId:        bill._id,
              billNumber:    bill.billNumber,
              appointmentId,
              sessionId,
              doctorId,
              totalAmount:   bill.totalAmount
            })
          }
        } catch (err) {
          console.error('session:start bill creation error:', err)
        }
      }
    })

    // Lab request updates
    socket.on('lab:update', (data) => {
      io.to(`session-${data.sessionId}`).emit('lab:status_changed', data)
      io.to('admin-dashboard').emit('lab:update', data)
    })

    // Prescription updates
    socket.on('prescription:update', (data) => {
      io.to(`session-${data.sessionId}`).emit('prescription:status_changed', data)
      io.to('admin-dashboard').emit('prescription:update', data)
    })

    // Payment updates
    socket.on('payment:initiated', (data) => {
      io.to(`${socket.user.role}-${socket.user._id}`).emit('payment:pending', data)
    })

    // ── SESSION PERSISTENCE: Presence-aware disconnect ───────────────────────
    //
    // On disconnect we mark the doctor as absent in the DB but we do NOT
    // cancel the session.  The SessionManager's auto-close scheduler already
    // has a presence-aware reschedule path: it will only cancel the session
    // after the doctor has been absent for PRESENCE_GRACE_PERIOD_MS (15 min).
    // This gives the doctor time to refresh, recover from a connectivity drop,
    // or navigate back to the dashboard.
    //
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.user.firstName}`)

      if (socket.user.role === 'doctor') {
        try {
          const SessionManager = (await import('./services/sessionManager.js')).default
          const absent = await SessionManager.markDoctorAbsent(socket.user._id.toString())

          if (absent) {
            console.log(
              `⏳ Session ${absent._id} kept alive — doctor absent, ` +
              'grace period started'
            )
          }
        } catch (err) {
          console.error('Mark doctor absent on disconnect error:', err)
        }
      }
    })
    // ────────────────────────────────────────────────────────────────────────

    socket.on('error', (error) => {
      console.error('Socket error:', error)
    })
  })

  console.log('🔌 Socket.IO initialized with session persistence and notification support')
  return io
}

// ── Notification emission helpers ─────────────────────────────────────────────

export const emitNotification = (userId, notification) => {
  if (!io) {
    console.error('Socket.IO not initialized')
    return
  }

  const userRoom = `user:${userId}`
  io.to(userRoom).emit('notification:new', {
    id: notification._id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
    relatedId: notification.relatedId,
    relatedModel: notification.relatedModel,
    actionUrl: notification.actionUrl,
    actionLabel: notification.actionLabel,
    createdAt: notification.createdAt
  })

  console.log(`📨 Notification sent to user ${userId}`)
}

export const broadcastToRole = (role, event, data) => {
  if (!io) {
    console.error('Socket.IO not initialized')
    return
  }

  io.to(`role:${role}`).emit(event, data)
  console.log(`📢 Broadcast ${event} to role: ${role}`)
}

export const emitToUsers = (userIds, event, data) => {
  if (!io) {
    console.error('Socket.IO not initialized')
    return
  }

  userIds.forEach(userId => {
    io.to(`user:${userId}`).emit(event, data)
  })

  console.log(`📨 Emitted ${event} to ${userIds.length} users`)
}

export const updateUnreadCount = async (userId) => {
  if (!io) return

  try {
    const Notification = (await import('./models/Notification.js')).default
    const unreadCount = await Notification.countDocuments({
      user: userId,
      read: false
    })

    io.to(`user:${userId}`).emit('notification:unread_count', { count: unreadCount })
  } catch (error) {
    console.error('Update unread count error:', error)
  }
}

export const getIO = () => io

export { io }
export default {
  initializeSocket,
  emitNotification,
  broadcastToRole,
  emitToUsers,
  updateUnreadCount,
  getIO,
  io
}