// components/admin/AppointmentsTab.jsx
/**
 * AppointmentsTab — Refactored
 * ─────────────────────────────────────────────────────────────────────────────
 * Issues fixed:
 *
 * 1. fetchAppointments was a plain async function (not useCallback). The socket
 *    handler for onAppointmentCreated closed over the initial (stale) version and
 *    always reset to page 0, even if the admin was on page 3. Wrapped in
 *    useCallback with [filters] deps.
 *
 * 2. useEffect([filters]) — because fetchAppointments was not stable, the effect
 *    body re-ran on every render where `filters` reference changed. Now the effect
 *    depends only on the stable useCallback reference.
 *
 * 3. viewDetails and handleApprove/handleReject were plain functions recreated
 *    on every render. Wrapped in useCallback.
 *
 * 4. Pagination offset stored as a ref for socket handlers (so they always see
 *    the latest offset without being listed as deps).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, Check, X, Eye, Search, Activity } from 'lucide-react';
import { adminAPI } from '../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import useAdminSocket from '../../hooks/useAdminSocket';

const STATUS_COLORS = {
  pending:   'bg-yellow-100 text-yellow-800',
  approved:  'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  cancelled: 'bg-red-100 text-red-800',
};

const PAGE_LIMIT = 15;

const AppointmentsTab = () => {
  const [appointments,       setAppointments]       = useState([]);
  const [loading,            setLoading]            = useState(false);
  const [filters,            setFilters]            = useState({ status: '', search: '', startDate: '', endDate: '' });
  const [detailData,         setDetailData]         = useState(null);
  const [showDetailsModal,   setShowDetailsModal]   = useState(false);
  const [selectedAppointment,setSelectedAppointment]= useState(null);
  const [showApprovalModal,  setShowApprovalModal]  = useState(false);
  const [actionType,         setActionType]         = useState(null);
  const [actionNotes,        setActionNotes]        = useState('');
  const [total,              setTotal]              = useState(0);
  const [offset,             setOffset]             = useState(0);

  // Ref so socket handlers always have the current offset without being deps
  const offsetRef = useRef(0);
  offsetRef.current = offset;

  // ① Stable fetch
  const fetchAppointments = useCallback(async (targetOffset = 0) => {
    try {
      setLoading(true);
      const data = await adminAPI.getAllAppointments({
        status:    filters.status    || undefined,
        startDate: filters.startDate || undefined,
        endDate:   filters.endDate   || undefined,
        limit:     PAGE_LIMIT,
        offset:    targetOffset,
      });
      setAppointments(data.appointments || []);
      setTotal(data.pagination?.total || 0);
      setOffset(targetOffset);
    } catch (err) {
      toast.error('Failed to fetch appointments');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.startDate, filters.endDate]);

  // ② Effect runs when the stable callback changes (i.e. when filters change)
  useEffect(() => {
    fetchAppointments(0); // reset to first page on filter change
  }, [fetchAppointments]);

  // ③ Socket handlers use stable fetchAppointments and offsetRef
  const { isConnected } = useAdminSocket({
    onAppointmentCreated:  ()     => { toast.success('New appointment request'); fetchAppointments(0); },
    onAppointmentApproved: (data) => setAppointments(prev =>
      prev.map(a => a._id === data.appointmentId ? { ...a, status: 'approved' } : a)),
    onAppointmentCancelled:(data) => setAppointments(prev =>
      prev.map(a => a._id === data.appointmentId ? { ...a, status: 'cancelled' } : a)),
    onAppointmentCompleted:()     => fetchAppointments(offsetRef.current),
    onSessionStarted:      (data) => setAppointments(prev =>
      prev.map(a => a._id === data.appointmentId ? { ...a, hasActiveSession: true } : a)),
    onSessionCompleted:    ()     => fetchAppointments(offsetRef.current),
  });

  // ③ Stable action handlers
  const handleApprove = useCallback(async (appointmentId) => {
    try {
      setLoading(true);
      await adminAPI.approveAppointment(appointmentId, { notes: actionNotes });
      toast.success('Appointment approved successfully');
      setShowApprovalModal(false);
      setActionNotes('');
      fetchAppointments(offsetRef.current);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve appointment');
    } finally {
      setLoading(false);
    }
  }, [actionNotes, fetchAppointments]);

  const handleReject = useCallback(async (appointmentId) => {
    if (!actionNotes.trim()) { toast.error('Please provide a rejection reason'); return; }
    try {
      setLoading(true);
      await adminAPI.rejectAppointment(appointmentId, { reason: actionNotes });
      toast.success('Appointment rejected');
      setShowApprovalModal(false);
      setActionNotes('');
      fetchAppointments(offsetRef.current);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject appointment');
    } finally {
      setLoading(false);
    }
  }, [actionNotes, fetchAppointments]);

  const openApprovalModal = useCallback((appointment, type) => {
    setSelectedAppointment(appointment);
    setActionType(type);
    setShowApprovalModal(true);
    setActionNotes('');
  }, []);

  const viewDetails = useCallback(async (appointmentId) => {
    try {
      setLoading(true);
      const data = await adminAPI.getAppointmentDetails(appointmentId);
      setDetailData(data);
      setShowDetailsModal(true);
    } catch {
      toast.error('Failed to fetch appointment details');
    } finally {
      setLoading(false);
    }
  }, []);

  const totalPages  = Math.ceil(total / PAGE_LIMIT);
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className={`p-3 rounded-lg flex items-center space-x-2 ${
        isConnected ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'
      }`}>
        <Activity className={`w-4 h-4 ${isConnected ? 'animate-pulse' : ''}`} />
        <span className="text-sm font-medium">{isConnected ? 'Real-time monitoring active' : 'Connecting...'}</span>
      </div>

      {/* Header + Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold">Appointment Management</h2>
            <p className="text-sm text-gray-500">
              Review and manage appointment requests{total > 0 && ` — ${total} total`}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text" placeholder="Search..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
            />
          </div>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
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

      {/* Appointments Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Doctor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && appointments.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-500">Loading appointments...</td></tr>
              ) : appointments.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-500">No appointments found</td></tr>
              ) : (
                appointments.map(appointment => (
                  <tr key={appointment._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {appointment.start ? format(new Date(appointment.start), 'MMM d, yyyy') : 'N/A'}
                      <br /><span className="text-gray-500">{appointment.start ? format(new Date(appointment.start), 'h:mm a') : ''}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {appointment.patient?.firstName} {appointment.patient?.lastName}
                      <br /><span className="text-gray-500 text-xs">{appointment.patient?.email}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">Dr. {appointment.doctor?.lastName}</td>
                    <td className="px-6 py-4 text-sm max-w-xs truncate">{appointment.reason}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col space-y-1">
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[appointment.status] || 'bg-gray-100 text-gray-800'}`}>
                          {appointment.status}
                        </span>
                        {appointment.hasActiveSession && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 flex items-center">
                            <Activity className="w-3 h-3 mr-1 animate-pulse" /> In Session
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button onClick={() => viewDetails(appointment._id)} className="text-blue-600 hover:text-blue-800 inline-flex items-center">
                        <Eye className="w-4 h-4 mr-1" /> View
                      </button>
                      {appointment.status === 'pending' && (
                        <>
                          <button onClick={() => openApprovalModal(appointment, 'approve')} className="text-green-600 hover:text-green-800 inline-flex items-center">
                            <Check className="w-4 h-4 mr-1" /> Approve
                          </button>
                          <button onClick={() => openApprovalModal(appointment, 'reject')} className="text-red-600 hover:text-red-800 inline-flex items-center">
                            <X className="w-4 h-4 mr-1" /> Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">Page {currentPage} of {totalPages} ({total} total)</span>
            <div className="flex space-x-2">
              <button
                disabled={offset === 0 || loading}
                onClick={() => fetchAppointments(offset - PAGE_LIMIT)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >Previous</button>
              <button
                disabled={offset + PAGE_LIMIT >= total || loading}
                onClick={() => fetchAppointments(offset + PAGE_LIMIT)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {showApprovalModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">{actionType === 'approve' ? 'Approve' : 'Reject'} Appointment</h3>
            <div className="mb-4 space-y-1">
              <p className="text-sm text-gray-600"><strong>Patient:</strong> {selectedAppointment.patient?.firstName} {selectedAppointment.patient?.lastName}</p>
              <p className="text-sm text-gray-600"><strong>Doctor:</strong> Dr. {selectedAppointment.doctor?.lastName}</p>
              <p className="text-sm text-gray-600"><strong>Date:</strong> {selectedAppointment.start ? format(new Date(selectedAppointment.start), 'MMM d, yyyy h:mm a') : 'N/A'}</p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                {actionType === 'approve' ? 'Notes (Optional)' : 'Rejection Reason (Required)'}
              </label>
              <textarea
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                rows="3"
                placeholder={actionType === 'approve' ? 'Add any notes...' : 'Please provide a reason...'}
              />
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => { setShowApprovalModal(false); setActionNotes(''); }}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >Cancel</button>
              <button
                onClick={() => actionType === 'approve' ? handleApprove(selectedAppointment._id) : handleReject(selectedAppointment._id)}
                disabled={loading}
                className={`flex-1 px-4 py-2 rounded-lg text-white ${actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {loading ? 'Processing...' : actionType === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && detailData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Appointment Details</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h4 className="font-semibold mb-3 text-sm uppercase text-gray-500 tracking-wide">Appointment</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Patient</span>
                    <p className="font-medium">{detailData.appointment?.patient?.firstName} {detailData.appointment?.patient?.lastName}</p>
                    <p className="text-gray-500 text-xs">{detailData.appointment?.patient?.email}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Doctor</span>
                    <p className="font-medium">Dr. {detailData.appointment?.doctor?.lastName}</p>
                    <p className="text-gray-500 text-xs">{detailData.appointment?.doctor?.specialization}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Date & Time</span>
                    <p className="font-medium">{detailData.appointment?.start ? format(new Date(detailData.appointment.start), 'PPpp') : 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Status</span>
                    <span className={`inline-block mt-1 px-3 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[detailData.appointment?.status] || 'bg-gray-100 text-gray-800'}`}>
                      {detailData.appointment?.status}
                    </span>
                  </div>
                </div>
                {detailData.appointment?.reason && <div className="mt-3"><span className="text-gray-600 text-sm">Reason for Visit</span><p className="text-sm mt-1">{detailData.appointment.reason}</p></div>}
                {detailData.appointment?.adminNotes && <div className="mt-3"><span className="text-gray-600 text-sm">Admin Notes</span><p className="text-sm mt-1 text-blue-800 bg-blue-50 p-2 rounded">{detailData.appointment.adminNotes}</p></div>}
                {detailData.appointment?.cancellationReason && <div className="mt-3"><span className="text-gray-600 text-sm">Cancellation Reason</span><p className="text-sm mt-1 text-red-800 bg-red-50 p-2 rounded">{detailData.appointment.cancellationReason}</p></div>}
              </div>

              {detailData.session && (
                <div>
                  <h4 className="font-semibold mb-3 text-sm uppercase text-gray-500 tracking-wide">Session</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-lg">
                    <div><span className="text-gray-600">Status</span><p className="font-medium capitalize mt-1">{detailData.session.status?.replace('_', ' ')}</p></div>
                    <div><span className="text-gray-600">Started</span><p className="mt-1">{detailData.session.startTime ? format(new Date(detailData.session.startTime), 'h:mm a') : 'N/A'}</p></div>
                    {detailData.session.complaints && <div className="col-span-2"><span className="text-gray-600">Complaints</span><p className="mt-1">{detailData.session.complaints}</p></div>}
                  </div>
                </div>
              )}

              {detailData.patientHistory?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 text-sm uppercase text-gray-500 tracking-wide">Recent Patient History</h4>
                  <div className="space-y-2">
                    {detailData.patientHistory.map(past => (
                      <div key={past._id} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-4 py-2">
                        <span className="text-gray-600">{past.start ? format(new Date(past.start), 'MMM d, yyyy') : 'N/A'}</span>
                        <span className="text-gray-700 flex-1 mx-4 truncate">{past.reason}</span>
                        <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[past.status] || 'bg-gray-100 text-gray-800'}`}>{past.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentsTab;