import mongoose from 'mongoose'

const sessionSchema = new mongoose.Schema({
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true,
    unique: true
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Session content
  complaints: {
    type: String,
    trim: true
  },
  clinicalObservations: {
    type: String,
    trim: true
  },
  provisionalDiagnosis: {
    type: String,
    trim: true
  },

  // Vital signs
  vitalSigns: {
    bloodPressure: String,
    heartRate: Number,
    temperature: Number,
    weight: Number,
    height: Number,
    respiratoryRate: Number,
    oxygenSaturation: Number
  },

  // Session metadata
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'cancelled'],
    default: 'in_progress'
  },

  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: Date,

  // References to related records
  labRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabRequest'
  }],
  medicalRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicalRecord'
  },
  prescriptions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prescription'
  }],

  // Session notes
  sessionNotes: String,

  // Timestamps for audit
  lastSaved: Date,

  // ─── Doctor Presence Tracking ────────────────────────────────────────────────
  // These three fields enable "session persistence":
  //   • The session lives for the full appointment window, surviving disconnects.
  //   • autoCloseSession only fires after the doctor has been ABSENT for the
  //     full PRESENCE_GRACE_PERIOD (15 min), not merely because end time passed.
  //   • Only an explicit PATCH /sessions/:id/complete ends the session.

  /**
   * True while the doctor's socket is connected to this session's room.
   * Toggled by socket connect/disconnect handlers in socket.js.
   */
  doctorPresent: {
    type: Boolean,
    default: false
  },

  /**
   * Wall-clock time of the doctor's last heartbeat, autosave, or socket
   * reconnect. The auto-close scheduler uses this to decide whether the
   * doctor has genuinely abandoned the session.
   */
  lastDoctorActivity: {
    type: Date
  },

  /**
   * Running count of how many times the doctor has reconnected.
   * Purely for audit / debugging; not used in business logic.
   */
  reconnectCount: {
    type: Number,
    default: 0
  }
  // ─────────────────────────────────────────────────────────────────────────────

}, {
  timestamps: true
})

// ── Indexes ──────────────────────────────────────────────────────────────────
sessionSchema.index({ doctor: 1, status: 1 })
sessionSchema.index({ patient: 1 })
sessionSchema.index({ createdAt: -1 })
// Critical: powers getActiveDoctorSession (modal-restore query on page load)
sessionSchema.index({ doctor: 1, status: 1, lastDoctorActivity: -1 })
// ─────────────────────────────────────────────────────────────────────────────

// Virtual: session duration in minutes
sessionSchema.virtual('duration').get(function () {
  if (!this.endTime) return null
  return Math.round((this.endTime - this.startTime) / 60000)
})

/** Returns true when the session is still running. */
sessionSchema.methods.isActive = function () {
  return this.status === 'in_progress'
}

/**
 * Legitimate session termination — called ONLY by the doctor via
 * PATCH /sessions/:id/complete. Never called by the cleanup scheduler.
 */
sessionSchema.methods.complete = async function () {
  this.status = 'completed'
  this.endTime = new Date()
  this.doctorPresent = false
  return this.save()
}

/**
 * Stamp presence — called on every socket heartbeat and autosave so the
 * auto-close scheduler knows the doctor is still active.
 */
sessionSchema.methods.recordDoctorActivity = async function () {
  this.lastDoctorActivity = new Date()
  this.doctorPresent = true
  return this.save()
}

const Session = mongoose.model('Session', sessionSchema)
export default Session