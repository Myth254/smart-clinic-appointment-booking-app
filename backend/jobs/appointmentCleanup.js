import cron from 'node-cron'
import Appointment from '../models/Appointment.js'
import Session from '../models/Session.js'
import Notification from '../models/Notification.js'
// io is imported dynamically inside the loop to avoid circular-import issues
// at module load time (socket.js depends on app.js which may not be ready yet).

/**
 * Check for past appointments and mark them as no-show
 * Runs every hour
 */
export const cleanupPastAppointments = async () => {
  console.log('🔍 Checking for past appointments...')

  try {
    const now = new Date()
    const gracePeriod = 30 // 30 minutes grace period
    const cutoffTime = new Date(now.getTime() - gracePeriod * 60 * 1000)

    // Find appointments that are past their time and still pending/approved/in_progress.
    // in_progress is explicitly included so that sessions orphaned by a server
    // restart (whose in-memory auto-close timers were wiped) are caught here.
    const pastAppointments = await Appointment.find({
      end: { $lt: cutoffTime }, // Past the end time + grace period
      status: { $in: ['pending', 'approved', 'in_progress'] }
    })
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName email')

    console.log(`📋 Found ${pastAppointments.length} past appointments to clean up`)

    for (const appointment of pastAppointments) {
      // Check if session was started
      const session = await Session.findOne({ appointment: appointment._id })

      if (session) {
        // If session exists but not completed, mark as cancelled
        if (session.status === 'in_progress') {
          session.status = 'cancelled'
          await session.save()
          appointment.status = 'cancelled'
          appointment.cancellationReason = 'Session not completed within time'

          console.log(`⚠️ Cancelled incomplete session for appointment ${appointment._id}`)
        }
      } else {
        // No session started - mark as no-show
        appointment.status = 'no-show'
        console.log(`❌ Marked appointment ${appointment._id} as no-show`)
      }

      await appointment.save()

      // ── Emit real-time socket event so open dashboards refresh immediately ──
      // Dynamic import avoids the circular-dependency problem at module load time.
      try {
        const { io } = await import('../socket.js')
        if (appointment.status === 'no-show') {
          io.to(`doctor-${appointment.doctor._id}`).emit('appointment:no_show', {
            appointmentId: appointment._id,
            patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
            start: appointment.start
          })
        } else {
          // cancelled — session was in_progress and timed out
          io.to(`doctor-${appointment.doctor._id}`).emit('appointment:updated', {
            appointmentId: appointment._id,
            previousStatus: 'in_progress',
            newStatus: 'cancelled'
          })
        }
      } catch (socketErr) {
        // Non-fatal: socket may not be available in test environments
        console.warn('⚠️ Could not emit socket event during cleanup:', socketErr.message)
      }

      // Notify patient
      await Notification.create({
        user: appointment.patient._id,
        type: 'appointment',
        title: appointment.status === 'no-show' ? 'Missed Appointment' : 'Appointment Cancelled',
        message: appointment.status === 'no-show'
          ? `Your appointment scheduled for ${appointment.start.toLocaleString()} was marked as a no-show. Please contact us to reschedule.`
          : `Your appointment from ${appointment.start.toLocaleString()} was cancelled as the session was not completed.`,
        data: { appointmentId: appointment._id },
        read: false,
        priority: 'high'
      })

      // Notify doctor
      await Notification.create({
        user: appointment.doctor._id,
        type: 'appointment',
        title: `Appointment ${appointment.status === 'no-show' ? 'No-Show' : 'Cancelled'}`,
        message: `Appointment with ${appointment.patient.firstName} ${appointment.patient.lastName} from ${appointment.start.toLocaleString()} was automatically marked as ${appointment.status}.`,
        data: { appointmentId: appointment._id },
        read: false
      })
    }

    console.log(`✅ Cleanup completed: ${pastAppointments.length} appointments processed`)
    return pastAppointments.length

  } catch (error) {
    console.error('❌ Appointment cleanup error:', error)
    throw error
  }
}

// Schedule to run every hour
cron.schedule('0 * * * *', async () => {
  console.log('⏰ Running scheduled appointment cleanup...')
  await cleanupPastAppointments()
})

console.log('📅 Appointment cleanup job scheduled (hourly)')

export default cleanupPastAppointments