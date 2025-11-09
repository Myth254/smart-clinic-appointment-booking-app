import axiosClient from './axiosClient'

export const notificationsAPI = {
  // User notification routes
  getNotifications: async (params = {}) => {
    const response = await axiosClient.get('/notifications', { params });
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await axiosClient.get('/notifications/unread-count');
    return response.data;
  },

  getNotificationStats: async () => {
    const response = await axiosClient.get('/notifications/stats');
    return response.data;
  },

  markAsRead: async (notificationId) => {
    const response = await axiosClient.put(`/notifications/${notificationId}/read`);
    return response.data;
  },

  markAllAsRead: async () => {
    const response = await axiosClient.put('/notifications/mark-all-read');
    return response.data;
  },

  deleteNotification: async (notificationId) => {
    const response = await axiosClient.delete(`/notifications/${notificationId}`);
    return response.data;
  },

  clearReadNotifications: async () => {
    const response = await axiosClient.delete('/notifications/clear-read');
    return response.data;
  },

  // Admin notification routes
  sendCustomNotification: async (notificationData) => {
    const response = await axiosClient.post('/notifications/send', notificationData);
    return response.data;
  },

  sendNotificationToRole: async (roleData) => {
    const response = await axiosClient.post('/notifications/send-to-role', roleData);
    return response.data;
  },

  // Notification template routes (Admin only)
  getNotificationTemplates: async () => {
    const response = await axiosClient.get('/notifications/templates');
    return response.data;
  },

  getNotificationTemplate: async (key) => {
    const response = await axiosClient.get(`/notifications/templates/${key}`);
    return response.data;
  },

  createTemplate: async (templateData) => {
    const response = await axiosClient.post('/notifications/templates', templateData);
    return response.data;
  },

  updateTemplate: async (key, templateData) => {
    const response = await axiosClient.put(`/notifications/templates/${key}`, templateData);
    return response.data;
  },

  deleteTemplate: async (key) => {
    const response = await axiosClient.delete(`/notifications/templates/${key}`);
    return response.data;
  },
};

export default notificationsAPI;