import axiosClient from './axiosClient'

export const specialtyAPI = {
  // Public routes
  getPopularSpecialties: async () => {
    const response = await axiosClient.get('/specialties/popular');
    return response.data;
  },

  getAllSpecialties: async (params = {}) => {
    const response = await axiosClient.get('/specialties', { params });
    return response.data;
  },

  getSpecialtyById: async (specialtyId) => {
    const response = await axiosClient.get(`/specialties/${specialtyId}`);
    return response.data;
  },

  getDoctorsBySpecialty: async (specialtyName) => {
    const response = await axiosClient.get(`/specialties/${specialtyName}/doctors`);
    return response.data;
  },

  // Admin routes
  createSpecialty: async (specialtyData) => {
    const response = await axiosClient.post('/specialties', specialtyData);
    return response.data;
  },

  updateSpecialty: async (specialtyId, specialtyData) => {
    const response = await axiosClient.put(`/specialties/${specialtyId}`, specialtyData);
    return response.data;
  },

  updateSpecialtyStatus: async (specialtyId, status) => {
    const response = await axiosClient.put(`/specialties/${specialtyId}/status`, { status });
    return response.data;
  },

  getSpecialtyStats: async (specialtyId) => {
    const response = await axiosClient.get(`/specialties/${specialtyId}/stats`);
    return response.data;
  },

  deleteSpecialty: async (specialtyId) => {
    const response = await axiosClient.delete(`/specialties/${specialtyId}`);
    return response.data;
  },
};

export default specialtyAPI;