// utils/sendEmail.js
import nodemailer from 'nodemailer'

/**
 * Send email using Nodemailer
 * @param {Object} options - Email options
 * @param {String} options.to - Recipient email
 * @param {String} options.subject - Email subject
 * @param {String} options.text - Plain text content
 * @param {String} options.html - HTML content
 * @returns {Promise} Email send result
 */
const sendEmail = async (options) => {
  try {
    // Create transporter with proper configuration
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      // ✅ Fix for self-signed certificate error in development
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production', // Only reject in production
        minVersion: 'TLSv1.2' // Ensure minimum TLS version
      },
      // Additional timeout settings
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 5000, // 5 seconds
    })

    // Verify transporter configuration (optional but helpful for debugging)
    if (process.env.NODE_ENV === 'development') {
      await transporter.verify()
      console.log('✅ Email server is ready to send messages')
    }

    // Email options
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'MediBook <noreply@medibook.com>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    }

    // Send email
    const info = await transporter.sendMail(mailOptions)

    console.log('✅ Email sent successfully:', info.messageId)
    return info
  } catch (error) {
    console.error('❌ Email send error:', error.message)

    // Don't throw error in development to prevent registration failures
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  Email not sent (development mode). Continuing...')
      return null
    }

    throw new Error(`Failed to send email: ${error.message}`)
  }
}

/**
 * Send welcome email
 * @param {Object} user - User object
 * @param {String} user.email - User email
 * @param {String} user.firstName - User first name
 * @param {String} user.role - User role
 */
export const sendWelcomeEmail = async (user) => {
  const subject = 'Welcome to MediBook!'
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #000; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to MediBook</h1>
        </div>
        <div class="content">
          <h2>Hello ${user.firstName}!</h2>
          <p>Thank you for joining MediBook. Your account has been successfully created.</p>
          <p>As a ${user.role}, you can now:</p>
          ${user.role === 'patient' ? `
            <ul>
              <li>Search and book appointments with doctors</li>
              <li>View your medical history</li>
              <li>Manage your health records</li>
              <li>Receive appointment reminders</li>
            </ul>
          ` : user.role === 'doctor' ? `
            <ul>
              <li>Manage your schedule and availability</li>
              <li>View patient appointments</li>
              <li>Add medical notes and prescriptions</li>
              <li>Track your patients</li>
            </ul>
          ` : `
            <ul>
              <li>Manage system users</li>
              <li>View analytics and reports</li>
              <li>Configure system settings</li>
              <li>Oversee appointments</li>
            </ul>
          `}
          <p>
            <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/login" class="button">
              Login to Your Account
            </a>
          </p>
          <p>If you have any questions, feel free to contact our support team.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} MediBook. All rights reserved.</p>
          <p>This is an automated email, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await sendEmail({
    to: user.email,
    subject,
    html
  })
}

/**
 * Send appointment confirmation email
 * @param {Object} data - Appointment data
 */
export const sendAppointmentConfirmation = async (data) => {
  const { patientEmail, patientName, doctorName, date, time } = data

  const subject = 'Appointment Confirmation - MediBook'
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #000; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: #fff; padding: 15px; border-left: 4px solid #000; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Confirmed</h1>
        </div>
        <div class="content">
          <h2>Hello ${patientName}!</h2>
          <p>Your appointment has been confirmed.</p>
          <div class="details">
            <p><strong>Doctor:</strong> ${doctorName}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time}</p>
          </div>
          <p>Please arrive 10 minutes before your scheduled time.</p>
          <p>If you need to reschedule or cancel, please do so at least 24 hours in advance.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} MediBook. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await sendEmail({
    to: patientEmail,
    subject,
    html
  })
}

/**
 * Send appointment reminder email
 * @param {Object} data - Appointment data
 */
export const sendAppointmentReminder = async (data) => {
  const { patientEmail, patientName, doctorName, date, time } = data

  const subject = 'Appointment Reminder - MediBook'
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #000; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .reminder { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Reminder</h1>
        </div>
        <div class="content">
          <h2>Hello ${patientName}!</h2>
          <p>This is a reminder about your upcoming appointment.</p>
          <div class="reminder">
            <p><strong>Doctor:</strong> ${doctorName}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time}</p>
          </div>
          <p>Please remember to bring any relevant medical documents or test results.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} MediBook. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await sendEmail({
    to: patientEmail,
    subject,
    html
  })
}

/**
 * Send appointment cancellation email
 * @param {Object} data - Appointment data
 */
export const sendAppointmentCancellation = async (data) => {
  const { patientEmail, patientName, doctorName, date, time, reason } = data

  const subject = 'Appointment Cancelled - MediBook'
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc3545; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: #fff; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Cancelled</h1>
        </div>
        <div class="content">
          <h2>Hello ${patientName}!</h2>
          <p>Your appointment has been cancelled.</p>
          <div class="details">
            <p><strong>Doctor:</strong> ${doctorName}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time}</p>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>
          <p>If you would like to reschedule, please book a new appointment.</p>
          <p>
            <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/appointments/book" class="button">
              Book New Appointment
            </a>
          </p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} MediBook. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await sendEmail({
    to: patientEmail,
    subject,
    html
  })
}

export default sendEmail