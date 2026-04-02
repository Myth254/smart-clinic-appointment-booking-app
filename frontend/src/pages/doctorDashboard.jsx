/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { appointmentsAPI, availabilityAPI, doctorAPI, medicalRecordsAPI } from '../api';
import socketService from '../services/socketService';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  startOfWeek, endOfWeek, addMonths, subMonths,
} from 'date-fns';
import toast from 'react-hot-toast';

import MedicalRecordsTab  from '../components/doctor/MedicalRecordsTab';
import PatientRecordsTab  from '../components/doctor/PatientRecordsTab';
import SessionHistoryTab  from '../components/doctor/SessionHistoryTab';  // NEW
import OverviewTab        from '../components/doctor/OverviewTab';
import DoctorModals       from '../components/doctor/DoctorModals';
import DoctorNotifications from '../components/doctor/DoctorNotifications';

// Navigation tab definitions
const TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'sessions',  label: 'Medical Sessions' },
  { id: 'history',   label: 'Session History' },   // NEW
  { id: 'patients',  label: 'Patient Records' },
];

const DoctorDashboard = () => {
  const { user, logout } = useAuth();
  const [loading,        setLoading]        = useState(false);
  const [currentDate,    setCurrentDate]    = useState(new Date());
  const [selectedDate,   setSelectedDate]   = useState(new Date());
  const [activeTab,      setActiveTab]      = useState('overview');
  const [socketConnected,setSocketConnected]= useState(false);

  const [todayAppointments, setTodayAppointments] = useState([]);
  const [allAppointments,   setAllAppointments]   = useState([]);
  const [patientRecords,    setPatientRecords]     = useState([]);
  const [stats, setStats] = useState({
    todayCount: 0,
    totalPatients: 0,
    confirmedCount: 0,
    pendingCount: 0,
    availabilityPercent: 0,
    nextAppointmentTime: null,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Modal state
  const [showAvailabilityModal,   setShowAvailabilityModal]   = useState(false);
  const [showBlockTimeModal,      setShowBlockTimeModal]      = useState(false);
  const [showAppointmentDetails,  setShowAppointmentDetails]  = useState(false);
  const [selectedAppointment,     setSelectedAppointment]     = useState(null);
  const [availabilityRules,       setAvailabilityRules]       = useState([]);
  const [showMedicalRecordsModal, setShowMedicalRecordsModal] = useState(false);
  const [selectedPatientRecord,   setSelectedPatientRecord]   = useState(null);

  const [availabilityForm, setAvailabilityForm] = useState({
    weekday: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30,
  });
  const [blockTimeForm, setBlockTimeForm] = useState({ date: '', isAvailable: false, reason: '' });

  // Ref that carries an appointment ID across a programmatic tab switch so
  // MedicalRecordsTab can auto-start that session without an extra user click.
  const pendingSessionAppointmentRef = useRef(null);

  const weekDays     = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const weekDaysFull = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  // ─── Socket initialisation ─────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !user) return;

    socketService.connect(token);
    setSocketConnected(socketService.getConnectionStatus());

    const handleSessionStarted = (data) => {
      toast.success(`Session started for patient: ${data.patient?.name || ''}`);
      fetchAppointments();
      fetchStats();
    };
    const handleLabUpdate        = (data) => toast(`Lab ${data.requestNumber}: ${data.status}`);
    const handlePrescriptionUpdate = (data) => toast(`Prescription update: ${data.status}`);

    // ── appointment:no_show — cron marked an appointment as missed ───────────
    // Refresh the appointments list so the badge updates without a page reload.
    const handleNoShow = () => {
      fetchAppointments();
      fetchStats();
    };

    // ── session:restore ─────────────────────────────────────────────────────
    // When the backend socket detects the doctor reconnecting with an active
    // session, it fires this event. We switch to the sessions tab so the
    // MedicalRecordsTab's own restore logic will trigger and reopen the modal.
    const handleSessionRestore = (data) => {
      console.log('🔄 session:restore received on dashboard', data);
      if (activeTab !== 'sessions') {
        setActiveTab('sessions');
        toast('Navigating to your active session…', { duration: 3000 });
      }
    };

    socketService.onSessionStarted(handleSessionStarted);
    socketService.onLabUpdate(handleLabUpdate);
    socketService.onPrescriptionUpdate(handlePrescriptionUpdate);
    socketService.onAppointmentNoShow(handleNoShow);
    socketService.socket?.on('session:restore', handleSessionRestore);

    const statusInterval = setInterval(() => setSocketConnected(socketService.getConnectionStatus()), 5000);

    return () => {
      clearInterval(statusInterval);
      socketService.removeListener('session:started',      handleSessionStarted);
      socketService.removeListener('lab:update',           handleLabUpdate);
      socketService.removeListener('prescription:update',  handlePrescriptionUpdate);
      socketService.removeListener('appointment:no_show',  handleNoShow);
      socketService.socket?.off('session:restore', handleSessionRestore);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ─── Data fetching ─────────────────────────────────────────────────────────
  const fetchAppointments = useCallback(async () => {
    try {
      const response = await appointmentsAPI.getAppointments({ limit: 1000, offset: 0 });
      const data = Array.isArray(response) ? response : response.appointments || [];

      const today    = new Date(); today.setHours(0,0,0,0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

      const todayAppts = data
        .filter(a => { const d = new Date(a.start); return d >= today && d < tomorrow; })
        .sort((a, b) => new Date(a.start) - new Date(b.start));

      setTodayAppointments(todayAppts);
      setAllAppointments(data);

      return data;
    } catch (err) {
      console.error('❌ Error fetching appointments:', err);
      toast.error('Failed to fetch appointments');
      return [];
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await doctorAPI.getDoctorStats();
      const data = response.data || response;

      setStats({
        todayCount: data.todayCount ?? 0,
        totalPatients: data.totalPatients ?? 0,
        confirmedCount: data.confirmedCount ?? 0,
        pendingCount: data.pendingCount ?? 0,
        availabilityPercent: data.availabilityPercent ?? 0,
        nextAppointmentTime: data.nextAppointmentTime ?? null,
      });
    } catch (err) {
      console.error('fetchStats error:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchPatientRecords = useCallback(async (appointments = []) => {
    try {
      const completed  = appointments.filter(a => a.status === 'completed');
      const patientMap = new Map();

      completed.forEach(a => {
        const id = a.patient?._id; if (!id) return;
        if (!patientMap.has(id)) {
          patientMap.set(id, { patient: a.patient, lastVisit: a.start, totalVisits: 1, conditions: [], notes: a.notes || '' });
        } else {
          const r = patientMap.get(id); r.totalVisits++;
          if (new Date(a.start) > new Date(r.lastVisit)) { r.lastVisit = a.start; r.notes = a.notes || r.notes; }
        }
      });

      const results = await Promise.all(
        Array.from(patientMap.keys()).map(async (pid) => {
          try {
            const res = await medicalRecordsAPI.getPatientRecords(pid);
            const conditions = [...new Set((res.data || []).map(r => r.diagnosis).filter(Boolean))].slice(0, 3);
            return { patientId: pid, conditions };
          } catch { return { patientId: pid, conditions: [] }; }
        })
      );
      results.forEach(({ patientId, conditions }) => { const r = patientMap.get(patientId); if (r) r.conditions = conditions; });
      setPatientRecords(Array.from(patientMap.values()));
    } catch (err) {
      toast.error('Failed to load patient records');
    }
  }, []);

  const fetchAvailabilityRules = useCallback(async () => {
    try {
      const res = await availabilityAPI.getDoctorRules(user.id);
      setAvailabilityRules(res.data || []);
    } catch (err) {
      console.error('Failed to fetch availability rules:', err);
    }
  }, [user.id]);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [data] = await Promise.all([
          fetchAppointments(),
          fetchStats(),
          fetchAvailabilityRules()
        ]);
        await fetchPatientRecords(data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id, fetchAppointments, fetchPatientRecords, fetchStats, fetchAvailabilityRules]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleUpdateStatus = async (appointmentId, status, notes = '') => {
    setLoading(true);
    try {
      await appointmentsAPI.updateAppointmentStatus(appointmentId, { status, notes });
      toast.success(`Appointment ${status} successfully`);
      const data = await fetchAppointments();
      await Promise.all([fetchPatientRecords(data), fetchStats()]);
    } catch (err) {
      const ed = err.response?.data;
      if (ed?.currentStatus && ed?.allowedTransitions) {
        const allowed = ed.allowedTransitions.length ? ed.allowedTransitions.join(', ') : 'none';
        toast.error(`Cannot change to ${status}. Current: ${ed.currentStatus}. Valid: ${allowed}`, { duration: 5000 });
      } else if (ed?.message?.includes('Doctors cannot cancel')) {
        toast.error('Only patients can cancel appointments', { duration: 4000 });
      } else {
        toast.error(ed?.message || 'Failed to update appointment');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetAvailability = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await availabilityAPI.createRule(availabilityForm);
      toast.success('Availability rule created');
      setShowAvailabilityModal(false);
      await Promise.all([fetchAvailabilityRules(), fetchStats()]);
      setAvailabilityForm({ weekday: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30 });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create availability rule');
    } finally { setLoading(false); }
  };

  const handleBlockTime = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await availabilityAPI.createException({ date: blockTimeForm.date, isAvailable: blockTimeForm.isAvailable, reason: blockTimeForm.reason, slots: [] });
      toast.success('Time blocked successfully');
      setShowBlockTimeModal(false);
      setBlockTimeForm({ date: '', isAvailable: false, reason: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to block time');
    } finally { setLoading(false); }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Remove this availability rule?')) return;
    try {
      await availabilityAPI.deleteRule(ruleId);
      toast.success('Availability rule removed');
      await Promise.all([fetchAvailabilityRules(), fetchStats()]);
    } catch { toast.error('Failed to remove rule'); }
  };

  // ── FIX B: Start session from overview modal → switch to sessions tab ──────
  // Stores the target appointment ID in a ref (no re-render), switches to the
  // sessions tab, and lets MedicalRecordsTab's useEffect pick it up and
  // auto-call handleStartSession once the appointments list is ready.
  const handleStartSessionFromModal = useCallback((appointment) => {
    pendingSessionAppointmentRef.current = appointment._id;
    setActiveTab('sessions');
  }, []);

  const getDaysInMonth   = () => eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate)), end: endOfWeek(endOfMonth(currentDate)) });
  const getApptsForDate  = (date) => allAppointments.filter(a => isSameDay(new Date(a.start), date)).length;
  const handleMonthNav   = (dir) => setCurrentDate(dir === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1));

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold">MediBook</span>
            </div>

            <div className="flex items-center space-x-4">
              {/* Socket indicator */}
              <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                socketConnected ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {socketConnected ? (
                  <><Wifi className="w-3 h-3" /><span>Live</span><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /></>
                ) : (
                  <><WifiOff className="w-3 h-3" /><span>Offline</span></>
                )}
              </div>

              <DoctorNotifications />

              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm font-medium">Dr. {user?.firstName} {user?.lastName}</div>
                  <div className="text-xs text-gray-500">{user?.specialization}</div>
                </div>
                <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-medium">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
              </div>

              <button onClick={logout} className="p-2 hover:bg-gray-100 rounded-lg flex items-center space-x-2">
                <LogOut className="w-5 h-5" />
                <span className="text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Nav tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <OverviewTab
            stats={stats}
            todayAppointments={todayAppointments}
            availabilityRules={availabilityRules}
            currentDate={currentDate}
            selectedDate={selectedDate}
            weekDays={weekDays}
            weekDaysFull={weekDaysFull}
            getDaysInMonth={getDaysInMonth}
            getAppointmentsForDate={getApptsForDate}
            onSetCurrentDate={handleMonthNav}
            onSetSelectedDate={setSelectedDate}
            onShowAvailabilityModal={() => setShowAvailabilityModal(true)}
            onShowBlockTimeModal={() => setShowBlockTimeModal(true)}
            onViewAppointmentDetails={(a) => { setSelectedAppointment(a); setShowAppointmentDetails(true); }}
            onUpdateStatus={handleUpdateStatus}
            onDeleteRule={handleDeleteRule}
            loading={loading}
          />
        )}

        {activeTab === 'sessions' && (
          <MedicalRecordsTab
            appointments={allAppointments.filter(a =>
              // FIX B/E: include in_progress so a resumed session's appointment
              // still appears in the list after the doctor refreshes the page.
              a.status === 'approved' || a.status === 'in_progress'
            )}
            onComplete={async () => {
              const data = await fetchAppointments();
              await Promise.all([fetchPatientRecords(data), fetchStats()]);
            }}
            loading={loading}
            pendingAppointmentId={pendingSessionAppointmentRef.current}
            onSessionStarted={() => { pendingSessionAppointmentRef.current = null; }}
            socketConnected={socketConnected}
          />
        )}

        {/* NEW: Session History tab */}
        {activeTab === 'history' && <SessionHistoryTab />}

        {activeTab === 'patients' && (
          <PatientRecordsTab
            patientRecords={patientRecords}
            onViewRecords={(r) => { setSelectedPatientRecord(r); setShowMedicalRecordsModal(true); }}
            loading={loading}
          />
        )}
      </main>

      {/* Modals */}
      <DoctorModals
        showAvailabilityModal={showAvailabilityModal}
        setShowAvailabilityModal={setShowAvailabilityModal}
        availabilityForm={availabilityForm}
        setAvailabilityForm={setAvailabilityForm}
        availabilityRules={availabilityRules}
        weekDaysFull={weekDaysFull}
        handleSetAvailability={handleSetAvailability}
        showBlockTimeModal={showBlockTimeModal}
        setShowBlockTimeModal={setShowBlockTimeModal}
        blockTimeForm={blockTimeForm}
        setBlockTimeForm={setBlockTimeForm}
        handleBlockTime={handleBlockTime}
        showAppointmentDetails={showAppointmentDetails}
        setShowAppointmentDetails={setShowAppointmentDetails}
        selectedAppointment={selectedAppointment}
        handleUpdateStatus={handleUpdateStatus}
        handleSelectAppointment={(a) => { setSelectedPatientRecord({ patient: a.patient, preSelectedAppointment: a._id }); setShowMedicalRecordsModal(true); }}
        onStartSession={handleStartSessionFromModal}
        loading={loading}
      />
    </div>
  );
};

export default DoctorDashboard;
