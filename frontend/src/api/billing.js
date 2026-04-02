// api/billing.js
// Covers all billingRoutes.js endpoints.
// Consumed via the central api barrel: import { billingAPI } from '../api'
import axiosClient from './axiosClient'

export const billingAPI = {

  // ── GET /billing/bills/my-bills ─────────────────────────────────────────
  // Patient: fetch own consolidated session bills.
  // params: { status, limit, offset }
  getMyBills: (params) =>
    axiosClient.get('/billing/bills/my-bills', { params })
      .then(res => res.data),

  // ── GET /billing/bills/:id ───────────────────────────────────────────────
  // Patient / Doctor / Admin: fetch a single bill by ID.
  getBillById: (id) =>
    axiosClient.get(`/billing/bills/${id}`)
      .then(res => res.data),

  // ── POST /billing/bills ──────────────────────────────────────────────────
  // Doctor: create a bill when opening a session.
  // body: { appointmentId, sessionId }
  createBill: (body) =>
    axiosClient.post('/billing/bills', body)
      .then(res => res.data),

  // ── PATCH /billing/bills/:id/add-line-item ───────────────────────────────
  // Doctor / Pharmacy / Admin: add a charge line item to a draft bill.
  // body: { type, description, quantity, unitCost, referenceId }
  addLineItem: (id, body) =>
    axiosClient.patch(`/billing/bills/${id}/add-line-item`, body)
      .then(res => res.data),

  // ── PATCH /billing/bills/:id/finalize ───────────────────────────────────
  // Doctor: lock bill after session close (draft → pending).
  finalizeBill: (id) =>
    axiosClient.patch(`/billing/bills/${id}/finalize`)
      .then(res => res.data),

  // ── PATCH /billing/bills/:id/waive ──────────────────────────────────────
  // Admin: waive a bill.
  // body: { reason }
  waiveBill: (id, body) =>
    axiosClient.patch(`/billing/bills/${id}/waive`, body)
      .then(res => res.data),

  // ── GET /billing/stats ───────────────────────────────────────────────────
  // Admin: revenue and billing statistics.
  getBillingStats: () =>
    axiosClient.get('/billing/stats')
      .then(res => res.data),

  // ── GET /billing/bills/appointment/:appointmentId ────────────────────────────
  // Doctor: fetch the live bill during an active session.
  getBillByAppointment: (appointmentId) =>
    axiosClient.get(`/billing/bills/appointment/${appointmentId}`)
      .then(res => res.data),

  // ── PATCH /billing/bills/:id/discount ───────────────────────────────────────
  // Admin: apply a discount to a draft or pending bill.
  // body: { discount, notes }
  applyDiscount: (id, body) =>
    axiosClient.patch(`/billing/bills/${id}/discount`, body)
      .then(res => res.data),
}

export default billingAPI;