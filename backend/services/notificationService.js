// utils/notificationService.js - ENHANCED VERSION
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import sendEmail from '../utils/sendEmail.js'
import { emitNotification } from '../socket.js'
import Prescription from '../models/Prescription.js'

/**
 * Centralized notification service with real-time Socket.IO integration
 */
class NotificationService {
  /**
   * Create and send notification with multi-channel support
   */
  static async send({
    userId,
    type,
    title,
    message,
    data = {},
    priority = 'normal',
    channels = ['in_app'],
    relatedId = null,
    relatedModel = null,
    actionUrl = null,
    actionLabel = null,
    expiresIn = null
  }) {
    try {
      // Validate user exists
      const user = await User.findById(userId).select('email phoneNumber firstName lastName')
      if (!user) {
        console.error(`User not found: ${userId}`)
        return null
      }

      // ✅ Validate notification type for user role
      if (!this.isValidTypeForRole(type, user.role)) {
        console.error(`Invalid notification type ${type} for role ${user.role}`)
        return null
      }

      // Create channel tracking array
      const channelTracking = channels.map(ch => ({
        type: ch,
        status: 'pending',
        sentAt: null,
        deliveredAt: null,
        error: null
      }))

      // ✅ Create in-app notification with proper channel tracking
      const notification = await Notification.create({
        user: userId,
        type,
        title,
        message,
        metadata: data,
        priority,
        channels: channelTracking,
        relatedId,
        relatedModel,
        actionUrl,
        actionLabel,
        deliveryStatus: 'pending',
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : null
      })

      // ✅ Process each delivery channel
      const deliveryPromises = []

      // 1. In-app notification (Socket.IO)
      if (channels.includes('in_app')) {
        deliveryPromises.push(
          this.sendSocketNotification(notification, user).catch(err => {
            console.error('Socket notification error:', err)
            return { channel: 'in_app', status: 'failed', error: err.message }
          })
        )
      }

      // 2. Email notification
      if (channels.includes('email') && user.email) {
        deliveryPromises.push(
          this.sendEmailNotification(user, notification).catch(err => {
            console.error('Email notification error:', err)
            return { channel: 'email', status: 'failed', error: err.message }
          })
        )
      }

      // 3. SMS notification
      if (channels.includes('sms') && user.phoneNumber) {
        deliveryPromises.push(
          this.sendSmsNotification(user, title, message).catch(err => {
            console.error('SMS notification error:', err)
            return { channel: 'sms', status: 'failed', error: err.message }
          })
        )
      }

      // ✅ Wait for all deliveries and update status
      const results = await Promise.allSettled(deliveryPromises)

      // Update channel statuses based on results
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          const { channel, status, error } = result.value
          const channelObj = notification.channels.find(ch => ch.type === channel)
          if (channelObj) {
            channelObj.status = status || 'sent'
            channelObj.sentAt = new Date()
            if (error) channelObj.error = error
          }
        }
      })

      // ✅ Update overall delivery status
      const allFailed = notification.channels.every(ch => ch.status === 'failed')
      const allSent = notification.channels.every(ch => ch.status === 'sent' || ch.status === 'delivered')

      notification.deliveryStatus = allFailed ? 'failed' : allSent ? 'sent' : 'pending'
      await notification.save()

      return notification
    } catch (error) {
      console.error('Notification service error:', error)
      throw error
    }
  }

  /**
   * ✅ NEW: Validate notification type for user role
   */
  static isValidTypeForRole(type, role) {
    const roleTypeMap = {
      patient: ['appointment', 'session', 'lab', 'prescription', 'payment', 'medical_record', 'reminder', 'alert'],
      doctor: ['appointment', 'session', 'lab', 'prescription', 'medical_record', 'reminder', 'alert'],
      lab_personnel: ['lab', 'system', 'alert'],
      pharmacy_staff: ['prescription', 'system', 'alert'],
      admin: ['system', 'alert', 'appointment', 'lab', 'prescription', 'payment', 'medical_record']
    }

    return roleTypeMap[role]?.includes(type) || false
  }

  /**
   * ✅ NEW: Send notification via Socket.IO
   */
  static async sendSocketNotification(notification, user) {
    try {
      emitNotification(user._id, notification)
      return { channel: 'in_app', status: 'sent' }
    } catch (error) {
      return { channel: 'in_app', status: 'failed', error: error.message }
    }
  }

  /**
   * Send notification to multiple users
   */
  static async sendToMultiple(userIds, notificationData) {
    const promises = userIds.map(userId =>
      this.send({ userId, ...notificationData })
    )
    const results = await Promise.allSettled(promises)

    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    return { total: userIds.length, successful, failed, results }
  }

  /**
   * Send notification to all users with specific role
   */
  static async sendToRole(role, notificationData) {
    try {
      const users = await User.find({ role, status: 'active' }).select('_id')
      return this.sendToMultiple(users.map(u => u._id), notificationData)
    } catch (error) {
      console.error('Send to role error:', error)
      throw error
    }
  }

  /**
   * Lab-specific notifications
   */
  static labNotifications = {
    // Lab request created
    requestCreated: async (labRequest, patient, doctor) => {
      const notifications = []

      // Notify patient
      notifications.push(
        NotificationService.send({
          userId: patient._id,
          type: 'lab',
          title: 'Lab Tests Requested',
          message: `Your doctor has requested ${labRequest.tests.length} lab test(s). Request #${labRequest.requestNumber}`,
          data: {
            labRequestId: labRequest._id,
            requestNumber: labRequest.requestNumber,
            testsCount: labRequest.tests.length,
            estimatedCost: labRequest.estimatedCost,
            priority: labRequest.priority
          },
          priority: labRequest.priority === 'emergency' ? 'urgent' : 'normal',
          channels: ['in_app', 'email', 'sms'],
          relatedId: labRequest._id,
          relatedModel: 'LabRequest',
          actionUrl: `/patient/lab-requests/${labRequest._id}`,
          actionLabel: 'View Lab Request'
        })
      )

      // ✅ NEW: Notify requesting doctor
      notifications.push(
        NotificationService.send({
          userId: doctor._id,
          type: 'lab',
          title: 'Lab Request Created',
          message: `Lab request #${labRequest.requestNumber} created for ${patient.firstName} ${patient.lastName}`,
          data: {
            labRequestId: labRequest._id,
            requestNumber: labRequest.requestNumber,
            patientName: `${patient.firstName} ${patient.lastName}`
          },
          priority: 'low',
          channels: ['in_app'],
          relatedId: labRequest._id,
          relatedModel: 'LabRequest',
          actionUrl: `/doctor/lab-requests/${labRequest._id}`,
          actionLabel: 'View Request'
        })
      )

      // Notify lab personnel if assigned
      if (labRequest.assignedTo) {
        notifications.push(
          NotificationService.send({
            userId: labRequest.assignedTo,
            type: 'lab',
            title: 'New Lab Request Assigned',
            message: `New ${labRequest.priority} priority lab request #${labRequest.requestNumber}`,
            data: {
              labRequestId: labRequest._id,
              requestNumber: labRequest.requestNumber,
              patientName: `${patient.firstName} ${patient.lastName}`
            },
            priority: labRequest.priority === 'emergency' ? 'urgent' : 'normal',
            channels: ['in_app', 'email'],
            relatedId: labRequest._id,
            relatedModel: 'LabRequest',
            actionUrl: `/lab/requests/${labRequest._id}`,
            actionLabel: 'Process Request'
          })
        )
      }

      return Promise.all(notifications)
    },

    // ✅ NEW: Lab payment confirmed
    paymentConfirmed: async (labRequest, patient) => {
      const notifications = []

      // Notify lab personnel to start processing
      if (labRequest.assignedTo) {
        notifications.push(
          NotificationService.send({
            userId: labRequest.assignedTo,
            type: 'lab',
            title: 'Lab Request Payment Confirmed',
            message: `Payment received for request #${labRequest.requestNumber}. Ready to process.`,
            data: {
              labRequestId: labRequest._id,
              requestNumber: labRequest.requestNumber,
              amount: labRequest.estimatedCost
            },
            priority: 'high',
            channels: ['in_app'],
            relatedId: labRequest._id,
            relatedModel: 'LabRequest',
            actionUrl: `/lab/requests/${labRequest._id}`,
            actionLabel: 'Start Processing'
          })
        )
      }

      // Confirm to patient
      notifications.push(
        NotificationService.send({
          userId: patient._id,
          type: 'payment',
          title: 'Lab Payment Confirmed',
          message: `Payment received for lab request #${labRequest.requestNumber}. Tests will be processed shortly.`,
          data: {
            labRequestId: labRequest._id,
            requestNumber: labRequest.requestNumber
          },
          priority: 'normal',
          channels: ['in_app', 'email'],
          relatedId: labRequest._id,
          relatedModel: 'LabRequest'
        })
      )

      return Promise.all(notifications)
    },

    // Lab request assigned
    requestAssigned: async (labRequest, labPersonnel, patient) => {
      const notifications = []

      // Notify lab personnel
      notifications.push(
        NotificationService.send({
          userId: labPersonnel._id,
          type: 'lab',
          title: 'Lab Request Assigned to You',
          message: `Lab request #${labRequest.requestNumber} has been assigned to you`,
          data: {
            labRequestId: labRequest._id,
            requestNumber: labRequest.requestNumber,
            priority: labRequest.priority
          },
          priority: 'normal',
          channels: ['in_app', 'email'],
          relatedId: labRequest._id,
          relatedModel: 'LabRequest',
          actionUrl: `/lab/requests/${labRequest._id}`,
          actionLabel: 'View Request'
        })
      )

      // Notify patient
      notifications.push(
        NotificationService.send({
          userId: patient._id,
          type: 'lab',
          title: 'Lab Tests Being Processed',
          message: `Your lab tests (Request #${labRequest.requestNumber}) are now being processed`,
          data: {
            labRequestId: labRequest._id,
            requestNumber: labRequest.requestNumber
          },
          priority: 'low',
          channels: ['in_app'],
          relatedId: labRequest._id,
          relatedModel: 'LabRequest'
        })
      )

      return Promise.all(notifications)
    },

    // Lab results uploaded
    resultsReady: async (labRequest, doctor, patient) => {
      const notifications = []
      const isCritical = labRequest.hasCriticalResults?.() || false

      // Notify doctor (HIGH PRIORITY)
      notifications.push(
        NotificationService.send({
          userId: doctor._id,
          type: 'lab',
          title: isCritical ? '🚨 CRITICAL Lab Results' : 'Lab Results Ready',
          message: `Lab results for request #${labRequest.requestNumber} are now available.${isCritical ? ' CRITICAL VALUES DETECTED - Immediate review required.' : ''}`,
          data: {
            labRequestId: labRequest._id,
            requestNumber: labRequest.requestNumber,
            critical: isCritical,
            patientName: `${patient.firstName} ${patient.lastName}`
          },
          priority: isCritical ? 'urgent' : 'high',
          channels: ['in_app', 'email'],
          relatedId: labRequest._id,
          relatedModel: 'LabRequest',
          actionUrl: `/doctor/lab-requests/${labRequest._id}`,
          actionLabel: 'Review Results'
        })
      )

      // ✅ NEW: Notify admin for critical results
      if (isCritical) {
        const admins = await User.find({ role: 'admin', status: 'active' })
        admins.forEach(admin => {
          notifications.push(
            NotificationService.send({
              userId: admin._id,
              type: 'alert',
              title: '⚠️ Critical Lab Result Alert',
              message: `Critical lab values detected for patient ${patient.firstName} ${patient.lastName}. Request #${labRequest.requestNumber}`,
              data: {
                labRequestId: labRequest._id,
                requestNumber: labRequest.requestNumber,
                patientId: patient._id,
                doctorId: doctor._id
              },
              priority: 'urgent',
              channels: ['in_app', 'email'],
              relatedId: labRequest._id,
              relatedModel: 'LabRequest'
            })
          )
        })
      }

      // Notify patient
      notifications.push(
        NotificationService.send({
          userId: patient._id,
          type: 'lab',
          title: 'Lab Results Available',
          message: `Your lab results for request #${labRequest.requestNumber} are ready. Please contact your doctor to discuss the results.`,
          data: {
            labRequestId: labRequest._id,
            requestNumber: labRequest.requestNumber
          },
          priority: 'normal',
          channels: ['in_app', 'email'],
          relatedId: labRequest._id,
          relatedModel: 'LabRequest',
          actionUrl: `/patient/lab-requests/${labRequest._id}`,
          actionLabel: 'View Results'
        })
      )

      return Promise.all(notifications)
    },

    // Lab attachment added
    attachmentAdded: async (labRequest, patient, fileName) => {
      return NotificationService.send({
        userId: patient._id,
        type: 'lab',
        title: 'New File Added',
        message: `A new file "${fileName}" has been added to your lab request #${labRequest.requestNumber}`,
        data: {
          labRequestId: labRequest._id,
          requestNumber: labRequest.requestNumber,
          fileName
        },
        priority: 'low',
        channels: ['in_app'],
        relatedId: labRequest._id,
        relatedModel: 'LabRequest'
      })
    }
  }

  /**
   * Pharmacy-specific notifications
   */
  static pharmacyNotifications = {
    // Prescription created
    prescriptionCreated: async (prescription, patient, doctor) => {
      const notifications = []

      // Notify patient
      notifications.push(
        NotificationService.send({
          userId: patient._id,
          type: 'prescription',
          title: 'New Prescription',
          message: `You have a new prescription from Dr. ${doctor.firstName} ${doctor.lastName}. Prescription #${prescription.prescriptionNumber}`,
          data: {
            prescriptionId: prescription._id,
            prescriptionNumber: prescription.prescriptionNumber,
            medicationsCount: prescription.medications.length
          },
          priority: 'normal',
          channels: ['in_app', 'email'],
          relatedId: prescription._id,
          relatedModel: 'Prescription',
          actionUrl: `/patient/prescriptions/${prescription._id}`,
          actionLabel: 'View Prescription'
        })
      )

      // ✅ NEW: Notify doctor (confirmation copy)
      notifications.push(
        NotificationService.send({
          userId: doctor._id,
          type: 'prescription',
          title: 'Prescription Created',
          message: `Prescription #${prescription.prescriptionNumber} created for ${patient.firstName} ${patient.lastName}`,
          data: {
            prescriptionId: prescription._id,
            prescriptionNumber: prescription.prescriptionNumber,
            patientName: `${patient.firstName} ${patient.lastName}`
          },
          priority: 'low',
          channels: ['in_app'],
          relatedId: prescription._id,
          relatedModel: 'Prescription'
        })
      )

      // Notify pharmacy staff (broadcast)
      const pharmacyStaff = await User.find({ role: 'pharmacy_staff', status: 'active' })
      pharmacyStaff.forEach(staff => {
        notifications.push(
          NotificationService.send({
            userId: staff._id,
            type: 'prescription',
            title: 'New Prescription',
            message: `New prescription #${prescription.prescriptionNumber} from Dr. ${doctor.firstName} ${doctor.lastName}`,
            data: {
              prescriptionId: prescription._id,
              prescriptionNumber: prescription.prescriptionNumber,
              patientName: `${patient.firstName} ${patient.lastName}`
            },
            priority: 'normal',
            channels: ['in_app'],
            relatedId: prescription._id,
            relatedModel: 'Prescription',
            actionUrl: `/pharmacy/prescriptions/${prescription._id}`,
            actionLabel: 'Process Prescription'
          })
        )
      })

      return Promise.all(notifications)
    },

    // ✅ NEW: Prescription payment confirmed
    paymentConfirmed: async (prescription, patient) => {
      const notifications = []

      // Notify pharmacy staff
      const pharmacyStaff = await User.find({ role: 'pharmacy_staff', status: 'active' })
      pharmacyStaff.forEach(staff => {
        notifications.push(
          NotificationService.send({
            userId: staff._id,
            type: 'prescription',
            title: 'Prescription Payment Confirmed',
            message: `Payment received for prescription #${prescription.prescriptionNumber}. Ready for dispensing.`,
            data: {
              prescriptionId: prescription._id,
              prescriptionNumber: prescription.prescriptionNumber,
              amount: prescription.actualCost
            },
            priority: 'high',
            channels: ['in_app'],
            relatedId: prescription._id,
            relatedModel: 'Prescription',
            actionUrl: `/pharmacy/prescriptions/${prescription._id}`,
            actionLabel: 'Dispense Medication'
          })
        )
      })

      // Confirm to patient
      notifications.push(
        NotificationService.send({
          userId: patient._id,
          type: 'payment',
          title: 'Prescription Payment Confirmed',
          message: `Payment received for prescription #${prescription.prescriptionNumber}. Your medication will be prepared shortly.`,
          data: {
            prescriptionId: prescription._id,
            prescriptionNumber: prescription.prescriptionNumber
          },
          priority: 'normal',
          channels: ['in_app', 'email'],
          relatedId: prescription._id,
          relatedModel: 'Prescription'
        })
      )

      return Promise.all(notifications)
    },

    // Prescription ready for pickup
    readyForPickup: async (prescription, patient) => {
      return NotificationService.send({
        userId: patient._id,
        type: 'prescription',
        title: 'Prescription Ready for Pickup',
        message: `Your prescription #${prescription.prescriptionNumber} is ready for pickup!${prescription.actualCost ? ` Total: KES ${prescription.actualCost}` : ''}`,
        data: {
          prescriptionId: prescription._id,
          prescriptionNumber: prescription.prescriptionNumber,
          cost: prescription.actualCost
        },
        priority: 'high',
        channels: ['in_app', 'email', 'sms'],
        relatedId: prescription._id,
        relatedModel: 'Prescription',
        actionUrl: `/patient/prescriptions/${prescription._id}`,
        actionLabel: 'View Details'
      })
    },

    // Prescription dispensed
    prescriptionDispensed: async (prescription, patient, doctor) => {
      const notifications = []

      // Notify patient
      notifications.push(
        NotificationService.send({
          userId: patient._id,
          type: 'prescription',
          title: 'Prescription Dispensed',
          message: `Your prescription #${prescription.prescriptionNumber} has been dispensed. Thank you!`,
          data: {
            prescriptionId: prescription._id,
            prescriptionNumber: prescription.prescriptionNumber
          },
          priority: 'low',
          channels: ['in_app'],
          relatedId: prescription._id,
          relatedModel: 'Prescription'
        })
      )

      // Notify doctor
      notifications.push(
        NotificationService.send({
          userId: doctor._id,
          type: 'prescription',
          title: 'Prescription Dispensed',
          message: `Prescription #${prescription.prescriptionNumber} for ${patient.firstName} ${patient.lastName} has been dispensed`,
          data: {
            prescriptionId: prescription._id,
            prescriptionNumber: prescription.prescriptionNumber,
            patientName: `${patient.firstName} ${patient.lastName}`
          },
          priority: 'low',
          channels: ['in_app'],
          relatedId: prescription._id,
          relatedModel: 'Prescription'
        })
      )

      return Promise.all(notifications)
    }
  }

  /**
   * Appointment-specific notifications
   */
  static appointmentNotifications = {
    // Appointment booked
    appointmentBooked: async (appointment, patient, doctor) => {
      const notifications = []

      // Notify patient
      notifications.push(
        NotificationService.send({
          userId: patient._id,
          type: 'appointment',
          title: 'Appointment Booked',
          message: `Your appointment with Dr. ${doctor.firstName} ${doctor.lastName} has been booked for ${new Date(appointment.start).toLocaleDateString()}`,
          data: {
            appointmentId: appointment._id,
            doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
            date: appointment.start
          },
          priority: 'normal',
          channels: ['in_app', 'email', 'sms'],
          relatedId: appointment._id,
          relatedModel: 'Appointment',
          actionUrl: `/patient/appointments/${appointment._id}`,
          actionLabel: 'View Appointment'
        })
      )

      // Notify doctor
      notifications.push(
        NotificationService.send({
          userId: doctor._id,
          type: 'appointment',
          title: 'New Appointment',
          message: `New appointment with ${patient.firstName} ${patient.lastName} on ${new Date(appointment.start).toLocaleDateString()}`,
          data: {
            appointmentId: appointment._id,
            patientName: `${patient.firstName} ${patient.lastName}`,
            date: appointment.start
          },
          priority: 'normal',
          channels: ['in_app', 'email'],
          relatedId: appointment._id,
          relatedModel: 'Appointment',
          actionUrl: `/doctor/appointments/${appointment._id}`,
          actionLabel: 'View Appointment'
        })
      )

      return Promise.all(notifications)
    },

    // ✅ NEW: Appointment approved
    appointmentApproved: async (appointment, patient, doctor) => {
      return NotificationService.send({
        userId: patient._id,
        type: 'appointment',
        title: 'Appointment Approved',
        message: `Your appointment with Dr. ${doctor.firstName} ${doctor.lastName} on ${new Date(appointment.start).toLocaleDateString()} has been approved.`,
        data: {
          appointmentId: appointment._id,
          doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
          date: appointment.start
        },
        priority: 'high',
        channels: ['in_app', 'email', 'sms'],
        relatedId: appointment._id,
        relatedModel: 'Appointment',
        actionUrl: `/patient/appointments/${appointment._id}`,
        actionLabel: 'View Details'
      })
    },

    // ✅ NEW: Appointment rejected
    appointmentRejected: async (appointment, patient, reason) => {
      return NotificationService.send({
        userId: patient._id,
        type: 'appointment',
        title: 'Appointment Declined',
        message: `Your appointment request has been declined. Reason: ${reason || 'Not specified'}`,
        data: {
          appointmentId: appointment._id,
          reason
        },
        priority: 'high',
        channels: ['in_app', 'email'],
        relatedId: appointment._id,
        relatedModel: 'Appointment'
      })
    },

    // ✅ NEW: Appointment reminder (24h before)
    appointmentReminder: async (appointment, patient, doctor) => {
      return NotificationService.send({
        userId: patient._id,
        type: 'reminder',
        title: 'Appointment Reminder',
        message: `Reminder: You have an appointment with Dr. ${doctor.firstName} ${doctor.lastName} tomorrow at ${new Date(appointment.start).toLocaleTimeString()}.`,
        data: {
          appointmentId: appointment._id,
          doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
          date: appointment.start
        },
        priority: 'high',
        channels: ['in_app', 'email', 'sms'],
        relatedId: appointment._id,
        relatedModel: 'Appointment',
        actionUrl: `/patient/appointments/${appointment._id}`,
        actionLabel: 'View Details'
      })
    }
  }

  /**
   * Session-specific notifications
   */
  static sessionNotifications = {
    // Session started
    sessionStarted: async (session, patient, doctor) => {
      return NotificationService.send({
        userId: patient._id,
        type: 'session',
        title: 'Session Started',
        message: `Your appointment with Dr. ${doctor.firstName} ${doctor.lastName} has started.`,
        data: {
          sessionId: session._id,
          appointmentId: session.appointment
        },
        priority: 'high',
        channels: ['in_app'],
        relatedId: session._id,
        relatedModel: 'Session'
      })
    },

    // Session completed
    sessionCompleted: async (session, patient, doctor) => {
      const notifications = []

      // Notify patient
      notifications.push(
        NotificationService.send({
          userId: patient._id,
          type: 'session',
          title: 'Session Completed',
          message: 'Your appointment session has been completed. Medical record is being finalized.',
          data: {
            sessionId: session._id,
            appointmentId: session.appointment
          },
          priority: 'normal',
          channels: ['in_app', 'email'],
          relatedId: session._id,
          relatedModel: 'Session'
        })
      )

      // ✅ NEW: Notify doctor (confirmation)
      notifications.push(
        NotificationService.send({
          userId: doctor._id,
          type: 'session',
          title: 'Session Completed',
          message: `Session for patient ${patient.firstName} ${patient.lastName} has been completed.`,
          data: {
            sessionId: session._id,
            appointmentId: session.appointment,
            patientName: `${patient.firstName} ${patient.lastName}`
          },
          priority: 'low',
          channels: ['in_app'],
          relatedId: session._id,
          relatedModel: 'Session'
        })
      )

      return Promise.all(notifications)
    },

    // ✅ NEW: Medical record finalized
    medicalRecordFinalized: async (record, patient, doctor) => {
      const notifications = []

      // Notify patient
      notifications.push(
        NotificationService.send({
          userId: patient._id,
          type: 'medical_record',
          title: 'Medical Record Available',
          message: 'Your medical record has been finalized and is now available for review.',
          data: {
            recordId: record._id
          },
          priority: 'normal',
          channels: ['in_app', 'email'],
          relatedId: record._id,
          relatedModel: 'MedicalRecord',
          actionUrl: `/patient/medical-records/${record._id}`,
          actionLabel: 'View Record'
        })
      )

      // Notify doctor (confirmation)
      notifications.push(
        NotificationService.send({
          userId: doctor._id,
          type: 'medical_record',
          title: 'Medical Record Finalized',
          message: `Medical record for ${patient.firstName} ${patient.lastName} has been finalized.`,
          data: {
            recordId: record._id,
            patientName: `${patient.firstName} ${patient.lastName}`
          },
          priority: 'low',
          channels: ['in_app'],
          relatedId: record._id,
          relatedModel: 'MedicalRecord'
        })
      )

      return Promise.all(notifications)
    }
  }

  /**
   * Payment notifications
   */
  static paymentNotifications = {
    // Payment requested
    paymentRequested: async (userId, amount, description, referenceId, relatedModel) => {
      return NotificationService.send({
        userId,
        type: 'payment',
        title: 'Payment Requested',
        message: `A payment of KES ${amount} is requested for ${description}`,
        data: {
          amount,
          description,
          referenceId
        },
        priority: 'high',
        channels: ['in_app', 'email'],
        relatedId: referenceId,
        relatedModel: relatedModel,
        actionUrl: `/patient/payments/${referenceId}`,
        actionLabel: 'Make Payment'
      })
    },

    // Payment received
    paymentReceived: async (userId, amount, description, referenceId, relatedModel) => {
      return NotificationService.send({
        userId,
        type: 'payment',
        title: 'Payment Received',
        message: `Your payment of KES ${amount} for ${description} has been received. Thank you!`,
        data: {
          amount,
          description,
          referenceId
        },
        priority: 'normal',
        channels: ['in_app', 'email'],
        relatedId: referenceId,
        relatedModel: relatedModel
      })
    }
  }

  /**
   * Prescription expiry notifications
   */
  static async checkAndNotifyExpiringPrescriptions() {
    try {
      const now = new Date()
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

      // Find prescriptions expiring in 3 days
      const expiringPrescriptions = await Prescription.find({
        validUntil: { $gte: now, $lte: threeDaysFromNow },
        status: { $in: ['new', 'availability_confirmed', 'ready_for_pickup'] }
      })
        .populate('patient', 'firstName lastName email')
        .populate('doctor', 'firstName lastName')

      const notifications = expiringPrescriptions.map(prescription => {
        const daysLeft = Math.ceil(
          (prescription.validUntil - now) / (1000 * 60 * 60 * 24)
        )

        return this.send({
          userId: prescription.patient._id,
          type: 'prescription',
          title: 'Prescription Expiring Soon',
          message: `Your prescription #${prescription.prescriptionNumber} will expire in ${daysLeft} day(s). Please collect it soon.`,
          data: {
            prescriptionId: prescription._id,
            prescriptionNumber: prescription.prescriptionNumber,
            daysLeft
          },
          priority: 'high',
          channels: ['in_app', 'email', 'sms'],
          relatedId: prescription._id,
          relatedModel: 'Prescription',
          actionUrl: `/patient/prescriptions/${prescription._id}`,
          actionLabel: 'View Prescription'
        })
      })

      const results = await Promise.allSettled(notifications)
      console.log(`✅ Sent ${results.filter(r => r.status === 'fulfilled').length} expiry notifications`)
      return results
    } catch (error) {
      console.error('Expiring prescription check error:', error)
      throw error
    }
  }

  /**
   * Send email notification with enhanced templates
   */
  static async sendEmailNotification(user, notification) {
    const emailTemplates = {
      lab: () => `
        <h2>Lab Notification</h2>
        <p>Hello ${user.firstName},</p>
        <p>${notification.message}</p>
        ${notification.actionUrl ? `<p><a href="${process.env.CLIENT_URL}${notification.actionUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">${notification.actionLabel || 'View Details'}</a></p>` : ''}
      `,
      prescription: () => `
        <h2>Prescription Notification</h2>
        <p>Hello ${user.firstName},</p>
        <p>${notification.message}</p>
        ${notification.actionUrl ? `<p><a href="${process.env.CLIENT_URL}${notification.actionUrl}" style="display: inline-block; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;">${notification.actionLabel || 'View Details'}</a></p>` : ''}
      `,
      appointment: () => `
        <h2>Appointment Notification</h2>
        <p>Hello ${user.firstName},</p>
        <p>${notification.message}</p>
        ${notification.actionUrl ? `<p><a href="${process.env.CLIENT_URL}${notification.actionUrl}" style="display: inline-block; padding: 10px 20px; background-color: #17a2b8; color: white; text-decoration: none; border-radius: 5px;">${notification.actionLabel || 'View Details'}</a></p>` : ''}
      `,
      payment: () => `
        <h2>Payment Notification</h2>
        <p>Hello ${user.firstName},</p>
        <p>${notification.message}</p>
        ${notification.actionUrl ? `<p><a href="${process.env.CLIENT_URL}${notification.actionUrl}" style="display: inline-block; padding: 10px 20px; background-color: #ffc107; color: black; text-decoration: none; border-radius: 5px;">${notification.actionLabel || 'View Details'}</a></p>` : ''}
      `,
      default: () => `
        <h2>${notification.title}</h2>
        <p>Hello ${user.firstName},</p>
        <p>${notification.message}</p>
        ${notification.actionUrl ? `<p><a href="${process.env.CLIENT_URL}${notification.actionUrl}" style="display: inline-block; padding: 10px 20px; background-color: #6c757d; color: white; text-decoration: none; border-radius: 5px;">${notification.actionLabel || 'View Details'}</a></p>` : ''}
      `
    }

    const template = emailTemplates[notification.type] || emailTemplates.default

    await sendEmail({
      to: user.email,
      subject: notification.title,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          ${template()}
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            This is an automated notification from MediBook Healthcare System. Please do not reply to this email.
          </p>
        </div>
      `
    })

    return { channel: 'email', status: 'sent' }
  }

  /**
   * Send SMS notification (placeholder)
   */
  static async sendSmsNotification(user, title, message) {
    // TODO: Implement SMS service integration (Twilio, Africa's Talking, etc.)
    console.log(`📱 SMS to ${user.phoneNumber}: ${title} - ${message}`)
    return { channel: 'sms', status: 'sent' }
  }
}

export default NotificationService