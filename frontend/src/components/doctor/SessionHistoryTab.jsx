import React, { useState, useEffect, useCallback } from 'react';
import {
  History, ChevronDown, ChevronRight, Clock, User, Calendar,
  FlaskConical, Pill, FileText, CheckCircle, XCircle, AlertCircle,
  Search, Filter, Stethoscope,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { sessionsAPI } from '../../api';
import toast from 'react-hot-toast';

// ─── Design tokens ────────────────────────────────────────────────────────────
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
    blue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    amber:  { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    red:    { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
    purple: { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff' },
    gray:   { bg: '#f5f5f5', text: '#525252', border: '#d4d4d4' },
  },
};

// ─── Small helpers ────────────────────────────────────────────────────────────
const Badge = ({ label, color = 'gray', icon: Icon }) => {
  const c = T.badge[color] || T.badge.gray;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 9999,
      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      {Icon && <Icon size={10} />}
      {label}
    </span>
  );
};

const STATUS_META = {
  completed:   { color: 'green',  icon: CheckCircle, label: 'Completed' },
  in_progress: { color: 'purple', icon: Stethoscope, label: 'In Progress' },
  cancelled:   { color: 'red',    icon: XCircle,     label: 'Cancelled' },
  default:     { color: 'gray',   icon: AlertCircle, label: 'Unknown' },
};

const statusMeta = s => STATUS_META[s] || STATUS_META.default;

const fmt = (dateStr) => {
  if (!dateStr) return '—';
  try { return format(parseISO(dateStr), 'MMM d, yyyy · h:mm a'); }
  catch { return dateStr; }
};

const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  try { return format(parseISO(dateStr), 'MMM d, yyyy'); }
  catch { return dateStr; }
};

const minutesDiff = (start, end) => {
  if (!start || !end) return null;
  return Math.round((new Date(end) - new Date(start)) / 60_000);
};

// ─── Vital signs row ──────────────────────────────────────────────────────────
const VitalRow = ({ label, value, unit }) =>
  value ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ color: T.textSm }}>{label}</span>
      <span style={{ fontWeight: 600, color: T.text }}>{value}{unit ? ` ${unit}` : ''}</span>
    </div>
  ) : null;

