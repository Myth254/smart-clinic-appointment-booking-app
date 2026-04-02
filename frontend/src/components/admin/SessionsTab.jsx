/* eslint-disable no-unused-vars */
// components/admin/SessionsTab.jsx
/**
 * SessionsTab — Refactored
 * ─────────────────────────────────────────────────────────────────────────────
 * Issues fixed:
 *
 * 1. fetchSessions was a plain async function (not useCallback), defined inside
 *    the component body and called from both useEffect and socket handlers.
 *    Because it captured `filters` via closure, the socket handlers called a
 *    STALE version of the function every time filters changed. Wrapped in
 *    useCallback with correct [filters] deps.
 *
 * 2. useEffect([filters]) called fetchSessions directly but fetchSessions was
 *    not stable — could cause multiple rapid calls. Now uses the stable
 *    useCallback reference.
 *
 * 3. viewSessionDetails was a plain async function recreated every render.
 *    Wrapped in useCallback.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Eye, CheckCircle, XCircle, Activity } from 'lucide-react';
import { adminAPI } from '../../api';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import useAdminSocket from '../../hooks/useAdminSocket';

const STATUS_COLORS = {
  in_progress: 'bg-green-100 text-green-800',
  completed:   'bg-blue-100 text-blue-800',
  cancelled:   'bg-red-100 text-red-800',
};
const STATUS_LABELS = {
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

const SessionsTab = () => {
  const [sessions,          setSessions]          = useState([]);
  const [loading,           setLoading]           = useState(false);
  const [filters,           setFilters]           = useState({ status: '', startDate: '', endDate: '' });
  const [selectedSession,   setSelectedSession]   = useState(null);
  const [showDetailsModal,  setShowDetailsModal]  = useState(false);
  const [liveCount,         setLiveCount]         = useState(0);

  // ① Stable fetch — captures current filters
  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminAPI.getAllSessions({
        status:    filters.status,
        startDate: filters.startDate,
        endDate:   filters.endDate,
      });
      setSessions(data.sessions || []);
      if (data.metrics?.inProgress !== undefined) setLiveCount(data.metrics.inProgress);
    } catch (err) {
      toast.error('Failed to fetch sessions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.startDate, filters.endDate]); // ← explicit primitives

  // ② Effect depends on the stable callback
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ③ Socket handlers use the stable fetchSessions
  const { isConnected } = useAdminSocket({
    onSessionStarted:  (data) => { toast.success(`Session started for appointment ${data.appointmentId}`); setLiveCount(p => p + 1); fetchSessions(); },
    onSessionCompleted:(data) => { toast.success('Session completed'); setLiveCount(p => Math.max(0, p - 1)); fetchSessions(); },
    onSessionCancelled:(data) => { toast.error('Session cancelled');   setLiveCount(p => Math.max(0, p - 1)); fetchSessions(); },
    onSessionAutoClosed:(data)=> { toast('Session auto-closed', { icon: '⚠️' }); setLiveCount(p => Math.max(0, p - 1)); fetchSessions(); },
  });

  // ③ Stable view helper
  const viewSessionDetails = useCallback(async (sessionId) => {
    try {
      setLoading(true);
      const data = await adminAPI.getSessionDetails(sessionId);
      setSelectedSession(data.session);
      setShowDetailsModal(true);
    } catch {
      toast.error('Failed to fetch session details');
    } finally {
      setLoading(false);
    }
  }, []);

  const getStatusColor = (s) => STATUS_COLORS[s] || 'bg-gray-100 text-gray-800';
  const getStatusLabel = (s) => STATUS_LABELS[s] || s;
  const getStatusIcon  = (s) => {
    if (s === 'in_progress') return <Activity className="w-4 h-4 text-green-600 animate-pulse" />;
    if (s === 'completed')   return <CheckCircle className="w-4 h-4 text-blue-600" />;
    if (s === 'cancelled')   return <XCircle className="w-4 h-4 text-red-600" />;
    return <Clock className="w-4 h-4 text-gray-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className={`p-3 rounded-lg flex items-center space-x-2 ${
        isConnected ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'
      }`}>
        <Activity className={`w-4 h-4 ${isConnected ? 'animate-pulse' : ''}`} />
        <span className="text-sm font-medium">
          {isConnected ? 'Real-time monitoring active' : 'Connecting to real-time server...'}
        </span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold">Session Monitoring</h2>
            <p className="text-sm text-gray-500">Track active and completed consultation sessions</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Active Sessions:</span>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">{liveCount}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <select
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
          >
            <option value="">All Statuses</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input type="date" value={filters.startDate}
            onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black" />
          <input type="date" value={filters.endDate}
            onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black" />
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Session ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Doctor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && sessions.length === 0 ? (
                <tr><td colSpan="7" className="px-6 py-12 text-center text-gray-500">Loading sessions...</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan="7" className="px-6 py-12 text-center text-gray-500">No sessions found</td></tr>
              ) : (
                sessions.map(session => (
                  <tr key={session._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{session._id?.slice(-8)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{session.patient?.firstName} {session.patient?.lastName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">Dr. {session.doctor?.lastName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {session.startTime ? format(new Date(session.startTime), 'MMM d, h:mm a') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {session.startTime ? formatDistanceToNow(new Date(session.startTime), { addSuffix: true }) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(session.status)}
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(session.status)}`}>
                          {getStatusLabel(session.status)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button onClick={() => viewSessionDetails(session._id)} className="text-blue-600 hover:text-blue-800 inline-flex items-center">
                        <Eye className="w-4 h-4 mr-1" /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Session Details</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Session Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-600">Session ID:</span><p className="font-mono text-xs mt-1">{selectedSession._id}</p></div>
                  <div><span className="text-gray-600">Status:</span><p className="font-medium mt-1">{getStatusLabel(selectedSession.status)}</p></div>
                  <div><span className="text-gray-600">Started:</span><p className="mt-1">{selectedSession.startTime ? format(new Date(selectedSession.startTime), 'PPpp') : 'N/A'}</p></div>
                  <div><span className="text-gray-600">Ended:</span><p className="mt-1">{selectedSession.endTime ? format(new Date(selectedSession.endTime), 'PPpp') : 'Ongoing'}</p></div>
                  {selectedSession.patient && <div><span className="text-gray-600">Patient:</span><p className="mt-1">{selectedSession.patient.firstName} {selectedSession.patient.lastName}</p></div>}
                  {selectedSession.doctor  && <div><span className="text-gray-600">Doctor:</span><p className="mt-1">Dr. {selectedSession.doctor.lastName}</p></div>}
                </div>
              </div>
              {selectedSession.complaints && <div><h4 className="font-semibold mb-2">Chief Complaints</h4><p className="text-sm text-gray-700">{selectedSession.complaints}</p></div>}
              {selectedSession.clinicalObservations && <div><h4 className="font-semibold mb-2">Clinical Observations</h4><p className="text-sm text-gray-700">{selectedSession.clinicalObservations}</p></div>}
              {selectedSession.vitalSigns && Object.values(selectedSession.vitalSigns).some(Boolean) && (
                <div>
                  <h4 className="font-semibold mb-2">Vital Signs</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {Object.entries(selectedSession.vitalSigns).map(([key, value]) =>
                      value ? <div key={key}><span className="text-gray-600 capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span><p className="font-medium">{value}</p></div> : null
                    )}
                  </div>
                </div>
              )}
              {selectedSession.provisionalDiagnosis && <div><h4 className="font-semibold mb-2">Provisional Diagnosis</h4><p className="text-sm text-gray-700">{selectedSession.provisionalDiagnosis}</p></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionsTab;