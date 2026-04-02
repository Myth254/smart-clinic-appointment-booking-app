// api/admin.js
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

  getWorkflowMetrics: async (params = {}) => {
    const response = await axiosClient.get('/admin/analytics/workflow', { params });
    return response.data;
  },

  getBottleneckAnalysis: async (params = {}) => {
    const response = await axiosClient.get('/admin/analytics/bottlenecks', { params });
    return response.data;
  },

  // ===== USER MANAGEMENT =====
  // NOTE: Backend getAllUsers only filters by ['patient','doctor','admin'].
  // lab_personnel and pharmacy_staff users exist in the User model but the
  // controller ignores those roles in its filter. Pass role anyway — backend will
  // return all users when role is not in the allowed list (filter stays empty).
  getAllUsers: async (params = {}) => {
    const response = await axiosClient.get('/admin/users', { params });
    return response.data;
  },

  getRecentUsers: async (params = {}) => {
    const response = await axiosClient.get('/admin/users/recent', { params });
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
    const response = await axiosClient.put(`/admin/users/${userId}/reset-password`, { newPassword });
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

  // ===== APPOINTMENT MANAGEMENT =====
  getAllAppointments: async (params = {}) => {
    const response = await axiosClient.get('/admin/appointments', { params });
    return response.data;
  },

  approveAppointment: async (appointmentId, approvalData = {}) => {
    const response = await axiosClient.post(`/admin/appointments/${appointmentId}/approve`, approvalData);
    return response.data;
  },

  rejectAppointment: async (appointmentId, rejectionData) => {
    const response = await axiosClient.post(`/admin/appointments/${appointmentId}/reject`, rejectionData);
    return response.data;
  },

  // Returns { success, appointment, session, patientHistory }
  getAppointmentDetails: async (appointmentId) => {
    const response = await axiosClient.get(`/admin/appointments/${appointmentId}/details`);
    return response.data;
  },

  // ===== SESSION OVERSIGHT =====
  // Returns { success, sessions, pagination, metrics }
  getAllSessions: async (params = {}) => {
    const response = await axiosClient.get('/admin/sessions', { params });
    return response.data;
  },

  // Returns { success, session }
  getSessionDetails: async (sessionId) => {
    const response = await axiosClient.get(`/admin/sessions/${sessionId}`);
    return response.data;
  },

  // ===== LAB OVERSIGHT =====
  getLabMetrics: async (params = {}) => {
    const response = await axiosClient.get('/admin/lab/metrics', { params });
    return response.data;
  },

  getLabRequestDetails: async (requestId) => {
    const response = await axiosClient.get(`/admin/lab/requests/${requestId}`);
    return response.data;
  },

  reassignLabRequest: async (requestId, reassignData) => {
    const response = await axiosClient.patch(`/admin/lab/requests/${requestId}/reassign`, reassignData);
    return response.data;
  },

  escalateLabRequest: async (requestId, escalationData) => {
    const response = await axiosClient.patch(`/admin/lab/requests/${requestId}/escalate`, escalationData);
    return response.data;
  },

  // ===== PHARMACY OVERSIGHT =====
  getPharmacyMetrics: async (params = {}) => {
    const response = await axiosClient.get('/admin/pharmacy/metrics', { params });
    return response.data;
  },

  getPrescriptionDetails: async (prescriptionId) => {
    const response = await axiosClient.get(`/admin/pharmacy/prescriptions/${prescriptionId}`);
    return response.data;
  },

  // ===== PAYMENT OVERSIGHT =====
  // Returns { success, payments, pagination, summary }
  getAllPayments: async (params = {}) => {
    const response = await axiosClient.get('/admin/payments', { params });
    return response.data;
  },

  reconcilePayment: async (paymentId, reconciliationData) => {
    const response = await axiosClient.post(`/admin/payments/${paymentId}/reconcile`, reconciliationData);
    return response.data;
  },

  unlockService: async (paymentId, serviceData) => {
    const response = await axiosClient.post(`/admin/payments/${paymentId}/unlock`, serviceData);
    return response.data;
  },
  // NOTE: GET /admin/payments/:id/impact does NOT exist in backend routes — removed.

  // ===== NOTIFICATION MONITORING =====
  // Returns { success, notifications, pagination }
  getFailedNotifications: async (params = {}) => {
    const response = await axiosClient.get('/admin/notifications/failed', { params });
    return response.data;
  },

  retryNotification: async (notificationId) => {
    const response = await axiosClient.post(`/admin/notifications/${notificationId}/retry`);
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

  // ===== AUDIT LOGS =====
  // Returns { success, logs, pagination }
  getAuditLogs: async (params = {}) => {
    const response = await axiosClient.get('/admin/audit-logs', { params });
    return response.data;
  },

  // Returns { success, data }
  getAuditLogById: async (logId) => {
    const response = await axiosClient.get(`/admin/audit-logs/${logId}`);
    return response.data;
  },

  // Returns { success, period, summary, topActions, topUsers, dailyTrend, resourceBreakdown }
  getAuditStats: async (params = {}) => {
    const response = await axiosClient.get('/admin/audit-logs/stats', { params });
    return response.data;
  },

  // NOTE: /admin/medical-records/* routes do NOT exist in backend — removed entirely.
};

export default adminAPI;