import express from 'express'
import { protect, authorize } from '../middlewares/authMiddleware.js'
import { validateMedicalRecord } from '../middlewares/validation.js'
import {
  createRecord,
  getRecordById,
  getPatientRecords,
  getDoctorRecords,
  updateRecord,
  uploadAttachment,
  deleteAttachment,
  getMyRecords,
  finalizeMedicalRecord
} from '../controllers/medicalRecordController.js'

const router = express.Router()

// All routes require authentication
router.use(protect)

// ===== GENERAL MEDICAL RECORD ROUTES =====

// Get current user's medical records (patient or doctor)
router.get('/my-records', getMyRecords)

// Create new medical record (doctor only)
router.post('/', authorize('doctor'), validateMedicalRecord, createRecord)

// Get specific medical record by ID (doctor, patient - own records, or admin)
router.get('/:recordId', getRecordById)

// Update medical record (doctor only - own records)
router.put('/:recordId', authorize('doctor'), updateRecord)

// ===== ATTACHMENT ROUTES =====

// Upload attachment to medical record (doctor only)
router.post('/:recordId/attachments', authorize('doctor'), uploadAttachment)

// Delete attachment from medical record (doctor only)
router.delete('/:recordId/attachments/:attachmentId', authorize('doctor'), deleteAttachment)

// ===== PATIENT-SPECIFIC ROUTES =====

// Get all medical records for a specific patient
// Accessible by: doctor, admin, or patient (own records)
router.get('/patient/:patientId', getPatientRecords)

// ===== DOCTOR-SPECIFIC ROUTES =====

// Get all medical records created by a specific doctor
// Accessible by: doctor (own records) or admin
router.get('/doctor/:doctorId', authorize('doctor', 'admin'), getDoctorRecords)

router.post('/:recordId/finalize',protect, authorize('doctor'), finalizeMedicalRecord)

export default router