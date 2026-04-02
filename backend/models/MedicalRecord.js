// models/MedicalRecord.js
import mongoose from 'mongoose'

// ─── Resolved Lab Result Sub-Schema ─────────────────────────────────────────
// When finalizeMedicalRecord runs it SNAPSHOTS all completed lab results here.
// This makes the medical record fully self-contained: even if the LabRequest
// document is later archived, the patient's record always shows the results.
// Patients read results ONLY from here — never directly from LabRequest.
const resolvedLabResultSchema = new mongoose.Schema(
  {
    testName:       { type: String, required: true },
    testCode:       { type: String, default: '' },
    result:         { type: String, default: 'Pending' },
    unit:           { type: String, default: '' },
    referenceRange: { type: String, default: '' },
    // normal | abnormal | critical
    status: {
      type: String,
      enum: ['normal', 'abnormal', 'critical', 'pending', 'inconclusive'],
      default: 'pending'
    },
    uploadedAt:   { type: Date, default: null },
    labPersonnel: { type: String, default: '' }     // display name of technician
  },
  { _id: true }
)

// ─── Medical Record Schema ───────────────────────────────────────────────────
const medicalRecordSchema = new mongoose.Schema(
  {
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true
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

    // ── Clinical Data ────────────────────────────────────────────────────
    diagnosis: {
      type: String,
      required: [true, 'Diagnosis is required']
    },
    symptoms:  [String],

    // ── Legacy inline prescription subdocs (kept for backwards compat) ───
    // New records use the Prescription collection + prescriptions[] ref below.
    prescription: [
      {
        medication:   { type: String, required: true },
        dosage:       String,
        frequency:    String,
        duration:     String,
        instructions: String
      }
    ],

    // ── ✅ FIX: ObjectId refs to Prescription documents ──────────────────
    // Populated by finalizeMedicalRecord() after Prescription.create().
    // Use this array (not the inline `prescription` subdocs above) for any
    // logic that needs the full Prescription document (pharmacy workflow,
    // status tracking, dispensing, etc.).
    prescriptions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Prescription'
      }
    ],

    // ── Legacy inline lab tests field (kept for backwards compat) ────────
    // New records will use labRequests[] + resolvedLabResults[] instead.
    labTests: [
      {
        testName: String,
        result:   String,
        date:     Date
      }
    ],

    // ── ✅ NEW: References to LabRequest documents ordered during this visit
    //    These are linked when the doctor creates a lab request with sessionId/
    //    appointmentId.  finalizeMedicalRecord reads these to snapshot results.
    labRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabRequest'
      }
    ],

    // ── ✅ NEW: Snapshotted lab results embedded at finalization time ─────
    //    Populated by finalizeMedicalRecord().
    //    Patients see lab data ONLY through this array — not through labRoutes.
    resolvedLabResults: [resolvedLabResultSchema],

    // ── Vital Signs ──────────────────────────────────────────────────────
    vitalSigns: {
      bloodPressure:    String,
      heartRate:        Number,
      temperature:      Number,
      weight:           Number,
      height:           Number,
      // These two fields are captured in Session.vitalSigns and displayed in
      // FinalizeRecordModal, but were missing here — so they were silently
      // dropped when completeSession copied session.vitalSigns → MedicalRecord.
      respiratoryRate:  Number,
      oxygenSaturation: Number
    },

    notes: String,

    // ── Follow-up ────────────────────────────────────────────────────────
    followUpRequired: { type: Boolean, default: false },
    followUpDate:     Date,

    // ── Attachments ──────────────────────────────────────────────────────
    attachments: [
      {
        fileName:   String,
        fileUrl:    String,
        fileType:   String,
        uploadedAt: { type: Date, default: Date.now }
      }
    ],

    // ── Status ───────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['draft', 'finalized'],
      default: 'draft'
    },
    finalizedAt:    Date,
    clinicalSummary: String,
    treatmentPlan:   String,
    dischargeNotes:  String,

    // ── ✅ NEW: Link to the Bill generated for this consultation ─────────
    //    Set by finalizeMedicalRecord() so the patient can navigate from
    //    their medical record directly to the corresponding bill.
    bill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bill',
      default: null
    }
  },
  {
    timestamps: true
  }
)

// ─── Indexes ─────────────────────────────────────────────────────────────────
medicalRecordSchema.index({ patient: 1, createdAt: -1 })
medicalRecordSchema.index({ doctor:  1, createdAt: -1 })
medicalRecordSchema.index({ status:  1, patient: 1 })

const MedicalRecord = mongoose.model('MedicalRecord', medicalRecordSchema)

export default MedicalRecord