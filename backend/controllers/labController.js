// controllers/labController.js
import LabRequest from '../models/LabRequest.js'
import Bill from '../models/Bill.js'
import MedicalRecord from '../models/MedicalRecord.js'            // ✅ NEW
import Session from '../models/Session.js'
import User from '../models/User.js'
import BillCalculator from '../services/billing/BillCalculator.js' // ✅ NEW
import NotificationService from '../services/notificationService.js'
import { canAccessLabRequest } from '../utils/permissions.js'
import logAudit from '../utils/auditLogger.js'
import { io } from '../socket.js'
import mongoose from 'mongoose'

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create lab request (Doctor only)
// @route   POST /api/v1/lab/requests
// @access  Private (Doctor)
// ─────────────────────────────────────────────────────────────────────────────
export const createLabRequest = async (req, res) => {
  try {
    const doctorId = req.user.id
    const {
      patientId,
      appointmentId,
      sessionId,
      tests,
      priority,
      clinicalNotes,
      provisionalDiagnosis,
      estimatedCost   // ✅ doctors now pass the fee; billing service reads it
    } = req.body
 
    if (!patientId || !tests || tests.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID and at least one test are required'
      })
    }
 
    // Whitelist of every value in the LabRequest.tests.category enum.
    // If the frontend sends a value outside this set (e.g. the old 'Chemistry'
    // label that was renamed to 'Biochemistry') we fall back to undefined so
    // Mongoose omits the field entirely rather than throwing a ValidationError.
    const VALID_CATEGORIES = new Set([
      'Hematology', 'Biochemistry', 'Chemistry', 'Microbiology',
      'Immunology', 'Pathology', 'Radiology', 'Imaging',
      'Serology', 'Molecular Biology', 'Other'
    ])

    const normalisedTests = tests.map(t => {
      const rawCategory = t.category || t.testType
      return {
        testName:     t.testName     || '',
        testCode:     t.testCode     || '',
        // Only pass category if it is a known enum value — unknown values would
        // cause a Mongoose ValidationError → 500 for the entire request.
        category:     (rawCategory && VALID_CATEGORIES.has(rawCategory)) ? rawCategory : undefined,
        specimenType: t.specimenType || t.specimen || '',
        instructions: t.instructions || '',
        status:       'pending'
      }
    })
 
    const labRequest = await LabRequest.create({
      patient:             patientId,
      doctor:              doctorId,
      appointment:         appointmentId,
      session:             sessionId,
      tests:               normalisedTests,
      priority:            priority || 'routine',
      clinicalNotes,
      provisionalDiagnosis,
      estimatedCost:       estimatedCost || 0,
      status:              'pending'
    })

    const resolvedFee = labRequest.estimatedCost > 0
      ? labRequest.estimatedCost
      : BillCalculator.resolveLabFee(normalisedTests.map(t => t.testName))

    if (labRequest.estimatedCost !== resolvedFee) {
      labRequest.estimatedCost = resolvedFee
      await labRequest.save()
    }

    await labRequest.populate([
      { path: 'patient', select: 'firstName lastName email' },
      { path: 'doctor',  select: 'firstName lastName specialization' }
    ])
 
    // Link lab request to session
    if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
      await Session.findByIdAndUpdate(sessionId, {
        $addToSet: { labRequests: labRequest._id }
      }).catch(err => console.error('Failed to link lab request to session:', err))
    }
 
    // Link to MedicalRecord
    if (appointmentId && mongoose.Types.ObjectId.isValid(appointmentId)) {
      await MedicalRecord.findOneAndUpdate(
        { appointment: appointmentId },
        { $addToSet: { labRequests: labRequest._id } }
      ).catch(err => console.error('Failed to link lab request to medical record:', err))
    }
 
    // ✅ BILLING HOOK — add lab fee to the draft bill immediately
    // Non-blocking: billing failure must never cancel a lab request.
    try {
      await BillCalculator.onLabRequested({
        appointmentId:  appointmentId,
        labRequestId:   labRequest._id,
        testNames:      normalisedTests.map(t => t.testName),
        estimatedCost:  resolvedFee
      })
    } catch (billErr) {
      console.error('⚠️  [BILLING] Lab billing hook failed (non-blocking):', billErr.message)
    }
 
    // Real-time broadcasts
    io.to('admin-dashboard').emit('lab:request_created', {
      labRequestId:  labRequest._id,
      requestNumber: labRequest.requestNumber,
      patientName:   `${labRequest.patient.firstName} ${labRequest.patient.lastName}`,
      doctorName:    `Dr. ${labRequest.doctor.lastName}`,
      testsCount:    labRequest.tests.length,
      priority:      labRequest.priority,
      timestamp:     new Date()
    })
    if (sessionId) {
      io.to(`session-${sessionId}`).emit('lab:requested', {
        labRequestId:  labRequest._id,
        requestNumber: labRequest.requestNumber,
        tests:         labRequest.tests.map(t => t.testName),
        priority:      labRequest.priority
      })
    }
    io.to('lab-personnel-pool').emit('lab:new_request', {
      labRequestId:  labRequest._id,
      requestNumber: labRequest.requestNumber,
      priority:      labRequest.priority,
      testsCount:    tests.length
    })
 
    await NotificationService.labNotifications.requestCreated(
      labRequest,
      await User.findById(patientId),
      await User.findById(doctorId)
    )
 
    await logAudit({
      userId:       doctorId,
      action:       'LAB_REQUEST_CREATED',
      resourceType: 'LabRequest',
      resourceId:   labRequest._id,
      details: {
        patientId,
        requestNumber: labRequest.requestNumber,
        testsCount:    tests.length,
        priority,
        estimatedCost: labRequest.estimatedCost
      },
      req,
      status: 'success'
    })
 
    return res.status(201).json({
      success: true,
      message: 'Lab request created successfully',
      data:    labRequest
    })
  } catch (error) {
    console.error('Create lab request error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get lab requests (filtered by role)
// @route   GET /api/v1/lab/requests
// @access  Private — Doctor (own) | Lab Personnel (assigned/pending) | Admin
//
// ✅ NOTE: Patient access has been REMOVED from both the route permissions
//    and here. Patients get lab results through MedicalRecord.resolvedLabResults
//    only. The patient branch below is kept defensively but will not be reached
//    because the route-level checkPermission blocks patients before this runs.
// ─────────────────────────────────────────────────────────────────────────────
export const getLabRequests = async (req, res) => {
  try {
    const userId   = req.user.id
    const userRole = req.user.role
    // Bug 3 fix: accept sessionId as a query param so the doctor's session
    // view can filter results to the current consultation only.
    const { status, priority, assignedTo, sessionId } = req.query

    let query = {}

    if (userRole === 'doctor') {
      query.doctor = userId
    } else if (userRole === 'lab_personnel') {
      query.$or = assignedTo === 'me'
        ? [{ assignedTo: userId }]
        : [{ assignedTo: userId }, { status: 'pending' }]
    }
    // admin → no filter (sees all)

    if (status)    query.status   = status
    if (priority)  query.priority = priority
    // Filter to a specific session when the doctor is viewing in-session results
    if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
      query.session = sessionId
    }

    const labRequests = await LabRequest.find(query)
      .populate('patient',    'firstName lastName email phoneNumber')
      .populate('doctor',     'firstName lastName specialization')
      .populate('assignedTo', 'firstName lastName')
      .sort({ priority: -1, createdAt: -1 })

    res.json({ success: true, count: labRequests.length, data: labRequests })
  } catch (error) {
    console.error('Get lab requests error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get single lab request
// @route   GET /api/v1/lab/requests/:id
// @access  Private — Doctor (own) | Lab Personnel (assigned) | Admin
// ─────────────────────────────────────────────────────────────────────────────
export const getLabRequestById = async (req, res) => {
  try {
    const labRequest = await LabRequest.findById(req.params.id)
      .populate('patient',        'firstName lastName email phoneNumber')
      .populate('doctor',         'firstName lastName specialization')
      .populate('assignedTo',     'firstName lastName')
      .populate('comments.user',  'firstName lastName role')

    if (!labRequest) {
      return res.status(404).json({ success: false, message: 'Lab request not found' })
    }

    if (!canAccessLabRequest(req.user, labRequest)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to view this lab request.'
      })
    }

    res.json({ success: true, data: labRequest })
  } catch (error) {
    console.error('Get lab request error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Assign lab request to lab personnel
// @route   PATCH /api/v1/lab/requests/:id/assign
// @access  Private (Lab Personnel)
// ─────────────────────────────────────────────────────────────────────────────
export const assignLabRequest = async (req, res) => {
  try {
    const labPersonnelId = req.user.id
    const labRequest     = await LabRequest.findById(req.params.id)

    if (!labRequest) {
      return res.status(404).json({ success: false, message: 'Lab request not found' })
    }

    if (labRequest.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Lab request is not in pending status' })
    }

    labRequest.assignedTo  = labPersonnelId
    labRequest.assignedAt  = new Date()
    labRequest.status      = 'assigned'
    await labRequest.save()

    await labRequest.populate([
      { path: 'patient', select: 'firstName lastName' },
      { path: 'doctor',  select: 'firstName lastName' }
    ])

    io.to(`session-${labRequest.session}`).emit('lab:assigned', {
      labRequestId:  labRequest._id,
      requestNumber: labRequest.requestNumber,
      assignedTo:    `${req.user.firstName} ${req.user.lastName}`
    })

    io.to(`doctor-${labRequest.doctor}`).emit('lab:assigned', {
      labRequestId:  labRequest._id,
      requestNumber: labRequest.requestNumber,
      status:        'assigned'
    })

    io.to('admin-dashboard').emit('lab:assigned', {
      labRequestId:  labRequest._id,
      requestNumber: labRequest.requestNumber,
      assignedTo:    labPersonnelId
    })

    await NotificationService.labNotifications.requestAssigned(
      labRequest,
      await User.findById(labPersonnelId),
      await User.findById(labRequest.patient)
    )

    await logAudit({
      userId:       labPersonnelId,
      action:       'LAB_REQUEST_ASSIGNED',
      resourceType: 'LabRequest',
      resourceId:   req.params.id,
      details: { requestNumber: labRequest.requestNumber, patientId: labRequest.patient },
      req,
      status: 'success'
    })

    res.json({ success: true, message: 'Lab request assigned successfully', data: labRequest })
  } catch (error) {
    console.error('Assign lab request error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update lab request status
// @route   PATCH /api/v1/lab/requests/:id/status
// @access  Private (Lab Personnel)
// ─────────────────────────────────────────────────────────────────────────────
export const updateLabRequestStatus = async (req, res) => {
  try {
    const { status, comment } = req.body
    const labRequest = await LabRequest.findById(req.params.id)

    if (!labRequest) {
      return res.status(404).json({ success: false, message: 'Lab request not found' })
    }

    if (req.user.role === 'lab_personnel' &&
        labRequest.assignedTo?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only update lab requests assigned to you'
      })
    }

    const previousStatus = labRequest.status
    labRequest.status    = status

    if (status === 'specimen_collected') labRequest.specimenCollectedAt  = new Date()
    if (status === 'processing')         labRequest.processingStartedAt  = new Date()
    if (status === 'completed')          labRequest.completedAt          = new Date()

    if (comment) {
      labRequest.comments.push({ user: req.user.id, text: comment, type: 'note' })
    }

    await labRequest.save()
    await labRequest.populate([
      { path: 'patient', select: 'firstName lastName email' },
      { path: 'doctor',  select: 'firstName lastName email' }
    ])

    io.to(`session-${labRequest.session}`).emit('lab:status_changed', {
      labRequestId: labRequest._id, requestNumber: labRequest.requestNumber,
      status, previousStatus, timestamp: new Date()
    })
    io.to(`doctor-${labRequest.doctor}`).emit('lab:update', {
      labRequestId: labRequest._id, requestNumber: labRequest.requestNumber, status
    })
    io.to('admin-dashboard').emit('lab:status_changed', {
      labRequestId: labRequest._id, requestNumber: labRequest.requestNumber,
      status, assignedTo: labRequest.assignedTo
    })

    await NotificationService.send({
      userId:   labRequest.doctor,
      type:     'lab_processing',
      title:    'Lab Status Updated',
      message:  `Lab request #${labRequest.requestNumber} status: ${status}`,
      data:     { labRequestId: labRequest._id, status },
      priority: 'normal',
      channels: ['in_app'],
      relatedLabRequest: labRequest._id
    })

    if (status === 'completed') {
      // ✅ NOTE: We do NOT notify the patient of raw results here.
      //    The patient notification fires in finalizeMedicalRecord() once
      //    the doctor has reviewed and the record is fully sealed.
      //    We only tell the DOCTOR that results are ready for their review.
      await NotificationService.send({
        userId:   labRequest.doctor,
        type:     'lab_results_ready',
        title:    'Lab Results Ready for Review',
        message:  `Lab results for request #${labRequest.requestNumber} are ready. Please review and finalize the medical record.`,
        data:     { labRequestId: labRequest._id },
        priority: 'high',
        channels: ['in_app', 'email'],
        relatedLabRequest: labRequest._id
      })
    }

    res.json({ success: true, message: 'Lab request status updated successfully', data: labRequest })
  } catch (error) {
    console.error('Update lab status error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Upload lab results
// @route   POST /api/v1/lab/requests/:id/results
// @access  Private (Lab Personnel)
//
// Note: billing charge was moved to createLabRequest → onLabRequested().
// This handler focuses purely on result recording.
// ─────────────────────────────────────────────────────────────────────────────
export const uploadLabResults = async (req, res) => {
  try {
    const { results, attachments, qcStatus, qcNotes } = req.body
    const labRequest = await LabRequest.findById(req.params.id)
 
    if (!labRequest) {
      return res.status(404).json({ success: false, message: 'Lab request not found' })
    }
 
    if (req.user.role === 'lab_personnel' &&
        labRequest.assignedTo?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only upload results for requests assigned to you'
      })
    }
 
    if (results && Array.isArray(results)) {
      results.forEach(result => {
        labRequest.results.push({ ...result, performedBy: req.user.id, performedAt: new Date() })
      })
    }
 
    if (attachments && Array.isArray(attachments)) {
      attachments.forEach(attachment => {
        labRequest.attachments.push({ ...attachment, uploadedBy: req.user.id, uploadedAt: new Date() })
      })
    }
 
    if (qcStatus) {
      labRequest.qcStatus = qcStatus
      labRequest.qcNotes  = qcNotes
    }
 
    labRequest.resultsUploadedAt = new Date()
    labRequest.status            = 'results_uploaded'
 
    if (labRequest.areAllTestsCompleted?.()) {
      labRequest.status      = 'completed'
      labRequest.completedAt = new Date()
      labRequest.reportedAt  = new Date()
    }
 
    await labRequest.save()
    await labRequest.populate([
      { path: 'patient', select: 'firstName lastName email' },
      { path: 'doctor',  select: 'firstName lastName email' }
    ])
 
    // Real-time broadcasts
    io.to(`session-${labRequest.session}`).emit('lab:results_ready', {
      labRequestId:  labRequest._id,
      requestNumber: labRequest.requestNumber,
      completedAt:   labRequest.completedAt
    })
    io.to(`doctor-${labRequest.doctor}`).emit('lab:results_uploaded', {
      labRequestId:  labRequest._id,
      requestNumber: labRequest.requestNumber,
      resultsCount:  results?.length || 0
    })
 
    await NotificationService.labNotifications?.resultsUploaded?.(
      labRequest,
      await User.findById(labRequest.patient),
      await User.findById(labRequest.doctor)
    )
 
    await logAudit({
      userId:       req.user.id,
      action:       'LAB_RESULTS_UPLOADED',
      resourceType: 'LabRequest',
      resourceId:   labRequest._id,
      details: {
        requestNumber: labRequest.requestNumber,
        resultsCount:  results?.length || 0,
        status:        labRequest.status
      },
      req,
      status: 'success'
    })
 
    return res.json({
      success: true,
      message: 'Lab results uploaded successfully',
      data:    labRequest
    })
  } catch (error) {
    console.error('Upload lab results error:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Add comment to lab request
// @route   POST /api/v1/lab/requests/:id/comments
// @access  Private — Doctor | Lab Personnel | Admin
// ─────────────────────────────────────────────────────────────────────────────
export const addLabComment = async (req, res) => {
  try {
    const { text, type } = req.body
    const labRequest = await LabRequest.findById(req.params.id)

    if (!labRequest) {
      return res.status(404).json({ success: false, message: 'Lab request not found' })
    }

    labRequest.comments.push({
      user:      req.user.id,
      text,
      type:      type || 'note',
      timestamp: new Date()
    })

    await labRequest.save()
    await labRequest.populate('comments.user', 'firstName lastName role')

    res.json({ success: true, message: 'Comment added successfully', data: labRequest })
  } catch (error) {
    console.error('Add lab comment error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Reject lab request
// @route   PATCH /api/v1/lab/requests/:id/reject
// @access  Private (Lab Personnel)
// ─────────────────────────────────────────────────────────────────────────────
export const rejectLabRequest = async (req, res) => {
  try {
    const { reason } = req.body
    const labRequest = await LabRequest.findById(req.params.id)

    if (!labRequest) {
      return res.status(404).json({ success: false, message: 'Lab request not found' })
    }

    labRequest.status           = 'rejected'
    labRequest.rejectionReason  = reason
    labRequest.rejectedBy       = req.user.id
    labRequest.rejectedAt       = new Date()

    labRequest.comments.push({
      user: req.user.id,
      text: `Request rejected: ${reason}`,
      type: 'rejection_reason'
    })

    await labRequest.save()
    await labRequest.populate([{ path: 'doctor', select: 'firstName lastName email' }])

    if (labRequest.appointment) {
      try {
        const bill = await Bill.findOne({
          appointment: labRequest.appointment,
          status: 'draft'
        })

        if (bill) {
          bill.lineItems = bill.lineItems.filter(
            item => !(item.type === 'lab' && String(item.referenceId) === String(labRequest._id))
          )
          BillCalculator.recompute(bill)
          await bill.save()
          console.log(`✅  [BILLING] Lab charge reversed on bill ${bill.billNumber} after request rejection`)
        }
      } catch (reverseErr) {
        console.error('⚠️  [BILLING] Failed to reverse lab charge on rejection:', reverseErr.message)
      }
    }

    await NotificationService.send({
      userId:   labRequest.doctor,
      type:     'lab_request_rejected',
      title:    'Lab Request Rejected',
      message:  `Lab request #${labRequest.requestNumber} was rejected. Reason: ${reason}`,
      data:     { labRequestId: labRequest._id },
      priority: 'normal',
      channels: ['in_app'],
      relatedLabRequest: labRequest._id
    })

    res.json({ success: true, message: 'Lab request rejected', data: labRequest })
  } catch (error) {
    console.error('Reject lab request error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

export default {
  createLabRequest,
  getLabRequests,
  getLabRequestById,
  assignLabRequest,
  updateLabRequestStatus,
  uploadLabResults,
  addLabComment,
  rejectLabRequest
}
