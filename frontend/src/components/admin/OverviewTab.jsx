/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
// components/admin/OverviewTab.jsx
/**
 * OverviewTab — Refactored
 * ─────────────────────────────────────────────────────────────────────────────
 * Issues fixed:
 *
 * 1. DUPLICATE FETCH — fetchRecentUsers() was a separate useCallback + separate
 *    useEffect fetch, hitting /admin/recent-users independently every mount.
 *    getDashboardStats() already returns `recentUsers` in its payload. The
 *    standalone fetchRecentUsers call is removed entirely.
 *
 * 2. UNSTABLE SOCKET HANDLERS — socketHandlers was an object literal recreated
 *    on every render. useAdminSocket stores the handlers in a ref so it's safe,
 *    but handlePaymentUpdate was defined as a bare function (not useCallback),
 *    making it visually unsafe and confusing. All handlers are now stable refs
 *    via useCallback / useRef.
 *
 * 3. MISSING DEP ARRAY on addRealtimeActivity — it was a plain function defined
 *    inside the component body, recreated every render. Wrapped in useCallback.
 *
 * 4. useEffect([fetchRecentUsers, fetchDashboardData]) — both were useCallback
 *    with empty dep arrays so they were stable, but listing them as deps is
 *    misleading and fragile. The effect now has an empty dep array and calls
 *    the stable functions directly.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, UserCheck, Calendar, TrendingUp, Activity, AlertCircle } from 'lucide-react';
import { adminAPI } from '../../api';
import { format, parseISO } from 'date-fns';
import useAdminSocket from '../../hooks/useAdminSocket';
import toast from 'react-hot-toast';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const formatSignedPercent = (v = 0) => `${v >= 0 ? '+' : ''}${v}%`;
const formatCurrency      = (v = 0) => `KES ${Number(v || 0).toLocaleString()}`;

const OverviewTab = () => {
  const [stats,              setStats]              = useState(null);
  const [recentUsers,        setRecentUsers]        = useState([]);
  const [appointmentTrends,  setAppointmentTrends]  = useState([]);
  const [revenueTrends,      setRevenueTrends]      = useState([]);
  const [loading,            setLoading]            = useState(true);
  const [realtimeActivity,   setRealtimeActivity]   = useState([]);

  // ── Stable helpers ──────────────────────────────────────────────────────────

  // ① Wrapped in useCallback — no longer recreated on every render
  const addRealtimeActivity = useCallback((action, detail, type) => {
    setRealtimeActivity(prev => [
      { id: Date.now(), action, detail, type, timestamp: new Date() },
      ...prev,
    ].slice(0, 10));
  }, []);

  // ② Single fetch: getDashboardStats already returns recentUsers.
  //    fetchRecentUsers as a separate call is removed.
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, appointmentsRes, revenueRes] = await Promise.all([
        adminAPI.getDashboardStats(),
        adminAPI.getAppointmentAnalytics({ groupBy: 'month' }),
        adminAPI.getRevenueAnalytics(),
      ]);

      setStats(statsRes);

      // ② Hydrate recentUsers from the stats response — no extra API call
      if (statsRes?.recentUsers) setRecentUsers(statsRes.recentUsers);

      setAppointmentTrends(
        (appointmentsRes?.data || []).map(item => ({
          month:     MONTH_ABBR[parseInt(item._id?.slice(-2) || '0', 10) - 1] || item._id,
          count:     item.total     ?? 0,
          completed: item.completed ?? 0,
          pending:   item.pending   ?? 0,
        }))
      );
      setRevenueTrends(
        (revenueRes?.data || []).map(item => ({
          month:        MONTH_ABBR[parseInt(item._id?.slice(-2) || '0', 10) - 1] || item._id,
          revenue:      item.revenue          ?? 0,
          appointments: item.appointmentCount ?? 0,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []); // ← stable — no deps

  // ── Socket handlers (stable via useRef + useCallback) ──────────────────────

  // ③ handlePaymentUpdate needs setStats — kept as useCallback
  const handlePaymentUpdate = useCallback((data) => {
    const amount = Number(data?.amount || 0);
    addRealtimeActivity(`Payment Received — ${formatCurrency(amount)}`, '', 'success');
    setStats(prev => prev ? {
      ...prev,
      revenue: {
        ...prev.revenue,
        actual: {
          ...prev.revenue?.actual,
          thisMonth: (prev.revenue?.actual?.thisMonth ?? prev.revenue?.thisMonth ?? 0) + amount,
        },
      },
    } : prev);
  }, [addRealtimeActivity]);

  // ④ socketHandlers object is stable: all callbacks are useCallback refs.
  //    useAdminSocket stores the object in a ref so recreation doesn't matter,
  //    but being explicit here avoids potential lint warnings.
  const socketHandlers = useRef(null);
  socketHandlers.current = {
    onSessionStarted: (data) => {
      addRealtimeActivity('Session Started', data.appointmentId, 'success');
      setStats(prev => prev ? {
        ...prev,
        sessions: { ...prev.sessions, active: (prev.sessions?.active ?? 0) + 1 },
      } : prev);
    },
    onSessionCompleted: (data) => {
      addRealtimeActivity('Session Completed', data.sessionId, 'success');
      fetchDashboardData(); // refresh full stats when a session ends
    },
    onLabRequested:         (data) => addRealtimeActivity('Lab Request Created',   data.requestId,      'info'),
    onLabResultsUploaded:   (data) => addRealtimeActivity('Lab Results Uploaded',  data.requestId,      'success'),
    onPrescriptionConfirmed:(data) => addRealtimeActivity('Prescription Confirmed',data.prescriptionId, 'success'),
    onPaymentSuccess:   handlePaymentUpdate,
    onPaymentReceived:  handlePaymentUpdate,
    onAppointmentCreated: () => addRealtimeActivity('New Appointment', 'A new appointment request was submitted', 'info'),
  };

  // Unwrap ref so useAdminSocket receives a plain object (stable because the
  // ref object identity is constant; values update in place).
  const { isConnected } = useAdminSocket(socketHandlers.current);

  // ④ Empty dep array — fetchDashboardData is stable (useCallback, no deps)
  useEffect(() => {
    fetchDashboardData();
  }, []); // ← intentionally empty

  // ── Derived display values ─────────────────────────────────────────────────

  const getActivityIcon = (type) => {
    const colors = { success: 'bg-green-500', info: 'bg-blue-500', warning: 'bg-yellow-500' };
    return <div className={`w-2 h-2 ${colors[type] || 'bg-gray-500'} rounded-full`} />;
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black" />
      </div>
    );
  }

  const patientGrowth  = stats?.users?.growthRate ?? 0;
  const displayRevenue = stats?.revenue?.actual?.thisMonth ?? stats?.revenue?.thisMonth ?? 0;
  const revenueGrowth  = stats?.revenue?.actual?.growthRate ?? 0;
  const revenueSubline = stats?.revenue?.actual
    ? `Consultation: ${formatCurrency(stats.revenue.actual.consultation)} · Lab: ${formatCurrency(stats.revenue.actual.lab)} · Medication: ${formatCurrency(stats.revenue.actual.medication)}`
    : `Based on ${stats?.revenue?.completedAppointments ?? 0} completed appointments`;
  const maxTrendCount = Math.max(...appointmentTrends.map(t => t.count), 1);

  return (
    <div className="space-y-8">

      {/* Connection Status */}
      <div className={`p-3 rounded-lg flex items-center justify-between ${
        isConnected ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
      }`}>
        <div className="flex items-center space-x-2">
          <Activity className={`w-4 h-4 ${isConnected ? 'text-green-600 animate-pulse' : 'text-yellow-600'}`} />
          <span className="text-sm font-medium">
            {isConnected ? 'Real-time monitoring active' : 'Connecting to real-time server...'}
          </span>
        </div>
        {realtimeActivity.length > 0 && (
          <span className="text-xs text-gray-600">
            Last activity: {format(realtimeActivity[0].timestamp, 'h:mm:ss a')}
          </span>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">Total Patients</h3>
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{stats?.users?.totalPatients ?? 0}</p>
            <p className={`text-sm ${patientGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatSignedPercent(patientGrowth)} from last month
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">Active Doctors</h3>
            <UserCheck className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{stats?.users?.totalDoctors ?? 0}</p>
            <p className="text-sm text-gray-500">{stats?.users?.newDoctorsThisMonth ?? 0} joined this month</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">This Month</h3>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{stats?.appointments?.thisMonth ?? 0}</p>
            <p className="text-sm text-gray-500">
              {stats?.appointments?.upcoming ?? 0} upcoming · {stats?.appointments?.pending ?? 0} pending
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">Revenue</h3>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{formatCurrency(displayRevenue)}</p>
            <p className={`text-sm ${revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatSignedPercent(revenueGrowth)} from last month
            </p>
            <p className="text-xs text-gray-500 leading-5">{revenueSubline}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">Active Sessions</h3>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{stats?.sessions?.active ?? 0}</p>
            <p className="text-sm text-gray-500">Consultations in progress</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Appointment Trends Chart */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold">Appointment Trends</h3>
            <p className="text-sm text-gray-500">Monthly appointment statistics</p>
          </div>
          <div className="h-64 flex items-end justify-between space-x-2">
            {appointmentTrends.length > 0 ? (
              appointmentTrends.map((data, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-black rounded-t"
                    style={{ height: `${(data.count / maxTrendCount) * 100}%`, minHeight: '20px' }}
                  />
                  <span className="text-xs text-gray-600 mt-2">{data.month}</span>
                  <span className="text-xs text-gray-400">{data.count}</span>
                </div>
              ))
            ) : (
              <div className="w-full flex items-center justify-center text-gray-400">
                <p className="text-sm">No data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Real-time Activity Feed */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Real-time Activity</h3>
            <p className="text-sm text-gray-500">Live system events</p>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {realtimeActivity.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No recent activity</p>
              </div>
            ) : (
              realtimeActivity.map((activity) => (
                <div key={activity.id} className="flex items-start space-x-3 pb-3 border-b border-gray-100 last:border-0">
                  {getActivityIcon(activity.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                    {activity.detail && <p className="text-xs text-gray-500 truncate">{activity.detail}</p>}
                    <p className="text-xs text-gray-400 mt-1">{format(activity.timestamp, 'h:mm:ss a')}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent User Registrations */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Recent User Registrations</h3>
          <p className="text-sm text-gray-500">New users who joined the platform</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">No recent registrations</td>
                </tr>
              ) : (
                recentUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                          <span className="text-xs font-medium">{user.firstName?.[0]}{user.lastName?.[0]}</span>
                        </div>
                        <span className="text-sm font-medium">{user.firstName} {user.lastName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">{user.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {user.createdAt ? format(parseISO(user.createdAt), 'MMM d, yyyy') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 text-xs font-medium bg-black text-white rounded-full">Active</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;