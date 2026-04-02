// api/pharmacy.js
import axiosClient from './axiosClient'

export const pharmacyAPI = {
  // Create prescription (Doctor)
  createPrescription: async (prescriptionData) => {
    const response = await axiosClient.post('/pharmacy/prescriptions', prescriptionData);
    return response.data;
  },

  // Get prescriptions (filtered by role)
  getPrescriptions: async (params = {}) => {
    const response = await axiosClient.get('/pharmacy/prescriptions', { params });
    return response.data;
  },

  // Get single prescription
  getPrescriptionById: async (prescriptionId) => {
    const response = await axiosClient.get(`/pharmacy/prescriptions/${prescriptionId}`);
    return response.data;
  },

  // Confirm drug availability (Pharmacy Staff)
  confirmAvailability: async (prescriptionId, availabilityData) => {
    const response = await axiosClient.patch(
      `/pharmacy/prescriptions/${prescriptionId}/confirm-availability`,
      availabilityData
    );
    return response.data;
  },

  // ✅ NEW: Approve or reject alternative medication (Doctor)
  /**
   * Approve or reject pharmacy's suggested alternative medication
   * @param {string} prescriptionId - Prescription ID
   * @param {Object} approvalData - { 
   *   medicationId: string, 
   *   approved: boolean, 
   *   comment: string (optional)
   * }
   * @returns {Promise} - { success, message, data: prescription }
   */
  approveAlternative: async (prescriptionId, approvalData) => {
    const response = await axiosClient.patch(
      `/pharmacy/prescriptions/${prescriptionId}/approve-alternative`,
      approvalData
    );
    return response.data;
  },

  // Mark prescription ready for pickup (Pharmacy Staff)
  markReadyForPickup: async (prescriptionId, readyData) => {
    const response = await axiosClient.patch(
      `/pharmacy/prescriptions/${prescriptionId}/ready`,
      readyData
    );
    return response.data;
  },

  // Dispense prescription (Pharmacy Staff)
  dispensePrescription: async (prescriptionId, dispenseData) => {
    const response = await axiosClient.patch(
      `/pharmacy/prescriptions/${prescriptionId}/dispense`,
      dispenseData
    );
    return response.data;
  },

  // Add comment to prescription
  addPrescriptionComment: async (prescriptionId, commentData) => {
    const response = await axiosClient.post(
      `/pharmacy/prescriptions/${prescriptionId}/comments`,
      commentData
    );
    return response.data;
  },

  // Cancel prescription
  cancelPrescription: async (prescriptionId, reason) => {
    const response = await axiosClient.patch(
      `/pharmacy/prescriptions/${prescriptionId}/cancel`,
      { reason }
    );
    return response.data;
  },

  // Get pharmacy dashboard stats (Pharmacy Staff)
  getPharmacyStats: async () => {
    const response = await axiosClient.get('/pharmacy/stats');
    return response.data;
  }
};

export default pharmacyAPI;