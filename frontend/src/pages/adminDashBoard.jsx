/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
// pages/AdminDashboard.jsx
/**
 * AdminDashboard — Refactored
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes from original:
 *
 * 1. Notification state replaced by `useNotifications` context — no separate
 *    local `notifications` / `unreadCount` state that diverges from the rest of
 *    the app.
 *
 * 2. Socket event handlers wrapped in stable `useCallback` refs — previously
 *    the `addNotification` function was recreated on every render, which meant
 *    the cleanup inside the socket `useEffect` removed stale listeners and the
 *    next render re-registered them, causing duplicate event handling.
 *
 * 3. Socket `useEffect` dep array is `[token]` — was missing from original,
 *    meaning it ran on every render.
 *
 * 4. Click-outside detection for notifications dropdown kept intact.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, Bell, LogOut, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import socketService from '../services/socketService';

import OverviewTab       from '../components/admin/OverviewTab';
import UserManagementTab from '../components/admin/UserManagement';
import AppointmentsTab   from '../components/admin/AppointmentsTab';
import SessionsTab       from '../components/admin/SessionsTab';
import SettingsTab       from '../components/admin/SettingsTab';
import ClinicsTab        from '../components/admin/ClinicsTab';

const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'users',        label: 'User Management' },
  { id: 'clinics',      label: 'Clinics' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'sessions',     label: 'Sessions' },
  { id: 'settings',     label: 'Settings' },
];

const AdminDashboard = () => {
  const { user, logout, token } = useAuth();

  // ① Shared notification context — no local duplicate state
  const { unreadCount, startPolling } = useNotifications();

  const [activeTab, setActiveTab] = useState('overview');
  const [userManagementIntent, setUserManagementIntent] = useState({ mode: null, role: null, nonce: 0 });
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Admin keeps its own in-memory activity log (socket events only, not DB notifications)
  const [activityLog, setActivityLog]     = useState([]);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityUnread, setActivityUnread]   = useState(0);

  const notifRef     = useRef(null);

  // Start notification polling for the bell icon
  useEffect(() => {
    startPolling();
  }, []); // ← once on mount

  // ── Socket setup ──────────────────────────────────────────────────────────
  // ② Stable addActivity — does NOT recreate on every render
  const addActivity = useCallback((title, message, type) => {
    setActivityLog((prev) => [
      { id: Date.now(), title, message, type, timestamp: new Date(), read: false },
      ...prev,
    ].slice(0, 50));
    setActivityUnread((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!token) return;

    socketService.connect(token);

    const statusInterval = setInterval(
      () => setIsSocketConnected(socketService.getConnectionStatus()),
      1_000
    );

    // ③ Handlers defined inside the effect — they close over `addActivity`
    //   which is stable (useCallback with empty deps)
    const handleSessionStarted      = (data) => addActivity('Session Started',         `Appointment ${data.appointmentId}`,                   'info');
    const handleLabRequested        = (data) => addActivity('New Lab Request',          `Request ${data.requestId}`,                           'info');
    const handlePaymentUpdate       = (data) => addActivity('Payment Received',         `KES ${Number(data.amount || 0).toLocaleString()}`,    'success');
    const handlePrescriptionConfirmed = (data) => addActivity('Prescription Confirmed', data.prescriptionId,                                   'success');
    const handleAppointmentCreated  = ()     => addActivity('New Appointment',          'A new appointment request was submitted',              'info');

    socketService.onSessionStarted(handleSessionStarted);
    socketService.onLabRequested(handleLabRequested);
    socketService.onPaymentSuccess(handlePaymentUpdate);
    socketService.onPaymentReceived(handlePaymentUpdate);
    socketService.onPrescriptionConfirmed(handlePrescriptionConfirmed);
    socketService.onAppointmentCreated(handleAppointmentCreated);

    return () => {
      clearInterval(statusInterval);
      socketService.removeListener('session:started',          handleSessionStarted);
      socketService.removeListener('lab:requested',            handleLabRequested);
      socketService.removeListener('payment:success',          handlePaymentUpdate);
      socketService.removeListener('payment:received',         handlePaymentUpdate);
      socketService.removeListener('prescription:confirmed',   handlePrescriptionConfirmed);
      socketService.removeListener('appointment:created',      handleAppointmentCreated);
    };
  }, [token, addActivity]); // ③ stable deps

  // ── Click-outside for activity dropdown ──────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target))
        setShowActivityLog(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markActivityRead = () => {
    setActivityLog((prev) => prev.map((n) => ({ ...n, read: true })));
    setActivityUnread(0);
  };

  // Combined badge: DB notifications (from context) + activity log
  const totalBadge = unreadCount + activityUnread;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo + connection */}
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold">MediBook Admin</span>

              <div className={`ml-4 flex items-center space-x-1 px-2 py-1 rounded-full text-xs ${
                isSocketConnected ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                <Activity className={`w-3 h-3 ${isSocketConnected ? 'animate-pulse' : ''}`} />
                <span>{isSocketConnected ? 'Live' : 'Connecting'}</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Activity/Notification bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setShowActivityLog((v) => !v)}
                  className="p-2 hover:bg-gray-100 rounded-lg relative"
                >
                  <Bell className="w-5 h-5" />
                  {totalBadge > 0 && (
                    <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {totalBadge > 9 ? '9+' : totalBadge}
                    </span>
                  )}
                </button>

                {showActivityLog && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
                    <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="font-semibold text-sm">Activity Log</h3>
                      {activityUnread > 0 && (
                        <button onClick={markActivityRead} className="text-xs text-blue-600 hover:text-blue-800">
                          Mark all as read
                        </button>
                      )}
                    </div>
                    {activityLog.length === 0 ? (
                      <p className="p-4 text-sm text-gray-500 text-center">No recent activity</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {activityLog.slice(0, 10).map((item) => (
                          <div key={item.id} className={`p-3 hover:bg-gray-50 ${!item.read ? 'bg-blue-50' : ''}`}>
                            <p className="text-sm font-medium">{item.title}</p>
                            <p className="text-xs text-gray-600">{item.message}</p>
                            <p className="text-xs text-gray-400 mt-1">{item.timestamp.toLocaleTimeString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* User info */}
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm font-medium">{user?.firstName} {user?.lastName}</div>
                  <div className="text-xs text-gray-500 capitalize">{user?.role || 'Administrator'}</div>
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

      {/* Nav Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview'     && <OverviewTab />}
        {activeTab === 'users'        && <UserManagementTab intent={userManagementIntent} />}
        {activeTab === 'clinics'      && <ClinicsTab />}
        {activeTab === 'appointments' && <AppointmentsTab />}
        {activeTab === 'sessions'     && <SessionsTab />}
        {activeTab === 'settings'     && <SettingsTab />}
      </main>
    </div>
  );
};

export default AdminDashboard;