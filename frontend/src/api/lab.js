import axiosClient from './axiosClient'

export const labAPI = {
  // Create lab request (Doctor)
  createLabRequest: async (requestData) => {
    const response = await axiosClient.post('/lab/requests', requestData);
    return response.data;
  },

  // Get lab requests (filtered by role)
  getLabRequests: async (params = {}) => {
    const response = await axiosClient.get('/lab/requests', { params });
    return response.data;
  },

  // Get single lab request
  getLabRequestById: async (requestId) => {
    const response = await axiosClient.get(`/lab/requests/${requestId}`);
    return response.data;
  },

  // Assign lab request to self (Lab Personnel)
  assignLabRequest: async (requestId) => {
    const response = await axiosClient.patch(`/lab/requests/${requestId}/assign`);
    return response.data;
  },

  // Update lab request status (Lab Personnel)
  updateLabRequestStatus: async (requestId, statusData) => {
    const response = await axiosClient.patch(`/lab/requests/${requestId}/status`, statusData);
    return response.data;
  },

  // Upload lab results (Lab Personnel)
  uploadLabResults: async (requestId, resultsData) => {
    const response = await axiosClient.post(`/lab/requests/${requestId}/results`, resultsData);
    return response.data;
  },

  // Add comment to lab request
  addLabComment: async (requestId, commentData) => {
    const response = await axiosClient.post(`/lab/requests/${requestId}/comments`, commentData);
    return response.data;
  },

  // Reject lab request (Lab Personnel)
  rejectLabRequest: async (requestId, rejectionData) => {
    const response = await axiosClient.patch(`/lab/requests/${requestId}/reject`, rejectionData);
    return response.data;
  }
};

export default labAPI;