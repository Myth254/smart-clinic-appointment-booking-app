/* eslint-disable no-unused-vars */
// controllers/medicalRecordController.js
import MedicalRecord from '../models/MedicalRecord.js'
import Appointment from '../models/Appointment.js'
import Patient from '../models/Patient.js'
import Doctor from '../models/Doctor.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import mongoose from 'mongoose'
import NotificationService from '../services/notificationService.js'
import Prescription from '../models/Prescription.js'
import LabRequest from '../models/LabRequest.js'
import Bill from '../models/Bill.js'
import BillCalculator from '../services/billing/BillCalculator.js'
import logAudit from '../utils/auditLogger.js'

const FOLLOW_UP_REMINDER_KIND = 'follow_up_required'

const syncAppointmentFollowUpState = async ({
  appointmentId,
  patientId,
  followUpRequired,
  followUpDate,
  followUpReason,
  followUpNotes
}) => {
  const appointment = await Appointment.findByIdAndUpdate(
    appointmentId,
    {
      $set: {
        isFollowUpRequired: Boolean(followUpRequired),
        followUpDate: followUpRequired ? (followUpDate || null) : null,
        followUpReason: followUpRequired ? (followUpReason || '') : '',
        followUpNotes: followUpRequired ? (followUpNotes || '') : ''
      }
    },
    { new: true }
  )

  if (!appointment) {
    return null
  }

  await Notification.updateMany(
    {
      user: patientId,
      type: 'reminder',
      relatedId: appointment._id,
      relatedModel: 'Appointment',
      status: 'active',
      'metadata.reminderKind': FOLLOW_UP_REMINDER_KIND
    },
    {
      status: 'resolved',
      resolvedAt: new Date()
    }
  )

  if (followUpRequired) {
    await Notification.findOneAndUpdate(
      {
        user: patientId,
        type: 'reminder',
        relatedId: appointment._id,
        relatedModel: 'Appointment',
        status: 'active',
        'metadata.reminderKind': FOLLOW_UP_REMINDER_KIND
      },
      {
        $set: {
          title: 'Follow-Up Appointment Required',
          message: followUpDate
            ? `Your doctor recommended a follow-up appointment by ${new Date(followUpDate).toLocaleDateString()}.`
            : 'Your doctor recommended a follow-up appointment. Please book it when you can.',
          priority: 'high',
          read: false,
          readAt: null,
          status: 'active',
          metadata: {
            reminderKind: FOLLOW_UP_REMINDER_KIND,
            appointmentId,
            followUpDate: followUpDate || null,
            followUpReason: followUpReason || '',
            followUpNotes: followUpNotes || ''
          }
        },
        $setOnInsert: {
          user: patientId,
          type: 'reminder',
          relatedId: appointment._id,
          relatedModel: 'Appointment'
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    )
  }

  return appointment
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create medical record
// @route   POST /api/medical-records
// @access  Private (Doctor only)
// ─────────────────────────────────────────────────────────────────────────────
export const createRecord = async (req, res) => {
  try {
    const doctorId = req.user.id
    const {
      appointmentId,
      diagnosis,
      symptoms,
      prescription,
      labTests,
      vitalSigns,
      notes,
      followUpRequired,
      followUpDate
    } = req.body

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment ID' })
    }

    const appointment = await Appointment.findById(appointmentId)
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' })
    }

    if (appointment.doctor.toString() !== doctorId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create medical record for this appointment'
      })
    }

    const patientExists = await User.findById(appointment.patient)
    if (!patientExists) {
      return res.status(404).json({ success: false, message: 'Patient user not found' })
    }

    const existingRecord = await MedicalRecord.findOne({ appointment: appointmentId })
    if (existingRecord) {
      return res.status(400).json({
        success: false,
        message: 'Medical record already exists for this appointment. Use update endpoint instead.'
      })
    }

    const medicalRecord = await MedicalRecord.create({
      appointment: appointmentId,
      patient: appointment.patient,
      doctor: doctorId,
      diagnosis,
      symptoms,
      prescription,
      labTests,
      vitalSigns,
      notes,
      followUpRequired: followUpRequired || false,
      followUpDate
    })

    await Appointment.findByIdAndUpdate(appointmentId, { status: 'completed' })
    await syncAppointmentFollowUpState({
      appointmentId,
      patientId: appointment.patient,
      followUpRequired,
      followUpDate,
      followUpReason: diagnosis,
      followUpNotes: notes
    })

    if (diagnosis) {
      await Patient.findOneAndUpdate(
        { userId: appointment.patient },
        {
          $push: {
            medicalHistory: {
              condition: diagnosis,
              diagnosedDate: new Date(),
              status: 'active',
              notes: notes
            }
          }
        }
      )
    }

    // ✅ FIX: 'appointment' is a valid type; 'in_app' is a valid channel value (string, not object)
    await Notification.create({
      user: appointment.patient,
      type: 'appointment',
      title: 'Medical Record Created',
      message: 'Your doctor has created a medical record for your appointment.',
      data: { appointmentId, medicalRecordId: medicalRecord._id }
    })

    const populatedRecord = await MedicalRecord.findById(medicalRecord._id)
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName specialization')
      .populate('appointment')
      .populate('prescriptions')

    await logAudit({
      userId: doctorId,
      action: 'MEDICAL_RECORD_CREATED',
      resourceType: 'MedicalRecord',
      resourceId: medicalRecord._id,
      details: {
        patientId: appointment.patient,
        appointmentId,
        diagnosis,
        hasPrescription: prescription && prescription.length > 0
      },
      req,
      status: 'success'
    })

    res.status(201).json({
      success: true,
      message: 'Medical record created successfully',
      data: populatedRecord
    })
  } catch (error) {
    console.error('❌ Error in createRecord:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get medical record by ID
// @route   GET /api/medical-records/:recordId
// @access  Private (Doctor or Patient - own records only)
// ─────────────────────────────────────────────────────────────────────────────
export const getRecordById = async (req, res) => {
  try {
    const userId   = req.user.id
    const userRole = req.user.role
    const { recordId } = req.params

    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' })
    }

    const medicalRecord = await MedicalRecord.findById(recordId)
      .populate({ path: 'patient', select: 'firstName lastName email phoneNumber' })
      .populate({ path: 'doctor',  select: 'firstName lastName email phoneNumber' })
      .populate('appointment')
      .populate('bill')
      .populate('prescriptions')

    if (!medicalRecord) {
      return res.status(404).json({ success: false, message: 'Medical record not found' })
    }

    if (userRole === 'doctor') {
      if (medicalRecord.doctor._id.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this medical record' })
      }
    } else if (userRole === 'patient') {
      if (medicalRecord.patient._id.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this medical record' })
      }
    } else if (userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to view medical records' })
    }

    await logAudit({
      userId,
      action: 'MEDICAL_RECORD_ACCESSED',
      resourceType: 'MedicalRecord',
      resourceId: recordId,
      details: { patientId: medicalRecord.patient, accessedBy: userRole },
      req,
      status: 'success'
    })

    res.status(200).json({ success: true, data: medicalRecord })
  } catch (error) {
    console.error('❌ Error in getRecordById:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all medical records for a patient
// @route   GET /api/medical-records/patient/:patientId
// @access  Private (Doctor, Admin, or Patient - own records)
// ─────────────────────────────────────────────────────────────────────────────
export const getPatientRecords = async (req, res) => {
  try {
    const userId   = req.user.id
    const userRole = req.user.role
    const { patientId } = req.params

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ success: false, message: 'Invalid patient ID' })
    }

    if (userRole === 'patient' && patientId !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to view these medical records' })
    }

    const medicalRecords = await MedicalRecord.find({ patient: patientId })
      .populate({ path: 'doctor', select: 'firstName lastName specialization' })
      .populate('appointment')
      .populate('prescriptions')
      .sort({ createdAt: -1 })

    res.status(200).json({ success: true, count: medicalRecords.length, data: medicalRecords })
  } catch (error) {
    console.error('❌ Error in getPatientRecords:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all medical records created by a doctor
// @route   GET /api/medical-records/doctor/:doctorId
// @access  Private (Doctor - own records, Admin)
// ─────────────────────────────────────────────────────────────────────────────
export const getDoctorRecords = async (req, res) => {
  try {
    const userId   = req.user.id
    const userRole = req.user.role
    const { doctorId } = req.params

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, message: 'Invalid doctor ID' })
    }

    if (userRole === 'doctor' && doctorId !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to view these medical records' })
    }

    if (userRole === 'patient') {
      return res.status(403).json({ success: false, message: 'Patients cannot view doctor\'s medical records' })
    }

    const medicalRecords = await MedicalRecord.find({ doctor: doctorId })
      .populate({ path: 'patient', select: 'firstName lastName' })
      .populate('appointment')
      .populate('prescriptions')
      .sort({ createdAt: -1 })

    res.status(200).json({ success: true, count: medicalRecords.length, data: medicalRecords })
  } catch (error) {
    console.error('❌ Error in getDoctorRecords:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update medical record (draft only)
// @route   PUT /api/medical-records/:recordId
// @access  Private (Doctor only - own records)
// ─────────────────────────────────────────────────────────────────────────────
export const updateRecord = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { recordId } = req.params
    const {
      diagnosis, symptoms, prescription, labTests,
      vitalSigns, notes, followUpRequired, followUpDate
    } = req.body

    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' })
    }

    const medicalRecord = await MedicalRecord.findById(recordId)
    if (!medicalRecord) {
      return res.status(404).json({ success: false, message: 'Medical record not found' })
    }

    if (medicalRecord.doctor.toString() !== doctorId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this medical record' })
    }

    const updates = {}
    if (diagnosis        !== undefined) updates.diagnosis        = diagnosis
    if (symptoms         !== undefined) updates.symptoms         = symptoms
    if (prescription     !== undefined) updates.prescription     = prescription
    if (labTests         !== undefined) updates.labTests         = labTests
    if (vitalSigns       !== undefined) updates.vitalSigns       = vitalSigns
    if (notes            !== undefined) updates.notes            = notes
    if (followUpRequired !== undefined) updates.followUpRequired = followUpRequired
    if (followUpDate     !== undefined) updates.followUpDate     = followUpDate

    const updatedRecord = await MedicalRecord.findByIdAndUpdate(recordId, updates, {
      new: true,
      runValidators: true
    })
      .populate('patient', 'firstName lastName')
      .populate('doctor',  'firstName lastName specialization')
      .populate('appointment')
      .populate('prescriptions')

    if (diagnosis && diagnosis !== medicalRecord.diagnosis) {
      await Patient.findOneAndUpdate(
        { userId: medicalRecord.patient },
        { $push: { medicalHistory: { condition: diagnosis, diagnosedDate: new Date(), status: 'active', notes } } }
      )
    }

    if (followUpRequired !== undefined || followUpDate !== undefined || diagnosis !== undefined || notes !== undefined) {
      await syncAppointmentFollowUpState({
        appointmentId: medicalRecord.appointment,
        patientId: medicalRecord.patient,
        followUpRequired: updatedRecord.followUpRequired,
        followUpDate: updatedRecord.followUpDate,
        followUpReason: updatedRecord.diagnosis,
        followUpNotes: updatedRecord.notes
      })
    }

    // ✅ FIX: use valid type 'appointment' (not an enum that doesn't exist)
    await Notification.create({
      user: medicalRecord.patient,
      type: 'appointment',
      title: 'Medical Record Updated',
      message: 'Your medical record has been updated by your doctor.',
      data: { medicalRecordId: recordId }
    })

    await logAudit({
      userId: doctorId,
      action: 'MEDICAL_RECORD_UPDATED',
      resourceType: 'MedicalRecord',
      resourceId: recordId,
      details: { patientId: medicalRecord.patient, updatedFields: Object.keys(updates) },
      req,
      status: 'success'
    })

    res.status(200).json({ success: true, message: 'Medical record updated successfully', data: updatedRecord })
  } catch (error) {
    console.error('❌ Error in updateRecord:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Upload attachment to medical record
// @route   POST /api/medical-records/:recordId/attachments
// @access  Private (Doctor only - own records)
// ─────────────────────────────────────────────────────────────────────────────
export const uploadAttachment = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { recordId } = req.params
    const { fileName, fileUrl, fileType } = req.body

    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' })
    }

    if (!fileName || !fileUrl || !fileType) {
      return res.status(400).json({ success: false, message: 'fileName, fileUrl, and fileType are required' })
    }

    const medicalRecord = await MedicalRecord.findById(recordId)
    if (!medicalRecord) {
      return res.status(404).json({ success: false, message: 'Medical record not found' })
    }

    if (medicalRecord.doctor.toString() !== doctorId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to upload attachments to this medical record' })
    }

    const updatedRecord = await MedicalRecord.findByIdAndUpdate(
      recordId,
      { $push: { attachments: { fileName, fileUrl, fileType, uploadedAt: new Date() } } },
      { new: true, runValidators: true }
    )
      .populate('patient', 'firstName lastName')
      .populate('doctor',  'firstName lastName specialization')

    await Notification.create({
      user: medicalRecord.patient,
      type: 'appointment',
      title: 'New Attachment Added',
      message: `A new file "${fileName}" has been added to your medical record.`,
      data: { medicalRecordId: recordId }
    })

    res.status(200).json({ success: true, message: 'Attachment uploaded successfully', data: updatedRecord })
  } catch (error) {
    console.error('❌ Error in uploadAttachment:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Delete attachment from medical record
// @route   DELETE /api/medical-records/:recordId/attachments/:attachmentId
// @access  Private (Doctor only - own records)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteAttachment = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { recordId, attachmentId } = req.params

    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' })
    }

    if (!mongoose.Types.ObjectId.isValid(attachmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid attachment ID' })
    }

    const medicalRecord = await MedicalRecord.findById(recordId)
    if (!medicalRecord) {
      return res.status(404).json({ success: false, message: 'Medical record not found' })
    }

    if (medicalRecord.doctor.toString() !== doctorId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete attachments from this medical record' })
    }

    const updatedRecord = await MedicalRecord.findByIdAndUpdate(
      recordId,
      { $pull: { attachments: { _id: attachmentId } } },
      { new: true, runValidators: true }
    )
      .populate('patient', 'firstName lastName')
      .populate('doctor',  'firstName lastName specialization')

    res.status(200).json({ success: true, message: 'Attachment deleted successfully', data: updatedRecord })
  } catch (error) {
    console.error('❌ Error in deleteAttachment:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get medical records for current user (patient or doctor)
// @route   GET /api/medical-records/my-records
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
export const getMyRecords = async (req, res) => {
  try {
    const userId   = req.user.id
    const userRole = req.user.role

    let medicalRecords

    if (userRole === 'patient') {
      medicalRecords = await MedicalRecord.find({ patient: userId })
        .populate({ path: 'doctor', select: 'firstName lastName specialization' })
        .populate('appointment')
        .populate('prescriptions')
        .sort({ createdAt: -1 })
    } else if (userRole === 'doctor') {
      medicalRecords = await MedicalRecord.find({ doctor: userId })
        .populate({ path: 'patient', select: 'firstName lastName' })
        .populate('appointment')
        .populate('prescriptions')
        .sort({ createdAt: -1 })
    } else {
      return res.status(403).json({ success: false, message: 'Only patients and doctors can access medical records' })
    }

    res.status(200).json({ success: true, count: medicalRecords.length, data: medicalRecords })
  } catch (error) {
    console.error('❌ Error in getMyRecords:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Finalize medical record
// @route   POST /api/medical-records/:recordId/finalize
// @access  Private (Doctor only)
//
// Handles four responsibilities:
//   1. Update core clinical fields
//   2. Embed resolved lab results from all linked LabRequests
//   3. Transition the Bill from draft → pending
//   4. Create Prescription document AND link it back to MedicalRecord
// ─────────────────────────────────────────────────────────────────────────────
export const finalizeMedicalRecord = async (req, res) => {
  try {
    const doctorId = req.user.id
    const { recordId } = req.params
    const {
      finalDiagnosis,
      clinicalSummary,
      treatmentPlan,
      prescriptionData,
      followUpRequired,
      followUpDate,
      dischargeNotes,
      symptoms
    } = req.body

    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' })
    }

    const medicalRecord = await MedicalRecord.findById(recordId)
      .populate('patient', 'firstName lastName email phoneNumber')
      .populate('appointment')

    if (!medicalRecord) {
      return res.status(404).json({ success: false, message: 'Medical record not found' })
    }

    if (medicalRecord.doctor.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to finalize this medical record' })
    }

    if (medicalRecord.status === 'finalized') {
      return res.status(400).json({ success: false, message: 'Medical record is already finalized' })
    }

    // ── Step 1: Update core fields ─────────────────────────────────────────
    medicalRecord.diagnosis        = finalDiagnosis    || medicalRecord.diagnosis
    medicalRecord.notes            = clinicalSummary   || medicalRecord.notes
    medicalRecord.clinicalSummary  = clinicalSummary   || medicalRecord.clinicalSummary
    medicalRecord.treatmentPlan    = treatmentPlan     || medicalRecord.treatmentPlan
    medicalRecord.dischargeNotes   = dischargeNotes    || medicalRecord.dischargeNotes
    medicalRecord.followUpRequired = followUpRequired  ?? medicalRecord.followUpRequired
    medicalRecord.followUpDate     = followUpDate      || medicalRecord.followUpDate
    if (Array.isArray(symptoms) && symptoms.length > 0) {
      medicalRecord.symptoms = symptoms
    }

    // ── Step 2: Embed lab results from all linked LabRequests ──────────────
    if (medicalRecord.labRequests && medicalRecord.labRequests.length > 0) {
      const labRequests = await LabRequest.find({
        _id:    { $in: medicalRecord.labRequests },
        status: { $in: ['results_uploaded', 'reviewed', 'completed'] }
      }).populate('assignedTo', 'firstName lastName')

      const resolved = []

      for (const lr of labRequests) {
        const results = lr.results || lr.tests || []

        for (const r of results) {
          resolved.push({
            testName:       r.testName       || r.name       || 'Unknown Test',
            testCode:       r.testCode       || r.code       || '',
            result:         r.result         || r.value      || 'N/A',
            unit:           r.unit           || '',
            referenceRange: r.referenceRange || r.normalRange || '',
            status:         r.status         || 'pending',
            uploadedAt:     lr.resultsUploadedAt || lr.updatedAt || new Date(),
            labPersonnel:   lr.assignedTo
              ? `${lr.assignedTo.firstName} ${lr.assignedTo.lastName}`
              : 'Lab Personnel'
          })
        }
      }

      medicalRecord.resolvedLabResults = resolved
      console.log(`✅ Embedded ${resolved.length} lab result(s) into medical record ${recordId}`)
    }

    // ── Step 3: Mark record as finalized ──────────────────────────────────
    medicalRecord.status      = 'finalized'
    medicalRecord.finalizedAt = new Date()
    await medicalRecord.save()

    await syncAppointmentFollowUpState({
      appointmentId: medicalRecord.appointment._id || medicalRecord.appointment,
      patientId: medicalRecord.patient._id || medicalRecord.patient,
      followUpRequired: medicalRecord.followUpRequired,
      followUpDate: medicalRecord.followUpDate,
      followUpReason: medicalRecord.diagnosis,
      followUpNotes: medicalRecord.clinicalSummary || medicalRecord.notes
    })

    // ── Step 4: Link bill to medical record ────────────────────────────────
    let bill = null
    try {
      bill = await Bill.findOne({
        appointment: medicalRecord.appointment._id,
        status: { $in: ['draft', 'pending'] }
      })

      if (bill) {
        if (bill.status === 'draft') {
          await BillCalculator.finalizeBill(bill, recordId)
          console.log(`✅ Bill ${bill.billNumber} transitioned draft → pending`)
        }
        await MedicalRecord.findByIdAndUpdate(recordId, { bill: bill._id })
        console.log(`✅ Bill ${bill.billNumber} linked to medical record ${recordId}`)
      } else {
        console.warn(`⚠️  No payable bill found for appointment ${medicalRecord.appointment._id} — skipping bill link`)
      }
    } catch (billError) {
      console.error('⚠️  Bill finalization error (non-blocking):', billError.message)
    }

    // ── Step 5: Create Prescription document and link back to MedicalRecord ─
    let prescription = null
    if (prescriptionData?.medications?.length > 0) {
      const patientProfile = await Patient.findOne({ userId: medicalRecord.patient._id })
      const allergies      = patientProfile?.allergies || []

      prescription = await Prescription.create({
        patient:             medicalRecord.patient._id,
        doctor:              doctorId,
        appointment:         medicalRecord.appointment._id,
        medicalRecord:       recordId,
        medications:         prescriptionData.medications,
        generalInstructions: prescriptionData.generalInstructions,
        warnings:            prescriptionData.warnings || [],
        allergies,
        refillsAllowed:      prescriptionData.refillsAllowed || 0,
        validUntil:          prescriptionData.validUntil
          || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'new'
      })

      await MedicalRecord.findByIdAndUpdate(recordId, {
        $push: { prescriptions: prescription._id }
      })

      await prescription.populate([
        { path: 'patient', select: 'firstName lastName email phoneNumber' },
        { path: 'doctor',  select: 'firstName lastName specialization' }
      ])

      console.log(`✅ Prescription ${prescription.prescriptionNumber} created and linked to medical record ${recordId}`)

      const doctor = await User.findById(doctorId)

      // ✅ FIX: 'prescription_created' is NOT a valid Notification.type enum value.
      //    The error message confirms: "prescription_created is not a valid enum value for path type"
      //    Use 'prescription' (or whatever your Notification model allows) instead.
      //    Also FIX: channels must be an array of ObjectIds referencing Channel documents,
      //    NOT an array of strings like ['in_app', 'email'].
      //    Remove the `channels` field entirely — let the Notification model use its defaults.
      //    Only include `channels` if your schema defines it as [String] with those exact values.

      await Notification.create({
        user:    medicalRecord.patient._id,
        type:    'prescription',             // ✅ FIXED: was 'prescription_created'
        title:   'New Prescription',
        message: `You have a new prescription from Dr. ${doctor.firstName} ${doctor.lastName}. Prescription #${prescription.prescriptionNumber}`,
        data: {
          prescriptionId:     prescription._id,
          prescriptionNumber: prescription.prescriptionNumber
        },
        priority:            'normal',
        // ✅ FIXED: removed `channels: ['in_app', 'email']` — channels is an array of
        //    ObjectId refs in your schema (embedded docs), NOT plain strings.
        //    Passing strings caused "Cast to embedded failed for value 'in_app'" error.
        relatedPrescription: prescription._id
      })

      // Notify all active pharmacy staff
      const pharmacyStaff = await User.find({ role: 'pharmacy_staff', status: 'active' }).select('_id')
      if (pharmacyStaff.length > 0) {
        await Notification.insertMany(
          pharmacyStaff.map(staff => ({
            user:    staff._id,
            type:    'prescription',           // ✅ FIXED: was 'prescription_created'
            title:   'New Prescription',
            message: `New prescription #${prescription.prescriptionNumber} from Dr. ${doctor.firstName} ${doctor.lastName}`,
            data: {
              prescriptionId: prescription._id,
              patientName: `${medicalRecord.patient.firstName} ${medicalRecord.patient.lastName}`
            },
            priority:            'normal',
            // ✅ FIXED: removed channels — same reason as above
            relatedPrescription: prescription._id
          }))
        )
      }
    }

    // ── Step 6: Notify patient — record is ready to view ──────────────────
    // ✅ FIX: 'diagnosis_updated' may also not be a valid type enum value.
    //    Use a safe fallback type like 'appointment' which is confirmed valid.
    //    Check your Notification model's `type` enum and replace accordingly.
    await Notification.create({
      user:    medicalRecord.patient._id,
      type:    'appointment',               // ✅ FIXED: was 'diagnosis_updated' (invalid enum)
      title:   'Your Medical Record is Ready',
      message: 'Your doctor has finalized your consultation record. You can now view your diagnosis, lab results, and billing summary in your dashboard.',
      data: {
        medicalRecordId:     recordId,
        billId:              bill?._id || null,
        prescriptionCreated: !!prescription,
        hasLabResults:       medicalRecord.resolvedLabResults?.length > 0
      },
      priority:             'high',
      // ✅ FIXED: removed channels field (same reason — schema expects ObjectId refs, not strings)
      relatedMedicalRecord: recordId
    })

    // ── Step 7: Update appointment status ─────────────────────────────────
    await Appointment.findByIdAndUpdate(medicalRecord.appointment._id, { status: 'completed' })

    // ── Step 8: Audit log ─────────────────────────────────────────────────
    await logAudit({
      userId: doctorId,
      action: 'MEDICAL_RECORD_FINALIZED',
      resourceType: 'MedicalRecord',
      resourceId: recordId,
      details: {
        patientId:           medicalRecord.patient._id,
        labResultsEmbedded:  medicalRecord.resolvedLabResults?.length || 0,
        prescriptionCreated: !!prescription,
        prescriptionId:      prescription?._id || null,
        billFinalized:       !!bill
      },
      req,
      status: 'success'
    })

    // ── Final response ─────────────────────────────────────────────────────
    const finalRecord = await MedicalRecord.findById(recordId)
      .populate('patient',       'firstName lastName email phoneNumber')
      .populate('doctor',        'firstName lastName specialization')
      .populate('appointment')
      .populate('bill')
      .populate('prescriptions')

    return res.status(200).json({
      success: true,
      message: 'Medical record finalized successfully',
      data: {
        medicalRecord:       finalRecord,
        prescription:        prescription || null,
        prescriptionCreated: !!prescription,
        bill:                bill || null,
        billFinalized:       !!bill,
        labResultsEmbedded:  medicalRecord.resolvedLabResults?.length || 0
      }
    })
  } catch (error) {
    console.error('❌ Finalize medical record error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}
