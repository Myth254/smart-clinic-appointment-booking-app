/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { X, Plus, FileText, Calendar, CheckCircle, Save, Download } from 'lucide-react';
import { medicalRecordsAPI, appointmentsAPI } from '../../api';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const MedicalRecordsTab = ({ patientRecord, onClose, readOnly = false }) => {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [completedAppointments, setCompletedAppointments] = useState([]);

  // Draft state for auto-save
  const [draftKey, setDraftKey] = useState('');
  const [lastSaved, setLastSaved] = useState(null);

  // Form state for creating/editing medical record
  const [formData, setFormData] = useState({
    appointmentId: '',
    diagnosis: '',
    symptoms: [],
    prescription: [{ medication: '', dosage: '', frequency: '', duration: '', instructions: '' }],
    labTests: [],
    vitalSigns: {
      bloodPressure: '',
      heartRate: '',
      temperature: '',
      weight: '',
      height: ''
    },
    notes: '',
    followUpRequired: false,
    followUpDate: ''
  });

  const [newSymptom, setNewSymptom] = useState('');
  const [newLabTest, setNewLabTest] = useState({ testName: '', result: '', date: '' });

  useEffect(() => {
    if (patientRecord) {
      fetchPatientRecords();
      
      if (!readOnly) {
        if (patientRecord.preSelectedAppointment) {
          setTimeout(() => {
            openCreateModal(patientRecord.preSelectedAppointment);
          }, 300);
        }
      }
    }
  }, [patientRecord, readOnly]);

  useEffect(() => {
    if (showCreateModal && formData.appointmentId && !readOnly) {
      const interval = setInterval(() => {
        saveDraft();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [showCreateModal, formData, readOnly]);

  const saveDraft = () => {
    if (formData.appointmentId) {
      const key = `medical_record_draft_${formData.appointmentId}`;
      localStorage.setItem(key, JSON.stringify(formData));
      setDraftKey(key);
      setLastSaved(new Date());
      toast.success('Draft saved', { duration: 1000 });
    }
  };

  const loadDraft = (appointmentId) => {
    const key = `medical_record_draft_${appointmentId}`;
    const draft = localStorage.getItem(key);
    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft);
        setFormData(parsedDraft);
        setDraftKey(key);
        toast.info('Draft loaded');
        return true;
      } catch (error) {
        console.error('Failed to load draft:', error);
      }
    }
    return false;
  };

  const clearDraft = () => {
    if (draftKey) {
      localStorage.removeItem(draftKey);
      setDraftKey('');
      setLastSaved(null);
    }
  };

  const fetchPatientRecords = async () => {
    try {
      setLoading(true);
      const response = await medicalRecordsAPI.getPatientRecords(patientRecord.patient._id);
      const fetchedRecords = response.data || [];
      setRecords(fetchedRecords);
      
      // Fetch completed appointments after records are loaded
      if (!readOnly) {
        await fetchCompletedAppointments(fetchedRecords);
      }
    } catch (error) {
      console.error('Failed to fetch medical records:', error);
      toast.error('Failed to load medical records');
    } finally {
      setLoading(false);
    }
  };

  // Accept records parameter to avoid race condition
  const fetchCompletedAppointments = async (existingRecords = records) => {
    try {
      const response = await appointmentsAPI.getAppointments({ 
        status: 'completed',
        patientId: patientRecord.patient._id 
      });
      const appointments = Array.isArray(response) 
        ? response 
        : (response.data || response.appointments || []);
      
      // Filter out appointments that already have medical records
      const appointmentsWithoutRecords = appointments.filter(apt => {
        return !existingRecords.some(rec => rec.appointment?._id === apt._id);
      });
      
      setCompletedAppointments(appointmentsWithoutRecords);
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
      toast.error('Failed to load appointments');
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleVitalSignsChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      vitalSigns: {
        ...prev.vitalSigns,
        [name]: value
      }
    }));
  };

  const handlePrescriptionChange = (index, field, value) => {
    const newPrescription = [...formData.prescription];
    newPrescription[index][field] = value;
    setFormData(prev => ({ ...prev, prescription: newPrescription }));
  };

  const addPrescriptionRow = () => {
    setFormData(prev => ({
      ...prev,
      prescription: [...prev.prescription, { medication: '', dosage: '', frequency: '', duration: '', instructions: '' }]
    }));
  };

  const removePrescriptionRow = (index) => {
    if (formData.prescription.length > 1) {
      setFormData(prev => ({
        ...prev,
        prescription: prev.prescription.filter((_, i) => i !== index)
      }));
    }
  };

  const handleAddSymptom = () => {
    if (newSymptom.trim()) {
      setFormData(prev => ({
        ...prev,
        symptoms: [...prev.symptoms, newSymptom.trim()]
      }));
      setNewSymptom('');
    }
  };

  const removeSymptom = (index) => {
    setFormData(prev => ({
      ...prev,
      symptoms: prev.symptoms.filter((_, i) => i !== index)
    }));
  };

  const handleAddLabTest = () => {
    if (newLabTest.testName.trim()) {
      setFormData(prev => ({
        ...prev,
        labTests: [...prev.labTests, { ...newLabTest }]
      }));
      setNewLabTest({ testName: '', result: '', date: '' });
    }
  };

  const removeLabTest = (index) => {
    setFormData(prev => ({
      ...prev,
      labTests: prev.labTests.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);

      const cleanedPrescription = formData.prescription.filter(p => p.medication.trim());

      const recordData = {
        ...formData,
        prescription: cleanedPrescription,
        vitalSigns: Object.keys(formData.vitalSigns).some(key => formData.vitalSigns[key])
          ? formData.vitalSigns
          : undefined
      };

      await medicalRecordsAPI.createRecord(recordData);
      
      clearDraft();
      
      toast.success('Medical record created successfully');
      setShowCreateModal(false);
      resetForm();
      await fetchPatientRecords();
    } catch (error) {
      console.error('Create record error:', error);
      toast.error(error.response?.data?.message || 'Failed to create medical record');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      appointmentId: '',
      diagnosis: '',
      symptoms: [],
      prescription: [{ medication: '', dosage: '', frequency: '', duration: '', instructions: '' }],
      labTests: [],
      vitalSigns: {
        bloodPressure: '',
        heartRate: '',
        temperature: '',
        weight: '',
        height: ''
      },
      notes: '',
      followUpRequired: false,
      followUpDate: ''
    });
    setNewSymptom('');
    setNewLabTest({ testName: '', result: '', date: '' });
  };

  const viewRecord = (record) => {
    setSelectedRecord(record);
    setShowViewModal(true);
  };

  const openCreateModal = (preSelectedAppointmentId = null) => {
    resetForm();
    
    if (preSelectedAppointmentId) {
      const draftLoaded = loadDraft(preSelectedAppointmentId);
      if (!draftLoaded) {
        setFormData(prev => ({
          ...prev,
          appointmentId: preSelectedAppointmentId
        }));
      }
    }
    
    setShowCreateModal(true);
  };

  const handleAppointmentChange = (e) => {
    const appointmentId = e.target.value;
    
    const draftLoaded = loadDraft(appointmentId);
    
    if (!draftLoaded) {
      setFormData(prev => ({
        ...prev,
        appointmentId
      }));
    }
  };

  return (
    <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-semibold">
                {readOnly ? 'Patient Medical Records' : 'Medical Records'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Patient: {patientRecord?.patient?.firstName} {patientRecord?.patient?.lastName}
              </p>
              {readOnly && (
                <p className="text-xs text-blue-600 mt-1">View only - No editing allowed</p>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {!readOnly && (
            <div className="mb-6">
              <button
                onClick={() => openCreateModal()}
                className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create Medical Record</span>
              </button>
            </div>
          )}

          {/* Records List */}
          {loading && records.length === 0 ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading records...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No medical records yet</p>
              {!readOnly && (
                <p className="text-sm text-gray-400 mt-1">Create a record after completing an appointment</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((record) => (
                <div key={record._id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h4 className="font-semibold text-lg">{record.diagnosis}</h4>
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                          {format(parseISO(record.createdAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                      
                      {record.symptoms && record.symptoms.length > 0 && (
                        <div className="mb-2">
                          <span className="text-sm text-gray-600">Symptoms: </span>
                          <span className="text-sm">{record.symptoms.join(', ')}</span>
                        </div>
                      )}
                      
                      {record.prescription && record.prescription.length > 0 && (
                        <div className="mb-2">
                          <span className="text-sm text-gray-600">Medications: </span>
                          <span className="text-sm">
                            {record.prescription.map(p => p.medication).join(', ')}
                          </span>
                        </div>
                      )}
                      
                      {record.notes && (
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2">{record.notes}</p>
                      )}
                      
                      {record.followUpRequired && (
                        <div className="mt-2 flex items-center space-x-2 text-sm text-blue-600">
                          <Calendar className="w-4 h-4" />
                          <span>Follow-up required: {format(parseISO(record.followUpDate), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                    </div>
                    
                    <button
                      onClick={() => viewRecord(record)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Medical Record Modal */}
      {!readOnly && showCreateModal && (
        <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold">Create Medical Record</h3>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="space-y-6">
                {/* Appointment Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2">Select Appointment *</label>
                  <select
                    name="appointmentId"
                    value={formData.appointmentId}
                    onChange={handleAppointmentChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                  >
                    <option value="">Choose completed appointment</option>
                    {completedAppointments.map((apt) => (
                      <option key={apt._id} value={apt._id}>
                        {format(parseISO(apt.start), 'MMM d, yyyy h:mm a')} - {apt.reason}
                      </option>
                    ))}
                  </select>
                  {draftKey && lastSaved && (
                    <p className="text-xs text-green-600 mt-1 flex items-center space-x-1">
                      <CheckCircle className="w-3 h-3" />
                      <span>Last saved: {format(lastSaved, 'h:mm:ss a')}</span>
                    </p>
                  )}
                </div>

                {/* Diagnosis */}
                <div>
                  <label className="block text-sm font-medium mb-2">Diagnosis *</label>
                  <textarea
                    name="diagnosis"
                    value={formData.diagnosis}
                    onChange={handleChange}
                    required
                    rows="3"
                    placeholder="Enter detailed diagnosis..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                  />
                </div>

                {/* Symptoms */}
                <div>
                  <label className="block text-sm font-medium mb-2">Symptoms</label>
                  <div className="flex space-x-2 mb-3">
                    <input
                      type="text"
                      value={newSymptom}
                      onChange={(e) => setNewSymptom(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSymptom())}
                      placeholder="Add symptom"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    />
                    <button
                      type="button"
                      onClick={handleAddSymptom}
                      className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                    >
                      Add
                    </button>
                  </div>
                  {formData.symptoms.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.symptoms.map((symptom, index) => (
                        <span key={index} className="inline-flex items-center px-3 py-1 bg-gray-100 rounded-full text-sm">
                          {symptom}
                          <button
                            type="button"
                            onClick={() => removeSymptom(index)}
                            className="ml-2 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Prescription */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium">Prescription</label>
                    <button
                      type="button"
                      onClick={addPrescriptionRow}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      + Add Medication
                    </button>
                  </div>
                  {formData.prescription.map((med, index) => (
                    <div key={index} className="grid grid-cols-5 gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Medication"
                        value={med.medication}
                        onChange={(e) => handlePrescriptionChange(index, 'medication', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                      />
                      <input
                        type="text"
                        placeholder="Dosage"
                        value={med.dosage}
                        onChange={(e) => handlePrescriptionChange(index, 'dosage', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                      />
                      <input
                        type="text"
                        placeholder="Frequency"
                        value={med.frequency}
                        onChange={(e) => handlePrescriptionChange(index, 'frequency', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                      />
                      <input
                        type="text"
                        placeholder="Duration"
                        value={med.duration}
                        onChange={(e) => handlePrescriptionChange(index, 'duration', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                      />
                      <button
                        type="button"
                        onClick={() => removePrescriptionRow(index)}
                        className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                {/* Vital Signs */}
                <div>
                  <label className="block text-sm font-medium mb-2">Vital Signs</label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <input
                      type="text"
                      name="bloodPressure"
                      value={formData.vitalSigns.bloodPressure}
                      onChange={handleVitalSignsChange}
                      placeholder="BP (120/80)"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    />
                    <input
                      type="number"
                      name="heartRate"
                      value={formData.vitalSigns.heartRate}
                      onChange={handleVitalSignsChange}
                      placeholder="Heart Rate"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    />
                    <input
                      type="number"
                      step="0.1"
                      name="temperature"
                      value={formData.vitalSigns.temperature}
                      onChange={handleVitalSignsChange}
                      placeholder="Temp (°C)"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    />
                    <input
                      type="number"
                      step="0.1"
                      name="weight"
                      value={formData.vitalSigns.weight}
                      onChange={handleVitalSignsChange}
                      placeholder="Weight (kg)"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    />
                    <input
                      type="number"
                      step="0.1"
                      name="height"
                      value={formData.vitalSigns.height}
                      onChange={handleVitalSignsChange}
                      placeholder="Height (cm)"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    />
                  </div>
                </div>

                {/* Lab Tests */}
                <div>
                  <label className="block text-sm font-medium mb-2">Lab Tests</label>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Test Name"
                      value={newLabTest.testName}
                      onChange={(e) => setNewLabTest({...newLabTest, testName: e.target.value})}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    />
                    <input
                      type="text"
                      placeholder="Result"
                      value={newLabTest.result}
                      onChange={(e) => setNewLabTest({...newLabTest, result: e.target.value})}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    />
                    <input
                      type="date"
                      value={newLabTest.date}
                      onChange={(e) => setNewLabTest({...newLabTest, date: e.target.value})}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    />
                    <button
                      type="button"
                      onClick={handleAddLabTest}
                      className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                    >
                      Add
                    </button>
                  </div>
                  {formData.labTests.length > 0 && (
                    <div className="space-y-2">
                      {formData.labTests.map((test, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <span className="font-medium">{test.testName}</span>
                            <span className="text-gray-600 mx-2">-</span>
                            <span>{test.result}</span>
                            {test.date && (
                              <span className="text-sm text-gray-500 ml-2">
                                ({format(parseISO(test.date), 'MMM d, yyyy')})
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLabTest(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium mb-2">Additional Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows="4"
                    placeholder="Any additional observations or recommendations..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                  />
                </div>

                {/* Follow-up */}
                <div>
                  <div className="flex items-center space-x-2 mb-3">
                    <input
                      type="checkbox"
                      name="followUpRequired"
                      checked={formData.followUpRequired}
                      onChange={handleChange}
                      className="w-4 h-4"
                    />
                    <label className="text-sm font-medium">Follow-up required</label>
                  </div>
                  {formData.followUpRequired && (
                    <input
                      type="date"
                      name="followUpDate"
                      value={formData.followUpDate}
                      onChange={handleChange}
                      min={new Date().toISOString().split('T')[0]}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    />
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-between items-center mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={saveDraft}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Draft</span>
                </button>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Close without saving? Your draft will be preserved.')) {
                        setShowCreateModal(false);
                      }
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center space-x-2"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Creating...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Create & Complete</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Medical Record Modal */}
      {showViewModal && selectedRecord && (
        <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-semibold">Medical Record Details</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {format(parseISO(selectedRecord.createdAt), 'MMMM d, yyyy')}
                  </p>
                </div>
                <button onClick={() => setShowViewModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)] space-y-6">
              {/* Diagnosis */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-2">DIAGNOSIS</h4>
                <p className="text-base">{selectedRecord.diagnosis}</p>
              </div>

              {/* Symptoms */}
              {selectedRecord.symptoms && selectedRecord.symptoms.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">SYMPTOMS</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedRecord.symptoms.map((symptom, index) => (
                      <span key={index} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                        {symptom}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Prescription */}
              {selectedRecord.prescription && selectedRecord.prescription.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">PRESCRIPTION</h4>
                  <div className="space-y-3">
                    {selectedRecord.prescription.map((med, index) => (
                      <div key={index} className="p-3 bg-gray-50 rounded-lg">
                        <p className="font-medium">{med.medication}</p>
                        <div className="grid grid-cols-3 gap-4 mt-2 text-sm text-gray-600">
                          {med.dosage && <p>Dosage: {med.dosage}</p>}
                          {med.frequency && <p>Frequency: {med.frequency}</p>}
                          {med.duration && <p>Duration: {med.duration}</p>}
                        </div>
                        {med.instructions && (
                          <p className="mt-2 text-sm text-gray-600">Instructions: {med.instructions}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vital Signs */}
              {selectedRecord.vitalSigns && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">VITAL SIGNS</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {selectedRecord.vitalSigns.bloodPressure && (
                      <div>
                        <p className="text-xs text-gray-500">Blood Pressure</p>
                        <p className="font-medium">{selectedRecord.vitalSigns.bloodPressure}</p>
                      </div>
                    )}
                    {selectedRecord.vitalSigns.heartRate && (
                      <div>
                        <p className="text-xs text-gray-500">Heart Rate</p>
                        <p className="font-medium">{selectedRecord.vitalSigns.heartRate} bpm</p>
                      </div>
                    )}
                    {selectedRecord.vitalSigns.temperature && (
                      <div>
                        <p className="text-xs text-gray-500">Temperature</p>
                        <p className="font-medium">{selectedRecord.vitalSigns.temperature}°C</p>
                      </div>
                    )}
                    {selectedRecord.vitalSigns.weight && (
                      <div>
                        <p className="text-xs text-gray-500">Weight</p>
                        <p className="font-medium">{selectedRecord.vitalSigns.weight} kg</p>
                      </div>
                    )}
                    {selectedRecord.vitalSigns.height && (
                      <div>
                        <p className="text-xs text-gray-500">Height</p>
                        <p className="font-medium">{selectedRecord.vitalSigns.height} cm</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Lab Tests */}
              {selectedRecord.labTests && selectedRecord.labTests.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">LAB TESTS</h4>
                  <div className="space-y-2">
                    {selectedRecord.labTests.map((test, index) => (
                      <div key={index} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{test.testName}</p>
                            <p className="text-sm text-gray-600 mt-1">Result: {test.result}</p>
                          </div>
                          {test.date && (
                            <p className="text-xs text-gray-500">
                              {format(parseISO(test.date), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedRecord.notes && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">ADDITIONAL NOTES</h4>
                  <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">{selectedRecord.notes}</p>
                </div>
              )}

              {/* Follow-up */}
              {selectedRecord.followUpRequired && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 text-blue-800">
                    <Calendar className="w-5 h-5" />
                    <div>
                      <p className="font-medium">Follow-up Required</p>
                      <p className="text-sm">
                        Scheduled for: {format(parseISO(selectedRecord.followUpDate), 'MMMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowViewModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  toast.info('Print functionality coming soon');
                }}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MedicalRecordsTab;