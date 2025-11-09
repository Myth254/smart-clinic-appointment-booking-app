import axiosClient from './axiosClient'

export const medicalRecordsAPI = {
  // General medical record routes
  getMyRecords: async (params = {}) => {
    const response = await axiosClient.get('/medical-records/my-records', { params });
    return response.data;
  },

  createRecord: async (recordData) => {
    const response = await axiosClient.post('/medical-records', recordData);
    return response.data;
  },

  getRecordById: async (recordId) => {
    const response = await axiosClient.get(`/medical-records/${recordId}`);
    return response.data;
  },

  updateRecord: async (recordId, recordData) => {
    const response = await axiosClient.put(`/medical-records/${recordId}`, recordData);
    return response.data;
  },

  // Attachment routes
  uploadAttachment: async (recordId, formData) => {
    const response = await axiosClient.post(`/medical-records/${recordId}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  deleteAttachment: async (recordId, attachmentId) => {
    const response = await axiosClient.delete(`/medical-records/${recordId}/attachments/${attachmentId}`);
    return response.data;
  },

  // Patient-specific routes
  getPatientRecords: async (patientId, params = {}) => {
    const response = await axiosClient.get(`/medical-records/patient/${patientId}`, { params });
    return response.data;
  },

  // Doctor-specific routes
  getDoctorRecords: async (doctorId, params = {}) => {
    const response = await axiosClient.get(`/medical-records/doctor/${doctorId}`, { params });
    return response.data;
  },
};

export default medicalRecordsAPI;