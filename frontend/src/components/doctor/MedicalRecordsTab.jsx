/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stethoscope, ClipboardList, Wifi, WifiOff } from 'lucide-react';
import {
  sessionsAPI,
  labAPI,
  medicalRecordsAPI,
  appointmentsAPI,
} from '../../api';
import socketService from '../../services/socketService';
import toast from 'react-hot-toast';

import AppointmentCard    from './MedicalRecordsTab/Appointment.jsx';
import SessionModal       from './MedicalRecordsTab/SessionModal.jsx';
import LabRequestModal    from './MedicalRecordsTab/LabRequestModal.jsx';
import LabResultsModal    from './MedicalRecordsTab/LabResultsModal.jsx';
import FinalizeRecordModal from './MedicalRecordsTab/FinalizeRecordModal.jsx';

// ─── Helper: hydrate sessionData state from a backend session object ──────────
const hydrateSessionData = (session) => ({
  complaints:           session.complaints           || '',
  clinicalObservations: session.clinicalObservations || '',
  provisionalDiagnosis: session.provisionalDiagnosis || '',
  sessionNotes:         session.sessionNotes         || '',
  vitalSigns: {
    bloodPressure:    session.vitalSigns?.bloodPressure    || '',
    heartRate:        session.vitalSigns?.heartRate        || '',
    temperature:      session.vitalSigns?.temperature      || '',
    weight:           session.vitalSigns?.weight           || '',
    height:           session.vitalSigns?.height           || '',
    respiratoryRate:  session.vitalSigns?.respiratoryRate  || '',
    oxygenSaturation: session.vitalSigns?.oxygenSaturation || '',
  },
  prescriptions: session.prescriptions || [],
});

const EMPTY_SESSION_DATA = {
  complaints: '', clinicalObservations: '', provisionalDiagnosis: '',
  sessionNotes: '',
  vitalSigns: { bloodPressure: '', heartRate: '', temperature: '', weight: '', height: '', respiratoryRate: '', oxygenSaturation: '' },
  prescriptions: [],
};

