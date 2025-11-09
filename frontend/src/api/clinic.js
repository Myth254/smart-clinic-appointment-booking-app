import axiosClient from './axiosClient'

export const clinicAPI = {
  // Public routes
  getAllClinics: async (params = {}) => {
    const response = await axiosClient.get('/clinics', { params });
    return response.data;
  },

  getClinicById: async (clinicId) => {
    const response = await axiosClient.get(`/clinics/${clinicId}`);
    return response.data;
  },

  getDoctorsByClinic: async (clinicId) => {
    const response = await axiosClient.get(`/clinics/${clinicId}/doctors`);
    return response.data;
  },

  // Admin routes
  createClinic: async (clinicData) => {
    const response = await axiosClient.post('/clinics', clinicData);
    return response.data;
  },

  updateClinic: async (clinicId, clinicData) => {
    const response = await axiosClient.put(`/clinics/${clinicId}`, clinicData);
    return response.data;
  },

  updateClinicStatus: async (clinicId, status) => {
    const response = await axiosClient.put(`/clinics/${clinicId}/status`, { status });
    return response.data;
  },

  getClinicStats: async (clinicId) => {
    const response = await axiosClient.get(`/clinics/${clinicId}/stats`);
    return response.data;
  },

  deleteClinic: async (clinicId) => {
    const response = await axiosClient.delete(`/clinics/${clinicId}`);
    return response.data;
  },
};

export default clinicAPI;