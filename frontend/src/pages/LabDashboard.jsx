/**
 * LabDashboard.jsx — fully synchronized with backend
 *
 * Fixes applied vs previous version:
 *
 *  [1] Status lifecycle: added `results_uploaded` as a valid status throughout
 *      (status pill, icon, action buttons, stats, tab filter).
 *
 *  [2] Stats now always fetched against the full unfiltered list so counts are
 *      accurate regardless of which tab is active.  A dedicated fetchStats()
 *      call fires on mount and after any mutation; it always requests all
 *      requests without a status filter.
 *
 *  [3] Reject action added — calls PATCH /lab/requests/:id/reject with a
 *      mandatory reason. Available to lab personnel on pending/assigned requests.
 *
 *  [4] Comment UI added — lab personnel (and doctors/admins) can post comments
 *      via POST /lab/requests/:id/comments.  Comments and their type are
 *      rendered in the details modal, including rejection_reason entries.
 *
 *  [5] `lab:results_ready` socket event handler added (fires from backend when
 *      uploadLabResults sets status to completed via areAllTestsCompleted()).
 *
 *  [6] `lab:payment_received` socket listener REMOVED — this event is never
 *      emitted by the backend (confirmed by paymentController audit).
 *
 *  [7] `qcNotes` textarea added to UploadResultsModal so it is sent alongside
 *      qcStatus in the payload (controller persists both fields).
 *
 *  [8] `provisionalDiagnosis` and `rejectionReason` surfaced in
 *      RequestDetailsModal.
 *
 *  [9] Socket handlers for `lab:new_request` and `lab:request_created` no
 *      longer try to append the partial socket payload as a full request row.
 *      Instead they trigger a lightweight stats refresh only; the list refetch
 *      is debounced to let any in-flight state settle.
 *
 * [10] `fetchLabRequests` ref-stabilised via useRef so the setTimeout callbacks
 *      inside socket handlers never close over a stale version.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bell,
  LogOut,
  Filter,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  MessageSquare,
  AlertTriangle,
  ChevronDown,
  FlaskConical,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { labAPI } from '../api'
import socketService from '../services/socketService'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS = {
  pending:          'Pending',
  assigned:         'Assigned',
  specimen_collected: 'Specimen Collected',
  processing:       'Processing',
  results_uploaded: 'Results Uploaded',
  completed:        'Completed',
  rejected:         'Rejected',
}

const STATUS_COLORS = {
  pending:           'bg-yellow-100 text-yellow-800',
  assigned:          'bg-blue-100 text-blue-800',
  specimen_collected:'bg-purple-100 text-purple-800',
  processing:        'bg-orange-100 text-orange-800',
  results_uploaded:  'bg-teal-100 text-teal-800',
  completed:         'bg-green-100 text-green-800',
  rejected:          'bg-red-100 text-red-800',
}

const PRIORITY_COLORS = {
  routine:   'bg-gray-100 text-gray-800',
  urgent:    'bg-yellow-100 text-yellow-800',
  stat:      'bg-orange-100 text-orange-800',
  emergency: 'bg-red-100 text-red-800',
}

const getStatusIcon = (status) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-5 h-5 text-green-500" />
    case 'rejected':
      return <XCircle className="w-5 h-5 text-red-500" />
    case 'results_uploaded':
      return <CheckCircle className="w-5 h-5 text-teal-500" />
    case 'processing':
      return <FlaskConical className="w-5 h-5 text-orange-500" />
    case 'specimen_collected':
      return <Clock className="w-5 h-5 text-purple-500" />
    case 'assigned':
      return <Clock className="w-5 h-5 text-blue-500" />
    default:
      return <Clock className="w-5 h-5 text-yellow-500" />
  }
}

// ─── Tabs config ──────────────────────────────────────────────────────────────
// 'all' tab sends no status filter to the API; every other tab passes ?status=X
const TABS = ['pending', 'assigned', 'processing', 'results_uploaded', 'completed', 'all']

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const LabDashboard = () => {
  const { user, logout } = useAuth()

  const [loading, setLoading]               = useState(false)
  const [activeTab, setActiveTab]           = useState('pending')
  const [labRequests, setLabRequests]       = useState([])
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [socketConnected, setSocketConnected] = useState(false)

  // [2] Stats are always computed from the unfiltered full list
  const [stats, setStats] = useState({
    pending: 0, assigned: 0, processing: 0,
    results_uploaded: 0, completed: 0, rejected: 0,
  })

  // ── Stable fetch refs ──────────────────────────────────────────────────────
  // [10] Keep latest versions in refs so socket handler timeouts never close
  //      over stale closures.

  // Fetch the tab-filtered list shown in the table
  const fetchListRef = useRef(null)
  const fetchList = useCallback(async () => {
    try {
      setLoading(true)
      const params = activeTab === 'all' ? {} : { status: activeTab }
      const response = await labAPI.getLabRequests(params)
      setLabRequests(response.data || [])
    } catch (err) {
      toast.error('Failed to fetch lab requests')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [activeTab])
  fetchListRef.current = fetchList

  // [2] Fetch full unfiltered list to compute accurate stats
  const fetchStatsRef = useRef(null)
  const fetchStats = useCallback(async () => {
    try {
      const response = await labAPI.getLabRequests({})
      const all = response.data || []
      setStats({
        pending:          all.filter(r => r.status === 'pending').length,
        assigned:         all.filter(r => r.status === 'assigned').length,
        processing:       all.filter(r => r.status === 'processing').length,
        results_uploaded: all.filter(r => r.status === 'results_uploaded').length,
        completed:        all.filter(r => r.status === 'completed').length,
        rejected:         all.filter(r => r.status === 'rejected').length,
      })
    } catch (err) {
      console.error('Failed to compute stats:', err)
    }
  }, [])
  fetchStatsRef.current = fetchStats

  // ── Initial load + tab change ──────────────────────────────────────────────
  useEffect(() => {
    fetchList()
    fetchStats()
  }, [fetchList, fetchStats])

  // ── Socket setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || !user) return

    socketService.connect(token)

    if (socketService.on) {
      socketService.on('connect',    () => setSocketConnected(true))
      socketService.on('disconnect', () => setSocketConnected(false))
    }

    try {
      setSocketConnected(Boolean(socketService.getConnectionStatus?.()))
    // eslint-disable-next-line no-unused-vars
    } catch (e) { /* ignore */ }

    return () => {
      socketService.off?.('connect')
      socketService.off?.('disconnect')
    }
  }, [user])

  // ── Real-time socket event handlers ───────────────────────────────────────
  useEffect(() => {
    if (!socketService?.on) return

    // [9] Backend only sends a partial payload (labRequestId, requestNumber,
    //     priority, testsCount) for lab:new_request — not a full request object.
    //     Trigger a debounced list + stats refresh instead of trying to splice
    //     the skeleton into state.
    const handleNewRequest = (data) => {
      console.log('🧪 New lab request:', data)
      toast.info(`New ${data.priority || ''} lab request #${data.requestNumber}`, {
        duration: 5000, icon: '🆕',
      })
      setTimeout(() => {
        fetchListRef.current?.()
        fetchStatsRef.current?.()
      }, 600)
    }

    // lab:request_created is emitted to admin-dashboard room; lab personnel
    // receive lab:new_request. We still handle it defensively.
    const handleRequestCreated = (data) => {
      console.log('🧪 Lab request created:', data)
      toast.success(`Lab request #${data.requestNumber} created — ${data.testsCount} test(s)`, {
        duration: 4000,
      })
      setTimeout(() => {
        fetchListRef.current?.()
        fetchStatsRef.current?.()
      }, 600)
    }

    const handleAssigned = (data) => {
      console.log('✅ Lab assigned:', data)
      const isMe = data.assignedTo === user?.id || data.assignedTo?._id === user?.id
      if (isMe) toast.success(`Lab request #${data.requestNumber} assigned to you!`)

      // Optimistic update on the visible list
      setLabRequests(prev =>
        prev.map(r =>
          r._id === data.labRequestId
            ? { ...r, status: 'assigned', assignedTo: data.assignedTo }
            : r
        )
      )
      setTimeout(() => {
        fetchListRef.current?.()
        fetchStatsRef.current?.()
      }, 1000)
    }

    const handleStatusChanged = (data) => {
      console.log('📊 Status changed:', data)
      toast.info(`Lab #${data.requestNumber}: ${STATUS_LABELS[data.status] || data.status}`)

      setLabRequests(prev =>
        prev.map(r => r._id === data.labRequestId ? { ...r, status: data.status } : r)
      )
      setTimeout(() => {
        fetchListRef.current?.()
        fetchStatsRef.current?.()
      }, 800)
    }

    // [5] lab:results_ready fires from uploadLabResults when areAllTestsCompleted()
    const handleResultsReady = (data) => {
      console.log('✅ Results ready:', data)
      toast.success(`Results ready for lab request #${data.requestNumber}`)
      setLabRequests(prev =>
        prev.map(r => r._id === data.labRequestId ? { ...r, status: 'completed' } : r)
      )
      setTimeout(() => {
        fetchListRef.current?.()
        fetchStatsRef.current?.()
      }, 800)
    }

    // lab:results_uploaded fires on the doctor room; we handle it anyway so
    // lab personnel see the status flip in real-time.
    const handleResultsUploaded = (data) => {
      console.log('📤 Results uploaded:', data)
      setLabRequests(prev =>
        prev.map(r => r._id === data.labRequestId ? { ...r, status: 'results_uploaded' } : r)
      )
      setTimeout(() => fetchStatsRef.current?.(), 800)
    }

    // [6] lab:payment_received is NOT emitted anywhere in the backend — removed.

    socketService.on('lab:new_request',      handleNewRequest)
    socketService.on('lab:request_created',  handleRequestCreated)
    socketService.on('lab:assigned',         handleAssigned)
    socketService.on('lab:status_changed',   handleStatusChanged)
    socketService.on('lab:results_ready',    handleResultsReady)    // [5] NEW
    socketService.on('lab:results_uploaded', handleResultsUploaded)

    return () => {
      socketService.off?.('lab:new_request',      handleNewRequest)
      socketService.off?.('lab:request_created',  handleRequestCreated)
      socketService.off?.('lab:assigned',         handleAssigned)
      socketService.off?.('lab:status_changed',   handleStatusChanged)
      socketService.off?.('lab:results_ready',    handleResultsReady)
      socketService.off?.('lab:results_uploaded', handleResultsUploaded)
    }
  }, [user])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAssign = useCallback(async (requestId) => {
    try {
      setLoading(true)
      await labAPI.assignLabRequest(requestId)
      toast.success('Lab request assigned to you')
      setLabRequests(prev =>
        prev.map(r =>
          r._id === requestId
            ? { ...r, assignedTo: { _id: user?.id, firstName: user?.firstName, lastName: user?.lastName }, status: 'assigned' }
            : r
        )
      )
      fetchStatsRef.current?.()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign request')
    } finally {
      setLoading(false)
    }
  }, [user])

  const handleUpdateStatus = useCallback(async (requestId, status, comment = '') => {
    try {
      setLoading(true)
      const request = labRequests.find(r => r._id === requestId)
      if (request?.assignedTo && request.assignedTo._id !== user?.id) {
        toast.error('You can only update status for requests assigned to you')
        return
      }
      await labAPI.updateLabRequestStatus(requestId, { status, comment })
      toast.success(`Status updated to ${STATUS_LABELS[status] || status}`)
      setLabRequests(prev => prev.map(r => r._id === requestId ? { ...r, status } : r))
      fetchStatsRef.current?.()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status')
    } finally {
      setLoading(false)
    }
  }, [labRequests, user])

  // [3] Reject handler
  const handleReject = useCallback(async (requestId, reason) => {
    try {
      setLoading(true)
      await labAPI.rejectLabRequest(requestId, { reason })
      toast.success('Lab request rejected')
      setShowRejectModal(false)
      setSelectedRequest(null)
      setLabRequests(prev =>
        prev.map(r => r._id === requestId ? { ...r, status: 'rejected', rejectionReason: reason } : r)
      )
      fetchStatsRef.current?.()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject request')
    } finally {
      setLoading(false)
    }
  }, [])

  // [4] Add comment handler
  const handleAddComment = useCallback(async (requestId, text, type = 'note') => {
    try {
      const res = await labAPI.addLabComment(requestId, { text, type })
      // Update the selected request in place so the modal re-renders
      setSelectedRequest(res.data)
      toast.success('Comment added')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add comment')
    }
  }, [])

  const handleUploadResults = useCallback(async (requestId, payload) => {
    try {
      setLoading(true)

      if (payload.attachments?.length > 0) {
        const fd = new FormData()
        fd.append('qcStatus', payload.qcStatus)
        fd.append('qcNotes',  payload.qcNotes || '')          // [7]
        fd.append('results',  JSON.stringify(payload.results || []))
        payload.attachments.forEach((file, idx) =>
          fd.append('attachments', file, file.name || `file-${idx}`)
        )
        if (labAPI.uploadLabResultsForm) {
          await labAPI.uploadLabResultsForm(requestId, fd)
        } else {
          await labAPI.uploadLabResults(requestId, fd)
        }
      } else {
        await labAPI.uploadLabResults(requestId, {
          results:     payload.results || [],
          qcStatus:    payload.qcStatus,
          qcNotes:     payload.qcNotes || '',                 // [7]
          attachments: [],
        })
      }

      toast.success('Results uploaded — doctor notified!')
      setShowUploadModal(false)
      setSelectedRequest(null)

      // Optimistic: could be results_uploaded or completed depending on the server
      setLabRequests(prev =>
        prev.map(r => r._id === requestId ? { ...r, status: 'results_uploaded' } : r)
      )
      setTimeout(() => {
        fetchListRef.current?.()
        fetchStatsRef.current?.()
      }, 800)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload results')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  const pendingCount = stats.pending

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
                <span className="text-white text-sm font-bold">LAB</span>
              </div>
              <span className="text-xl font-semibold">MediBook Lab</span>
            </div>

            <div className="flex items-center space-x-4">
              {/* Socket status */}
              <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                socketConnected
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {socketConnected
                  ? <><Wifi className="w-3 h-3" /><span>Live</span><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /></>
                  : <><WifiOff className="w-3 h-3" /><span>Offline</span></>
                }
              </div>

              <button className="p-2 hover:bg-gray-100 rounded-lg relative">
                <Bell className="w-5 h-5" />
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </button>

              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm font-medium">{user?.firstName} {user?.lastName}</div>
                  <div className="text-xs text-gray-500">Lab Personnel</div>
                </div>
                <div className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center font-medium">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Stats cards — [2] always from full unfiltered list ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          {[
            { label: 'Pending',          key: 'pending',          icon: <Clock className="w-5 h-5 text-yellow-500" />,  sub: 'Awaiting assignment' },
            { label: 'Assigned',         key: 'assigned',         icon: <Clock className="w-5 h-5 text-blue-500" />,    sub: 'Ready to process' },
            { label: 'Processing',       key: 'processing',       icon: <FlaskConical className="w-5 h-5 text-orange-500" />, sub: 'In progress' },
            { label: 'Results Uploaded', key: 'results_uploaded', icon: <Upload className="w-5 h-5 text-teal-500" />,   sub: 'Awaiting doctor review' },
            { label: 'Completed',        key: 'completed',        icon: <CheckCircle className="w-5 h-5 text-green-500" />, sub: 'Finalized' },
            { label: 'Rejected',         key: 'rejected',         icon: <XCircle className="w-5 h-5 text-red-500" />,   sub: 'Rejected' },
          ].map(({ label, key, icon, sub }) => (
            <div
              key={key}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setActiveTab(key)}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-gray-600 text-xs font-medium">{label}</h3>
                {icon}
              </div>
              <p className="text-2xl font-bold">{stats[key]}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="bg-white border-b border-gray-200 rounded-t-lg overflow-x-auto">
          <nav className="flex space-x-6 px-6 min-w-max">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'all' ? 'All' : (STATUS_LABELS[tab] || tab)}
                {stats[tab] > 0 && tab !== 'all' && tab !== 'completed' && (
                  <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[tab] || 'bg-gray-100 text-gray-700'}`}>
                    {stats[tab]}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Request list ── */}
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg">
          {loading && labRequests.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-3" />
              Loading lab requests…
            </div>
          ) : labRequests.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p>No lab requests in <span className="font-medium">{STATUS_LABELS[activeTab] || activeTab}</span> status</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {labRequests.map(request => (
                <LabRequestRow
                  key={request._id}
                  request={request}
                  user={user}
                  loading={loading}
                  onAssign={handleAssign}
                  onUpdateStatus={handleUpdateStatus}
                  onUpload={() => { setSelectedRequest(request); setShowUploadModal(true) }}
                  onReject={() => { setSelectedRequest(request); setShowRejectModal(true) }}
                  onViewDetails={() => { setSelectedRequest(request); setShowDetailsModal(true) }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}

      {showUploadModal && selectedRequest && (
        <UploadResultsModal
          request={selectedRequest}
          onClose={() => { setShowUploadModal(false); setSelectedRequest(null) }}
          onSubmit={handleUploadResults}
        />
      )}

      {showRejectModal && selectedRequest && (
        <RejectModal
          request={selectedRequest}
          onClose={() => { setShowRejectModal(false); setSelectedRequest(null) }}
          onConfirm={handleReject}
        />
      )}

      {showDetailsModal && selectedRequest && (
        <RequestDetailsModal
          request={selectedRequest}
          user={user}
          onClose={() => { setShowDetailsModal(false); setSelectedRequest(null) }}
          onAddComment={handleAddComment}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LabRequestRow — single row in the request list
// ─────────────────────────────────────────────────────────────────────────────
const LabRequestRow = ({
  request, user, loading,
  onAssign, onUpdateStatus, onUpload, onReject, onViewDetails,
}) => {
  const isAssignedToMe = request.assignedTo?._id === user?.id ||
                         request.assignedTo === user?.id

  return (
    <div className="p-6 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4 flex-1">
          {getStatusIcon(request.status)}

          <div className="flex-1 space-y-2">
            {/* Title row */}
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-lg">Request #{request.requestNumber}</h3>
              <span className={`px-3 py-1 text-xs font-medium rounded-full ${PRIORITY_COLORS[request.priority] || PRIORITY_COLORS.routine}`}>
                {request.priority}
              </span>
              <span className={`px-3 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[request.status] || 'bg-gray-100 text-gray-800'}`}>
                {STATUS_LABELS[request.status] || request.status}
              </span>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-gray-500">Patient:</span>
                <span className="ml-2 font-medium">{request.patient?.firstName} {request.patient?.lastName}</span>
              </div>
              <div>
                <span className="text-gray-500">Doctor:</span>
                <span className="ml-2 font-medium">Dr. {request.doctor?.firstName} {request.doctor?.lastName}</span>
              </div>
              <div>
                <span className="text-gray-500">Requested:</span>
                <span className="ml-2">
                  {format(parseISO(request.requestedAt || request.createdAt), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Tests:</span>
                <span className="ml-2 font-medium">{request.tests?.length || 0}</span>
              </div>
            </div>

            {/* Tests list */}
            {request.tests?.length > 0 && (
              <ul className="space-y-0.5">
                {request.tests.map((test, idx) => (
                  <li key={test.testCode || `${idx}-${test.testName}`} className="text-sm text-gray-600">
                    • {test.testName}{test.category ? ` (${test.category})` : ''}
                  </li>
                ))}
              </ul>
            )}

            {/* Clinical notes */}
            {request.clinicalNotes && (
              <div className="bg-gray-50 rounded p-2 text-sm text-gray-700">
                <span className="font-medium">Clinical Notes: </span>
                {request.clinicalNotes}
              </div>
            )}

            {/* [8] Rejection reason */}
            {request.status === 'rejected' && request.rejectionReason && (
              <div className="bg-red-50 rounded p-2 text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span><span className="font-medium">Rejection reason: </span>{request.rejectionReason}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col space-y-2 ml-4 flex-shrink-0">

          {/* Assign */}
          {request.status === 'pending' && (
            <button
              onClick={() => onAssign(request._id)}
              disabled={loading}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              Assign to Me
            </button>
          )}

          {/* Specimen collected */}
          {request.status === 'assigned' && isAssignedToMe && (
            <button
              onClick={() => onUpdateStatus(request._id, 'specimen_collected')}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              Specimen Collected
            </button>
          )}

          {/* Start processing */}
          {request.status === 'specimen_collected' && isAssignedToMe && (
            <button
              onClick={() => onUpdateStatus(request._id, 'processing')}
              disabled={loading}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              Start Processing
            </button>
          )}

          {/* Upload results — available at processing stage */}
          {request.status === 'processing' && isAssignedToMe && (
            <button
              onClick={onUpload}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Results</span>
            </button>
          )}

          {/* [1] results_uploaded → allow completing or re-uploading */}
          {request.status === 'results_uploaded' && isAssignedToMe && (
            <button
              onClick={() => onUpdateStatus(request._id, 'completed')}
              disabled={loading}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              Mark Complete
            </button>
          )}

          {/* [3] Reject — available for pending or assigned */}
          {['pending', 'assigned'].includes(request.status) && (
            <button
              onClick={onReject}
              disabled={loading}
              className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
          )}

          {/* View details */}
          <button
            onClick={onViewDetails}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RequestDetailsModal — [4][7][8] full details + comments
// ─────────────────────────────────────────────────────────────────────────────
const RequestDetailsModal = ({ request, onClose, onAddComment }) => {
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting]   = useState(false)

  const handleCommentSubmit = async (e) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setSubmitting(true)
    await onAddComment(request._id, commentText.trim())
    setCommentText('')
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-semibold">Request #{request.requestNumber}</h3>
            <p className="text-sm text-gray-500 mt-1">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[request.status] || ''}`}>
                {STATUS_LABELS[request.status] || request.status}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">

          {/* Core fields */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-gray-500">Patient</p><p className="font-medium">{request.patient?.firstName} {request.patient?.lastName}</p></div>
            <div><p className="text-xs text-gray-500">Doctor</p><p className="font-medium">Dr. {request.doctor?.firstName} {request.doctor?.lastName}</p></div>
            <div><p className="text-xs text-gray-500">Requested At</p><p className="font-medium">{format(parseISO(request.requestedAt || request.createdAt), 'MMM d, yyyy h:mm a')}</p></div>
            <div><p className="text-xs text-gray-500">Priority</p><p className="font-medium capitalize">{request.priority}</p></div>
            {request.assignedTo && (
              <div><p className="text-xs text-gray-500">Assigned To</p><p className="font-medium">{request.assignedTo.firstName} {request.assignedTo.lastName}</p></div>
            )}
            {request.completedAt && (
              <div><p className="text-xs text-gray-500">Completed At</p><p className="font-medium">{format(parseISO(request.completedAt), 'MMM d, yyyy h:mm a')}</p></div>
            )}
          </div>

          {/* [8] Provisional diagnosis */}
          {request.provisionalDiagnosis && (
            <div>
              <p className="text-sm font-medium text-gray-700">Provisional Diagnosis</p>
              <p className="text-sm text-gray-600 mt-1 bg-blue-50 p-2 rounded">{request.provisionalDiagnosis}</p>
            </div>
          )}

          {/* Clinical notes */}
          <div>
            <p className="text-sm font-medium text-gray-700">Clinical Notes</p>
            <p className="text-sm text-gray-600 mt-1 bg-gray-50 p-2 rounded">{request.clinicalNotes || '—'}</p>
          </div>

          {/* Tests */}
          {request.tests?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Tests ({request.tests.length})</p>
              <ul className="space-y-1">
                {request.tests.map((t, i) => (
                  <li key={t.testCode || i} className="text-sm text-gray-600 flex justify-between bg-gray-50 px-3 py-1.5 rounded">
                    <span>{t.testName}{t.category ? ` — ${t.category}` : ''}</span>
                    {t.specimenType && <span className="text-gray-400">{t.specimenType}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* [8] Rejection reason */}
          {request.status === 'rejected' && request.rejectionReason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">Rejection Reason</p>
                <p className="text-sm text-red-600">{request.rejectionReason}</p>
              </div>
            </div>
          )}

          {/* [4] Comments */}
          {request.comments?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <MessageSquare className="w-4 h-4" /> Comments ({request.comments.length})
              </p>
              <ul className="space-y-2">
                {request.comments.map((c, i) => (
                  <li key={i} className={`text-sm p-3 rounded-lg ${c.type === 'rejection_reason' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium text-xs">
                        {c.user?.firstName} {c.user?.lastName}
                        {c.user?.role && <span className="text-gray-400 ml-1">({c.user.role})</span>}
                      </span>
                      {c.timestamp && (
                        <span className="text-xs text-gray-400">
                          {format(parseISO(c.timestamp), 'MMM d, h:mm a')}
                        </span>
                      )}
                    </div>
                    <p>{c.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* [4] Add comment */}
          <form onSubmit={handleCommentSubmit} className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Add Comment</p>
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add a note or observation…"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || !commentText.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Posting…' : 'Post Comment'}
              </button>
            </div>
          </form>

          <div className="flex justify-end pt-2 border-t border-gray-200">
            <button onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RejectModal — [3]
// ─────────────────────────────────────────────────────────────────────────────
const RejectModal = ({ request, onClose, onConfirm }) => {
  const [reason, setReason] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!reason.trim()) { toast.error('Please provide a rejection reason'); return }
    onConfirm(request._id, reason.trim())
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 bg-red-50">
          <h3 className="text-xl font-semibold text-red-800">Reject Lab Request</h3>
          <p className="text-sm text-red-600 mt-1">Request #{request.requestNumber}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="Explain why this request is being rejected…"
              required
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Confirm Reject
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UploadResultsModal — [6][7] qcNotes added
// ─────────────────────────────────────────────────────────────────────────────
const UploadResultsModal = ({ request, onClose, onSubmit }) => {
  const [results, setResults] = useState(
    (request.tests || []).map(test => ({
      testName:    test.testName,
      testCode:    test.testCode || '',
      parameter:   test.testName,
      value:       '',
      normalRange: '',
      unit:        '',
      flag:        'normal',
      notes:       '',
    }))
  )
  const [qcStatus,      setQcStatus]      = useState('passed')
  const [qcNotes,       setQcNotes]       = useState('')         // [7]
  const [attachments,   setAttachments]   = useState([])

  const setField = (idx, field, value) => {
    setResults(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    for (const r of results) {
      if (!r.value) { toast.error('Please fill in all result values before uploading'); return }
    }
    onSubmit(request._id, { results, attachments, qcStatus, qcNotes })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-white">
          <h3 className="text-2xl font-semibold">Upload Lab Results</h3>
          <p className="text-sm text-gray-500 mt-1">Request #{request.requestNumber} — results sent to doctor instantly</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Per-test result rows */}
          {results.map((result, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-4 hover:border-gray-300 transition-colors">
              <h4 className="font-medium text-lg flex items-center">
                <span className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs mr-2">{idx + 1}</span>
                {result.testName}
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Result Value *</label>
                  <input type="text" value={result.value} onChange={e => setField(idx, 'value', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required placeholder="e.g., 7.2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Normal Range</label>
                  <input type="text" value={result.normalRange} onChange={e => setField(idx, 'normalRange', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="e.g., 4.5–10.0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input type="text" value={result.unit} onChange={e => setField(idx, 'unit', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="e.g., mg/dL" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Flag</label>
                  <select value={result.flag} onChange={e => setField(idx, 'flag', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent">
                    <option value="normal">✓ Normal</option>
                    <option value="high">↑ High</option>
                    <option value="low">↓ Low</option>
                    <option value="critical">⚠ Critical</option>
                    <option value="abnormal">⚠ Abnormal</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes / Interpretation</label>
                <textarea value={result.notes} onChange={e => setField(idx, 'notes', e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Additional observations…" />
              </div>
            </div>
          ))}

          {/* QC */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quality Control Status</label>
              <select value={qcStatus} onChange={e => setQcStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent">
                <option value="passed">✓ QC Passed</option>
                <option value="failed">✗ QC Failed</option>
                <option value="review_required">⚠ Review Required</option>
              </select>
            </div>
            {/* [7] qcNotes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">QC Notes</label>
              <textarea value={qcNotes} onChange={e => setQcNotes(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Quality control observations (optional)…" />
            </div>
          </div>

          {/* Attachments */}
          <div className="border border-gray-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Attachments (optional)</label>
            <input type="file" onChange={e => setAttachments(Array.from(e.target.files || []))} multiple className="w-full text-sm" />
            <p className="text-xs text-gray-400 mt-1">PDF or image files accepted.</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
            <strong>Note:</strong> Results are instantly forwarded to the requesting doctor via real-time notification.
          </div>

          <div className="flex justify-end space-x-3 pt-2 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2">
              <Upload className="w-4 h-4" />
              <span>Upload & Notify Doctor</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LabDashboard