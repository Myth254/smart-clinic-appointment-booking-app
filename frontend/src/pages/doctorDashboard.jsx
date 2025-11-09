/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { appointmentsAPI, availabilityAPI, medicalRecordsAPI } from '../api';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
} from 'date-fns';
import toast from 'react-hot-toast';
import MedicalRecordsTab from '../components/doctor/MedicalRecordsTab';
import PatientRecordsTab from '../components/doctor/PatientRecordsTab';
import CreateMedicalRecordsTab from '../components/doctor/CreateMedicalRecordsTab';
import OverviewTab from '../components/doctor/OverviewTab';
import DoctorModals from '../components/doctor/DoctorModals';

const DoctorDashboard = () => {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('overview');

  // State
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [patientRecords, setPatientRecords] = useState([]);
  const [stats, setStats] = useState({
    todayCount: 0,
    totalPatients: 0,
    confirmedCount: 0,
    availabilityPercent: 85,
  });

  // Modal states
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [showBlockTimeModal, setShowBlockTimeModal] = useState(false);
  const [showAppointmentDetails, setShowAppointmentDetails] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [availabilityRules, setAvailabilityRules] = useState([]);
  const [showMedicalRecordsModal, setShowMedicalRecordsModal] = useState(false);
  const [selectedPatientRecord, setSelectedPatientRecord] = useState(null);

  // Forms
  const [availabilityForm, setAvailabilityForm] = useState({
    weekday: 1,
    startTime: '09:00',
    endTime: '17:00',
    slotDurationMinutes: 30,
  });

  const [blockTimeForm, setBlockTimeForm] = useState({
    date: '',
    isAvailable: false,
    reason: '',
  });

  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const weekDaysFull = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  const fetchAppointments = useCallback(async () => {
    try {
      const response = await appointmentsAPI.getAppointments();
      const data = Array.isArray(response)
        ? response
        : response.appointments || [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayAppts = data
        .filter((apt) => {
          const aptDate = new Date(apt.start);
          return aptDate >= today && aptDate < tomorrow;
        })
        .sort((a, b) => new Date(a.start) - new Date(b.start));

      setTodayAppointments(todayAppts);
      setAllAppointments(data);

      const totalPatients = new Set(
        data.map((apt) => apt.patient?._id).filter(Boolean)
      ).size;

      const rulesResponse = await availabilityAPI.getDoctorRules(user.id);
      const rules = Array.isArray(rulesResponse)
        ? rulesResponse
        : rulesResponse.data || [];

      const calculateAvailabilityPercent = (rules) => {
        if (!rules || rules.length === 0) return 0;
        const totalMinutes = rules.reduce((sum, rule) => {
          if (!rule.startTime || !rule.endTime) return sum;
          const [startH, startM] = rule.startTime.split(':').map(Number);
          const [endH, endM] = rule.endTime.split(':').map(Number);
          const diff = endH * 60 + endM - (startH * 60 + startM);
          return sum + (diff > 0 ? diff : 0);
        }, 0);
        return Math.min(100, Math.round((totalMinutes / 2400) * 100));
      };

      const availabilityPercent = calculateAvailabilityPercent(rules);

      setStats({
        todayCount: todayAppts.length,
        totalPatients,
        confirmedCount: data.filter(
          (apt) => apt.status === 'approved' && new Date(apt.start) >= today
        ).length,
        availabilityPercent,
      });

      return data;
    } catch (error) {
      toast.error('Failed to fetch appointments');
      console.error(error);
      return [];
    }
  }, [user?.id]);

  // Populate patient conditions from medical records
  const fetchPatientRecords = useCallback(async (appointments = []) => {
    try {
      const completed = appointments.filter((apt) => apt.status === 'completed');
      const patientMap = new Map();
      
      // Step 1: Build basic patient map from appointments
      completed.forEach((apt) => {
        const patientId = apt.patient?._id;
        if (!patientId) return;

        if (!patientMap.has(patientId)) {
          patientMap.set(patientId, {
            patient: apt.patient,
            lastVisit: apt.start,
            totalVisits: 1,
            conditions: [], // Will be populated from medical records
            notes: apt.notes || '',
          });
        } else {
          const record = patientMap.get(patientId);
          record.totalVisits++;
          if (new Date(apt.start) > new Date(record.lastVisit)) {
            record.lastVisit = apt.start;
            record.notes = apt.notes || record.notes;
          }
        }
      });

      // Step 2: Fetch medical records to populate conditions
      const patientIds = Array.from(patientMap.keys());
      
      // Fetch medical records for each patient in parallel
      const recordsPromises = patientIds.map(async (patientId) => {
        try {
          const response = await medicalRecordsAPI.getPatientRecords(patientId);
          const records = response.data || [];
          
          // Extract unique diagnoses as conditions (max 3 most recent)
          const conditions = [...new Set(
            records
              .map(r => r.diagnosis)
              .filter(Boolean)
          )].slice(0, 3);
          
          return { patientId, conditions };
        } catch (error) {
          console.error(`Failed to fetch records for patient ${patientId}:`, error);
          return { patientId, conditions: [] };
        }
      });

      // Wait for all medical records to be fetched
      const conditionsResults = await Promise.all(recordsPromises);
      
      // Step 3: Update patient records with conditions
      conditionsResults.forEach(({ patientId, conditions }) => {
        const record = patientMap.get(patientId);
        if (record) {
          record.conditions = conditions;
        }
      });

      setPatientRecords(Array.from(patientMap.values()));
    } catch (error) {
      console.error('Error processing patient records:', error);
      toast.error('Failed to load complete patient records');
    }
  }, []);

  const fetchAvailabilityRules = useCallback(async () => {
    try {
      const response = await availabilityAPI.getDoctorRules(user.id);
      setAvailabilityRules(response.data || []);
    } catch (error) {
      console.error('Failed to fetch availability rules:', error);
    }
  }, [user.id]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await fetchAppointments();
        await fetchPatientRecords(data);
        await fetchAvailabilityRules();
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedDate, fetchAppointments, fetchPatientRecords, fetchAvailabilityRules]);

  const handleUpdateStatus = async (appointmentId, status, notes = '') => {
    try {
      setLoading(true);
      await appointmentsAPI.updateAppointmentStatus(appointmentId, { status, notes });
      toast.success(`Appointment ${status}`);
      const data = await fetchAppointments();
      await fetchPatientRecords(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update appointment');
    } finally {
      setLoading(false);
    }
  };

  const handleSetAvailability = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await availabilityAPI.createRule(availabilityForm);
      toast.success('Availability rule created');
      setShowAvailabilityModal(false);
      await fetchAvailabilityRules();
      setAvailabilityForm({
        weekday: 1,
        startTime: '09:00',
        endTime: '17:00',
        slotDurationMinutes: 30,
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create availability rule');
    } finally {
      setLoading(false);
    }
  };

  const handleBlockTime = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await availabilityAPI.createException({
        date: blockTimeForm.date,
        isAvailable: blockTimeForm.isAvailable,
        reason: blockTimeForm.reason,
        slots: [],
      });
      toast.success('Time blocked successfully');
      setShowBlockTimeModal(false);
      setBlockTimeForm({ date: '', isAvailable: false, reason: '' });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to block time');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Remove this availability rule?')) return;
    try {
      await availabilityAPI.deleteRule(ruleId);
      toast.success('Availability rule removed');
      await fetchAvailabilityRules();
    } catch (error) {
      toast.error('Failed to remove rule');
    }
  };

  const viewAppointmentDetails = (appointment) => {
    setSelectedAppointment(appointment);
    setShowAppointmentDetails(true);
  };

  const handleSelectAppointment = (appointment) => {
    const patientRecord = {
      patient: appointment.patient,
      preSelectedAppointment: appointment._id,
    };
    setSelectedPatientRecord(patientRecord);
    setShowMedicalRecordsModal(true);
  };

  const handleViewRecords = (record) => {
    setSelectedPatientRecord(record);
    setShowMedicalRecordsModal(true);
  };

  const getDaysInMonth = () => {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    return eachDayOfInterval({ start, end });
  };

  const getAppointmentsForDate = (date) => {
    return allAppointments.filter((apt) => isSameDay(new Date(apt.start), date)).length;
  };

  const handleSetCurrentDate = (direction) => {
    if (direction === 'prev') {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
                <CalendarIcon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold">MediBook</span>
            </div>

            <div className="flex items-center space-x-4">
              <button className="p-2 hover:bg-gray-100 rounded-lg relative">
                <Bell className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm font-medium">
                    Dr. {user?.firstName} {user?.lastName}
                  </div>
                  <div className="text-xs text-gray-500">{user?.specialization}</div>
                </div>
                <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-medium">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
              </div>
              <button
                onClick={logout}
                className="p-2 hover:bg-gray-100 rounded-lg flex items-center space-x-2"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {['overview', 'records', 'patients'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'overview'
                  ? 'Overview'
                  : tab === 'records'
                    ? 'Medical Records'
                    : 'Patient Records'}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
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
            getAppointmentsForDate={getAppointmentsForDate}
            onSetCurrentDate={handleSetCurrentDate}
            onSetSelectedDate={setSelectedDate}
            onShowAvailabilityModal={() => setShowAvailabilityModal(true)}
            onShowBlockTimeModal={() => setShowBlockTimeModal(true)}
            onViewAppointmentDetails={viewAppointmentDetails}
            onUpdateStatus={handleUpdateStatus}
            onDeleteRule={handleDeleteRule}
            loading={loading}
          />
        )}

        {activeTab === 'records' && (
          <CreateMedicalRecordsTab
            appointments={allAppointments}
            onSelectAppointment={handleSelectAppointment}
            onMarkComplete={(id) => handleUpdateStatus(id, 'completed', 'Visit completed')}
            loading={loading}
          />
        )}

        {activeTab === 'patients' && (
          <PatientRecordsTab
            patientRecords={patientRecords}
            onViewRecords={handleViewRecords}
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
        handleSelectAppointment={handleSelectAppointment}
        loading={loading}
      />

      {showMedicalRecordsModal && selectedPatientRecord && (
        <MedicalRecordsTab
          patientRecord={selectedPatientRecord}
          readOnly={!selectedPatientRecord.preSelectedAppointment}
          onClose={() => {
            setShowMedicalRecordsModal(false);
            setSelectedPatientRecord(null);
            fetchAppointments().then((data) => fetchPatientRecords(data));
          }}
        />
      )}
    </div>
  );
};

export default DoctorDashboard;