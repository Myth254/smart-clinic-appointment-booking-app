import express from 'express'
import {
  startSession,
  createSession,
  getSessionByAppointment,
  getSessionById,
  updateSession,
  completeSession,
  extendSession,
  getDoctorSessions,
  addLabRequestToSession,
  autosaveSession,
  getActiveSession,
  checkSessionStatus,
  getActiveDoctorSession   // NEW: modal-restore endpoint
} from '../controllers/sessionController.js'
import { protect, authorize } from '../middlewares/authMiddleware.js'

const router = express.Router()

// ── Health check routes (no auth required) ──────────────────────────────────

router.get('/test', (req, res) => {
  console.log('✅ Session test route hit!')
  res.json({
    success: true,
    message: 'Session routes are working!',
    timestamp: new Date().toISOString()
  })
})

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Session routes are healthy!',
    timestamp: new Date().toISOString()
  })
})

// All routes below require authentication
router.use(protect)

// ── DOCTOR-ONLY ROUTES ───────────────────────────────────────────────────────

// Start new session (or resume own in-progress session — idempotent)
router.post('/start', authorize('doctor'), startSession)

// Create session (legacy support — also idempotent)
router.post('/', authorize('doctor'), createSession)

// ─── SESSION PERSISTENCE: modal-restore endpoint ─────────────────────────────
// Called by the doctor's dashboard on every page load / component mount.
// Returns the doctor's active in-progress session (if any) so the frontend
// can automatically reopen the session modal without the doctor losing context.
//
// IMPORTANT: this route MUST be declared before '/:sessionId' and
// '/doctor/my-sessions' to avoid Express matching 'active-session' as a
// :sessionId or treating 'active-session' as part of the my-sessions path.
router.get('/doctor/active-session', authorize('doctor'), getActiveDoctorSession)
// ─────────────────────────────────────────────────────────────────────────────

// Get doctor's session history
router.get('/doctor/my-sessions', authorize('doctor'), getDoctorSessions)

// Update session data
router.put('/:sessionId', authorize('doctor'), updateSession)

// Extend session by 15 or 30 minutes (FIX D)
// Must be declared before '/:sessionId/complete' to guarantee Express picks
// 'extend' as the action segment and not as a sessionId sub-resource collision.
router.patch('/:sessionId/extend', authorize('doctor'), extendSession)

// Complete session — the ONLY legitimate termination path
router.patch('/:sessionId/complete', authorize('doctor'), completeSession)

// Add a lab request to an active session
router.post('/:sessionId/lab-requests', authorize('doctor'), addLabRequestToSession)

// Periodic autosave during consultation (also stamps doctor activity)
router.patch('/:sessionId/autosave', authorize('doctor'), autosaveSession)

// ── DOCTOR & PATIENT ROUTES ──────────────────────────────────────────────────

// Get session by appointment ID
router.get('/appointment/:appointmentId', authorize('doctor', 'patient'), getSessionByAppointment)

// Get session by session ID
router.get('/:sessionId', authorize('doctor', 'patient'), getSessionById)

// ── DOCTOR, PATIENT & ADMIN ROUTES ──────────────────────────────────────────

// Get active session for a specific appointment
router.get('/appointment/:appointmentId/active', authorize('doctor', 'patient', 'admin'), getActiveSession)

// Check session status (includes time validity and doctor presence)
router.get('/:sessionId/status', authorize('doctor', 'patient', 'admin'), checkSessionStatus)

export default router