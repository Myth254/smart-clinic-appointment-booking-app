// api/notifications.js - FIXED VERSION
import axiosClient from './axiosClient'

export const notificationsAPI = {
  // ✅ FIXED: Now properly awaits and returns data
  getNotifications: async (params = {}, config = {}) => {
    const controller = new AbortController();
    config.signal = controller.signal;

    try {
      const response = await axiosClient.get('/notifications', { params, ...config });

      // ✅ Return the actual data, not the promise
      return response.data;
    } catch (error) {
      // Re-throw abort errors as-is so components can handle them
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        throw error;
      }

      // Re-throw other errors
      throw error;
    }
  },

  getUnreadCount: async (config = {}) => {
    const response = await axiosClient.get('/notifications/unread-count', config);
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

  // ✅ NEW: Delivery status endpoint
  getDeliveryStatus: async (notificationId) => {
    const response = await axiosClient.get(`/notifications/${notificationId}/delivery-status`);
    return response.data;
  },

  // ✅ NEW: Retry failed notification
  retryFailedNotification: async (notificationId) => {
    const response = await axiosClient.post(`/notifications/${notificationId}/retry`);
    return response.data;
  },
};

export default notificationsAPI;