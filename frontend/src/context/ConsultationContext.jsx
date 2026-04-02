import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { appointmentsAPI, sessionsAPI, medicalRecordsAPI, labAPI, pharmacyAPI } from '../api';
import toast from 'react-hot-toast';

const ConsultationContext = createContext();

export const useConsultation = () => {
  const context = useContext(ConsultationContext);
  if (!context) {
    throw new Error('useConsultation must be used within ConsultationProvider');
  }
  return context;
};

export const ConsultationProvider = ({ children }) => {
  const [activeConsultations, setActiveConsultations] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch all active consultations
  const fetchActiveConsultations = useCallback(async () => {
    try {
      setLoading(true);
      const appointments = await appointmentsAPI.getAppointments({
        status: 'approved'
      });

      const consultations = [];
      
      for (const apt of appointments.data || []) {
        try {
          // Check if session exists
          const session = await sessionsAPI.getSessionByAppointment(apt._id);
          
          if (session && session.status !== 'completed') {
            // Fetch related data
            const [medicalRecord, labRequests, prescriptions] = await Promise.all([
              medicalRecordsAPI.getRecordById(session.medicalRecordId).catch(() => null),
              labAPI.getLabRequests({ appointmentId: apt._id }).catch(() => ({ data: [] })),
              pharmacyAPI.getPrescriptions({ appointmentId: apt._id }).catch(() => ({ data: [] }))
            ]);

            consultations.push({
              appointment: apt,
              session: session,
              medicalRecord: medicalRecord?.data || null,
              labRequests: labRequests.data || [],
              prescriptions: prescriptions.data || [],
              lastUpdated: new Date()
            });
          }
        } catch (error) {
          // Session doesn't exist yet, skip
          continue;
        }
      }

      setActiveConsultations(consultations);
    } catch (error) {
      console.error('Failed to fetch active consultations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh specific consultation
  const refreshConsultation = useCallback(async (appointmentId) => {
    try {
      const session = await sessionsAPI.getSessionByAppointment(appointmentId);
      
      if (!session) return;

      const [appointment, medicalRecord, labRequests, prescriptions] = await Promise.all([
        appointmentsAPI.getAppointmentById(appointmentId),
        medicalRecordsAPI.getRecordById(session.medicalRecordId).catch(() => null),
        labAPI.getLabRequests({ appointmentId }),
        pharmacyAPI.getPrescriptions({ appointmentId })
      ]);

      const updatedConsultation = {
        appointment: appointment.data,
        session: session,
        medicalRecord: medicalRecord?.data || null,
        labRequests: labRequests.data || [],
        prescriptions: prescriptions.data || [],
        lastUpdated: new Date()
      };

      setActiveConsultations(prev => {
        const index = prev.findIndex(c => c.appointment._id === appointmentId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = updatedConsultation;
          return updated;
        }
        return [...prev, updatedConsultation];
      });

      return updatedConsultation;
    } catch (error) {
      console.error('Failed to refresh consultation:', error);
      throw error;
    }
  }, []);

  // Check for critical lab results
  const checkCriticalResults = useCallback(() => {
    const criticalConsultations = activeConsultations.filter(c => 
      c.labRequests.some(lab => 
        lab.results?.some(result => result.flag === 'critical')
      )
    );

    return criticalConsultations;
  }, [activeConsultations]);

  // Get consultation by appointment ID
  const getConsultation = useCallback((appointmentId) => {
    return activeConsultations.find(c => c.appointment._id === appointmentId);
  }, [activeConsultations]);

  useEffect(() => {
    fetchActiveConsultations();
    
    // Poll every 30 seconds for updates
    const interval = setInterval(fetchActiveConsultations, 30000);
    
    return () => clearInterval(interval);
  }, [fetchActiveConsultations]);

  const value = {
    activeConsultations,
    loading,
    fetchActiveConsultations,
    refreshConsultation,
    checkCriticalResults,
    getConsultation
  };

  return (
    <ConsultationContext.Provider value={value}>
      {children}
    </ConsultationContext.Provider>
  );
};

export default ConsultationContext;