// ─── Expanded detail panel ────────────────────────────────────────────────────
const SessionDetail = ({ session }) => {
  const vs = session.vitalSigns || {};
  const hasVitals = Object.values(vs).some(Boolean);
  const duration = minutesDiff(session.startTime, session.endTime);

  return (
    <div style={{
      padding: '20px 24px',
      background: T.bg,
      borderTop: `1px solid ${T.border}`,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      gap: 16,
    }}>

      {/* Session metadata */}
      <div style={{ background: T.surface, borderRadius: 10, padding: 16, border: `1px solid ${T.border}` }}>
        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: T.textXs, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Session Info
        </p>
        <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div><span style={{ color: T.textSm }}>Started: </span><span style={{ fontWeight: 600 }}>{fmt(session.startTime)}</span></div>
          {session.endTime && <div><span style={{ color: T.textSm }}>Ended: </span><span style={{ fontWeight: 600 }}>{fmt(session.endTime)}</span></div>}
          {duration !== null && <div><span style={{ color: T.textSm }}>Duration: </span><span style={{ fontWeight: 600 }}>{duration} min</span></div>}
          {session.reconnectCount > 0 && <div><span style={{ color: T.textSm }}>Reconnects: </span><span style={{ fontWeight: 600 }}>{session.reconnectCount}</span></div>}
        </div>
      </div>

      {/* Complaints */}
      {session.complaints && (
        <div style={{ background: T.surface, borderRadius: 10, padding: 16, border: `1px solid ${T.border}` }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: T.textXs, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Chief Complaints</p>
          <p style={{ margin: 0, fontSize: 13, color: T.textMd, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{session.complaints}</p>
        </div>
      )}

      {/* Vitals */}
      {hasVitals && (
        <div style={{ background: T.surface, borderRadius: 10, padding: 16, border: `1px solid ${T.border}` }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: T.textXs, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Vital Signs</p>
          <VitalRow label="Blood Pressure"  value={vs.bloodPressure}    unit="mmHg" />
          <VitalRow label="Heart Rate"      value={vs.heartRate}         unit="bpm" />
          <VitalRow label="Temperature"     value={vs.temperature}       unit="°C" />
          <VitalRow label="Weight"          value={vs.weight}            unit="kg" />
          <VitalRow label="Height"          value={vs.height}            unit="cm" />
          <VitalRow label="Resp. Rate"      value={vs.respiratoryRate}   unit="/min" />
          <VitalRow label="SpO₂"            value={vs.oxygenSaturation}  unit="%" />
        </div>
      )}

      {/* Clinical observations */}
      {session.clinicalObservations && (
        <div style={{ background: T.surface, borderRadius: 10, padding: 16, border: `1px solid ${T.border}` }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: T.textXs, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Clinical Observations</p>
          <p style={{ margin: 0, fontSize: 13, color: T.textMd, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{session.clinicalObservations}</p>
        </div>
      )}

      {/* Provisional diagnosis */}
      {session.provisionalDiagnosis && (
        <div style={{ background: T.surface, borderRadius: 10, padding: 16, border: `1px solid ${T.border}` }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: T.textXs, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Provisional Diagnosis</p>
          <p style={{ margin: 0, fontSize: 13, color: T.textMd, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{session.provisionalDiagnosis}</p>
        </div>
      )}

      {/* Session notes */}
      {session.sessionNotes && (
        <div style={{ background: T.surface, borderRadius: 10, padding: 16, border: `1px solid ${T.border}` }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: T.textXs, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Session Notes</p>
          <p style={{ margin: 0, fontSize: 13, color: T.textMd, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{session.sessionNotes}</p>
        </div>
      )}

      {/* Lab requests */}
      {session.labRequests?.length > 0 && (
        <div style={{ background: T.surface, borderRadius: 10, padding: 16, border: `1px solid ${T.border}` }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: T.textXs, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 5 }}>
            <FlaskConical size={11} /> Lab Requests ({session.labRequests.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {session.labRequests.map((lab, i) => (
              <div key={lab._id || i} style={{ fontSize: 13, padding: '6px 10px', background: T.badge.blue.bg, border: `1px solid ${T.badge.blue.border}`, borderRadius: 7 }}>
                <span style={{ fontWeight: 600, color: T.text }}>{lab.testName || `Lab #${i + 1}`}</span>
                {lab.status && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: T.badge.blue.text }}>· {lab.status}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prescriptions */}
      {session.prescriptions?.length > 0 && (
        <div style={{ background: T.surface, borderRadius: 10, padding: 16, border: `1px solid ${T.border}` }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: T.textXs, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Pill size={11} /> Prescriptions ({session.prescriptions.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {session.prescriptions.map((rx, i) => (
              <div key={rx._id || i} style={{ fontSize: 13, padding: '6px 10px', background: T.badge.green.bg, border: `1px solid ${T.badge.green.border}`, borderRadius: 7 }}>
                <span style={{ fontWeight: 600, color: T.text }}>{rx.drugName || rx.medication || `Rx #${i + 1}`}</span>
                {rx.dosage && <span style={{ color: T.textSm, marginLeft: 6 }}>· {rx.dosage}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

// ─── Session row ──────────────────────────────────────────────────────────────
const SessionRow = ({ session }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = statusMeta(session.status);
  const duration = minutesDiff(session.startTime, session.endTime);

  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      {/* Summary row */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          padding: '16px 24px', background: T.surface,
          border: 'none', cursor: 'pointer', textAlign: 'left', gap: 16,
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = T.bg}
        onMouseLeave={e => e.currentTarget.style.background = T.surface}
      >
        {/* Expand icon */}
        <span style={{ color: T.textXs, flexShrink: 0 }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>

        {/* Patient avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: T.bg, border: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          fontSize: 13, fontWeight: 700, color: T.textMd,
        }}>
          {session.patient?.firstName?.[0]}{session.patient?.lastName?.[0]}
        </div>

        {/* Patient + date */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>
            {session.patient?.firstName} {session.patient?.lastName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3, color: T.textSm, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={11} color={T.textXs} />
              {fmtDate(session.startTime)}
            </span>
            {session.startTime && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} color={T.textXs} />
                {format(parseISO(session.startTime), 'h:mm a')}
              </span>
            )}
          </div>
        </div>

        {/* Duration */}
        {duration !== null && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{duration}<span style={{ fontSize: 11, color: T.textSm, fontWeight: 500 }}> min</span></div>
            <div style={{ fontSize: 11, color: T.textXs }}>duration</div>
          </div>
        )}

        {/* Lab / Rx counts */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {session.labRequests?.length > 0 && (
            <Badge label={`${session.labRequests.length} labs`} color="blue" icon={FlaskConical} />
          )}
          {session.prescriptions?.length > 0 && (
            <Badge label={`${session.prescriptions.length} Rx`} color="green" icon={Pill} />
          )}
        </div>

        {/* Status badge */}
        <Badge label={meta.label} color={meta.color} icon={meta.icon} />
      </button>

      {/* Expanded detail */}
      {expanded && <SessionDetail session={session} />}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const SessionHistoryTab = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const response = await sessionsAPI.getDoctorSessions(params);
      setSessions(response.data || []);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      toast.error('Failed to load session history');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter]);

  // Client-side search on patient name / diagnosis
  const filtered = sessions.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${s.patient?.firstName ?? ''} ${s.patient?.lastName ?? ''}`.toLowerCase();
    const diag = (s.provisionalDiagnosis ?? '').toLowerCase();
    return name.includes(q) || diag.includes(q);
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Summary stats
  const total     = sessions.length;
  const completed = sessions.filter(s => s.status === 'completed').length;
  const cancelled = sessions.filter(s => s.status === 'cancelled').length;
  const avgDur    = (() => {
    const withDur = sessions.filter(s => s.startTime && s.endTime);
    if (!withDur.length) return null;
    const avg = withDur.reduce((sum, s) => sum + minutesDiff(s.startTime, s.endTime), 0) / withDur.length;
    return Math.round(avg);
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Summary stats ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Total Sessions', value: total,     color: T.text },
          { label: 'Completed',      value: completed, color: T.badge.green.text },
          { label: 'Cancelled',      value: cancelled, color: T.badge.red.text },
          { label: 'Avg Duration',   value: avgDur !== null ? `${avgDur} min` : '—', color: T.badge.blue.text },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: T.surface, borderRadius: 10, padding: '18px 20px',
            border: `1px solid ${T.border}`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 13, color: T.textSm }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div style={{
        background: T.surface, borderRadius: 10, padding: '16px 20px',
        border: `1px solid ${T.border}`, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} color={T.textXs} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search by patient name or diagnosis…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, fontSize: 13,
              border: `1px solid ${T.border}`, background: T.bg, color: T.text,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {['all','completed','cancelled','in_progress'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${statusFilter === s ? T.primary : T.border}`,
                background: statusFilter === s ? T.primary : T.surface,
                color: statusFilter === s ? '#fff' : T.textMd,
                textTransform: 'capitalize',
              }}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>

        <button onClick={fetchSessions} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          border: `1px solid ${T.border}`, background: T.bg, color: T.textMd,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Filter size={12} /> Refresh
        </button>
      </div>

      {/* ── Session list ─────────────────────────────────────────────────── */}
      <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        {/* List header */}
        <div style={{
          padding: '16px 24px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, background: T.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <History size={17} color={T.textMd} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>Session History</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: T.textSm }}>
                {filtered.length} session{filtered.length !== 1 ? 's' : ''} — click a row to expand details
              </p>
            </div>
          </div>
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: T.textXs, fontSize: 14 }}>
            Loading session history…
          </div>
        ) : paginated.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: T.textXs }}>
            <History size={36} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>No sessions found</p>
          </div>
        ) : (
          paginated.map(session => (
            <SessionRow key={session._id} session={session} />
          ))
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: '14px 24px', borderTop: `1px solid ${T.border}`, background: T.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, color: T.textSm }}>
              Page {page} of {totalPages} · {filtered.length} total
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${T.border}`, background: T.surface, color: T.textMd,
                  cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1,
                }}
              >← Prev</button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${T.border}`, background: T.surface, color: T.textMd,
                  cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1,
                }}
              >Next →</button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default SessionHistoryTab;