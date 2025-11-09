import axiosClient from './axiosClient'

export const doctorAPI = {
  // Get all doctors (public route for searching)
  getAllDoctors: async (params = {}) => {
    const response = await axiosClient.get('/doctors/all', { params });
    return response.data;
  },

  // Profile routes
  getProfile: async () => {
    const response = await axiosClient.get('/doctors/profile');
    return response.data;
  },

  updateProfile: async (profileData) => {
    const response = await axiosClient.put('/doctors/profile', profileData);
    return response.data;
  },

  // Stats route
  getStats: async () => {
    const response = await axiosClient.get('/doctors/stats');
    return response.data;
  },

  // Appointment routes
  getAppointments: async (params = {}) => {
    const response = await axiosClient.get('/doctors/appointments', { params });
    return response.data;
  },

  updateAppointmentStatus: async (appointmentId, statusData) => {
    const response = await axiosClient.put(`/doctors/appointments/${appointmentId}/status`, statusData);
    return response.data;
  },

  addMedicalNotes: async (appointmentId, notesData) => {
    const response = await axiosClient.post(`/doctors/appointments/${appointmentId}/notes`, notesData);
    return response.data;
  },

  // Patient routes
  getPatients: async (params = {}) => {
    const response = await axiosClient.get('/doctors/patients', { params });
    return response.data;
  },

  getPatientDetails: async (patientId) => {
    const response = await axiosClient.get(`/doctors/patients/${patientId}`);
    return response.data;
  },

  getPatientHistory: async (patientId) => {
    const response = await axiosClient.get(`/doctors/patients/${patientId}/history`);
    return response.data;
  },

  // Calendar route
  getCalendar: async (params = {}) => {
    const response = await axiosClient.get('/doctors/calendar', { params });
    return response.data;
  },
};

export default doctorAPI;