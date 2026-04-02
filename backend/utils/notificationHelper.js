// utils/notificationHelper.js
import Notification from '../models/Notification.js'
import sendEmail from './sendEmail.js'

/**
 * Create and send notification
 * @param {Object} options - Notification options
 * @param {string} options.userId - User ID to notify
 * @param {string} options.type - Notification type
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} options.relatedId - Related resource ID
 * @param {string} options.relatedModel - Related model name
 * @param {boolean} options.sendEmail - Whether to send email notification
 * @param {boolean} options.sendSMS - Whether to send SMS notification
 */
export const createNotification = async ({
  userId,
  type,
  title,
  message,
  relatedId = null,
  relatedModel = null,
  sendEmail: shouldSendEmail = true,
  sendSMS = false,
  priority = 'normal'
}) => {
  try {
    // Create notification in database
    const notification = await Notification.create({
      user: userId,
      type,
      title,
      message,
      relatedId,
      relatedModel,
      read: false,
      priority,
      deliveryStatus: 'pending'
    })

    // Send email if requested
    if (shouldSendEmail) {
      try {
        const User = (await import('../models/User.js')).default
        const user = await User.findById(userId)

        if (user && user.email) {
          await sendEmail({
            to: user.email,
            subject: title,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">${title}</h2>
                <p style="color: #666; line-height: 1.6;">${message}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">
                  This is an automated notification from MediBook. Please do not reply to this email.
                </p>
              </div>
            `
          })

          notification.deliveryStatus = 'sent'
          await notification.save()
        }
      } catch (emailError) {
        console.error('Email notification error:', emailError)
        notification.deliveryStatus = 'failed'
        notification.deliveryError = emailError.message
        await notification.save()
      }
    }

    // TODO: Implement SMS sending if requested
    if (sendSMS) {
      // await sendSMSNotification(userId, message)
    }

    return notification
  } catch (error) {
    console.error('Create notification error:', error)
    throw error
  }
}

/**
 * Create multiple notifications (bulk)
 */
export const createBulkNotifications = async (notifications) => {
  try {
    const results = await Promise.allSettled(
      notifications.map(notif => createNotification(notif))
    )

    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    return {
      success: true,
      total: notifications.length,
      successful,
      failed,
      results
    }
  } catch (error) {
    console.error('Bulk notification error:', error)
    throw error
  }
}

/**
 * Notify all users with specific role
 */
export const notifyRole = async (role, { type, title, message, priority = 'normal' }) => {
  try {
    const User = (await import('../models/User.js')).default
    const users = await User.find({ role, status: 'active' })

    const notifications = users.map(user => ({
      userId: user._id,
      type,
      title,
      message,
      priority,
      sendEmail: true
    }))

    return await createBulkNotifications(notifications)
  } catch (error) {
    console.error('Notify role error:', error)
    throw error
  }
}

/**
 * Notification templates for common events
 */
export const NOTIFICATION_TEMPLATES = {
  // Appointment notifications
  APPOINTMENT_APPROVED: (appointment) => ({
    type: 'appointment',
    title: 'Appointment Approved',
    message: `Your appointment on ${appointment.start.toLocaleDateString()} has been approved.`,
    relatedId: appointment._id,
    relatedModel: 'Appointment'
  }),

  APPOINTMENT_REJECTED: (appointment, reason) => ({
    type: 'appointment',
    title: 'Appointment Rejected',
    message: `Your appointment request has been rejected. Reason: ${reason}`,
    relatedId: appointment._id,
    relatedModel: 'Appointment'
  }),

  APPOINTMENT_REMINDER: (appointment) => ({
    type: 'appointment',
    title: 'Appointment Reminder',
    message: `Reminder: You have an appointment tomorrow at ${appointment.start.toLocaleTimeString()}.`,
    relatedId: appointment._id,
    relatedModel: 'Appointment',
    priority: 'high'
  }),

  // Session notifications
  SESSION_STARTED: (session) => ({
    type: 'session',
    title: 'Medical Session Started',
    message: 'Your doctor has started your medical consultation session.',
    relatedId: session._id,
    relatedModel: 'Session'
  }),

  SESSION_COMPLETED: (session) => ({
    type: 'session',
    title: 'Session Completed',
    message: 'Your medical consultation has been completed. Medical records are now available.',
    relatedId: session._id,
    relatedModel: 'Session'
  }),

  // Lab notifications
  LAB_REQUEST_CREATED: (labRequest) => ({
    type: 'lab',
    title: 'Lab Tests Requested',
    message: `Your doctor has requested ${labRequest.tests.length} lab test(s). Please complete payment to proceed.`,
    relatedId: labRequest._id,
    relatedModel: 'LabRequest'
  }),

  LAB_ASSIGNED: (labRequest) => ({
    type: 'lab',
    title: 'Lab Request Assigned',
    message: `Lab request ${labRequest.requestNumber} has been assigned to you.`,
    relatedId: labRequest._id,
    relatedModel: 'LabRequest'
  }),

  LAB_RESULTS_READY: (labRequest) => ({
    type: 'lab',
    title: 'Lab Results Ready',
    message: `Your lab test results for ${labRequest.requestNumber} are now available.`,
    relatedId: labRequest._id,
    relatedModel: 'LabRequest',
    priority: 'high'
  }),

  LAB_CRITICAL_RESULT: (labRequest) => ({
    type: 'lab',
    title: 'CRITICAL: Lab Result Alert',
    message: `Critical lab results detected in ${labRequest.requestNumber}. Please review immediately.`,
    relatedId: labRequest._id,
    relatedModel: 'LabRequest',
    priority: 'urgent'
  }),

  // Prescription notifications
  PRESCRIPTION_CREATED: (prescription) => ({
    type: 'prescription',
    title: 'Prescription Issued',
    message: `A new prescription (${prescription.prescriptionNumber}) has been issued for you.`,
    relatedId: prescription._id,
    relatedModel: 'Prescription'
  }),

  PRESCRIPTION_READY: (prescription) => ({
    type: 'prescription',
    title: 'Prescription Ready for Pickup',
    message: `Your prescription ${prescription.prescriptionNumber} is ready for pickup at the pharmacy.`,
    relatedId: prescription._id,
    relatedModel: 'Prescription',
    priority: 'high'
  }),

  PRESCRIPTION_ALTERNATIVE: (prescription, medication) => ({
    type: 'prescription',
    title: 'Alternative Medication Suggested',
    message: `The pharmacy has suggested an alternative for ${medication.drugName}. Please review and approve.`,
    relatedId: prescription._id,
    relatedModel: 'Prescription'
  }),

  PRESCRIPTION_DISPENSED: (prescription) => ({
    type: 'prescription',
    title: 'Prescription Dispensed',
    message: `Your prescription ${prescription.prescriptionNumber} has been dispensed.`,
    relatedId: prescription._id,
    relatedModel: 'Prescription'
  }),

  // Payment notifications
  PAYMENT_INITIATED: (payment) => ({
    type: 'payment',
    title: 'Payment Request Sent',
    message: `M-Pesa payment request for KES ${payment.amount} has been sent to your phone.`,
    relatedId: payment._id,
    relatedModel: 'Payment'
  }),

  PAYMENT_SUCCESS: (payment) => ({
    type: 'payment',
    title: 'Payment Successful',
    message: `Your payment of KES ${payment.amount} has been received successfully.`,
    relatedId: payment._id,
    relatedModel: 'Payment'
  }),

  PAYMENT_FAILED: (payment) => ({
    type: 'payment',
    title: 'Payment Failed',
    message: `Your payment of KES ${payment.amount} could not be processed. Please try again.`,
    relatedId: payment._id,
    relatedModel: 'Payment',
    priority: 'high'
  }),

  // Medical record notifications
  MEDICAL_RECORD_FINALIZED: (record) => ({
    type: 'medical_record',
    title: 'Medical Record Finalized',
    message: 'Your medical record has been finalized and is now available for review.',
    relatedId: record._id,
    relatedModel: 'MedicalRecord'
  }),

  // Diagnosis notifications
  DIAGNOSIS_UPDATED: (record) => ({
    type: 'medical_record',
    title: 'Diagnosis Updated',
    message: 'Your doctor has updated your diagnosis. Please review the medical record.',
    relatedId: record._id,
    relatedModel: 'MedicalRecord',
    priority: 'high'
  })
}

/**
 * Send notification using template
 */
export const sendTemplatedNotification = async (userId, templateName, data) => {
  try {
    const templateFn = NOTIFICATION_TEMPLATES[templateName]

    if (!templateFn) {
      throw new Error(`Notification template '${templateName}' not found`)
    }

    const notificationData = templateFn(data)

    return await createNotification({
      userId,
      ...notificationData,
      sendEmail: true
    })
  } catch (error) {
    console.error('Send templated notification error:', error)
    throw error
  }
}

export default {
  createNotification,
  createBulkNotifications,
  notifyRole,
  sendTemplatedNotification,
  NOTIFICATION_TEMPLATES
}