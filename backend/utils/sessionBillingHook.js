// utils/sessionBillingHook.js
//
// ✅ FIX #14 — Bill creation wired to session start event.
//
// USAGE: Import and call createBillForSession() at the point in your
// sessionController where the doctor starts / opens a session.
//
// Example (sessionController.js — startSession or createSession function):
//
//   import { createBillForSession } from '../utils/sessionBillingHook.js'
//
//   export const startSession = async (req, res) => {
//     // ... your existing session creation logic ...
//     const session = await Session.create({ ... })
//
//     // ✅ Auto-create the bill as soon as the session is opened
//     await createBillForSession({
//       appointmentId: session.appointment,   // required
//       sessionId:     session._id,           // optional — links bill to session
//       doctorId:      req.user.id
//     })
//
//     res.status(201).json({ success: true, data: session })
//   }
//
// The function is fully idempotent — calling it twice for the same
// appointment returns the existing bill without creating a duplicate.

import Appointment from '../models/Appointment.js'
import BillCalculator from '../services/billing/BillCalculator.js'

/**
 * Create (or return existing) a Bill for the given appointment.
 *
 * @param {{ appointmentId: string, sessionId?: string, doctorId: string }} params
 * @returns {Promise<import('mongoose').Document>} The Bill document
 */
export const createBillForSession = async ({ appointmentId, sessionId, doctorId }) => {
  if (!appointmentId) {
    console.warn('⚠️  createBillForSession: appointmentId is required — skipping')
    return null
  }

  // ── Resolve appointment + fee ──────────────────────────────────────────────
  const appointment = await Appointment.findById(appointmentId)
  if (!appointment) {
    console.error(`❌  createBillForSession: appointment ${appointmentId} not found`)
    return null
  }

  const { bill } = await BillCalculator.onSessionStart({
    appointmentId:   String(appointment._id),
    sessionId:       sessionId ? String(sessionId) : null,
    doctorId:        String(doctorId || appointment.doctor),
    patientId:       String(appointment.patient),
    appointmentType: appointment.appointmentType || appointment.type
  })

  return bill
}

/**
 * Safe wrapper — logs errors but never throws.
 * Use this in sessionController so a billing failure never crashes session start.
 *
 * @param {{ appointmentId: string, sessionId?: string, doctorId: string }} params
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const createBillForSessionSafe = async (params) => {
  try {
    return await createBillForSession(params)
  } catch (err) {
    console.error('⚠️  createBillForSession error (non-blocking):', err.message)
    return null
  }
}

export default { createBillForSession, createBillForSessionSafe }
