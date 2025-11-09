/* eslint-disable no-unused-vars */
import MedicalRecord from '../models/MedicalRecord.js'
import Appointment from '../models/Appointment.js'
import Patient from '../models/Patient.js'
import Doctor from '../models/Doctor.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import mongoose from 'mongoose'

// @desc    Create medical record
// @route   POST /api/medical-records
// @access  Private (Doctor only)
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

    // Validate appointmentId
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment ID' })
    }

    // Find appointment and validate
    const appointment = await Appointment.findById(appointmentId)
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' })
    }

    // Verify doctor owns this appointment
    if (appointment.doctor.toString() !== doctorId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create medical record for this appointment'
      })
    }

    // Verify patient exists before creating record
    const patientExists = await User.findById(appointment.patient)
    if (!patientExists) {
      return res.status(404).json({
        success: false,
        message: 'Patient user not found'
      })
    }

    // Check if record already exists for this appointment
    const existingRecord = await MedicalRecord.findOne({ appointment: appointmentId })
    if (existingRecord) {
      return res.status(400).json({
        success: false,
        message: 'Medical record already exists for this appointment. Use update endpoint instead.'
      })
    }

    // Create medical record
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

    // Update appointment status to completed
    await Appointment.findByIdAndUpdate(appointmentId, { status: 'completed' })

    // Add to patient's medical history if diagnosis is provided
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

    // Notify patient
    await Notification.create({
      user: appointment.patient,
      type: 'appointment',
      title: 'Medical Record Created',
      message: 'Your doctor has created a medical record for your appointment.',
      data: {
        appointmentId,
        medicalRecordId: medicalRecord._id
      }
    })

    // Populate the response
    const populatedRecord = await MedicalRecord.findById(medicalRecord._id)
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName specialization')
      .populate('appointment')

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

