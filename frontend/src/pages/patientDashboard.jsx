/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { Calendar, Bell, FileText, Settings, LogOut, Clock, User, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { appointmentsAPI, patientAPI, medicalRecordsAPI } from '../api';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import BookAppointmentModal from '../components/forms/BookAppointmentModal';
import NotificationsModal from '../components/layout/NotificationsModal';
import SettingsModal from '../components/layout/SettingsModal';
import RescheduleModal from '../components/forms/RescheduleModal';

const PatientDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  
  // Modal states
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedAppointmentForReschedule, setSelectedAppointmentForReschedule] = useState(null);
  
  // State
  const [appointments, setAppointments] = useState([]);
  const [appointmentHistory, setAppointmentHistory] = useState([]);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [stats, setStats] = useState({
    upcomingAppointments: 0,
    nextAppointmentDays: 0,
    totalVisits: 0,
    unreadNotifications: 0
  });

  // ✅ Fixed: Consolidated useEffect - fetch on mount and tab change
  useEffect(() => {
    fetchAppointments();
    fetchUnreadCount();
    
    // Fetch records only when 'records' tab is active
    if (activeTab === 'records') {
      fetchMedicalRecords();
    }
  }, [activeTab]);

  // Calculate stats when appointments change
  useEffect(() => {
    const calculateStats = () => {
      const upcomingCount = appointments.length;
      let nextDays = 0;
      
      if (appointments.length > 0) {
        const sortedAppts = [...appointments].sort((a, b) => new Date(a.start) - new Date(b.start));
        const nextAppt = sortedAppts[0];
        const diffTime = new Date(nextAppt.start) - new Date();
        nextDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      setStats(prev => ({
        ...prev,
        upcomingAppointments: upcomingCount,
        nextAppointmentDays: nextDays,
        totalVisits: appointmentHistory.filter(a => a.status === 'completed').length,
      }));
    };
    calculateStats();
  }, [appointments, appointmentHistory]);

  const fetchMedicalRecords = async () => {
    try {
      setLoading(true);
      const response = await medicalRecordsAPI.getMyRecords();
      setMedicalRecords(response.data || []);
    } catch (error) {
      console.error('Failed to fetch medical records:', error);
      toast.error('Failed to load medical records');
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const response = await appointmentsAPI.getAppointments();

      const payload = response.data || response;
      const data = Array.isArray(payload)
        ? payload
        : (payload.appointments || []);

      // ✅ DEBUG: Log the first appointment to see structure
      if (data.length > 0) {
        console.log('=== APPOINTMENT DATA STRUCTURE ===');
        console.log('First appointment:', data[0]);
        console.log('Doctor object:', data[0].doctor);
        console.log('Doctor specialization:', data[0].doctor?.specialization);
        console.log('================================');
      }

      const now = new Date();
      const upcoming = data.filter(apt =>
        ['pending', 'approved'].includes(apt.status) &&
        new Date(apt.start) > now
      );
      const history = data.filter(apt =>
        apt.status === 'completed' ||
        apt.status === 'cancelled' ||
        new Date(apt.start) <= now
      );

      setAppointments(upcoming);
      setAppointmentHistory(history);
    } catch (error) {
      toast.error('Failed to fetch appointments');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      if (!user?.id) return; // ✅ Changed from user?._id to user?.id (normalized)
      const response = await patientAPI.getUnreadCount(user.id);
      setStats(prev => ({
        ...prev,
        unreadNotifications: response.unreadCount || 0
      }));
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;

    try {
      setLoading(true);
      await appointmentsAPI.cancelAppointment(appointmentId, 'Cancelled by patient');
      toast.success('Appointment cancelled successfully');
      fetchAppointments();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel appointment');
    } finally {
      setLoading(false);
    }
  };

  const handleRescheduleClick = (appointment) => {
    setSelectedAppointmentForReschedule(appointment);
    setShowRescheduleModal(true);
  };

  const handleRescheduleSubmit = async (newSlot) => {
    try {
      setLoading(true);
      await appointmentsAPI.rescheduleAppointment(
        selectedAppointmentForReschedule._id,
        {
          newStart: new Date(newSlot.start).toISOString(),
          newEnd: new Date(newSlot.end).toISOString(),
          reason: 'Patient requested reschedule'
        }
      );
      toast.success('Appointment rescheduled successfully');
      setShowRescheduleModal(false);
      setSelectedAppointmentForReschedule(null);
      fetchAppointments();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reschedule');
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationsClick = () => {
    setShowNotifications(true);
  };

  const handleSettingsClick = () => {
    setShowSettings(true);
  };

  const handleModalClose = (modalType) => {
    if (modalType === 'notifications') {
      setShowNotifications(false);
      fetchUnreadCount();
    } else if (modalType === 'settings') {
      setShowSettings(false);
    } else if (modalType === 'reschedule') {
      setShowRescheduleModal(false);
      setSelectedAppointmentForReschedule(null);
    }
  };

  const formatDate = (dateString) => {
    try {
      return format(parseISO(dateString), 'EEE, MMM d');
    } catch {
      return dateString;
    }
  };

  const formatTime = (dateString) => {
    try {
      return format(parseISO(dateString), 'h:mm a');
    } catch {
      return dateString;
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
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold">MediBook</span>
            </div>

            <div className="flex items-center space-x-4">
              <button 
                onClick={handleNotificationsClick}
                className="p-2 hover:bg-gray-100 rounded-lg relative"
              >
                <Bell className="w-5 h-5" />
                {stats.unreadNotifications > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                    {stats.unreadNotifications > 9 ? '9+' : stats.unreadNotifications}
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

      {/* Navigation - ✅ Fixed: Added 'records' tab */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'book', label: 'Book Appointment' },
              { id: 'records', label: 'Medical Records' },
              { id: 'history', label: 'History' }
            ].map(tab => (
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-gray-600 text-sm font-medium">Upcoming Appointments</h3>
                  <Calendar className="w-5 h-5 text-gray-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold">{stats.upcomingAppointments}</p>
                  <p className="text-sm text-gray-500">
                    {stats.upcomingAppointments > 0 
                      ? `Next appointment in ${stats.nextAppointmentDays} days`
                      : 'No upcoming appointments'}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-gray-600 text-sm font-medium">Total Visits</h3>
                  <FileText className="w-5 h-5 text-gray-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold">{stats.totalVisits}</p>
                  <p className="text-sm text-gray-500">Completed appointments</p>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6 cursor-pointer hover:bg-gray-50" onClick={handleNotificationsClick}>
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-gray-600 text-sm font-medium">Notifications</h3>
                  <Bell className="w-5 h-5 text-gray-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold">{stats.unreadNotifications}</p>
                  <p className="text-sm text-gray-500">Unread reminders</p>
                </div>
              </div>
            </div>

            {/* Upcoming Appointments */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold">Upcoming Appointments</h2>
                    <p className="text-sm text-gray-500">Your scheduled appointments</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('book')}
                    className="bg-black text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-gray-800"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Book New</span>
                  </button>
                </div>
              </div>

              <div className="divide-y divide-gray-200">
                {loading && appointments.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">Loading appointments...</div>
                ) : appointments.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    No upcoming appointments. Book one to get started!
                  </div>
                ) : (
                  appointments.map((appointment) => (
                    <div key={appointment._id} className="p-6 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex space-x-4">
                          <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                            <User className="w-6 h-6 text-gray-600" />
                          </div>
                          <div className="space-y-1">
                            <h3 className="font-medium">
                              Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}
                            </h3>
                            <p className="text-sm text-gray-600">{appointment.doctor?.specialization}</p>
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              <div className="flex items-center space-x-1">
                                <Calendar className="w-4 h-4" />
                                <span>{formatDate(appointment.start)}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Clock className="w-4 h-4" />
                                <span>{formatTime(appointment.start)}</span>
                              </div>
                            </div>
                            {appointment.reason && (
                              <p className="text-sm text-gray-600 mt-2">Reason: {appointment.reason}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                            appointment.status === 'approved' 
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {appointment.status}
                          </span>
                          <button
                            onClick={() => handleRescheduleClick(appointment)}
                            disabled={loading}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                          >
                            Reschedule
                          </button>
                          <button
                            onClick={() => handleCancelAppointment(appointment._id)}
                            disabled={loading}
                            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setActiveTab('book')}
                  className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Book Appointment</div>
                    <div className="text-sm text-gray-500">Schedule a new visit</div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('records')}
                  className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">View Records</div>
                    <div className="text-sm text-gray-500">Access medical history</div>
                  </div>
                </button>

                <button 
                  onClick={handleNotificationsClick}
                  className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Notifications</div>
                    <div className="text-sm text-gray-500">Manage reminders</div>
                  </div>
                </button>

                <button 
                  onClick={handleSettingsClick}
                  className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Settings</div>
                    <div className="text-sm text-gray-500">Update your profile</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'book' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <BookAppointmentModal onSuccess={fetchAppointments} />
          </div>
        )}

        {activeTab === 'records' && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Medical Records</h2>
              <p className="text-sm text-gray-500">Your medical history and diagnoses</p>
            </div>
            
            {loading && medicalRecords.length === 0 ? (
              <div className="p-12 text-center text-gray-500">Loading records...</div>
            ) : medicalRecords.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No medical records yet</p>
                <p className="text-xs mt-1">Records will appear here after completed appointments</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {medicalRecords.map((record) => (
                  <div key={record._id} className="p-6 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900">
                            {record.diagnosis}
                          </h3>
                          <span className="text-sm text-gray-500">
                            {format(parseISO(record.createdAt), 'MMM d, yyyy')}
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-600">
                          Dr. {record.doctor?.userId?.firstName || record.doctor?.firstName} {record.doctor?.userId?.lastName || record.doctor?.lastName}
                        </p>
                        
                        {record.prescription && record.prescription.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm font-medium text-gray-700">Prescriptions:</p>
                            <ul className="mt-1 space-y-1">
                              {record.prescription.map((med, idx) => (
                                <li key={idx} className="text-sm text-gray-600">
                                  • {med.medication} - {med.dosage} ({med.frequency})
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {record.notes && (
                          <p className="text-sm text-gray-600 mt-2">
                            <span className="font-medium">Notes:</span> {record.notes}
                          </p>
                        )}
                      </div>
                      
                      <button
                        onClick={() => window.open(`/api/medical-records/${record._id}/pdf`, '_blank')}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 ml-4"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Appointment History</h2>
              <p className="text-sm text-gray-500">View your past appointments and medical notes</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doctor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specialty</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loading && appointmentHistory.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                        Loading appointment history...
                      </td>
                    </tr>
                  ) : appointmentHistory.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                        No appointment history yet
                      </td>
                    </tr>
                  ) : (
                    appointmentHistory.map((appointment) => (
                      <tr key={appointment._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {formatDate(appointment.start)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {appointment.doctor?.specialization}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {formatTime(appointment.start)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                            appointment.status === 'completed'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {appointment.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {appointment.notes || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <NotificationsModal 
        isOpen={showNotifications} 
        onClose={() => handleModalClose('notifications')} 
      />
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => handleModalClose('settings')} 
      />
      {showRescheduleModal && selectedAppointmentForReschedule && (
        <RescheduleModal
          isOpen={showRescheduleModal}
          onClose={() => handleModalClose('reschedule')}
          appointment={selectedAppointmentForReschedule}
          onSubmit={handleRescheduleSubmit}
        />
      )}
    </div>
  );
};

export default PatientDashboard;