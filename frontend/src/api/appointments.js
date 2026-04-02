// api/appointments.js
import axiosClient from './axiosClient'

export const appointmentsAPI = {
  // Create appointment - matches validation.js schema
  createAppointment: async (appointmentData) => {
    const payload = {
      doctorId: appointmentData.doctorId,
      start: appointmentData.start,
      end: appointmentData.end,
      reason: appointmentData.reason,
      type: appointmentData.type || 'consultation',
      notes: appointmentData.notes || ''
    };

    // ✅ FIX: Only include followUpOf if it's a valid non-empty string
    // Omitting the field entirely is better than sending null/undefined
    if (appointmentData.followUpOf && typeof appointmentData.followUpOf === 'string') {
      payload.followUpOf = appointmentData.followUpOf;
    }

    console.log('📤 Creating appointment with payload:', payload);

    const response = await axiosClient.post('/appointments', payload);
    return response.data;
  },

  // Get all appointments for logged-in user
  getAppointments: async (filters = {}) => {
    const params = new URLSearchParams();
    
    if (filters.status) params.append('status', filters.status);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);

    const response = await axiosClient.get(`/appointments?${params.toString()}`);
    return response.data;
  },

  // Get appointment by ID
  getAppointmentById: async (appointmentId) => {
    const response = await axiosClient.get(`/appointments/${appointmentId}`);
    return response.data;
  },

  // ✅ NEW: Start appointment session (Doctor only)
  /**
   * Start a session for an appointment
   * @param {string} appointmentId - Appointment ID
   * @returns {Promise} - { success, message, data: { session, appointment } }
   */
  startAppointmentSession: async (appointmentId) => {
    const response = await axiosClient.post(`/appointments/${appointmentId}/start-session`);
    return response.data;
  },

  // Update appointment status (Doctor/Admin)
  updateAppointmentStatus: async (appointmentId, statusData) => {
    const response = await axiosClient.put(
      `/appointments/${appointmentId}/status`,
      statusData
    );
    return response.data;
  },

  dismissFollowUpReminder: async (appointmentId) => {
    const response = await axiosClient.put(
      `/appointments/${appointmentId}/follow-up-reminder/dismiss`
    );
    return response.data;
  },

  // Reschedule appointment
  rescheduleAppointment: async (appointmentId, rescheduleData) => {
    const payload = {
      newStart: rescheduleData.newStart,
      newEnd: rescheduleData.newEnd,
      reason: rescheduleData.reason || ''
    };

    const response = await axiosClient.put(
      `/appointments/${appointmentId}/reschedule`,
      payload
    );
    return response.data;
  },

  // Cancel appointment
  cancelAppointment: async (appointmentId, reason) => {
    const response = await axiosClient.put(
      `/appointments/${appointmentId}/status`,
      {
        status: 'cancelled',
        notes: reason
      }
    );
    return response.data;
  },

  // Check for conflicts
  checkConflicts: async (conflictData) => {
    const response = await axiosClient.post('/appointments/check-conflicts', conflictData);
    return response.data;
  },

  // Get appointments by doctor (Doctor/Admin)
  getAppointmentsByDoctor: async (doctorId, filters = {}) => {
    const params = new URLSearchParams();
    
    if (filters.status) params.append('status', filters.status);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await axiosClient.get(
      `/appointments/doctor/${doctorId}?${params.toString()}`
    );
    return response.data;
  },

  // Get appointments by patient (Patient/Admin)
  getAppointmentsByPatient: async (patientId, filters = {}) => {
    const params = new URLSearchParams();
    
    if (filters.status) params.append('status', filters.status);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await axiosClient.get(
      `/appointments/patient/${patientId}?${params.toString()}`
    );
    return response.data;
  },

  // Delete appointment (Admin)
  deleteAppointment: async (appointmentId) => {
    const response = await axiosClient.delete(`/appointments/${appointmentId}`);
    return response.data;
  },
};

export default appointmentsAPI;
