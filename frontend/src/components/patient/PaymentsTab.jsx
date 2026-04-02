// components/patient/PaymentsTab.jsx
//
// ✅ REFACTORED — data is now passed as props from PatientDashboard.
//
// Before: PaymentsTab called billingAPI.getMyBills() internally via its own
//         useEffect. This ran a duplicate request because PatientDashboard
//         already fetches bills via fetchBills() and holds them in state.
//
// After:  PaymentsTab is purely presentational for the bill list. It receives
//         `bills`, `loading`, and `onRefresh` as props. The only network call
//         remaining is the "Refresh" button, which delegates back to the parent
//         via `onRefresh()` so the parent's fetchBills() runs (deduplication
//         still applies there).
//
// Props:
//   bills       Bill[]   — from PatientDashboard state
//   loading     bool     — initial load spinner
//   onPayment   fn       — payment initiation handler (unchanged)
//   onRefresh   fn       — called when user clicks Refresh button

import React, { useState } from 'react';
import {
  CheckCircle, CreditCard, AlertCircle, Receipt,
  Stethoscope, TestTube, Pill, RefreshCw,
  ChevronDown, ChevronUp, Clock, DollarSign,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS = {
  draft:          { label: 'In Progress',    badge: 'bg-gray-100 text-gray-700',     dot: 'bg-gray-400'   },
  pending:        { label: 'Payment Due',    badge: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' },
  partially_paid: { label: 'Partially Paid', badge: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  paid:           { label: 'Paid',           badge: 'bg-green-100 text-green-800',   dot: 'bg-green-500'  },
  waived:         { label: 'Waived',         badge: 'bg-blue-100 text-blue-800',     dot: 'bg-blue-400'   },
  cancelled:      { label: 'Cancelled',      badge: 'bg-red-100 text-red-800',       dot: 'bg-red-400'    },
};
const scfg = (s) => STATUS[s] || { label: s, badge: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' };

// ── Breakdown row ──────────────────────────────────────────────────────────────
const BRow = ({ icon, label, amount }) => (
  <div className="flex items-center justify-between text-sm">
    <div className="flex items-center gap-2 text-gray-600">{icon}<span>{label}</span></div>
    <span className="font-medium text-gray-900">KES {amount?.toLocaleString()}</span>
  </div>
);

// ── Mini breakdown for history table ──────────────────────────────────────────
const MiniBreakdown = ({ b }) => {
  if (!b) return <span className="text-gray-400">—</span>;
  const parts = [
    b.consultationFee > 0 && `Consult ${b.consultationFee?.toLocaleString()}`,
    b.labFees         > 0 && `Lab ${b.labFees?.toLocaleString()}`,
    b.pharmacyCharges > 0 && `Rx ${b.pharmacyCharges?.toLocaleString()}`,
  ].filter(Boolean);
  return <span className="text-xs text-gray-500">{parts.join(' · ') || '—'}</span>;
};

// ── Section wrapper ────────────────────────────────────────────────────────────
const Section = ({ title, subtitle, action, children }) => (
  <div className="bg-white rounded-lg border border-gray-200">
    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

const EmptyState = ({ icon, title, sub }) => (
  <div className="p-12 text-center text-gray-500">
    <div className="mx-auto mb-3 w-fit">{icon}</div>
    <p className="font-medium">{title}</p>
    {sub && <p className="text-xs mt-1">{sub}</p>}
  </div>
);

// ── Single bill card ───────────────────────────────────────────────────────────
const BillCard = ({ bill, onPay }) => {
  const [open, setOpen] = useState(false);
  const cfg    = scfg(bill.status);
  const canPay = ['pending', 'partially_paid'].includes(bill.status);
  const isPaid = ['paid', 'waived'].includes(bill.status);

  return (
    <div className={`rounded-lg border transition-all ${
      canPay ? 'border-yellow-300 bg-yellow-50/40' : 'border-gray-200 bg-white'
    }`}>
      {/* Header row */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
              <span className="text-xs text-gray-400 font-mono">{bill.billNumber}</span>
            </div>
            <p className="font-medium text-gray-900 truncate">{bill.sessionRef}</p>
            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {bill.date ? format(parseISO(bill.date), 'MMM d, yyyy') : '—'}
              </span>
              <span>{bill.doctor}</span>
            </div>
          </div>

          {/* Right — amount + CTA */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <p className={`text-lg font-bold ${isPaid ? 'text-green-700' : 'text-gray-900'}`}>
              KES {bill.totalAmount?.toLocaleString()}
            </p>
            {bill.status === 'partially_paid' && (
              <p className="text-xs text-orange-600 font-medium">
                Balance: KES {bill.balanceDue?.toLocaleString()}
              </p>
            )}
            {canPay && (
              <button
                onClick={() => onPay(bill)}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                <CreditCard className="w-4 h-4" />
                Pay with M-Pesa
              </button>
            )}
            {isPaid && (
              <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                <CheckCircle className="w-3.5 h-3.5" /> Settled
              </span>
            )}
          </div>
        </div>

        {/* Partial-pay progress bar */}
        {bill.status === 'partially_paid' && bill.totalAmount > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Paid: KES {bill.amountPaid?.toLocaleString()}</span>
              <span>Remaining: KES {bill.balanceDue?.toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-orange-500 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, ((bill.amountPaid || 0) / bill.totalAmount) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Toggle */}
        <button
          onClick={() => setOpen(v => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {open ? 'Hide breakdown' : 'View breakdown'}
        </button>
      </div>

      {/* Expandable breakdown */}
      {open && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-3">
          {/* Category rows */}
          <div className="space-y-2">
            {bill.breakdown?.consultationFee > 0 && (
              <BRow icon={<Stethoscope className="w-4 h-4 text-blue-500" />}   label="Consultation fee"      amount={bill.breakdown.consultationFee} />
            )}
            {bill.breakdown?.labFees > 0 && (
              <BRow icon={<TestTube className="w-4 h-4 text-purple-500" />}    label="Lab tests"             amount={bill.breakdown.labFees} />
            )}
            {bill.breakdown?.pharmacyCharges > 0 && (
              <BRow icon={<Pill className="w-4 h-4 text-green-500" />}         label="Pharmacy / medications" amount={bill.breakdown.pharmacyCharges} />
            )}
          </div>

          {/* Line-item detail */}
          {bill.lineItems?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Item detail</p>
              <div className="space-y-1.5">
                {bill.lineItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs text-gray-600">
                    <span className="truncate pr-4">{item.description}</span>
                    <span className="font-medium flex-shrink-0">KES {item.totalCost?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          <div className="pt-3 border-t border-gray-200 flex justify-between font-semibold text-sm">
            <span>Total</span>
            <span>KES {bill.totalAmount?.toLocaleString()}</span>
          </div>

          {/* Payment receipts */}
          {bill.payments?.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1.5">Payments received</p>
              {bill.payments.map((pmt, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-600 py-0.5">
                  <span className="font-mono">{pmt.mpesaReceiptNumber || pmt.receiptNumber || `Payment ${i + 1}`}</span>
                  <span>KES {pmt.amount?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
/**
 * PaymentsTab
 *
 * Props:
 *   bills      Bill[]  — managed by PatientDashboard, passed down (no self-fetch)
 *   loading    bool    — initial load state from parent
 *   onPayment  fn(bill, 'bill') — payment initiation, delegated to parent
 *   onRefresh  fn()    — triggers parent's fetchBills(); avoids duplicate fetching
 */
const PaymentsTab = ({ bills = [], loading = false, onPayment, onRefresh }) => {
  // Local refreshing flag purely for spinner UX on manual refresh press.
  // The actual request lives in the parent — we just signal intent.
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  // Derived lists
  const pendingBills = bills.filter(b => ['pending', 'partially_paid'].includes(b.status));
  const draftBills   = bills.filter(b => b.status === 'draft');
  const settledBills = bills.filter(b => ['paid', 'waived'].includes(b.status));

  const totalOwed    = pendingBills.reduce((s, b) => s + (b.balanceDue  || 0), 0);
  const totalPaid    = settledBills.reduce((s, b) => s + (b.totalAmount || 0), 0);
  const thisMonth    = settledBills.filter(b =>
    b.paidAt && new Date(b.paidAt).getMonth() === new Date().getMonth()
  );
  const thisMonthAmt = thisMonth.reduce((s, b) => s + (b.totalAmount || 0), 0);

  // Wrap bill into the shape handlePaymentInitiation / PaymentVerificationModal expect.
  const handlePay = (bill) => {
    onPayment({
      billId:      bill._id,
      amount:      bill.balanceDue,
      billNumber:  bill.billNumber,
      description: bill.sessionRef,
      itemDetails: `Balance due: KES ${bill.balanceDue?.toLocaleString()}`,
    }, 'bill');
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-green-600 rounded-full animate-spin mx-auto mb-4" />
          <p>Loading billing history…</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: 'Amount Outstanding',
            value: `KES ${totalOwed.toLocaleString()}`,
            sub:   `${pendingBills.length} bill${pendingBills.length !== 1 ? 's' : ''} due`,
            bg:    'bg-yellow-50 border-yellow-200',
            text:  'text-yellow-800',
            sub2:  'text-yellow-700',
            icon:  <AlertCircle className="w-5 h-5 text-yellow-600" />,
          },
          {
            label: 'Paid This Month',
            value: `KES ${thisMonthAmt.toLocaleString()}`,
            sub:   `${thisMonth.length} transaction${thisMonth.length !== 1 ? 's' : ''}`,
            bg:    'bg-green-50 border-green-200',
            text:  'text-green-800',
            sub2:  'text-green-700',
            icon:  <CheckCircle className="w-5 h-5 text-green-600" />,
          },
          {
            label: 'Total Paid (All Time)',
            value: `KES ${totalPaid.toLocaleString()}`,
            sub:   `${settledBills.length} settled bill${settledBills.length !== 1 ? 's' : ''}`,
            bg:    'bg-blue-50 border-blue-200',
            text:  'text-blue-800',
            sub2:  'text-blue-700',
            icon:  <DollarSign className="w-5 h-5 text-blue-600" />,
          },
        ].map(({ label, value, sub, bg, text, sub2, icon }) => (
          <div key={label} className={`p-5 border rounded-lg ${bg}`}>
            <div className="flex items-center gap-2 mb-1">{icon}<p className="text-sm text-gray-600">{label}</p></div>
            <p className={`text-2xl font-bold ${text}`}>{value}</p>
            <p className={`text-xs mt-1 ${sub2}`}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h3 className="font-medium text-blue-900 mb-2">Payment Information</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Each bill covers your full consultation: doctor fee, lab tests, and pharmacy charges combined</li>
          <li>• Payments are processed securely via M-Pesa STK Push</li>
          <li>• You'll receive a prompt on your phone — enter your PIN to confirm</li>
          <li>• Partial payment is supported: pay what you can now and settle the balance later</li>
          <li>• Keep your M-Pesa transaction receipts for your records</li>
        </ul>
      </div>

      {/* Outstanding bills */}
      <Section
        title="Outstanding Bills"
        subtitle="Settle your consultation charges securely via M-Pesa"
        action={
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      >
        {pendingBills.length === 0 ? (
          <EmptyState
            icon={<CheckCircle className="w-12 h-12 text-green-300" />}
            title="No outstanding bills"
            sub="All your charges are settled!"
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingBills.map(b => (
              <div key={b._id} className="p-4"><BillCard bill={b} onPay={handlePay} /></div>
            ))}
          </div>
        )}
      </Section>

      {/* Draft (in-session) bills */}
      {draftBills.length > 0 && (
        <Section
          title="Active Sessions"
          subtitle="These bills are still being built — charges are added as your session progresses"
        >
          <div className="divide-y divide-gray-100">
            {draftBills.map(b => (
              <div key={b._id} className="p-4"><BillCard bill={b} onPay={handlePay} /></div>
            ))}
          </div>
        </Section>
      )}

      {/* Payment history */}
      <Section title="Payment History" subtitle="Your settled consultation bills">
        {settledBills.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-12 h-12 text-gray-300" />}
            title="No payment history"
            sub="Completed payments will appear here"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Date', 'Bill', 'Doctor', 'Breakdown', 'Total', 'Status'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settledBills.map(b => {
                  const cfg = scfg(b.status);
                  return (
                    <tr key={b._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap text-gray-600">
                        {(b.paidAt || b.date)
                          ? format(parseISO(b.paidAt || b.date), 'MMM d, yyyy')
                          : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900 truncate max-w-[160px]">{b.sessionRef}</p>
                        <p className="text-xs text-gray-400 font-mono">{b.billNumber}</p>
                      </td>
                      <td className="px-5 py-4 text-gray-600 whitespace-nowrap">{b.doctor}</td>
                      <td className="px-5 py-4"><MiniBreakdown b={b.breakdown} /></td>
                      <td className="px-5 py-4 whitespace-nowrap font-semibold">
                        KES {b.totalAmount?.toLocaleString()}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
};

export default PaymentsTab;