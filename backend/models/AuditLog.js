// models/AuditLog.js
import mongoose from 'mongoose'

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      // User actions
      'user_created', 'user_updated', 'user_deleted', 'user_status_changed',
      'password_reset', 'login', 'logout',

      // Appointment actions
      'appointment_created', 'appointments_retrieved', 'appointment_updated', 'appointment_cancelled',
      'appointment_rescheduled', 'appointment_completed',

      // Session actions
      'session_started', 'session_updated', 'session_completed',

      // Medical record actions
      'medical_record_created', 'medical_record_updated', 'medical_record_finalized',
      'attachment_uploaded', 'attachment_deleted',

      // Lab actions
      'lab_request_created', 'lab_request_assigned', 'lab_status_updated',
      'lab_results_uploaded', 'lab_request_rejected',

      // Prescription actions
      'prescription_created', 'prescription_confirmed', 'prescription_ready',
      'prescription_dispensed', 'prescription_cancelled',

      // Payment actions
      'payment_initiated', 'payment_completed', 'payment_failed',

      // System actions
      'setting_updated', 'notification_sent', 'email_sent', 'setting_updated',
      'notification_sent',

      // Notification lifecycle
      'notifications_retrieved',
      'notification_read',
      'notification_deleted',

      'email_sent'
    ]
  },
  resourceType: {
    type: String,
    enum: [
      'User', 'Appointment', 'Session', 'MedicalRecord', 'LabRequest',
      'Prescription', 'Payment', 'Notification', 'Setting'
    ]
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: String,
  userAgent: String,
  status: {
    type: String,
    enum: ['success', 'failure', 'pending'],
    default: 'success'
  },
  errorMessage: String
}, {
  timestamps: true
})

// Indexes for efficient queries
auditLogSchema.index({ user: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })
auditLogSchema.index({ resourceType: 1, resourceId: 1 })
auditLogSchema.index({ createdAt: -1 })

const AuditLog = mongoose.model('AuditLog', auditLogSchema)

export default AuditLog