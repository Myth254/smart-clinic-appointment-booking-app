// api/payments.js
import axiosClient from './axiosClient';

export const paymentsAPI = {
  /**
   * Initiate M-Pesa STK Push payment
   * @param {Object} paymentData - { amount, phoneNumber, referenceId, type }
   * @returns {Promise}
   */
  initiateMpesaPayment: async (paymentData) => {
    const response = await axiosClient.post('/payments/mpesa/stk-push', paymentData);
    return response.data;
  },

  /**
   * Query M-Pesa transaction status
   * @param {string} checkoutRequestId - M-Pesa checkout request ID
   * @returns {Promise}
   */
  queryMpesaTransaction: async (checkoutRequestId) => {
    const response = await axiosClient.get(`/payments/mpesa/query/${checkoutRequestId}`);
    return response.data;
  },

  retryPayment: async (paymentId) => {
    const response = await axiosClient.post(`/payments/${paymentId}/retry`);
    return response.data;
  },

  /**
   * Get user payment history
   * @param {Object} params - { status, type, limit, offset }
   * @returns {Promise}
   */
  getPaymentHistory: async (params = {}) => {
    const response = await axiosClient.get('/payments/history', { params });
    return response.data;
  },

  /**
   * Get payment by ID
   * @param {string} paymentId - Payment ID
   * @returns {Promise}
   */
  getPaymentById: async (paymentId) => {
    const response = await axiosClient.get(`/payments/${paymentId}`);
    return response.data;
  },

  /**
   * Get payment statistics (Admin only)
   * @returns {Promise}
   */
  getPaymentStats: async () => {
    const response = await axiosClient.get('/payments/stats');
    return response.data;
  },

  /**
   * Helper function to format phone number for M-Pesa
   * @param {string} phoneNumber - Phone number in any format
   * @returns {string} - Formatted phone number (254XXXXXXXXX)
   */
  formatPhoneNumber: (phoneNumber) => {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle different formats
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('254')) {
      // Already in correct format
    } else if (cleaned.startsWith('+254')) {
      cleaned = cleaned.substring(1);
    } else if (cleaned.length === 9) {
      // Assume it's missing country code and leading 0
      cleaned = '254' + cleaned;
    }
    
    return cleaned;
  },

  /**
   * Validate phone number
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} - True if valid Kenyan number
   */
  validatePhoneNumber: (phoneNumber) => {
    const formatted = paymentsAPI.formatPhoneNumber(phoneNumber);
    return /^254[17]\d{8}$/.test(formatted);
  }
};

export default paymentsAPI;