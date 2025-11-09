import axiosClient from './axiosClient'

export const patientAPI = {
  // Profile routes - FIXED: All use /patients/ consistently
  getProfile: async (patientId) => {
    const response = await axiosClient.get(`/patients/${patientId}`);
    return response.data;
  },

  updateProfile: async (patientId, profileData) => {
    const response = await axiosClient.put(`/patients/${patientId}`, profileData);
    return response.data;
  },

  getStats: async (patientId) => {
    const response = await axiosClient.get(`/patients/${patientId}/stats`);
    return response.data;
  },

  // Get all doctors (public route for searching)
  getAllDoctors: async (params = {}) => {
    const response = await axiosClient.get('/patients/doctors', { params });
    return response.data;
  },

  // Appointment routes
  getAppointments: async (patientId, params = {}) => {
    const response = await axiosClient.get(`/patients/${patientId}/appointments`, { params });
    return response.data;
  },

  bookAppointment: async (patientId, appointmentData) => {
    const response = await axiosClient.post(`/patients/${patientId}/appointments`, appointmentData);
    return response.data;
  },

  rescheduleAppointment: async (patientId, appointmentId, rescheduleData) => {
    const response = await axiosClient.put(`/patients/${patientId}/appointments/${appointmentId}`, rescheduleData);
    return response.data;
  },

  cancelAppointment: async (patientId, appointmentId, reason) => {
    const response = await axiosClient.delete(`/patients/${patientId}/appointments/${appointmentId}`, {
      data: { reason }
    });
    return response.data;
  },

  // Medical records routes
  getMedicalRecords: async (patientId, params = {}) => {
    const response = await axiosClient.get(`/patients/${patientId}/medical-records`, { params });
    return response.data;
  },

  getMedicalRecordById: async (patientId, recordId) => {
    const response = await axiosClient.get(`/patients/${patientId}/medical-records/${recordId}`);
    return response.data;
  },

  // Notification routes
  getNotifications: async (patientId, params = {}) => {
    const response = await axiosClient.get(`/patients/${patientId}/notifications`, { params });
    return response.data;
  },

  getUnreadCount: async (patientId) => {
    const response = await axiosClient.get(`/patients/${patientId}/notifications/unread-count`);
    return response.data;
  },

  markNotificationRead: async (patientId, notificationId) => {
    const response = await axiosClient.put(`/patients/${patientId}/notifications/${notificationId}/read`);
    return response.data;
  },

  markAllNotificationsRead: async (patientId) => {
    const response = await axiosClient.put(`/patients/${patientId}/notifications/mark-all-read`);
    return response.data;
  },
};

export default patientAPI;