// ─────────────────────────────────────────────────────────────────────────────
const MedicalRecordsTab = ({
  appointments = [],
  onComplete,
  // FIX B: when the doctor clicks "Start Session" from the Overview modal the
  // dashboard switches tabs and drops this ID here so we auto-start immediately.
  pendingAppointmentId = null,
  onSessionStarted = null,
  socketConnected = false,
}) => {
  const [loading, setLoading]           = useState(false);
  const [restoring, setRestoring]       = useState(true); // true while the on-mount restore check runs
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [activeSession, setActiveSession]               = useState(null);
  const [medicalRecordId, setMedicalRecordId]           = useState(null);

  // Modal visibility
  const [showSessionModal,   setShowSessionModal]   = useState(false);
  const [showLabModal,       setShowLabModal]       = useState(false);
  const [showLabResultsModal,setShowLabResultsModal]= useState(false);
  const [showFinalizeModal,  setShowFinalizeModal]  = useState(false);

  const [sessionData, setSessionData] = useState(EMPTY_SESSION_DATA);

  const [labRequestForm, setLabRequestForm] = useState({
    tests: [], priority: 'routine', clinicalNotes: '',
    provisionalDiagnosis: '',
    // Bug 5 fix: paymentRequired and estimatedCost removed — not set by doctor
  });
  const [newTest, setNewTest] = useState({ testName: '', category: '', specimenType: '', instructions: '' });
  const [finalRecordData, setFinalRecordData] = useState({
    diagnosis: '', symptoms: [], prescription: [], notes: '',
    treatmentPlan: '',
    followUpRequired: false, followUpDate: '',
  });
  const [labResults, setLabResults] = useState([]);

  // FIX D: extend-session prompt state — shown when the backend warns at -5 min
  const [showExtendPrompt, setShowExtendPrompt] = useState(false);

  // Heartbeat interval ref — cleared on unmount / session end
  const heartbeatRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────
  // openSession: shared helper for both "start from list" and "restore"
  // ─────────────────────────────────────────────────────────────────────────
  const openSession = useCallback((session, appointment) => {
    setActiveSession(session);
    setSelectedAppointment(appointment || session.appointment);
    setSessionData(hydrateSessionData(session));
    if (session.medicalRecord?._id || session.medicalRecord) {
      setMedicalRecordId(session.medicalRecord?._id || session.medicalRecord);
    }
    setShowSessionModal(true);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ON MOUNT: restore any in-progress session via REST + socket
  // This is the key fix — the doctor gets their modal back after any
  // page refresh, navigation, or tab restore.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const result = await sessionsAPI.getActiveDoctorSession();
        // Only restore when the backend confirms an active session AND the
        // appointment window is still open (remainingTime > 0).
        // This is the frontend's own guard — it must not trust hasActiveSession
        // alone because an expired session could slip through if the backend
        // force-close races with this call.
        if (result.hasActiveSession && result.data && result.remainingTime > 0) {
          const session = result.data;
          openSession(session, session.appointment);
          toast.success('Session restored — you have an active consultation', { duration: 4000 });
        }
      } catch (err) {
        console.warn('Session restore check failed:', err);
      } finally {
        setRestoring(false);
      }
    };
    restoreSession();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Socket setup
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (activeSession?._id) socketService.leaveSession(activeSession._id);
    };
  }, [activeSession?._id]);

  // ── FIX B: auto-start session when dashboard navigates here via "Start Session" ──
  // Waits until the restore check finishes and the appointments list is populated
  // before calling handleStartSession so the appointment object is fully hydrated.
  useEffect(() => {
    if (!pendingAppointmentId || restoring) return;
    const match = appointments.find(a => a._id === pendingAppointmentId);
    if (!match) return;
    handleStartSession(match);
    if (onSessionStarted) onSessionStarted();
    // handleStartSession is stable (defined below with useCallback pattern — see below).
  }, [pendingAppointmentId, appointments, restoring]);

  // ─────────────────────────────────────────────────────────────────────────
  // Socket events for active session (join room, listen for server events)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeSession?._id) return;

    socketService.joinSession(activeSession._id);

    // ── session:restore — fired by server when doctor reconnects ──────────
    // The server detects the reconnect, stamps presence, and emits this event
    // so even if the REST restore call raced, we have a safety net.
    const handleSessionRestore = (data) => {
      console.log('🔄 socket session:restore received', data);
      if (showSessionModal) return; // already open
      // Re-fetch full session data to ensure modal is hydrated correctly
      sessionsAPI.getActiveDoctorSession().then(result => {
        if (result.hasActiveSession && result.data && result.remainingTime > 0) {
          openSession(result.data, result.data.appointment);
          toast.success('Session window restored');
        }
      }).catch(console.error);
    };

    const handleSessionUpdate = (data) => {
      console.log('📨 Session update received:', data);
    };

    const handleSessionProgress = (data) => {
      toast(data.message, { duration: 2000 });
    };

    const handleSessionCompleted = () => {
      toast.success('Session has been completed');
      teardownSession();
      if (onComplete) onComplete();
    };

    const handleSessionAutoClosed = (data) => {
      toast.error('Session was automatically closed: ' + data.reason, { duration: 5000 });
      teardownSession();
      if (onComplete) onComplete();
    };

    // ── FIX D: expiring-soon warning from backend ─────────────────────────────
    // Fired ~5 min before appointment.end (and again after each extension).
    // Surfaces a non-blocking banner inside SessionModal so the doctor can
    // extend or begin wrapping up without losing their work.
    const handleExpiringSoon = () => {
      setShowExtendPrompt(true);
    };

    const handleLabStatusChanged = (data) => {
      toast(`Lab ${data.requestNumber}: ${data.status}`);
      fetchLabResults();
    };

    const handleLabResultsReady = (data) => {
      toast.success(`Lab results for request ${data.requestNumber} are ready!`);
      fetchLabResults();
    };

    socketService.on?.('session:restore',       handleSessionRestore);
    socketService.onSessionUpdate(handleSessionUpdate);
    socketService.onSessionProgress(handleSessionProgress);
    socketService.onSessionCompleted(handleSessionCompleted);
    socketService.onSessionAutoClosed(handleSessionAutoClosed);
    socketService.onSessionExpiringSoon(handleExpiringSoon);
    socketService.onLabStatusChanged(handleLabStatusChanged);
    socketService.onLabResultsReady(handleLabResultsReady);

    // ── Doctor heartbeat ──────────────────────────────────────────────────
    // Sent every 60 s while the session is open.  Tells the backend the
    // doctor is still present, preventing spurious auto-close.
    heartbeatRef.current = setInterval(() => {
      socketService.socket?.emit('doctor:heartbeat', { sessionId: activeSession._id });
    }, 60_000);

    // Legacy session validity heartbeat (every 30 s)
    const validityHeartbeat = setInterval(() => {
      socketService.sessionHeartbeat(activeSession._id, (status) => {
        if (!status.active) {
          toast('Session is no longer active', { icon: '⚠️' });
          teardownSession();
          if (onComplete) onComplete();
        }
      });
    }, 30_000);

    return () => {
      clearInterval(heartbeatRef.current);
      clearInterval(validityHeartbeat);
      socketService.leaveSession(activeSession._id);
      socketService.removeListener?.('session:restore',       handleSessionRestore);
      socketService.removeListener('session:updated',         handleSessionUpdate);
      socketService.removeListener('session:progress',        handleSessionProgress);
      socketService.removeListener('session:completed',       handleSessionCompleted);
      socketService.removeListener('session:auto_closed',     handleSessionAutoClosed);
      socketService.removeListener('session:expiring_soon',   handleExpiringSoon);
      socketService.removeListener('lab:status_changed',      handleLabStatusChanged);
      socketService.removeListener('lab:results_ready',       handleLabResultsReady);
    };
  }, [activeSession?._id]);

  // ─────────────────────────────────────────────────────────────────────────
  // Autosave every 60 s while modal is open
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeSession?._id || !showSessionModal) return;
    const id = setInterval(async () => {
      try {
        await sessionsAPI.autosaveSession(activeSession._id, {
          complaints:           sessionData.complaints,
          vitalSigns:           sessionData.vitalSigns,
          clinicalObservations: sessionData.clinicalObservations,
          provisionalDiagnosis: sessionData.provisionalDiagnosis,
          sessionNotes:         sessionData.sessionNotes,
        });
        console.log('✅ Auto-saved at', new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Autosave failed:', err);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [activeSession?._id, sessionData, showSessionModal]);

  // ─────────────────────────────────────────────────────────────────────────
  // Lab results
  // ─────────────────────────────────────────────────────────────────────────
  const fetchLabResults = async () => {
    if (!activeSession?._id) return;
    try {
      // Bug 3 fix: pass sessionId so the backend filters to this session only.
      // Without it the doctor would see lab requests from ALL their sessions.
      const res = await labAPI.getLabRequests({ sessionId: activeSession._id });
      setLabResults((res.data || []).filter(l => l.status === 'completed'));
    } catch (err) {
      console.error('Failed to fetch lab results:', err);
    }
  };
  useEffect(() => { fetchLabResults(); }, [activeSession?._id]);

  // ─────────────────────────────────────────────────────────────────────────
  // Teardown helper — resets all session state
  // ─────────────────────────────────────────────────────────────────────────
  const teardownSession = useCallback(() => {
    clearInterval(heartbeatRef.current);
    setShowSessionModal(false);
    setActiveSession(null);
    setSelectedAppointment(null);
    setMedicalRecordId(null);
    setSessionData(EMPTY_SESSION_DATA);
    setLabResults([]);
    setShowExtendPrompt(false);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Start / resume session from the appointments list
  // ─────────────────────────────────────────────────────────────────────────
  const handleStartSession = async (appointment) => {
    // If this exact session is already loaded locally — just reopen the modal
    if (activeSession && activeSession.appointment?._id === appointment._id) {
      setShowSessionModal(true);
      return;
    }

    setLoading(true);
    try {
      const response = await sessionsAPI.startSession({ appointmentId: appointment._id });

      if (response.success && response.data) {
        openSession(response.data, appointment);
        const msg = response.resumed ? 'Session resumed' : 'Session started';
        toast.success(msg);
        if (onComplete) await onComplete();
      }
    } catch (err) {
      toast.error('Failed to start session: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Save session manually
  // ─────────────────────────────────────────────────────────────────────────
  const handleSaveSession = async () => {
    if (!activeSession?._id) { toast.error('No active session'); return; }
    setLoading(true);
    try {
      await sessionsAPI.autosaveSession(activeSession._id, {
        complaints:           sessionData.complaints,
        vitalSigns:           sessionData.vitalSigns,
        clinicalObservations: sessionData.clinicalObservations,
        provisionalDiagnosis: sessionData.provisionalDiagnosis,
        sessionNotes:         sessionData.sessionNotes,
      });
      toast.success('Session saved');
    } catch (err) {
      toast.error('Failed to save session');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FIX D: Extend session
  // Called from the +15/+30 min buttons in SessionModal's expiry banner.
  // Updates the local appointment end time so the countdown resets immediately
  // without waiting for the next REST poll.
  // ─────────────────────────────────────────────────────────────────────────
  const handleExtendSession = async (extraMinutes) => {
    if (!activeSession?._id) return;
    try {
      const result = await sessionsAPI.extendSession(activeSession._id, extraMinutes);
      // Patch the local appointment so SessionModal's countdown restarts from newEnd
      setSelectedAppointment(prev => ({ ...prev, end: result.data.newEnd }));
      setShowExtendPrompt(false);
      toast.success(`Session extended by ${extraMinutes} minutes`);
    } catch (err) {
      toast.error('Failed to extend session: ' + (err.response?.data?.message || err.message));
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Lab requests
  // ─────────────────────────────────────────────────────────────────────────
  const handleAddTest = () => {
    if (!newTest.testName.trim()) { toast.error('Test name is required'); return; }
    // Bug 1 fix: reset uses schema-correct field names (category, specimenType)
    setLabRequestForm(prev => ({ ...prev, tests: [...prev.tests, { ...newTest, id: Date.now() }] }));
    setNewTest({ testName: '', category: '', specimenType: '', instructions: '' });
  };

  const removeTest = (testId) =>
    setLabRequestForm(prev => ({ ...prev, tests: prev.tests.filter(t => t.id !== testId) }));

  const handleRequestLabs = async () => {
    if (labRequestForm.tests.length === 0) { toast.error('Please add at least one test'); return; }
    setLoading(true);
    try {
      const labReq = await labAPI.createLabRequest({
        patientId:            selectedAppointment.patient._id,
        appointmentId:        selectedAppointment._id,
        sessionId:            activeSession._id,
        tests:                labRequestForm.tests,
        priority:             labRequestForm.priority,
        clinicalNotes:        labRequestForm.clinicalNotes,
        provisionalDiagnosis: labRequestForm.provisionalDiagnosis,
        // Bug 5 fix: paymentRequired and estimatedCost removed — not doctor's concern
      });
      if (activeSession?._id && labReq.data?._id) {
        await sessionsAPI.addLabRequestToSession(activeSession._id, labReq.data._id);
      }
      toast.success(`Lab request ${labReq.data.requestNumber} created`);
      setShowLabModal(false);
      // Bug 5 fix: reset form without payment fields
      setLabRequestForm({ tests: [], priority: 'routine', clinicalNotes: '', provisionalDiagnosis: '' });
      await fetchLabResults();
    } catch (err) {
      toast.error('Failed to create lab request: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Finalize medical record
  // ─────────────────────────────────────────────────────────────────────────
  const handleFinalizeMedicalRecord = async () => {
    if (!finalRecordData.diagnosis.trim()) { toast.error('Diagnosis is required'); return; }
    setLoading(true);
    try {
      // ── STEP 1: Complete the session ──────────────────────────────────────
      // completeSession() is called FIRST, before finalizeMedicalRecord.
      //
      // Why this order matters:
      //   • The old code called medicalRecordsAPI.createRecord() here, which
      //     hits POST /medical-records and is blocked by the validateMedicalRecord
      //     middleware with a 400 "Validation error".  The middleware rejects the
      //     request because the appointment is already in_progress by this point.
      //
      //   • completeSession() on the backend auto-creates a MedicalRecord draft
      //     directly (bypassing the middleware entirely) and links its _id to the
      //     session via Session.medicalRecord.  We then read that ID back via
      //     getSessionById — POST /medical-records is never called at all.
      //
      //   • finalizeMedicalRecord has no appointment-status guards so calling it
      //     after completeSession is safe.
      if (activeSession?._id) {
        await sessionsAPI.completeSession(activeSession._id);
      }

      // ── STEP 2: Read the MedicalRecord ID the server just linked ─────────
      // completeSession auto-creates a draft MedicalRecord and writes its _id
      // to session.medicalRecord via findByIdAndUpdate — but that update happens
      // after the session object is returned, so the response doesn't include it.
      // A fresh getSessionById gives us the linked ID.
      // If medicalRecordId was already set in state (restored session), use that.
      let recordId = medicalRecordId;
      if (!recordId && activeSession?._id) {
        try {
          const freshSession = await sessionsAPI.getSessionById(activeSession._id);
          recordId = freshSession?.data?.medicalRecord?._id
                  || freshSession?.data?.medicalRecord
                  || null;
          if (recordId) setMedicalRecordId(recordId);
        } catch (fetchErr) {
          console.error('Could not fetch session after complete:', fetchErr);
        }
      }

      if (!recordId) {
        toast.error('Could not resolve medical record ID. Please refresh and try again.');
        return;
      }

      // ── STEP 3: Finalize the medical record ───────────────────────────────
      const hasPrescription = finalRecordData.prescription.some(p => p.medication?.trim());
      const finalizationData = {
        finalDiagnosis:   finalRecordData.diagnosis,
        clinicalSummary:  finalRecordData.notes,
        treatmentPlan:    finalRecordData.treatmentPlan || finalRecordData.notes,
        followUpRequired: finalRecordData.followUpRequired,
        followUpDate:     finalRecordData.followUpDate || undefined,
        dischargeNotes:   finalRecordData.notes,
        // symptoms are collected in FinalizeRecordModal but were never included
        // in the API payload — finalizeMedicalRecord never received them so
        // MedicalRecord.symptoms was always empty after finalization.
        symptoms: finalRecordData.symptoms.length > 0 ? finalRecordData.symptoms : undefined,
      };
      if (labResults.length > 0) {
        finalizationData.labResults = labResults.map(l => ({
          testName: l.testName, requestNumber: l.requestNumber,
          results: l.results, status: l.status,
        }));
      }
      if (hasPrescription) {
        // `drugName`, `dosage`, `frequency`, `duration`, and `quantity` are all
        // `required: true` in the Prescription schema. Filter out any medication
        // row that is missing any of these fields — an empty string passes
        // `.filter(p => p.medication?.trim())` but still fails Mongoose validation,
        // causing a silent 400 on finalize.
        const validMedications = finalRecordData.prescription
          .filter(p =>
            p.medication?.trim() &&
            p.dosage?.trim() &&
            p.frequency?.trim() &&
            p.duration?.trim()
          )
          .map(p => ({
            drugName:     p.medication,
            dosage:       p.dosage,
            frequency:    p.frequency,
            duration:     p.duration,
            quantity:     p.quantity || 1,
            instructions: p.instructions || '',
          }));

        if (validMedications.length > 0) {
          finalizationData.prescriptionData = {
            medications:         validMedications,
            generalInstructions: finalRecordData.notes,
            warnings:            [],
            refillsAllowed:      0,
          };
        }
      }

      const finalizeRes = await medicalRecordsAPI.finalizeMedicalRecord(recordId, finalizationData);
      if (finalizeRes.success) {
        const { prescriptionCreated, prescription } = finalizeRes.data;
        toast.success(prescriptionCreated
          ? `Medical record finalized with prescription ${prescription.prescriptionNumber}`
          : 'Medical record finalized successfully'
        );
      }

      // finalizeMedicalRecord already marks the appointment 'completed' on the
      // backend — updateAppointmentStatus is not needed here.

      setShowFinalizeModal(false);
      teardownSession();
      setFinalRecordData({ diagnosis: '', symptoms: [], prescription: [], notes: '', treatmentPlan: '', followUpRequired: false, followUpDate: '' });
      if (onComplete) await onComplete();
    } catch (err) {
      toast.error('Failed to finalize: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Category strings MUST exactly match the LabRequest model's `tests.category`
  // enum. Using a mismatched value (e.g. 'Chemistry' instead of 'Biochemistry',
  // or 'Imaging' when it wasn't in the enum) causes a Mongoose ValidationError
  // → 500 from the backend on every affected test submission.
  const commonLabTests = [
    { category: 'Hematology',   tests: ['Complete Blood Count (CBC)', 'Blood Smear', 'ESR', 'Blood Grouping'] },
    { category: 'Biochemistry', tests: ['Blood Glucose', 'Lipid Profile', 'Liver Function Tests', 'Kidney Function Tests', 'Electrolytes'] },
    { category: 'Microbiology', tests: ['Urine Culture', 'Blood Culture', 'Stool Culture', 'Throat Swab'] },
    { category: 'Serology',     tests: ['HIV Test', 'Hepatitis Panel', 'Malaria Test', 'Typhoid Test'] },
    { category: 'Imaging',      tests: ['X-Ray', 'Ultrasound', 'CT Scan', 'MRI'] },
  ];

  const getStatusColor = (status) => ({
    approved: 'bg-green-100 text-green-800',
    completed: 'bg-blue-100 text-blue-800',
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-purple-100 text-purple-800',
  }[status] || 'bg-gray-100 text-gray-800');

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Stethoscope className="w-6 h-6 text-gray-700" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Medical Records Management</h2>
              <p className="text-sm text-gray-500">Complete workflow from session to final record</p>
            </div>
          </div>

          {/* Socket status */}
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            socketConnected ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            {socketConnected ? (
              <><Wifi className="w-4 h-4 text-green-600" /><span className="text-sm font-medium text-green-900">Real-time Connected</span><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /></>
            ) : (
              <><WifiOff className="w-4 h-4 text-red-600" /><span className="text-sm font-medium text-red-900">Offline</span></>
            )}
          </div>
        
        </div>
      </div>

      {/* Restore banner — shown while restore check is running */}
      {restoring && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
          Checking for active session…
        </div>
      )}

      {/* Workflow guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
          <ClipboardList className="w-5 h-5 mr-2 text-blue-600" />
          Workflow Guide
        </h3>
        <div className="grid md:grid-cols-4 gap-4 text-sm">
          {[
            ['1. Start Session', 'approved → in_progress'],
            ['2. Document & Save', 'Auto-saves every 60s'],
            ['3. Request Labs (Optional)', 'Order tests, review results'],
            ['4. Finalize & Complete', 'in_progress → completed'],
          ].map(([title, sub]) => (
            <div key={title} className="space-y-1">
              <div className="font-medium text-gray-900">{title}</div>
              <div className="text-gray-600">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Appointments list */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Active Appointments</h3>
          <p className="text-sm text-gray-500">Start sessions for confirmed appointments</p>
        </div>
        <div className="divide-y divide-gray-200">
          {appointments.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Stethoscope className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No active appointments</p>
            </div>
          ) : (
            appointments.map(appointment => (
              <AppointmentCard
                key={appointment._id}
                appointment={appointment}
                onStartSession={handleStartSession}
                loading={loading}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      <SessionModal
        isOpen={showSessionModal}
        // Minimise (X button in header) just collapses to pill — handled inside modal
        // onClose is only called when the doctor explicitly ends the session
        onClose={async () => {
          // MUST await completeSession before clearing React state.
          // Fire-and-forget was the original bug: if the PATCH failed the DB
          // record stayed in_progress and the modal would reappear on next mount.
          if (activeSession?._id) {
            try {
              await sessionsAPI.completeSession(activeSession._id);
            } catch (err) {
              // Surface the error — do NOT tear down if the API call failed,
              // otherwise the session stays in_progress with no way to close it.
              toast.error(
                'Failed to end session on server. Please try again. ' +
                (err.response?.data?.message || err.message)
              );
              return; // abort — keep modal open so doctor can retry
            }
          }
          teardownSession();
          if (onComplete) onComplete();
        }}
        selectedAppointment={selectedAppointment}
        sessionData={sessionData}
        setSessionData={setSessionData}
        onSave={handleSaveSession}
        onRequestLabs={() => setShowLabModal(true)}
        onViewResults={() => setShowLabResultsModal(true)}
        onFinalize={() => {
          setFinalRecordData(prev => ({
            ...prev,
            diagnosis: sessionData.provisionalDiagnosis,
            notes:     sessionData.clinicalObservations,
          }));
          setShowFinalizeModal(true);
        }}
        loading={loading}
        sessionStartTime={activeSession?.startTime || null}
        appointmentEndTime={selectedAppointment?.end || null}
        showExtendPrompt={showExtendPrompt}
        onExtend={handleExtendSession}
        onDismissExtend={() => setShowExtendPrompt(false)}
      />

      <LabRequestModal
        isOpen={showLabModal}
        onClose={() => setShowLabModal(false)}
        labRequestForm={labRequestForm}
        setLabRequestForm={setLabRequestForm}
        newTest={newTest}
        setNewTest={setNewTest}
        onAddTest={handleAddTest}
        onRemoveTest={removeTest}
        onSubmit={handleRequestLabs}
        loading={loading}
        commonLabTests={commonLabTests}
      />

      <LabResultsModal
        isOpen={showLabResultsModal}
        onClose={() => setShowLabResultsModal(false)}
        labResults={labResults}
        getStatusColor={getStatusColor}
      />

      <FinalizeRecordModal
        isOpen={showFinalizeModal}
        onClose={() => setShowFinalizeModal(false)}
        finalRecordData={finalRecordData}
        setFinalRecordData={setFinalRecordData}
        onSubmit={handleFinalizeMedicalRecord}
        loading={loading}
        selectedAppointment={selectedAppointment}
        sessionData={sessionData}
        labResults={labResults}
      />
    </div>
  );
};

export default MedicalRecordsTab;