// @desc    Get medical record by ID
// @route   GET /api/medical-records/:recordId
// @access  Private (Doctor or Patient - own records only)
export const getRecordById = async (req, res) => {
  try {
    // ✅ FIX: Use consistent req.user.id
    const userId = req.user.id
    const userRole = req.user.role
    const { recordId } = req.params

    // Validate recordId
    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' })
    }

    const medicalRecord = await MedicalRecord.findById(recordId)
      .populate({
        path: 'patient',
        select: 'firstName lastName email phoneNumber',
        populate: {
          path: 'userId',
          select: 'firstName lastName email phoneNumber'
        }
      })
      .populate({
        path: 'doctor',
        select: 'firstName lastName email phoneNumber',
        populate: {
          path: 'userId',
          select: 'firstName lastName specialization'
        }
      })
      .populate('appointment')

    if (!medicalRecord) {
      return res.status(404).json({ success: false, message: 'Medical record not found' })
    }

    // Authorization check
    if (userRole === 'doctor') {
      if (medicalRecord.doctor.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this medical record'
        })
      }
    } else if (userRole === 'patient') {
      if (medicalRecord.patient.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this medical record'
        })
      }
    } else if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view medical records'
      })
    }

    res.status(200).json({
      success: true,
      data: medicalRecord
    })
  } catch (error) {
    console.error('❌ Error in getRecordById:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Get all medical records for a patient
// @route   GET /api/medical-records/patient/:patientId
// @access  Private (Doctor, Admin, or Patient - own records)
export const getPatientRecords = async (req, res) => {
  try {
    // ✅ FIX: Use consistent req.user.id
    const userId = req.user.id
    const userRole = req.user.role
    const { patientId } = req.params

    // Validate patientId
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ success: false, message: 'Invalid patient ID' })
    }

    // Authorization check
    if (userRole === 'patient' && patientId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view these medical records'
      })
    }

    const medicalRecords = await MedicalRecord.find({ patient: patientId })
      .populate({
        path: 'doctor',
        select: 'firstName lastName specialization',
        populate: {
          path: 'userId',
          select: 'firstName lastName specialization'
        }
      })
      .populate('appointment')
      .sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      count: medicalRecords.length,
      data: medicalRecords
    })
  } catch (error) {
    console.error('❌ Error in getPatientRecords:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Get all medical records created by a doctor
// @route   GET /api/medical-records/doctor/:doctorId
// @access  Private (Doctor - own records, Admin)
export const getDoctorRecords = async (req, res) => {
  try {
    // ✅ FIX: Use consistent req.user.id
    const userId = req.user.id
    const userRole = req.user.role
    const { doctorId } = req.params

    // Validate doctorId
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, message: 'Invalid doctor ID' })
    }

    // Authorization check
    if (userRole === 'doctor' && doctorId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view these medical records'
      })
    }

    if (userRole === 'patient') {
      return res.status(403).json({
        success: false,
        message: 'Patients cannot view doctor\'s medical records'
      })
    }

    const medicalRecords = await MedicalRecord.find({ doctor: doctorId })
      .populate({
        path: 'patient',
        select: 'firstName lastName',
        populate: {
          path: 'userId',
          select: 'firstName lastName email'
        }
      })
      .populate('appointment')
      .sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      count: medicalRecords.length,
      data: medicalRecords
    })
  } catch (error) {
    console.error('❌ Error in getDoctorRecords:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Update medical record
// @route   PUT /api/medical-records/:recordId
// @access  Private (Doctor only - own records)
export const updateRecord = async (req, res) => {
  try {
    // ✅ FIX: Use consistent req.user.id
    const doctorId = req.user.id
    const { recordId } = req.params
    const {
      diagnosis,
      symptoms,
      prescription,
      labTests,
      vitalSigns,
      notes,
      followUpRequired,
      followUpDate
    } = req.body

    // Validate recordId
    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' })
    }

    const medicalRecord = await MedicalRecord.findById(recordId)
    if (!medicalRecord) {
      return res.status(404).json({ success: false, message: 'Medical record not found' })
    }

    // Verify doctor owns this record
    if (medicalRecord.doctor.toString() !== doctorId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this medical record'
      })
    }

    // Build updates object
    const updates = {}
    if (diagnosis !== undefined) updates.diagnosis = diagnosis
    if (symptoms !== undefined) updates.symptoms = symptoms
    if (prescription !== undefined) updates.prescription = prescription
    if (labTests !== undefined) updates.labTests = labTests
    if (vitalSigns !== undefined) updates.vitalSigns = vitalSigns
    if (notes !== undefined) updates.notes = notes
    if (followUpRequired !== undefined) updates.followUpRequired = followUpRequired
    if (followUpDate !== undefined) updates.followUpDate = followUpDate

    const updatedRecord = await MedicalRecord.findByIdAndUpdate(
      recordId,
      updates,
      { new: true, runValidators: true }
    )
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName specialization')
      .populate('appointment')

    // Update patient's medical history if diagnosis changed
    if (diagnosis && diagnosis !== medicalRecord.diagnosis) {
      await Patient.findOneAndUpdate(
        { userId: medicalRecord.patient },
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

    // Notify patient of update
    await Notification.create({
      user: medicalRecord.patient,
      type: 'appointment',
      title: 'Medical Record Updated',
      message: 'Your medical record has been updated by your doctor.',
      data: { medicalRecordId: recordId }
    })

    res.status(200).json({
      success: true,
      message: 'Medical record updated successfully',
      data: updatedRecord
    })
  } catch (error) {
    console.error('❌ Error in updateRecord:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Upload attachment to medical record
// @route   POST /api/medical-records/:recordId/attachments
// @access  Private (Doctor only - own records)
export const uploadAttachment = async (req, res) => {
  try {
    // ✅ FIX: Use consistent req.user.id
    const doctorId = req.user.id
    const { recordId } = req.params
    const { fileName, fileUrl, fileType } = req.body

    // Validate recordId
    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' })
    }

    // Validate required fields
    if (!fileName || !fileUrl || !fileType) {
      return res.status(400).json({
        success: false,
        message: 'fileName, fileUrl, and fileType are required'
      })
    }

    const medicalRecord = await MedicalRecord.findById(recordId)
    if (!medicalRecord) {
      return res.status(404).json({ success: false, message: 'Medical record not found' })
    }

    // Verify doctor owns this record
    if (medicalRecord.doctor.toString() !== doctorId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload attachments to this medical record'
      })
    }

    // Add attachment
    const updatedRecord = await MedicalRecord.findByIdAndUpdate(
      recordId,
      {
        $push: {
          attachments: {
            fileName,
            fileUrl,
            fileType,
            uploadedAt: new Date()
          }
        }
      },
      { new: true, runValidators: true }
    )
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName specialization')

    // Notify patient
    await Notification.create({
      user: medicalRecord.patient,
      type: 'appointment',
      title: 'New Attachment Added',
      message: `A new file "${fileName}" has been added to your medical record.`,
      data: { medicalRecordId: recordId }
    })

    res.status(200).json({
      success: true,
      message: 'Attachment uploaded successfully',
      data: updatedRecord
    })
  } catch (error) {
    console.error('❌ Error in uploadAttachment:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Delete attachment from medical record
// @route   DELETE /api/medical-records/:recordId/attachments/:attachmentId
// @access  Private (Doctor only - own records)
export const deleteAttachment = async (req, res) => {
  try {
    // ✅ FIX: Use consistent req.user.id
    const doctorId = req.user.id
    const { recordId, attachmentId } = req.params

    // Validate recordId
    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' })
    }

    // Validate attachmentId
    if (!mongoose.Types.ObjectId.isValid(attachmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid attachment ID' })
    }

    const medicalRecord = await MedicalRecord.findById(recordId)
    if (!medicalRecord) {
      return res.status(404).json({ success: false, message: 'Medical record not found' })
    }

    // Verify doctor owns this record
    if (medicalRecord.doctor.toString() !== doctorId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete attachments from this medical record'
      })
    }

    // Remove attachment
    const updatedRecord = await MedicalRecord.findByIdAndUpdate(
      recordId,
      {
        $pull: {
          attachments: { _id: attachmentId }
        }
      },
      { new: true, runValidators: true }
    )
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName specialization')

    res.status(200).json({
      success: true,
      message: 'Attachment deleted successfully',
      data: updatedRecord
    })
  } catch (error) {
    console.error('❌ Error in deleteAttachment:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Get medical records for current user (patient or doctor)
// @route   GET /api/medical-records/my-records
// @access  Private
export const getMyRecords = async (req, res) => {
  try {
    // ✅ FIX: Use consistent req.user.id
    const userId = req.user.id
    const userRole = req.user.role

    let medicalRecords

    if (userRole === 'patient') {
      // Get records where user is the patient
      medicalRecords = await MedicalRecord.find({ patient: userId })
        .populate({
          path: 'doctor',
          select: 'firstName lastName specialization',
          populate: {
            path: 'userId',
            select: 'firstName lastName specialization'
          }
        })
        .populate('appointment')
        .sort({ createdAt: -1 })
    } else if (userRole === 'doctor') {
      // Get records created by the doctor
      medicalRecords = await MedicalRecord.find({ doctor: userId })
        .populate({
          path: 'patient',
          select: 'firstName lastName',
          populate: {
            path: 'userId',
            select: 'firstName lastName email'
          }
        })
        .populate('appointment')
        .sort({ createdAt: -1 })
    } else {
      return res.status(403).json({
        success: false,
        message: 'Only patients and doctors can access medical records'
      })
    }

    res.status(200).json({
      success: true,
      count: medicalRecords.length,
      data: medicalRecords
    })
  } catch (error) {
    console.error('❌ Error in getMyRecords:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}