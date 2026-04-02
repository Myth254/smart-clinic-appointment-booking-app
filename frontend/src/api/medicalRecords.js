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

  // ✅ NEW: Finalize medical record (creates prescription & notifies pharmacy)
  /**
   * Finalize medical record with final diagnosis and optional prescription
   * @param {string} recordId - Medical record ID
   * @param {Object} finalizationData - {
   *   finalDiagnosis: string,
   *   clinicalSummary: string,
   *   treatmentPlan: string,
   *   prescriptionData: {
   *     medications: [{ drugName, dosage, frequency, duration, quantity, ... }],
   *     generalInstructions: string,
   *     warnings: string[],
   *     refillsAllowed: number
   *   },
   *   followUpRequired: boolean,
   *   followUpDate: Date,
   *   dischargeNotes: string
   * }
   * @returns {Promise} - { success, message, data: { medicalRecord, prescription, prescriptionCreated } }
   */
  finalizeMedicalRecord: async (recordId, finalizationData) => {
    const response = await axiosClient.post(
      `/medical-records/${recordId}/finalize`,
      finalizationData
    );
    return response.data;
  },

  // Attachment routes
  /**
   * Upload attachment to medical record
   * @param {string} recordId - Medical record ID
   * @param {Object} attachmentData - { fileName, fileUrl, fileType }
   * @returns {Promise}
   */
  uploadAttachment: async (recordId, attachmentData) => {
    const response = await axiosClient.post(
      `/medical-records/${recordId}/attachments`,
      attachmentData
    );
    return response.data;
  },

  deleteAttachment: async (recordId, attachmentId) => {
    const response = await axiosClient.delete(
      `/medical-records/${recordId}/attachments/${attachmentId}`
    );
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