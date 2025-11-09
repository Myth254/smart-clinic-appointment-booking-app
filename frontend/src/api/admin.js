import axiosClient from './axiosClient'

export const adminAPI = {
  // ===== DASHBOARD & ANALYTICS =====
  getDashboardStats: async () => {
    const response = await axiosClient.get('/admin/stats');
    return response.data;
  },

  getAppointmentAnalytics: async (params = {}) => {
    const response = await axiosClient.get('/admin/analytics/appointments', { params });
    return response.data;
  },

  getRevenueAnalytics: async (params = {}) => {
    const response = await axiosClient.get('/admin/analytics/revenue', { params });
    return response.data;
  },

  // ===== USER MANAGEMENT =====
  getAllUsers: async (params = {}) => {
    const response = await axiosClient.get('/admin/users', { params });
    return response.data;
  },

  getRecentUsers: async () => {
    const response = await axiosClient.get('/admin/users/recent');
    return response.data;
  },

  createUser: async (userData) => {
    const response = await axiosClient.post('/admin/users', userData);
    return response.data;
  },

  getUserById: async (userId) => {
    const response = await axiosClient.get(`/admin/users/${userId}`);
    return response.data;
  },

  updateUser: async (userId, userData) => {
    const response = await axiosClient.put(`/admin/users/${userId}`, userData);
    return response.data;
  },

  updateUserStatus: async (userId, status) => {
    const response = await axiosClient.put(`/admin/users/${userId}/status`, { status });
    return response.data;
  },

  resetUserPassword: async (userId, newPassword) => {
    const response = await axiosClient.put(`/admin/users/${userId}/reset-password`, {
      newPassword
    });
    return response.data;
  },

  deleteUser: async (userId) => {
    const response = await axiosClient.delete(`/admin/users/${userId}`);
    return response.data;
  },

  // ===== DOCTOR MANAGEMENT =====
  getAllDoctors: async (params = {}) => {
    const response = await axiosClient.get('/admin/doctors', { params });
    return response.data;
  },

  // Get all doctors (public - for searching/filtering)
  searchDoctors: async (params = {}) => {
    const response = await axiosClient.get('/users/doctors', { params });
    return response.data;
  },

  // ===== APPOINTMENT MANAGEMENT =====
  getAllAppointments: async (params = {}) => {
    const response = await axiosClient.get('/admin/appointments', { params });
    return response.data;
  },

  // ===== SYSTEM SETTINGS =====
  getSystemSettings: async () => {
    const response = await axiosClient.get('/admin/settings');
    return response.data;
  },

  updateSystemSettings: async (settings) => {
    const response = await axiosClient.put('/admin/settings', settings);
    return response.data;
  },
};

export default adminAPI;