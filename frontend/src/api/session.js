// api/session.js
import axiosClient from './axiosClient';

export const sessionsAPI = {
  /**
   * Start new session or resume an existing in-progress session (idempotent).
   * Returns { success, resumed, data: session }
   * resumed === true  → doctor is rejoining; frontend should reopen modal.
   * resumed === false → fresh session was created.
   */
  startSession: async (sessionData) => {
    const response = await axiosClient.post('/sessions/start', sessionData);
    return response.data;
  },

  /**
   * Create new session (legacy support — also idempotent).
   */
  createSession: async (sessionData) => {
    const response = await axiosClient.post('/sessions', sessionData);
    return response.data;
  },

  /**
   * Called on every dashboard mount to check whether this doctor has an
   * active in-progress session that should reopen the session modal.
   * Returns { success, hasActiveSession, remainingTime?, data: session | null }
   */
  getActiveDoctorSession: async () => {
    const response = await axiosClient.get('/sessions/doctor/active-session');
    return response.data;
  },

  /**
   * Get session by appointment ID.
   */
  getSessionByAppointment: async (appointmentId) => {
    const response = await axiosClient.get(`/sessions/appointment/${appointmentId}`);
    return response.data;
  },

  /**
   * Get session by session ID.
   */
  getSessionById: async (sessionId) => {
    const response = await axiosClient.get(`/sessions/${sessionId}`);
    return response.data;
  },

  /**
   * Full session update.
   */
  updateSession: async (sessionId, updates) => {
    const response = await axiosClient.put(`/sessions/${sessionId}`, updates);
    return response.data;
  },

  /**
   * Periodic autosave during a consultation.
   * Also stamps lastDoctorActivity on the backend, resetting the
   * presence-grace auto-close timer.
   * @param {string} sessionId
   * @param {Object} updates — any of: complaints, vitalSigns, clinicalObservations,
   *                           provisionalDiagnosis, sessionNotes
   */
  autosaveSession: async (sessionId, updates) => {
    const response = await axiosClient.patch(`/sessions/${sessionId}/autosave`, updates);
    return response.data;
  },

  /**
   * Explicitly complete a session.
   * This is the ONLY legitimate way to end a session on the frontend.
   * The backend will clear the auto-close timer and mark the session completed.
   */
  completeSession: async (sessionId) => {
    const response = await axiosClient.patch(`/sessions/${sessionId}/complete`);
    return response.data;
  },

  /**
   * Get the currently active (in_progress) session for a given appointment.
   */
  getActiveSession: async (appointmentId) => {
    const response = await axiosClient.get(`/sessions/appointment/${appointmentId}/active`);
    return response.data;
  },

  /**
   * Check session status — includes time validity and doctorPresent flag.
   */
  checkSessionStatus: async (sessionId) => {
    const response = await axiosClient.get(`/sessions/${sessionId}/status`);
    return response.data;
  },

  /**
   * Get all sessions for the logged-in doctor.
   * @param {Object} params — { status?, startDate?, endDate? }
   */
  getDoctorSessions: async (params = {}) => {
    const response = await axiosClient.get('/sessions/doctor/my-sessions', { params });
    return response.data;
  },

  /**
   * Extend an active session by 15 or 30 minutes.
   * The backend reschedules the auto-close timer and re-emits the
   * session:expiring_soon warning at the new -5 min threshold.
   * @param {string} sessionId
   * @param {15|30} extraMinutes
   */
  extendSession: async (sessionId, extraMinutes) => {
    const response = await axiosClient.patch(`/sessions/${sessionId}/extend`, { extraMinutes });
    return response.data;
  },

  /**
   * Attach a lab request to a session.
   */
  addLabRequestToSession: async (sessionId, labRequestId) => {
    const response = await axiosClient.post(`/sessions/${sessionId}/lab-requests`, { labRequestId });
    return response.data;
  },
};

export default sessionsAPI;