/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
// pages/PatientDashboard.jsx
/**
 * PatientDashboard — Refactored (pass 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes on top of the previous refactor:
 *
 * A. PaymentsTab no longer self-fetches.
 *    Before: payments tab lazy-loader called `fetchBills()` AND `fetchPrescriptions()`,
 *            while PaymentsTab also called `billingAPI.getMyBills()` internally
 *            on mount — 2 hits to /billing/bills/my-bills per tab visit.
 *    After:  `bills` and `loading` are passed as props. The "Refresh" button
 *            delegates to `fetchBills` via the new `onRefresh` prop.
 *            The lazy-loader only calls `fetchBills()` once (guard still applies).
 *
 * B. ActiveConsultationBanner no longer polls socket status or registers
 *    its own session:progress listener.
 *    Before: Banner had setInterval(checkConnection, 1_000) → 60 state updates/min,
 *            plus its own onSessionProgress listener duplicating the dashboard's.
 *    After:  Banner receives `isConnected` and `recentUpdate` as props.
 *            The dashboard owns the single 1-second connection check interval
 *            (already present) and manages recentUpdate state.
 *
 * C. PrescriptionsTab no longer registers socket listeners.
 *    Before: PrescriptionsTab subscribed to prescription:confirmed/ready/
 *            dispensed/alternative_suggested independently.
 *    After:  It only receives `highlightedPrescriptions` as a prop (Set<id>),
 *            managed entirely by the socket handlers below.
 *
 * All other fixes from pass 1 are preserved unchanged.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calendar, Bell, LogOut, Plus, Activity,
  Pill, CreditCard, Clock, FileText,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { ConsultationProvider } from '../context/ConsultationContext';
import { useNotifications } from '../context/NotificationContext';
import {
  medicalRecordsAPI, patientAPI, pharmacyAPI, billingAPI,
} from '../api';
import { useAppointments } from '../hooks/Useappointments';
import toast from 'react-hot-toast';
import socketService from '../services/socketService';

import StatsCards                from '../components/patient/stats/StatsCards';
import OverviewTab               from '../components/patient/OverviewTab';
import PrescriptionsTab          from '../components/patient/PrescriptionsTab';
import PaymentsTab               from '../components/patient/PaymentsTab';
import HistoryTab                from '../components/patient/HistoryTab';
import CriticalResultsAlert      from '../components/patient/CriticalResultsAlert';
import ActiveConsultationBanner  from '../components/patient/ActiveConsultationBanner';
import PaymentVerificationModal  from '../components/modals/PaymentVerificationModal';
import { FollowUpsList }         from '../components/patient/FollowUpBookingWidget';
import AppointmentReminderSystem from '../components/patient/AppointmentReminderSystem';
import BookAppointmentModal      from '../components/forms/BookAppointmentModal';
import NotificationsModal        from '../components/layout/NotificationsModal';
import SettingsModal             from '../components/layout/SettingsModal';
import RescheduleModal           from '../components/forms/RescheduleModal';
import PrescriptionDetailModal   from '../components/modals/PrescriptionDetailModal';
import MedicalRecordDetailModal  from '../components/modals/MedicalRecordDetailModal';
import { appointmentsAPI }       from '../api';

// ─────────────────────────────────────────────────────────────────────────────

const ConnectionStatusBadge = ({ isConnected }) => (
  <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${
    isConnected
      ? 'bg-green-50 text-green-700 border border-green-200'
      : 'bg-red-50 text-red-700 border border-red-200'
  }`}>
    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
    <span>{isConnected ? 'Live' : 'Offline'}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

const PatientDashboardContent = () => {
  const { user, logout }  = useAuth();
  const { unreadCount }   = useNotifications(); // shared context — no extra poll

  const [activeTab, setActiveTab]             = useState('overview');
  const [loading,   setLoading]               = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  // B. recentUpdate replaces Banner's internal state — managed here so the
  //    single session:progress handler in the socket useEffect can set it.
  const [recentUpdate, setRecentUpdate]       = useState(null);
  const recentUpdateTimerRef                  = useRef(null);

  // Modals
  const [showNotifications,  setShowNotifications]  = useState(false);
  const [showSettings,       setShowSettings]        = useState(false);
  const [showRescheduleModal,setShowRescheduleModal] = useState(false);
  const [showPaymentModal,   setShowPaymentModal]    = useState(false);
  const [selectedAppointmentForReschedule, setSelectedAppointmentForReschedule] = useState(null);
  const [selectedMedicalRecord,  setSelectedMedicalRecord]  = useState(null);
  const [selectedPrescription,   setSelectedPrescription]   = useState(null);
  const [paymentData,            setPaymentData]            = useState(null);
  const [statsLoading,           setStatsLoading]           = useState(true);
  const [highlightedPrescriptions, setHighlightedPrescriptions] = useState(new Set());

  // Data
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [labRequests,    setLabRequests]    = useState([]);
  const [prescriptions,  setPrescriptions]  = useState([]);
  const [bills,          setBills]          = useState([]);
  const [billsLoading,   setBillsLoading]   = useState(false);
  const [stats, setStats] = useState({
    upcomingAppointments: 0, nextAppointmentDays: 0,
    totalVisits: 0, unreadNotifications: 0,
    activePrescriptions: 0, pendingPayments: 0,
  });

  // Centralised appointment fetching via hook
  const {
    all: allAppointments,
    upcoming: appointments,
    history: appointmentHistory,
    refresh: refreshAppointments,
  } = useAppointments();

  // Track which tabs have been loaded at least once — prevent re-fetch on revisit
  const tabLoadedRef    = useRef({});
  const statsTimeoutRef = useRef(null);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!user?._id) { setStatsLoading(false); return; }
    setStatsLoading(true);
    try {
      const data = await patientAPI.getStats(user._id);
      setStats({
        upcomingAppointments: data.upcomingCount         ?? 0,
        nextAppointmentDays:  data.nextAppointmentDays   ?? 0,
        totalVisits:          data.completedAppointments ?? 0,
        activePrescriptions:  data.activePrescriptions   ?? 0,
        pendingPayments:      data.pendingPayments        ?? 0,
        unreadNotifications:  data.unreadNotifications    ?? 0,
      });
    } catch (err) {
      console.error('fetchStats error:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [user?._id]);

  const debouncedFetchStats = useCallback(() => {
    clearTimeout(statsTimeoutRef.current);
    statsTimeoutRef.current = setTimeout(fetchStats, 400);
  }, [fetchStats]);

  // ── Data fetchers (stable references) ────────────────────────────────────
  const fetchBills = useCallback(async () => {
    try {
      setBillsLoading(true);
      const res = await billingAPI.getMyBills();
      setBills(res.data ?? []);
    } catch (err) {
      if (err?.response?.status !== 404) console.error('Fetch bills error:', err);
      setBills([]);
    } finally {
      setBillsLoading(false);
    }
  }, []);

  const fetchMedicalRecords = useCallback(async () => {
    try {
      setLoading(true);
      const res = await medicalRecordsAPI.getMyRecords();
      const records = res.data ?? [];
      setMedicalRecords(records);
      // Derive lab requests from already-fetched records — no extra API call
      const labResults = records.flatMap((r) => r.resolvedLabResults ?? []);
      setLabRequests(labResults);
    } catch (err) {
      toast.error('Failed to load medical records');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPrescriptions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await pharmacyAPI.getPrescriptions();
      setPrescriptions(res.data ?? []);
    } catch (err) {
      toast.error('Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Bootstrap on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?._id) return;
    refreshAppointments();
    fetchStats();
    fetchBills();
    tabLoadedRef.current['overview'] = true;
  }, [user?._id]);

  // ── Lazy tab loading — fetch only when tab first visited ─────────────────
  useEffect(() => {
    if (tabLoadedRef.current[activeTab]) return; // already loaded
    tabLoadedRef.current[activeTab] = true;

    if (activeTab === 'records') {
      fetchMedicalRecords();
    } else if (activeTab === 'prescriptions') {
      fetchPrescriptions();
    }
    // 'payments' no longer needs to self-fetch — bills are fetched on mount
    // and refreshed via the Refresh button (onRefresh prop) when needed.
  }, [activeTab]);

  useEffect(() => () => {
    clearTimeout(statsTimeoutRef.current);
    clearTimeout(recentUpdateTimerRef.current);
  }, []);

  // ── Socket setup ──────────────────────────────────────────────────────────
  // Dep array uses `user?.role` (primitive) not `user` (object) — prevents
  // re-registration on every render when user reference changes.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || user?.role !== 'patient') return;

    socketService.connect(token);

    // Single interval for connection status — owned here, not in Banner
    const checkConnection = setInterval(
      () => setSocketConnected(socketService.getConnectionStatus()),
      1_000
    );

    const handleSessionStarted = (data) => {
      toast.success(`Dr. ${data.doctor?.name || 'Your doctor'} has started your consultation`, {
        duration: 5000, icon: '👨‍⚕️',
      });
      refreshAppointments();
      debouncedFetchStats();
    };

    const handleBillCreated = (data) => {
      toast.info(`Your consultation bill is ready (${data.billNumber})`, { duration: 4000, icon: '🧾' });
      fetchBills();
      debouncedFetchStats();
    };

    // B. session:progress now updates recentUpdate state (passed to Banner as prop)
    //    instead of being handled inside Banner itself.
    const handleSessionProgress = (data) => {
      toast.info(data.message, { duration: 3000 });
      // Show update bubble in Banner for 5 s
      clearTimeout(recentUpdateTimerRef.current);
      setRecentUpdate({ message: data.message, timestamp: new Date() });
      recentUpdateTimerRef.current = setTimeout(() => setRecentUpdate(null), 5_000);
    };

    const handleSessionCompleted = (data) => {
      toast.success('Your consultation has been completed', { duration: 5000, icon: '✅' });
      setRecentUpdate(null);
      refreshAppointments();
      fetchMedicalRecords();
      debouncedFetchStats();
    };

    const handleSessionCancelled = (data) => {
      toast.error(`Session ended: ${data.reason}`, { duration: 6000 });
      setRecentUpdate(null);
      refreshAppointments();
    };

    const handleLabRequestCreated = (data) => {
      toast.info(`Lab tests ordered: ${data.tests?.join(', ') || 'Tests'}`, { duration: 5000, icon: '🧪' });
      tabLoadedRef.current['records'] = false;
      if (activeTab === 'records') fetchMedicalRecords();
    };

    const handleLabStatusChanged = (data) => {
      const msgs = {
        assigned:           'Lab tests assigned to technician',
        specimen_collected: 'Specimen collected',
        processing:         'Lab tests in progress',
        completed:          'Lab results ready!',
      };
      if (msgs[data.status]) {
        toast.info(msgs[data.status], { duration: 4000, icon: '🧪' });
        tabLoadedRef.current['records'] = false;
        if (activeTab === 'records') fetchMedicalRecords();
      }
    };

    const handleLabResultsAvailable = (data) => {
      toast.success('Your lab results are now available!', { duration: 6000, icon: '📊' });
      if (data.hasCriticalResults)
        toast.error('⚠️ CRITICAL: Some results require immediate attention.', { duration: 10000 });
      tabLoadedRef.current['records'] = false;
      if (activeTab === 'records') fetchMedicalRecords();
    };

    // C. Prescription highlight helper — only managed here, not in PrescriptionsTab
    const highlightPrescription = (id) => {
      setHighlightedPrescriptions((prev) => new Set([...prev, id]));
      setTimeout(() => {
        setHighlightedPrescriptions((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 3_000);
    };

    const handlePrescriptionConfirmed = (data) => {
      toast.info(`Prescription #${data.prescriptionNumber}: Medications confirmed`, { duration: 4000, icon: '💊' });
      tabLoadedRef.current['prescriptions'] = false;
      fetchPrescriptions();
      highlightPrescription(data.prescriptionId);
      debouncedFetchStats();
    };

    const handlePrescriptionReady = (data) => {
      toast.success('Your prescription is ready for pickup!', { duration: 8000, icon: '🏪' });
      fetchPrescriptions();
      highlightPrescription(data.prescriptionId);
      debouncedFetchStats();
    };

    const handlePrescriptionDispensed = (data) => {
      toast.success(`Prescription #${data.prescriptionNumber} has been dispensed`, { duration: 5000, icon: '✅' });
      fetchPrescriptions();
      highlightPrescription(data.prescriptionId);
      debouncedFetchStats();
    };

    const handlePaymentSuccessSocket = (data) => {
      toast.success(
        `Payment of KES ${data.amount?.toLocaleString() || data.amount} successful!`,
        { duration: 5000, icon: '✅' }
      );
      fetchBills();
      debouncedFetchStats();
      if (data.type === 'prescription') fetchPrescriptions();
    };

    const handlePaymentPending = () =>
      toast.info('Payment is being processed...', { duration: 4000, icon: '⏳' });

    socketService.onSessionStarted(handleSessionStarted);
    socketService.socket?.on('session:bill_created', handleBillCreated);
    socketService.onSessionProgress(handleSessionProgress);
    socketService.onSessionCompleted(handleSessionCompleted);
    socketService.onSessionCancelled(handleSessionCancelled);
    socketService.onLabRequestCreated(handleLabRequestCreated);
    socketService.onLabStatusChanged(handleLabStatusChanged);
    socketService.onLabResultsAvailable(handleLabResultsAvailable);
    socketService.onPrescriptionConfirmed(handlePrescriptionConfirmed);
    socketService.onPrescriptionReady(handlePrescriptionReady);
    socketService.onPrescriptionDispensed(handlePrescriptionDispensed);
    socketService.onPaymentSuccess(handlePaymentSuccessSocket);
    socketService.onPaymentPending(handlePaymentPending);

    return () => {
      clearInterval(checkConnection);
      clearTimeout(statsTimeoutRef.current);
      clearTimeout(recentUpdateTimerRef.current);
      socketService.removeAllListeners('session:started');
      socketService.removeAllListeners('session:progress');
      socketService.removeAllListeners('session:completed');
      socketService.removeAllListeners('session:cancelled');
      socketService.removeAllListeners('session:bill_created');
      socketService.removeAllListeners('lab:request_created');
      socketService.removeAllListeners('lab:status_changed');
      socketService.removeAllListeners('lab:results_available');
      socketService.removeAllListeners('prescription:confirmed');
      socketService.removeAllListeners('prescription:ready');
      socketService.removeAllListeners('prescription:dispensed');
      socketService.removeAllListeners('payment:success');
      socketService.removeAllListeners('payment:pending');
    };
  }, [user?.role]); // primitive dep — re-registers only when role changes

  useEffect(() => () => { if (!user) socketService.disconnect(); }, [user]);

  // ── Action handlers ───────────────────────────────────────────────────────
  const handlePaymentInitiation = (item, type) => {
    if (type === 'bill' || item.billId) {
      setPaymentData({
        billId:      item.billId || item._id,
        amount:      item.amount || item.balanceDue,
        billNumber:  item.billNumber,
        description: item.description || item.sessionRef,
        itemDetails: item.itemDetails,
        defaultPhone: user?.phoneNumber,
      });
    } else {
      setPaymentData({
        amount:      item.estimatedCost || item.actualCost,
        referenceId: item._id,
        type,
        description: type === 'lab'
          ? `Lab Test #${item.requestNumber}`
          : `Prescription #${item.prescriptionNumber}`,
        itemDetails: type === 'lab'
          ? `${item.tests?.length || 0} test(s)`
          : `${item.medications?.length || 0} medication(s)`,
        defaultPhone: user?.phoneNumber,
      });
    }
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = async () => {
    toast.success('Payment completed successfully!');
    await fetchBills();
    await fetchStats();
    if (activeTab === 'prescriptions' || activeTab === 'payments') await fetchPrescriptions();
  };

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      setLoading(true);
      await appointmentsAPI.cancelAppointment(appointmentId, 'Cancelled by patient');
      toast.success('Appointment cancelled successfully');
      await Promise.all([refreshAppointments(), fetchStats()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel appointment');
    } finally {
      setLoading(false);
    }
  };

  const handleReschedule = async (newSlot) => {
    try {
      setLoading(true);
      await appointmentsAPI.rescheduleAppointment(selectedAppointmentForReschedule._id, {
        newStart: new Date(newSlot.start).toISOString(),
        newEnd:   new Date(newSlot.end).toISOString(),
        reason:   'Patient requested reschedule',
      });
      toast.success('Appointment rescheduled successfully');
      setShowRescheduleModal(false);
      setSelectedAppointmentForReschedule(null);
      await Promise.all([refreshAppointments(), fetchStats()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reschedule');
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUpBook = (appointment) => {
    setActiveTab('book');
    sessionStorage.setItem('followUpContext', JSON.stringify({
      followUpOf:    appointment._id,
      doctorId:      appointment.doctor?._id || appointment.doctor?.userId?._id,
      suggestedDate: appointment.followUpDate,
      reason:        appointment.followUpReason
        ? `Follow-up for: ${appointment.followUpReason}`
        : 'Follow-up appointment requested by your doctor.',
    }));
  };

  const handleFollowUpDismiss = async (appointment) => {
    try {
      await appointmentsAPI.dismissFollowUpReminder(appointment._id);
      toast.success('Follow-up reminder dismissed');
      refreshAppointments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to dismiss follow-up reminder');
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const pendingFollowUps = allAppointments.filter(
    (a) => a.isFollowUpRequired && a.activeFollowUpReminder?.status === 'active'
  );

  const tabs = [
    { id: 'overview',      label: 'Overview',         icon: Activity   },
    { id: 'book',          label: 'Book Appointment', icon: Plus       },
    { id: 'records',       label: 'Medical Records',  icon: FileText   },
    { id: 'prescriptions', label: 'Prescriptions',    icon: Pill       },
    { id: 'payments',      label: 'Payments',         icon: CreditCard },
    { id: 'history',       label: 'History',          icon: Clock      },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <CriticalResultsAlert />

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold">MediBook</span>
              <ConnectionStatusBadge isConnected={socketConnected} />
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowNotifications(true)}
                className="p-2 hover:bg-gray-100 rounded-lg relative"
              >
                <Bell className="w-5 h-5" />
                {/* Use shared context unreadCount — no extra API call */}
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm font-medium">{user?.firstName} {user?.lastName}</div>
                  <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
                </div>
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-medium">
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

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* B. Pass isConnected + recentUpdate props — Banner no longer polls/subscribes */}
        <ActiveConsultationBanner
          onViewDetails={() => {}}
          isConnected={socketConnected}
          recentUpdate={recentUpdate}
        />

        <AppointmentReminderSystem appointments={allAppointments} />

        {pendingFollowUps.length > 0 && activeTab === 'overview' && (
          <FollowUpsList
            appointments={pendingFollowUps}
            onBook={handleFollowUpBook}
            onDismiss={handleFollowUpDismiss}
          />
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <StatsCards stats={stats} statsLoading={statsLoading} onCardClick={setActiveTab} />
            <OverviewTab
              appointments={appointments}
              loading={loading}
              onBookNew={() => setActiveTab('book')}
              onReschedule={(apt) => {
                setSelectedAppointmentForReschedule(apt);
                setShowRescheduleModal(true);
              }}
              onCancel={handleCancelAppointment}
              onViewRecords={() => setActiveTab('records')}
              onViewNotifications={() => setShowNotifications(true)}
              onViewSettings={() => setShowSettings(true)}
            />
          </div>
        )}

        {activeTab === 'book' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <BookAppointmentModal
              onSuccess={async () => { await Promise.all([refreshAppointments(), fetchStats()]); }}
            />
          </div>
        )}

        {activeTab === 'records' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <MedicalRecordDetailModal
              records={medicalRecords}
              loading={loading}
              onViewRecord={setSelectedMedicalRecord}
            />
          </div>
        )}

        {activeTab === 'prescriptions' && (
          // C. No socket listeners inside PrescriptionsTab anymore
          <PrescriptionsTab
            prescriptions={prescriptions}
            highlightedPrescriptions={highlightedPrescriptions}
            loading={loading}
            onViewDetails={setSelectedPrescription}
          />
        )}

        {activeTab === 'payments' && (
          // A. Bills passed as props — PaymentsTab no longer self-fetches
          <PaymentsTab
            bills={bills}
            loading={billsLoading}
            onPayment={handlePaymentInitiation}
            onRefresh={fetchBills}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab appointmentHistory={appointmentHistory} loading={loading} />
        )}
      </main>

      <NotificationsModal
        isOpen={showNotifications}
        onClose={() => { setShowNotifications(false); fetchStats(); }}
      />
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {showRescheduleModal && selectedAppointmentForReschedule && (
        <RescheduleModal
          isOpen={showRescheduleModal}
          onClose={() => {
            setShowRescheduleModal(false);
            setSelectedAppointmentForReschedule(null);
          }}
          appointment={selectedAppointmentForReschedule}
          onSubmit={handleReschedule}
        />
      )}

      {selectedPrescription && (
        <PrescriptionDetailModal
          prescription={selectedPrescription}
          onClose={() => setSelectedPrescription(null)}
        />
      )}

      <PaymentVerificationModal
        isOpen={showPaymentModal}
        onClose={() => { setShowPaymentModal(false); setPaymentData(null); }}
        paymentData={paymentData}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const PatientDashboard = () => (
  <ConsultationProvider>
    <PatientDashboardContent />
  </ConsultationProvider>
);

export default PatientDashboard;