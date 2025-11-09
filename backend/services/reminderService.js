import cron from 'node-cron'
import Appointment from '../models/Appointment.js'
import sendEmail from '../utils/sendEmail.js'
import { startOfDay, endOfDay, addDays, format } from 'date-fns'

// Runs every day at 08:00 AM (server time)
cron.schedule('0 8 * * *', async () => {
  console.log('🕗 Running daily appointment reminder job...')

  try {
    // Step 1: find appointments for "tomorrow"
    const tomorrow = addDays(new Date(), 1)
    const start = startOfDay(tomorrow)
    const end = endOfDay(tomorrow)

    const appointments = await Appointment.find({
      start: { $gte: start, $lte: end },
      status: { $in: ['approved', 'pending'] }
    })
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName email')

    if (!appointments.length) {
      console.log('✅ No appointments for tomorrow.')
      return
    }

    console.log(`📅 Found ${appointments.length} appointment(s) for tomorrow.`)

    for (const appt of appointments) {
      const dateStr = format(appt.start, 'PPP')
      const timeStr = format(appt.start, 'p')

      // Patient reminder
      if (appt.patient?.email) {
        await sendEmail(
          appt.patient.email,
          'Appointment Reminder - MediBook',
          `
          <p>Dear ${appt.patient.firstName},</p>
          <p>This is a reminder for your appointment scheduled for <strong>${dateStr}</strong> at <strong>${timeStr}</strong>.</p>
          <p>Doctor: Dr. ${appt.doctor.lastName}</p>
          <p>Please arrive 10 minutes early.</p>
          <p>Best regards,<br/>MediBook Team</p>
          `
        )
      }

      // Doctor reminder
      if (appt.doctor?.email) {
        await sendEmail(
          appt.doctor.email,
          'Upcoming Appointment Tomorrow',
          `
          <p>Hello Dr. ${appt.doctor.lastName},</p>
          <p>You have an appointment scheduled for <strong>${dateStr}</strong> at <strong>${timeStr}</strong>.</p>
          <p>Patient: ${appt.patient.firstName} ${appt.patient.lastName}</p>
          <p>Best regards,<br/>MediBook System</p>
          `
        )
      }
    }

    console.log('✅ Appointment reminder job completed successfully.')
  } catch (error) {
    console.error('❌ Reminder job failed:', error.message)
  }
})