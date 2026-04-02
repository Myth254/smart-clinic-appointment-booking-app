/* eslint-disable no-unused-vars */
import React from 'react';
import { X, FlaskConical, AlertCircle, Download, Printer } from 'lucide-react';

// ─── Design tokens (mirrors DoctorSessionPage) ────────────────────────────────
const T = {
  bg:      '#f5f5f5',
  surface: '#ffffff',
  border:  '#e5e5e5',
  text:    '#171717',
  textMd:  '#404040',
  textSm:  '#737373',
  textXs:  '#a3a3a3',
  primary: '#171717',
  badge: {
    green:  { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
    amber:  { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    red:    { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
    blue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    gray:   { bg: '#f5f5f5', text: '#525252', border: '#d4d4d4' },
  },
};

const Badge = ({ label, color = 'gray' }) => {
  const c = T.badge[color] || T.badge.gray;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 9px', borderRadius: 9999,
      fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>{label}</span>
  );
};

const FLAG_COLOR = { normal: 'green', low: 'blue', high: 'amber', critical: 'red' };

const LabResultsModal = ({ isOpen, onClose, labResults, getStatusColor }) => {
  if (!isOpen) return null;

  // Derive badge color from status string (supports both Tailwind class strings and our token system)
  const statusBadgeColor = (status) => {
    if (status === 'completed') return 'green';
    if (status === 'pending')   return 'amber';
    if (status === 'cancelled' || status === 'rejected') return 'red';
    return 'gray';
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: T.surface, borderRadius: 14, width: '100%', maxWidth: 860,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 9, background: T.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FlaskConical size={17} color={T.textMd} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Laboratory Results</h3>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: T.textSm }}>Review completed test results</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 6,
            borderRadius: 8, display: 'flex', alignItems: 'center', color: T.textSm,
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {labResults.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: T.textXs }}>
              <FlaskConical size={40} style={{ display: 'block', margin: '0 auto 14px' }} />
              <p style={{ margin: 0, fontSize: 14 }}>No lab results available yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {labResults.map(labResult => (
                <div key={labResult._id} style={{
                  border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden',
                }}>
                  {/* Sub-header */}
                  <div style={{
                    padding: '12px 18px', background: T.bg, borderBottom: `1px solid ${T.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      {/* Bug 7 fix: LabRequest has tests[] not a single testName */}
                      <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>
                        {labResult.tests?.map(t => t.testName).join(', ') || labResult.requestNumber}
                      </span>
                      <span style={{ fontSize: 12, color: T.textXs, marginLeft: 10 }}>
                        Request #{labResult.requestNumber}
                      </span>
                    </div>
                    <Badge label={labResult.status} color={statusBadgeColor(labResult.status)} />
                  </div>

                  {/* Results table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ background: T.bg }}>
                          {['Parameter', 'Value', 'Unit', 'Normal Range', 'Flag'].map(h => (
                            <th key={h} style={{
                              padding: '9px 14px', textAlign: 'left',
                              fontSize: 11, fontWeight: 700, color: T.textSm,
                              textTransform: 'uppercase', letterSpacing: '0.06em',
                              border: `1px solid ${T.border}`,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(labResult.results || []).map((result, idx) => (
                          <tr key={idx} style={{
                            background: result.flag !== 'normal' ? T.badge.amber.bg : T.surface,
                          }}>
                            {/* Bug 7 fix: schema uses testName (not parameter) and result (not value) */}
                            <td style={{ padding: '9px 14px', border: `1px solid ${T.border}`, fontWeight: 600, color: T.text }}>{result.testName || '—'}</td>
                            <td style={{ padding: '9px 14px', border: `1px solid ${T.border}`, fontWeight: 700, color: T.text }}>{result.result || '—'}</td>
                            <td style={{ padding: '9px 14px', border: `1px solid ${T.border}`, color: T.textSm }}>{result.unit || '—'}</td>
                            <td style={{ padding: '9px 14px', border: `1px solid ${T.border}`, color: T.textSm }}>{result.normalRange || '—'}</td>
                            <td style={{ padding: '9px 14px', border: `1px solid ${T.border}` }}>
                              {result.flag === 'normal' ? (
                                <Badge label="Normal" color="green" />
                              ) : result.flag === 'low' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Badge label="Low" color="blue" />
                                  <AlertCircle size={13} color={T.badge.blue.text} />
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Badge label={result.flag === 'critical' ? 'Critical' : 'High'} color={result.flag === 'critical' ? 'red' : 'amber'} />
                                  <AlertCircle size={13} color={result.flag === 'critical' ? T.badge.red.text : T.badge.amber.text} />
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: `1px solid ${T.border}`,
          background: T.bg, display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            border: `1px solid ${T.border}`, background: T.surface, color: T.textMd, cursor: 'pointer',
          }}>
            Close
          </button>
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            border: `1px solid ${T.border}`, background: T.surface, color: T.textMd, cursor: 'pointer',
          }}>
            <Printer size={14} /> Print
          </button>
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            border: `1px solid ${T.primary}`, background: T.primary, color: '#fff', cursor: 'pointer',
          }}>
            <Download size={14} /> Download Results
          </button>
        </div>
      </div>
    </div>
  );
};

export default LabResultsModal;