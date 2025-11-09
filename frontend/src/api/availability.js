import axiosClient from './axiosClient'

export const availabilityAPI = {
  // Get availability rules for a doctor
  getDoctorRules: async (doctorId) => {
    const response = await axiosClient.get(`/availability/rules/${doctorId}`);
    return response.data;
  },

  // Get available slots for a doctor on a specific date
  getAvailableSlots: async (doctorId, date) => {
    const response = await axiosClient.get(`/availability/slots/${doctorId}/${date}`);
    return response.data;
  },

  // Get exceptions for a doctor
  getDoctorExceptions: async (doctorId) => {
    const response = await axiosClient.get(`/availability/exceptions/${doctorId}`);
    return response.data;
  },

  // Create availability rule (Doctor only)
  createRule: async (ruleData) => {
    const response = await axiosClient.post('/availability/rules', ruleData);
    return response.data;
  },

  // Update availability rule (Doctor/Admin)
  updateRule: async (ruleId, ruleData) => {
    const response = await axiosClient.put(`/availability/rules/${ruleId}`, ruleData);
    return response.data;
  },

  // Delete availability rule (Doctor/Admin)
  deleteRule: async (ruleId) => {
    const response = await axiosClient.delete(`/availability/rules/${ruleId}`);
    return response.data;
  },

  // Create availability exception (Doctor only)
  createException: async (exceptionData) => {
    const response = await axiosClient.post('/availability/exceptions', exceptionData);
    return response.data;
  },

  // Update availability exception (Doctor/Admin)
  updateException: async (exceptionId, exceptionData) => {
    const response = await axiosClient.put(`/availability/exceptions/${exceptionId}`, exceptionData);
    return response.data;
  },

  // Delete availability exception (Doctor/Admin)
  deleteException: async (exceptionId) => {
    const response = await axiosClient.delete(`/availability/exceptions/${exceptionId}`);
    return response.data;
  },
};

export default availabilityAPI;