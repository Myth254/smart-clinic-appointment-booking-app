import cron from 'node-cron'
import Appointment from '../models/Appointment.js'
import NotificationService from '../utils/notificationService.js'

// Run daily at 8:00 AM to send reminders for appointments in next 24 hours
cron.schedule('0 8 * * *', async () => {
  console.log('🔔 Running appointment reminder checker...')

  try {
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // Find appointments in next 24 hours with status 'approved'
    // ('confirmed' is NOT a valid enum value — that bug silently sent 0 reminders)
    const upcomingAppointments = await Appointment.find({
      start: { $gte: now, $lte: tomorrow },
      status: 'approved'
    })
      .populate('patient', 'firstName lastName email phoneNumber')
      .populate('doctor', 'firstName lastName')

    console.log(`📋 Found ${upcomingAppointments.length} appointments needing reminders`)

    const notifications = upcomingAppointments.map(appointment =>
      NotificationService.appointmentNotifications.appointmentReminder(
        appointment,
        appointment.patient,
        appointment.doctor
      )
    )

    const results = await Promise.allSettled(notifications)
    const successful = results.filter(r => r.status === 'fulfilled').length

    console.log(`✅ Sent ${successful} appointment reminders`)
  } catch (error) {
    console.error('❌ Appointment reminder error:', error)
  }
})

console.log('📅 Appointment reminder checker scheduled (daily at 8:00 AM)')