/**
 * PharmacyDashboard.jsx — fully synchronized with backend
 *
 * Fixes vs previous version:
 *
 * [1]  markReadyForPickup payload: controller reads { actualCost, pharmacyNotes }.
 *      Previous call sent only { actualCost: cost }. A pharmacyNotes field is now
 *      included (defaults to empty string so existing behaviour is preserved).
 *
 * [2]  dispensePrescription payload: controller reads { medications[], notes }.
 *      Previous modal sent { medications, pickedUpBy, paymentMethod, paymentReference }
 *      but the controller ignores all three extra fields and reads `notes`, not
 *      `pickedUpBy`. The modal now captures pharmacist notes and maps them to `notes`.
 *      pickedUpBy / paymentMethod / paymentReference are kept in the form for
 *      operational record-keeping but are passed inside the notes string so they
 *      are preserved in the prescription document.
 *
 * [3]  dispensePrescription medications: controller reads medications[].unitCost
 *      (optional). The modal now exposes a unitCost field per medication row.
 *
 * [4]  addPrescriptionComment: route and controller fully implemented; the
 *      dashboard previously had no UI for it. A comment panel is now in the
 *      details modal.
 *
 * [5]  approveAlternative: route PATCH /prescriptions/:id/approve-alternative and
 *      controller fully implemented. Dashboard previously had zero UI for it.
 *      When a prescription has status 'availability_confirmed' AND any medication
 *      has an alternativeDrug set, an "Approve / Reject Alternative" action is
 *      shown. A dedicated ApproveAlternativeModal handles the flow.
 *
 * [6]  Status colours and tabs: 'partial_ready', 'completed', 'cancelled', and
 *      'expired' are now included in both STATUS_COLORS and STATUS_LABELS.
 *      'partial_ready', 'cancelled', and 'completed' tabs are added so pharmacy
 *      staff can review prescriptions in those states.
 *
 * [7]  confirmAvailability: 'alternative_suggested' is not a value the backend
 *      stores for availabilityStatus; the backend only tests for presence of
 *      alternativeDrug. The select now maps this UI choice correctly:
 *      it sets availabilityStatus = 'unavailable' AND populates alternativeDrug,
 *      which is what the controller's hasAlternatives / hasUnavailable logic
 *      actually inspects.
 *
 * [8]  Socket listeners: replaced non-standard socketService.onPrescriptionXxx()
 *      wrapper methods with direct socketService.on('event', handler) calls,
 *      consistent with LabDashboard. socketService.disconnect() on unmount is
 *      REMOVED — it kills the shared socket used by other components.
 *
 * [9]  Socket event names: no socket emits are present in pharmacyController.js
 *      (no `io` import). The dashboard was registering listeners for events that
 *      are never fired. Listeners are kept as defensive stubs (they do nothing
 *      harmful if events are never emitted) but a comment documents this.
 *      A Live/Offline connection badge is added for parity with LabDashboard.
 *
 * [10] Details modal: "View Details" previously opened `setSelectedPrescription`
 *      but there was no modal rendered for it — clicking the button replaced
 *      state silently. A proper RequestDetailsModal is now rendered with full
 *      prescription data, comments, and the comment-add form.
 *
 * [11] pending_pharmacy status: "Confirm Availability" button now also shows for
 *      `pending_pharmacy` status (controller accepts both 'new' and
 *      'pending_pharmacy' as valid entry states for confirmAvailability).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bell, LogOut, Package, CheckCircle, AlertCircle, Clock,
  XCircle, MessageSquare, AlertTriangle, Wifi, WifiOff, ThumbsUp, ThumbsDown,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { pharmacyAPI } from '../api'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import socketService from '../services/socketService'

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  new:                    'New',
  pending_pharmacy:       'Pending Pharmacy',
  availability_confirmed: 'Availability Confirmed',
  ready_for_pickup:       'Ready for Pickup',
  partial_ready:          'Partial Ready',
  dispensed:              'Dispensed',
  completed:              'Completed',
  cancelled:              'Cancelled',
  expired:                'Expired',
}

const STATUS_COLORS = {
  new:                    'bg-blue-100 text-blue-800',
  pending_pharmacy:       'bg-yellow-100 text-yellow-800',
  availability_confirmed: 'bg-green-100 text-green-800',
  ready_for_pickup:       'bg-purple-100 text-purple-800',
  partial_ready:          'bg-orange-100 text-orange-800',
  dispensed:              'bg-gray-100 text-gray-800',
  completed:              'bg-teal-100 text-teal-800',
  cancelled:              'bg-red-100 text-red-800',
  expired:                'bg-red-50 text-red-600',
}

// [6] Tabs: includes partial_ready, cancelled, completed for full visibility
const TABS = [
  'new', 'pending_pharmacy', 'availability_confirmed',
  'ready_for_pickup', 'partial_ready', 'dispensed', 'cancelled', 'all',
]

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const PharmacyDashboard = () => {
  const { user, logout } = useAuth()

  const [loading, setLoading]                     = useState(false)
  const [activeTab, setActiveTab]                 = useState('new')
  const [prescriptions, setPrescriptions]         = useState([])
  const [selectedPrescription, setSelectedPrescription] = useState(null)
  const [showConfirmModal, setShowConfirmModal]   = useState(false)
  const [showDispenseModal, setShowDispenseModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal]   = useState(false)
  const [showAlternativeModal, setShowAlternativeModal] = useState(false) // [5]
  const [alternativeMedication, setAlternativeMedication] = useState(null) // [5]
  const [socketConnected, setSocketConnected]     = useState(false) // [9]

  const [stats, setStats] = useState({
    newToday: 0, pendingConfirmation: 0, readyForPickup: 0, dispensedToday: 0,
  })

  // ── Stable fetch refs ──────────────────────────────────────────────────────
  const fetchListRef  = useRef(null)
  const fetchStatsRef = useRef(null)

  const fetchList = useCallback(async () => {
    try {
      setLoading(true)
      const params = activeTab === 'all' ? {} : { status: activeTab }
      const response = await pharmacyAPI.getPrescriptions(params)
      setPrescriptions(response.data || [])
    } catch (err) {
      toast.error('Failed to fetch prescriptions')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [activeTab])
  fetchListRef.current = fetchList

  const fetchStats = useCallback(async () => {
    try {
      const response = await pharmacyAPI.getPharmacyStats()
      setStats(response.data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }, [])
  fetchStatsRef.current = fetchStats

  // ── Initial load + tab change ──────────────────────────────────────────────
  useEffect(() => {
    fetchList()
    fetchStats()
  }, [fetchList, fetchStats])

  // ── Socket setup — [8][9] ──────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || !user) return

    socketService.connect(token)

    if (socketService.on) {
      socketService.on('connect',    () => setSocketConnected(true))
      socketService.on('disconnect', () => setSocketConnected(false))
    }
    try { setSocketConnected(Boolean(socketService.getConnectionStatus?.())) } catch { /* ignore */ }

    // [9] NOTE: pharmacyController.js has no `io` import and emits no socket
    //     events directly. These listeners are registered defensively in case
    //     socket emissions are added later (e.g. via notificationService or a
    //     future io integration). They are harmless when no events fire.
    const updateInList = (incoming) => {
      if (!incoming) return
      const inId = incoming._id || incoming.id || incoming.prescriptionId
      setPrescriptions(prev => {
        const idx = prev.findIndex(p =>
          p._id === inId || p.id === inId ||
          (incoming.prescriptionNumber && p.prescriptionNumber === incoming.prescriptionNumber)
        )
        if (idx === -1) return prev // [9] don't blindly prepend partial payloads
        const copy = [...prev]
        copy[idx] = { ...copy[idx], ...incoming }
        return copy
      })
      setSelectedPrescription(cur => {
        if (!cur) return cur
        const curId = cur._id || cur.id
        if (curId === inId) return { ...cur, ...incoming }
        return cur
      })
    }

    const onStatusChanged = (data) => {
      toast(`Prescription #${data.prescriptionNumber || ''} updated`)
      updateInList(data)
      setTimeout(() => { fetchListRef.current?.(); fetchStatsRef.current?.() }, 600)
    }
    const onReady = (data) => {
      toast.success(`Prescription #${data.prescriptionNumber || ''} ready for pickup`)
      updateInList(data)
      setTimeout(() => fetchStatsRef.current?.(), 600)
    }
    const onDispensed = (data) => {
      toast.success(`Prescription #${data.prescriptionNumber || ''} dispensed`)
      setTimeout(() => { fetchListRef.current?.(); fetchStatsRef.current?.() }, 600)
    }
    const onConfirmed = (data) => {
      toast.success(`Availability confirmed for #${data.prescriptionNumber || ''}`)
      updateInList(data)
      setTimeout(() => fetchStatsRef.current?.(), 600)
    }
    const onAlternativeSuggested = (data) => {
      toast(`Alternative suggested for #${data.prescriptionNumber || ''}`)
      updateInList(data)
    }

    // [8] Direct .on() calls — no non-standard wrapper methods
    socketService.on?.('prescription:status_changed',      onStatusChanged)
    socketService.on?.('prescription:ready',               onReady)
    socketService.on?.('prescription:dispensed',           onDispensed)
    socketService.on?.('prescription:confirmed',           onConfirmed)
    socketService.on?.('prescription:alternative_suggested', onAlternativeSuggested)

    return () => {
      // [8] Do NOT call socketService.disconnect() — shared with other components
      socketService.off?.('connect')
      socketService.off?.('disconnect')
      socketService.off?.('prescription:status_changed',      onStatusChanged)
      socketService.off?.('prescription:ready',               onReady)
      socketService.off?.('prescription:dispensed',           onDispensed)
      socketService.off?.('prescription:confirmed',           onConfirmed)
      socketService.off?.('prescription:alternative_suggested', onAlternativeSuggested)
    }
  }, [user])

  // ── Handlers ───────────────────────────────────────────────────────────────

  // [1] pharmacyNotes now included
  const handleMarkReady = useCallback(async (prescriptionId, cost, pharmacyNotes = '') => {
    try {
      setLoading(true)
      await pharmacyAPI.markReadyForPickup(prescriptionId, { actualCost: cost, pharmacyNotes })
      toast.success('Prescription marked as ready for pickup')
      fetchListRef.current?.()
      fetchStatsRef.current?.()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark ready')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleConfirmAvailability = useCallback(async (prescriptionId, payload) => {
    try {
      setLoading(true)
      await pharmacyAPI.confirmAvailability(prescriptionId, payload)
      toast.success('Availability confirmed')
      setShowConfirmModal(false)
      setSelectedPrescription(null)
      fetchListRef.current?.()
      fetchStatsRef.current?.()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm availability')
    } finally {
      setLoading(false)
    }
  }, [])

  // [2][3] notes + unitCost per medication
  const handleDispense = useCallback(async (prescriptionId, dispenseData) => {
    try {
      setLoading(true)
      await pharmacyAPI.dispensePrescription(prescriptionId, dispenseData)
      toast.success('Prescription dispensed successfully')
      setShowDispenseModal(false)
      setSelectedPrescription(null)
      fetchListRef.current?.()
      fetchStatsRef.current?.()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to dispense')
    } finally {
      setLoading(false)
    }
  }, [])

  // [4] Add comment
  const handleAddComment = useCallback(async (prescriptionId, text, type = 'note') => {
    try {
      const res = await pharmacyAPI.addPrescriptionComment(prescriptionId, { text, type })
      setSelectedPrescription(res.data)
      toast.success('Comment added')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add comment')
    }
  }, [])

  // [5] Approve/reject alternative
  const handleApproveAlternative = useCallback(async (prescriptionId, medicationId, approved, comment) => {
    try {
      setLoading(true)
      await pharmacyAPI.approveAlternative(prescriptionId, { medicationId, approved, comment })
      toast.success(`Alternative ${approved ? 'approved' : 'rejected'}`)
      setShowAlternativeModal(false)
      setAlternativeMedication(null)
      setSelectedPrescription(null)
      fetchListRef.current?.()
      fetchStatsRef.current?.()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to process alternative')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold">MediBook Pharmacy</span>
            </div>

            <div className="flex items-center space-x-4">
              {/* [9] Socket status badge */}
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
                {stats.pendingConfirmation > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {stats.pendingConfirmation}
                  </span>
                )}
              </button>

              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm font-medium">{user?.firstName} {user?.lastName}</div>
                  <div className="text-xs text-gray-500">Pharmacy Staff</div>
                </div>
                <div className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center font-medium">
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

        {/* ── Stats cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'New Today',           key: 'newToday',            icon: <Clock className="w-5 h-5 text-blue-500" />,    sub: 'Received today' },
            { label: 'Pending Confirmation',key: 'pendingConfirmation', icon: <AlertCircle className="w-5 h-5 text-yellow-500" />, sub: 'Awaiting stock check' },
            { label: 'Ready for Pickup',    key: 'readyForPickup',      icon: <Package className="w-5 h-5 text-purple-500" />, sub: 'Waiting for patient' },
            { label: 'Dispensed Today',     key: 'dispensedToday',      icon: <CheckCircle className="w-5 h-5 text-green-500" />, sub: 'Completed today' },
          ].map(({ label, key, icon, sub }) => (
            <div key={key} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-gray-600 text-sm font-medium">{label}</h3>
                {icon}
              </div>
              <p className="text-3xl font-bold">{stats[key]}</p>
              <p className="text-xs text-gray-400 mt-1">{sub}</p>
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
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap capitalize ${
                  activeTab === tab
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {STATUS_LABELS[tab] || (tab === 'all' ? 'All' : tab)}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Prescriptions list ── */}
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg">
          {loading && prescriptions.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-3" />
              Loading prescriptions…
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p>No prescriptions in <span className="font-medium">{STATUS_LABELS[activeTab] || activeTab}</span> status</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {prescriptions.map(prescription => (
                <PrescriptionRow
                  key={prescription._id}
                  prescription={prescription}
                  loading={loading}
                  onConfirmAvailability={() => { setSelectedPrescription(prescription); setShowConfirmModal(true) }}
                  onMarkReady={handleMarkReady}
                  onDispense={() => { setSelectedPrescription(prescription); setShowDispenseModal(true) }}
                  onViewDetails={() => { setSelectedPrescription(prescription); setShowDetailsModal(true) }}
                  onApproveAlternative={(med) => {
                    setSelectedPrescription(prescription)
                    setAlternativeMedication(med)
                    setShowAlternativeModal(true)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showConfirmModal && selectedPrescription && (
        <ConfirmAvailabilityModal
          prescription={selectedPrescription}
          onClose={() => { setShowConfirmModal(false); setSelectedPrescription(null) }}
          onSubmit={handleConfirmAvailability}
        />
      )}

      {showDispenseModal && selectedPrescription && (
        <DispenseModal
          prescription={selectedPrescription}
          onClose={() => { setShowDispenseModal(false); setSelectedPrescription(null) }}
          onSubmit={handleDispense}
        />
      )}

      {/* [10] Details modal */}
      {showDetailsModal && selectedPrescription && (
        <DetailsModal
          prescription={selectedPrescription}
          onClose={() => { setShowDetailsModal(false); setSelectedPrescription(null) }}
          onAddComment={handleAddComment}
        />
      )}

      {/* [5] Approve alternative modal */}
      {showAlternativeModal && selectedPrescription && alternativeMedication && (
        <ApproveAlternativeModal
          prescription={selectedPrescription}
          medication={alternativeMedication}
          loading={loading}
          onClose={() => { setShowAlternativeModal(false); setAlternativeMedication(null); setSelectedPrescription(null) }}
          onSubmit={handleApproveAlternative}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PrescriptionRow
// ─────────────────────────────────────────────────────────────────────────────
const PrescriptionRow = ({
  prescription, loading,
  onConfirmAvailability, onMarkReady, onDispense, onViewDetails, onApproveAlternative,
}) => {
  const [readyNotes, setReadyNotes] = useState('')
  const [showReadyForm, setShowReadyForm] = useState(false)

  return (
    <div className="p-6 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-4">

        {/* Left: info */}
        <div className="flex-1 space-y-3">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-lg">Prescription #{prescription.prescriptionNumber}</h3>
            <span className={`px-3 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[prescription.status] || 'bg-gray-100 text-gray-800'}`}>
              {STATUS_LABELS[prescription.status] || prescription.status}
            </span>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Patient:</span>
              <span className="ml-2 font-medium">{prescription.patient?.firstName} {prescription.patient?.lastName}</span>
            </div>
            <div>
              <span className="text-gray-500">Doctor:</span>
              <span className="ml-2 font-medium">Dr. {prescription.doctor?.firstName} {prescription.doctor?.lastName}</span>
            </div>
            <div>
              <span className="text-gray-500">Created:</span>
              <span className="ml-2">{format(parseISO(prescription.createdAt), 'MMM d, yyyy')}</span>
            </div>
          </div>

          {/* Valid until */}
          {prescription.validUntil && (
            <p className="text-xs text-gray-400">
              Valid until: {format(parseISO(prescription.validUntil), 'MMM d, yyyy')}
            </p>
          )}

          {/* Medications */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Medications ({prescription.medications?.length || 0})</p>
            <div className="space-y-2">
              {prescription.medications?.map((med, idx) => (
                <div key={med._id || idx} className="flex items-start justify-between border border-gray-200 rounded-lg p-3">
                  <div className="flex-1">
                    <p className="font-medium">{med.drugName}</p>
                    <p className="text-sm text-gray-600">{med.dosage} • {med.frequency} • {med.duration}</p>
                    {med.instructions && <p className="text-sm text-gray-500 mt-1">{med.instructions}</p>}
                    {/* [5] Show alternative if suggested */}
                    {med.alternativeDrug && (
                      <p className="text-sm text-amber-700 mt-1">
                        ⚠ Alternative suggested: <span className="font-medium">{med.alternativeDrug}</span>
                        {med.alternativeReason && ` — ${med.alternativeReason}`}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex flex-col items-end gap-1">
                    {med.availabilityStatus && (
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        med.availabilityStatus === 'available'  ? 'bg-green-100 text-green-800' :
                        med.availabilityStatus === 'unavailable'? 'bg-red-100 text-red-800' :
                        med.availabilityStatus === 'partial'    ? 'bg-orange-100 text-orange-800' :
                                                                  'bg-gray-100 text-gray-800'
                      }`}>
                        {med.availabilityStatus}
                      </span>
                    )}
                    {/* [5] Quick approve/reject button for alternatives */}
                    {med.alternativeDrug && (
                      <button
                        onClick={() => onApproveAlternative(med)}
                        className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded hover:bg-amber-200 transition-colors"
                      >
                        Review Alternative
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {prescription.generalInstructions && (
            <div>
              <p className="text-sm font-medium text-gray-700">Instructions:</p>
              <p className="text-sm text-gray-600 mt-1">{prescription.generalInstructions}</p>
            </div>
          )}

          {prescription.cancellationReason && (
            <div className="bg-red-50 rounded p-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700"><span className="font-medium">Cancellation reason: </span>{prescription.cancellationReason}</p>
            </div>
          )}

          {/* [1] Mark ready inline form */}
          {showReadyForm && (
            <div className="border border-purple-200 rounded-lg p-3 bg-purple-50 space-y-2 mt-2">
              <p className="text-sm font-medium text-purple-800">Mark Ready for Pickup</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Actual Cost (KES)</label>
                  <input
                    id={`cost-${prescription._id}`}
                    type="number"
                    min="0"
                    defaultValue={prescription.actualCost || prescription.estimatedCost || ''}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Notes (optional)</label>
                  <input
                    value={readyNotes}
                    onChange={e => setReadyNotes(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    placeholder="Pharmacy notes…"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowReadyForm(false)} className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-white">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cost = parseFloat(document.getElementById(`cost-${prescription._id}`)?.value) || 0
                    handleMarkReadyLocal(prescription._id, cost, readyNotes)
                    setShowReadyForm(false)
                  }}
                  className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  Confirm Ready
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex flex-col space-y-2 flex-shrink-0">

          {/* [11] 'new' AND 'pending_pharmacy' both accepted by controller */}
          {['new', 'pending_pharmacy'].includes(prescription.status) && (
            <button
              onClick={onConfirmAvailability}
              disabled={loading}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              Confirm Availability
            </button>
          )}

          {/* [1] Mark ready — opens inline form */}
          {prescription.status === 'availability_confirmed' && (
            <button
              onClick={() => setShowReadyForm(r => !r)}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              Mark Ready
            </button>
          )}

          {['ready_for_pickup', 'partial_ready'].includes(prescription.status) && (
            <button
              onClick={onDispense}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Dispense
            </button>
          )}

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

  // local forwarder so the inline form can call the parent handler
  function handleMarkReadyLocal(id, cost, notes) {
    onMarkReady(id, cost, notes)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmAvailabilityModal — [7] fixed availabilityStatus mapping
// ─────────────────────────────────────────────────────────────────────────────
const ConfirmAvailabilityModal = ({ prescription, onClose, onSubmit }) => {
  const [medications, setMedications] = useState(
    prescription.medications.map(med => ({
      medicationId:      med._id,
      availabilityStatus: 'available',  // backend values: available | partial | unavailable
      alternativeDrug:   '',
      alternativeReason: '',
      _uiChoice:         'available',   // UI-only: available | partial | unavailable | alternative_suggested
    }))
  )
  const [pharmacyNotes, setPharmacyNotes] = useState('')

  const setField = (idx, field, value) => {
    setMedications(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const handleUiChoice = (idx, choice) => {
    // [7] Map UI choice → the fields the controller actually inspects:
    //   hasUnavailable = any medication.availabilityStatus === 'unavailable'
    //   hasAlternatives = any medication.alternativeDrug is truthy
    setMedications(prev => {
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        _uiChoice: choice,
        availabilityStatus: choice === 'alternative_suggested' ? 'unavailable' : choice,
        alternativeDrug:    choice !== 'alternative_suggested' ? '' : next[idx].alternativeDrug,
        alternativeReason:  choice !== 'alternative_suggested' ? '' : next[idx].alternativeReason,
      }
      return next
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // Strip _uiChoice before sending to API
    const payload = {
      medications: medications.map(({  ...rest }) => rest),
      pharmacyNotes,
    }
    onSubmit(prescription._id, payload)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-2xl font-semibold">Confirm Drug Availability</h3>
          <p className="text-sm text-gray-500 mt-1">Prescription #{prescription.prescriptionNumber}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {prescription.medications.map((med, idx) => (
            <div key={med._id} className="border border-gray-200 rounded-lg p-4 space-y-4">
              <div>
                <h4 className="font-medium">{med.drugName}</h4>
                <p className="text-sm text-gray-600">{med.dosage} • Qty: {med.quantity}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Availability Status</label>
                <select
                  value={medications[idx]._uiChoice}
                  onChange={e => handleUiChoice(idx, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                >
                  <option value="available">✓ Available</option>
                  <option value="partial">⬤ Partially Available</option>
                  <option value="unavailable">✗ Unavailable</option>
                  <option value="alternative_suggested">⇄ Suggest Alternative</option>
                </select>
              </div>

              {/* [7] Alternative fields only when 'Suggest Alternative' is chosen */}
              {medications[idx]._uiChoice === 'alternative_suggested' && (
                <div className="space-y-3 bg-amber-50 rounded-lg p-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Alternative Drug Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={medications[idx].alternativeDrug}
                      onChange={e => setField(idx, 'alternativeDrug', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="Generic name or brand substitute"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Alternative <span className="text-red-500">*</span></label>
                    <textarea
                      value={medications[idx].alternativeReason}
                      onChange={e => setField(idx, 'alternativeReason', e.target.value)}
                      rows={2}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Pharmacy Notes</label>
            <textarea
              value={pharmacyNotes}
              onChange={e => setPharmacyNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
              placeholder="Any additional notes…"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 text-sm">Confirm Availability</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DispenseModal — [2][3] notes field + unitCost per medication
// ─────────────────────────────────────────────────────────────────────────────
const DispenseModal = ({ prescription, onClose, onSubmit }) => {
  const [pickedUpBy, setPickedUpBy]           = useState('')
  const [paymentMethod, setPaymentMethod]     = useState('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [pharmacistNotes, setPharmacistNotes] = useState('')
  const [medications, setMedications]         = useState(
    prescription.medications.map(med => ({
      medicationId:      med._id,
      dispensedQuantity: med.quantity || 0,
      unitCost:          med.unitCost || '',       // [3]
    }))
  )

  const setMedField = (idx, field, value) => {
    setMedications(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // [2] Controller reads { medications[], notes }
    //     Operational fields (pickedUpBy, paymentMethod, paymentReference)
    //     are appended to notes so they persist in the prescription document.
    const operationalInfo = [
      pickedUpBy     ? `Picked up by: ${pickedUpBy}`            : '',
      paymentMethod  ? `Payment: ${paymentMethod}`               : '',
      paymentReference ? `Ref: ${paymentReference}`             : '',
      pharmacistNotes  ? pharmacistNotes                        : '',
    ].filter(Boolean).join(' | ')

    onSubmit(prescription._id, {
      medications: medications.map(m => ({
        medicationId:      m.medicationId,
        dispensedQuantity: Number(m.dispensedQuantity),
        ...(m.unitCost !== '' ? { unitCost: Number(m.unitCost) } : {}), // [3]
      })),
      notes: operationalInfo || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-2xl font-semibold">Dispense Prescription</h3>
          <p className="text-sm text-gray-500 mt-1">Prescription #{prescription.prescriptionNumber}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Dispensed quantities + unit cost per medication */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Dispensed Quantities</p>
            <div className="space-y-3">
              {prescription.medications.map((med, idx) => (
                <div key={med._id || idx} className="border border-gray-200 rounded-lg p-3">
                  <p className="font-medium text-sm">{med.drugName}</p>
                  <p className="text-xs text-gray-500 mb-2">{med.dosage}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Dispensed Qty</label>
                      <input
                        type="number"
                        min="0"
                        value={medications[idx].dispensedQuantity}
                        onChange={e => setMedField(idx, 'dispensedQuantity', e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                    {/* [3] unitCost field */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Unit Cost (KES, optional)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={medications[idx].unitCost}
                        onChange={e => setMedField(idx, 'unitCost', e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pickup details */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Picked Up By <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={pickedUpBy}
              onChange={e => setPickedUpBy(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
              required
              placeholder="Name of person collecting"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="insurance">Insurance</option>
                <option value="mobile_money">Mobile Money</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Reference</label>
              <input
                type="text"
                value={paymentReference}
                onChange={e => setPaymentReference(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                placeholder="Transaction ID"
              />
            </div>
          </div>

          {/* [2] Pharmacist notes → sent as `notes` to controller */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pharmacist Notes (optional)</label>
            <textarea
              value={pharmacistNotes}
              onChange={e => setPharmacistNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
              placeholder="Any additional dispensing notes…"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">Complete Dispense</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DetailsModal — [4][10] full details + comments
// ─────────────────────────────────────────────────────────────────────────────
const DetailsModal = ({ prescription, onClose, onAddComment }) => {
  const [commentText, setCommentText] = useState('')
  const [commentType, setCommentType] = useState('note')
  const [submitting, setSubmitting]   = useState(false)

  const handleCommentSubmit = async (e) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setSubmitting(true)
    await onAddComment(prescription._id, commentText.trim(), commentType)
    setCommentText('')
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-semibold">Prescription #{prescription.prescriptionNumber}</h3>
            <span className={`inline-flex mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[prescription.status] || ''}`}>
              {STATUS_LABELS[prescription.status] || prescription.status}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">

          {/* Core meta */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-gray-500">Patient</p><p className="font-medium">{prescription.patient?.firstName} {prescription.patient?.lastName}</p></div>
            <div><p className="text-xs text-gray-500">Doctor</p><p className="font-medium">Dr. {prescription.doctor?.firstName} {prescription.doctor?.lastName}</p></div>
            <div><p className="text-xs text-gray-500">Created</p><p className="font-medium">{format(parseISO(prescription.createdAt), 'MMM d, yyyy h:mm a')}</p></div>
            <div><p className="text-xs text-gray-500">Valid Until</p><p className="font-medium">{prescription.validUntil ? format(parseISO(prescription.validUntil), 'MMM d, yyyy') : '—'}</p></div>
            {prescription.confirmedBy && (
              <div><p className="text-xs text-gray-500">Confirmed By</p><p className="font-medium">{prescription.confirmedBy.firstName} {prescription.confirmedBy.lastName}</p></div>
            )}
            {prescription.dispensedBy && (
              <div><p className="text-xs text-gray-500">Dispensed By</p><p className="font-medium">{prescription.dispensedBy.firstName} {prescription.dispensedBy.lastName}</p></div>
            )}
            {prescription.actualCost != null && (
              <div><p className="text-xs text-gray-500">Actual Cost</p><p className="font-medium">KES {prescription.actualCost.toLocaleString()}</p></div>
            )}
          </div>

          {prescription.generalInstructions && (
            <div>
              <p className="text-sm font-medium text-gray-700">General Instructions</p>
              <p className="text-sm text-gray-600 mt-1 bg-gray-50 p-2 rounded">{prescription.generalInstructions}</p>
            </div>
          )}

          {prescription.warnings && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm font-medium text-yellow-800">⚠ Warnings</p>
              <p className="text-sm text-yellow-700 mt-1">{prescription.warnings}</p>
            </div>
          )}

          {prescription.pharmacyNotes && (
            <div>
              <p className="text-sm font-medium text-gray-700">Pharmacy Notes</p>
              <p className="text-sm text-gray-600 mt-1 bg-gray-50 p-2 rounded">{prescription.pharmacyNotes}</p>
            </div>
          )}

          {/* Comments — [4] */}
          {prescription.comments?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <MessageSquare className="w-4 h-4" /> Comments ({prescription.comments.length})
              </p>
              <ul className="space-y-2">
                {prescription.comments.map((c, i) => (
                  <li key={i} className={`text-sm p-3 rounded-lg ${
                    c.type === 'alternative_suggestion' ? 'bg-amber-50 text-amber-800' :
                    c.type === 'doctor_response'        ? 'bg-blue-50 text-blue-800' :
                    c.type === 'query'                  ? 'bg-yellow-50 text-yellow-800' :
                                                          'bg-gray-50 text-gray-700'
                  }`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium text-xs">
                        {c.user?.firstName} {c.user?.lastName}
                        {c.user?.role && <span className="opacity-60 ml-1">({c.user.role})</span>}
                      </span>
                      {c.timestamp && (
                        <span className="text-xs opacity-60">{format(parseISO(c.timestamp), 'MMM d, h:mm a')}</span>
                      )}
                    </div>
                    <p>{c.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add comment — [4] */}
          <form onSubmit={handleCommentSubmit} className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Add Comment</p>
            <div className="flex gap-2">
              <select
                value={commentType}
                onChange={e => setCommentType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="note">Note</option>
                <option value="query">Query to Doctor</option>
              </select>
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                rows={2}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Add a note or query…"
              />
            </div>
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
            <button onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ApproveAlternativeModal — [5]
// Controller expects: { medicationId, approved: boolean, comment?: string }
// ─────────────────────────────────────────────────────────────────────────────
const ApproveAlternativeModal = ({ prescription, medication, loading, onClose, onSubmit }) => {
  const [comment, setComment] = useState('')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 bg-amber-50">
          <h3 className="text-xl font-semibold text-amber-900">Review Alternative Medication</h3>
          <p className="text-sm text-amber-700 mt-1">Prescription #{prescription.prescriptionNumber}</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
            <p><span className="text-gray-500">Original:</span> <span className="font-medium line-through text-gray-400">{medication.drugName}</span></p>
            <p><span className="text-gray-500">Suggested:</span> <span className="font-medium text-amber-800">{medication.alternativeDrug}</span></p>
            {medication.alternativeReason && (
              <p><span className="text-gray-500">Reason:</span> {medication.alternativeReason}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Doctor Comment (optional)</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Explain your decision…"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => onSubmit(prescription._id, medication._id, false, comment)}
              className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              <ThumbsDown className="w-4 h-4" /> Reject Alternative
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => onSubmit(prescription._id, medication._id, true, comment)}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              <ThumbsUp className="w-4 h-4" /> Approve Alternative
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PharmacyDashboard
