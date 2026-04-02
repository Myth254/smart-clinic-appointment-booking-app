// controllers/pharmacyController.js
import Prescription from '../models/Prescription.js'
import Session from '../models/Session.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import BillCalculator from '../services/billing/BillCalculator.js' // ✅ NEW
import NotificationService from '../services/notificationService.js'
import logAudit from '../utils/auditLogger.js'
import mongoose from 'mongoose'

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create prescription (Doctor only)
// @route   POST /api/v1/pharmacy/prescriptions
// @access  Private (Doctor)
// ─────────────────────────────────────────────────────────────────────────────
export const createPrescription = async (req, res) => {
  try {
    const doctorId = req.user.id
    const {
      patientId, appointmentId, sessionId, medicalRecordId,
      medications, generalInstructions, warnings, refillsAllowed, validUntil
    } = req.body
 
    if (!patientId || !medications || medications.length === 0) {
      return res.status(400).json({ success: false, message: 'Patient ID and at least one medication are required' })
    }

    if (!appointmentId) {
      console.warn(
        `⚠️  [BILLING] createPrescription called without appointmentId for patient ${patientId} ` +
        '— pharmacy billing will be skipped at dispense time'
      )
    }
 
    const patient   = await User.findById(patientId).populate('patientProfile')
    const allergies = patient?.patientProfile?.allergies || []
 
    const prescription = await Prescription.create({
      patient: patientId,
      doctor:  doctorId,
      appointment:   appointmentId,
      medicalRecord: medicalRecordId,
      medications,
      generalInstructions,
      warnings,
      allergies,
      refillsAllowed: refillsAllowed || 0,
      validUntil:     validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'new'
    })
 
    await prescription.populate([
      { path: 'patient', select: 'firstName lastName email phoneNumber' },
      { path: 'doctor',  select: 'firstName lastName specialization' }
    ])
 
    if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
      await Session.findByIdAndUpdate(sessionId, { $addToSet: { prescriptions: prescription._id } })
        .catch(err => console.error('Failed to link prescription to session:', err))
    }
 
    await NotificationService.pharmacyNotifications.prescriptionCreated(
      prescription,
      await User.findById(patientId),
      await User.findById(doctorId)
    )
 
    await logAudit({
      userId: doctorId, action: 'PRESCRIPTION_CREATED',
      resourceType: 'Prescription', resourceId: prescription._id,
      details: { patientId, prescriptionNumber: prescription.prescriptionNumber, medicationsCount: medications.length },
      req, status: 'success'
    })
 
    return res.status(201).json({ success: true, message: 'Prescription created successfully', data: prescription })
  } catch (error) {
    console.error('Create prescription error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get prescriptions (filtered by role)
// @route   GET /api/v1/pharmacy/prescriptions
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
export const getPrescriptions = async (req, res) => {
  try {
    const userId   = req.user.id
    const userRole = req.user.role
    const { status } = req.query

    let query = {}

    if (userRole === 'doctor') {
      query.doctor = userId
    } else if (userRole === 'pharmacy_staff') {
      query.status = { $in: ['new', 'pending_pharmacy', 'availability_confirmed', 'ready_for_pickup', 'partial_ready'] }
    } else if (userRole === 'patient') {
      query.patient = userId
    }

    if (status) query.status = status

    const prescriptions = await Prescription.find(query)
      .populate('patient',     'firstName lastName email phoneNumber')
      .populate('doctor',      'firstName lastName specialization')
      .populate('confirmedBy', 'firstName lastName')
      .populate('dispensedBy', 'firstName lastName')
      .sort({ createdAt: -1 })

    res.json({ success: true, count: prescriptions.length, data: prescriptions })
  } catch (error) {
    console.error('Get prescriptions error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get single prescription
// @route   GET /api/v1/pharmacy/prescriptions/:id
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
export const getPrescriptionById = async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id)
      .populate('patient',       'firstName lastName email phoneNumber')
      .populate('doctor',        'firstName lastName specialization')
      .populate('confirmedBy',   'firstName lastName')
      .populate('dispensedBy',   'firstName lastName')
      .populate('comments.user', 'firstName lastName role')

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' })
    }

    const userId   = req.user.id
    const userRole = req.user.role

    if (userRole === 'patient' && prescription.patient._id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }
    if (userRole === 'doctor' && prescription.doctor._id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    res.json({ success: true, data: prescription })
  } catch (error) {
    console.error('Get prescription error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Confirm drug availability
// @route   PATCH /api/v1/pharmacy/prescriptions/:id/confirm-availability
// @access  Private (Pharmacy Staff)
// ─────────────────────────────────────────────────────────────────────────────
export const confirmAvailability = async (req, res) => {
  try {
    const { medications, pharmacyNotes } = req.body
    const prescription = await Prescription.findById(req.params.id)

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' })
    }

    if (!['new', 'pending_pharmacy'].includes(prescription.status)) {
      return res.status(400).json({ success: false, message: 'Prescription cannot be confirmed at this stage' })
    }

    let hasUnavailable = false
    let hasAlternatives = false

    medications.forEach(medUpdate => {
      const medication = prescription.medications.id(medUpdate.medicationId)
      if (medication) {
        medication.availabilityStatus = medUpdate.availabilityStatus
        if (medUpdate.alternativeDrug) {
          medication.alternativeDrug   = medUpdate.alternativeDrug
          medication.alternativeReason = medUpdate.alternativeReason
          hasAlternatives = true
        }
        if (medUpdate.availabilityStatus === 'unavailable') {
          hasUnavailable = true
        }
      }
    })

    prescription.pharmacyNotes = pharmacyNotes
    prescription.confirmedBy   = req.user.id
    prescription.confirmedAt   = new Date()
    prescription.status        = (hasUnavailable && !hasAlternatives)
      ? 'pending_pharmacy'
      : 'availability_confirmed'

    await prescription.save()
    await prescription.populate([
      { path: 'patient', select: 'firstName lastName email' },
      { path: 'doctor',  select: 'firstName lastName email' }
    ])

    if (hasAlternatives) {
      await Notification.create({
        user:    prescription.doctor,
        type:    'prescription',
        title:   'Alternative Medications Suggested',
        message: `Pharmacy has suggested alternatives for prescription #${prescription.prescriptionNumber}`,
        data:    { prescriptionId: prescription._id, requiresApproval: true }
      })
      prescription.comments.push({
        user: req.user.id,
        text: 'Alternative medications suggested. Awaiting doctor approval.',
        type: 'alternative_suggestion'
      })
    } else {
      await Notification.create({
        user:    prescription.patient,
        type:    'prescription',
        title:   'Prescription Confirmed',
        message: `Your prescription #${prescription.prescriptionNumber} is being prepared`,
        data:    { prescriptionId: prescription._id }
      })
    }

    await prescription.save()

    res.json({ success: true, message: 'Availability confirmed successfully', data: prescription })
  } catch (error) {
    console.error('Confirm availability error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Mark prescription ready for pickup
// @route   PATCH /api/v1/pharmacy/prescriptions/:id/ready
// @access  Private (Pharmacy Staff)
// ─────────────────────────────────────────────────────────────────────────────
export const markReadyForPickup = async (req, res) => {
  try {
    const { actualCost, pharmacyNotes } = req.body
    const prescription = await Prescription.findById(req.params.id)

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' })
    }

    const allAvailable = prescription.areAllMedicationsAvailable()

    prescription.status          = allAvailable ? 'ready_for_pickup' : 'partial_ready'
    prescription.readyForPickupAt = new Date()
    prescription.actualCost       = actualCost

    if (pharmacyNotes) prescription.pharmacyNotes = pharmacyNotes

    await prescription.save()
    await prescription.populate([{ path: 'patient', select: 'firstName lastName email phoneNumber' }])

    await NotificationService.pharmacyNotifications.readyForPickup(
      prescription,
      await User.findById(prescription.patient)
    )

    res.json({ success: true, message: 'Prescription marked as ready for pickup', data: prescription })
  } catch (error) {
    console.error('Mark ready error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Dispense prescription (Pharmacy Staff)
// @route   PATCH /api/v1/pharmacy/prescriptions/:id/dispense
// @access  Private (Pharmacy Staff)
// ─────────────────────────────────────────────────────────────────────────────
export const dispensePrescription = async (req, res) => {
  try {
    const pharmacistId = req.user.id
    const { medications, notes } = req.body
 
    const prescription = await Prescription.findById(req.params.id)
      .populate('patient', 'firstName lastName phoneNumber')
      .populate('doctor',  'firstName lastName')
 
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' })
    }
 
    if (['dispensed', 'completed', 'cancelled', 'expired'].includes(prescription.status)) {
      return res.status(400).json({
        success: false,
        message: `Prescription is already "${prescription.status}" and cannot be dispensed`
      })
    }
 
    // ── Update dispensing details per medication ────────────────────────────
    medications?.forEach(medUpdate => {
      const medication = prescription.medications.id(medUpdate.medicationId)
      if (medication) {
        medication.dispensedQuantity = medUpdate.dispensedQuantity
        medication.dispensedBy       = pharmacistId
        medication.dispensedAt       = new Date()
        if (medUpdate.unitCost !== undefined) medication.unitCost = medUpdate.unitCost
        medication.availabilityStatus = 'available'
      }
    })
 
    prescription.status      = 'dispensed'
    prescription.dispensedBy = pharmacistId
    prescription.dispensedAt = new Date()
    if (notes) prescription.pharmacyNotes = notes
 
    await prescription.save()
 
    // ── ✅ BILLING HOOK — add medication cost to the Bill ──────────────────
    // Prescription billing is deferred to dispense time (not prescription time).
    // onPharmacyDispense() supports both draft and post-finalization bills.
    if (prescription.appointment) {
      try {
        await BillCalculator.onPharmacyDispense({
          appointmentId:  String(prescription.appointment),
          prescriptionId: prescription._id,
          medications:    prescription.medications.toObject()
        })
      } catch (billErr) {
        console.error('⚠️  [BILLING] Pharmacy billing hook failed (non-blocking):', billErr.message)
      }
    } else {
      console.error(`❌  [BILLING] Prescription ${prescription.prescriptionNumber} has no appointment — medication charge lost`)
    }
 
    await NotificationService.pharmacyNotifications?.prescriptionDispensed?.(
      prescription,
      prescription.patient,
      prescription.doctor
    )
 
    await logAudit({
      userId: pharmacistId, action: 'PRESCRIPTION_DISPENSED',
      resourceType: 'Prescription', resourceId: prescription._id,
      details: {
        prescriptionNumber: prescription.prescriptionNumber,
        patientId: prescription.patient._id,
        medicationsDispensed: medications?.length || 0
      },
      req, status: 'success'
    })
 
    return res.json({ success: true, message: 'Prescription dispensed successfully', data: prescription })
  } catch (error) {
    console.error('Dispense prescription error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Add comment to prescription
// @route   POST /api/v1/pharmacy/prescriptions/:id/comments
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
export const addPrescriptionComment = async (req, res) => {
  try {
    const { text, type } = req.body
    const prescription = await Prescription.findById(req.params.id)

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' })
    }

    prescription.comments.push({
      user:      req.user.id,
      text,
      type:      type || 'note',
      timestamp: new Date()
    })

    await prescription.save()
    await prescription.populate('comments.user', 'firstName lastName role')

    if (type === 'query' && req.user.role === 'pharmacy_staff') {
      await Notification.create({
        user:    prescription.doctor,
        type:    'prescription',
        title:   'Pharmacy Query',
        message: `Pharmacy has a query regarding prescription #${prescription.prescriptionNumber}`,
        data:    { prescriptionId: prescription._id }
      })
    }

    res.json({ success: true, message: 'Comment added successfully', data: prescription })
  } catch (error) {
    console.error('Add prescription comment error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Cancel prescription
// @route   PATCH /api/v1/pharmacy/prescriptions/:id/cancel
// @access  Private (Doctor or Patient)
// ─────────────────────────────────────────────────────────────────────────────
export const cancelPrescription = async (req, res) => {
  try {
    const { reason } = req.body
    const prescription = await Prescription.findById(req.params.id)

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' })
    }

    if (req.user.role === 'patient' && prescription.patient.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }
    if (req.user.role === 'doctor' && prescription.doctor.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    if (['dispensed', 'completed'].includes(prescription.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel dispensed prescription' })
    }

    prescription.status             = 'cancelled'
    prescription.cancellationReason = reason
    prescription.cancelledBy        = req.user.id
    prescription.cancelledAt        = new Date()

    await prescription.save()
    await prescription.populate([
      { path: 'patient', select: 'firstName lastName' },
      { path: 'doctor',  select: 'firstName lastName' }
    ])

    const notifyUserId = req.user.role === 'patient' ? prescription.doctor : prescription.patient
    await Notification.create({
      user:    notifyUserId,
      type:    'prescription',
      title:   'Prescription Cancelled',
      message: `Prescription #${prescription.prescriptionNumber} has been cancelled`,
      data:    { prescriptionId: prescription._id, reason }
    })

    await logAudit({
      userId:       req.user.id,
      action:       'PRESCRIPTION_CANCELLED',
      resourceType: 'Prescription',
      resourceId:   req.params.id,
      details: {
        prescriptionNumber: prescription.prescriptionNumber,
        patientId:          prescription.patient,
        cancelledBy:        req.user.role,
        cancellationReason: reason
      },
      req,
      status: 'success'
    })

    res.json({ success: true, message: 'Prescription cancelled successfully', data: prescription })
  } catch (error) {
    console.error('Cancel prescription error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get pharmacy dashboard stats
// @route   GET /api/v1/pharmacy/stats
// @access  Private (Pharmacy Staff, Admin)
// ─────────────────────────────────────────────────────────────────────────────
export const getPharmacyStats = async (req, res) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const stats = await Prescription.aggregate([
      {
        $facet: {
          newToday: [
            { $match: { status: 'new', createdAt: { $gte: today } } },
            { $count: 'count' }
          ],
          pendingConfirmation: [
            { $match: { status: { $in: ['new', 'pending_pharmacy'] } } },
            { $count: 'count' }
          ],
          readyForPickup: [
            { $match: { status: { $in: ['ready_for_pickup', 'partial_ready'] } } },
            { $count: 'count' }
          ],
          dispensedToday: [
            { $match: { status: 'dispensed', dispensedAt: { $gte: today } } },
            { $count: 'count' }
          ]
        }
      }
    ])

    res.json({
      success: true,
      data: {
        newToday:            stats[0].newToday[0]?.count            || 0,
        pendingConfirmation: stats[0].pendingConfirmation[0]?.count  || 0,
        readyForPickup:      stats[0].readyForPickup[0]?.count      || 0,
        dispensedToday:      stats[0].dispensedToday[0]?.count      || 0
      }
    })
  } catch (error) {
    console.error('Get pharmacy stats error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Doctor approves/rejects alternative medication
// @route   PATCH /api/v1/pharmacy/prescriptions/:id/approve-alternative
// @access  Private (Doctor)
// ─────────────────────────────────────────────────────────────────────────────
export const approveAlternative = async (req, res) => {
  try {
    const { medicationId, approved, comment } = req.body
    const prescription = await Prescription.findById(req.params.id)
      .populate('patient', 'firstName lastName email')

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' })
    }

    if (prescription.doctor.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied. Not your prescription.' })
    }

    const medication = prescription.medications.id(medicationId)
    if (!medication) {
      return res.status(404).json({ success: false, message: 'Medication not found in prescription' })
    }

    if (!medication.alternativeDrug) {
      return res.status(400).json({ success: false, message: 'No alternative drug suggested for this medication' })
    }

    if (approved) {
      medication.drugName          = medication.alternativeDrug
      medication.alternativeReason = `Approved by doctor: ${comment || medication.alternativeReason}`
      medication.availabilityStatus = 'available'
      medication.alternativeDrug   = null
    } else {
      medication.availabilityStatus = 'unavailable'
      medication.alternativeReason  = `Rejected by doctor: ${comment || 'No suitable alternative'}`
    }

    prescription.status = approved ? 'availability_confirmed' : 'pending_pharmacy'

    prescription.comments.push({
      user:      req.user.id,
      text:      `Doctor ${approved ? 'approved' : 'rejected'} alternative: ${medication.drugName}. ${comment || ''}`,
      type:      'doctor_response',
      timestamp: new Date()
    })

    await prescription.save()

    await Notification.create({
      user:    prescription.confirmedBy,
      type:    'prescription',
      title:   approved ? 'Alternative Approved' : 'Alternative Rejected',
      message: `Doctor has ${approved ? 'approved' : 'rejected'} the alternative medication for prescription #${prescription.prescriptionNumber}`,
      data:    { prescriptionId: prescription._id, medicationId, approved },
      priority: 'normal',
      channels: ['in_app'],
      relatedPrescription: prescription._id
    })

    await Notification.create({
      user:    prescription.patient._id,
      type:    'prescription',
      title:   'Prescription Updated',
      message: approved
        ? `Your prescription has been updated with an alternative medication: ${medication.drugName}`
        : 'Your doctor is working with the pharmacy to find suitable medication for you.',
      data:    { prescriptionId: prescription._id },
      priority: 'normal',
      channels: ['in_app'],
      relatedPrescription: prescription._id
    })

    await prescription.populate([
      { path: 'patient', select: 'firstName lastName email' },
      { path: 'doctor',  select: 'firstName lastName specialization' }
    ])

    res.json({
      success: true,
      message: `Alternative medication ${approved ? 'approved' : 'rejected'} successfully`,
      data:    prescription
    })
  } catch (error) {
    console.error('Approve alternative error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

export default {
  createPrescription,
  getPrescriptions,
  getPrescriptionById,
  confirmAvailability,
  markReadyForPickup,
  dispensePrescription,
  addPrescriptionComment,
  cancelPrescription,
  getPharmacyStats,
  approveAlternative
}
