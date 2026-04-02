import React from 'react';
import { Calendar, Clock, User, PlayCircle, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';

// ─── Design tokens (mirrors DoctorSessionPage) ────────────────────────────────
const T = {
  bg:      '#f5f5f5',
  surface: '#ffffff',
  border:  '#e5e5e5',
  text:    '#171717',
  textMd:  '#404040',
  textSm:  '#737373',
  textXs:  '#a3a3a3',
  primary:    '#171717',
  primaryHov: '#404040',
  badge: {
    green:  { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
    amber:  { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    red:    { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
    blue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    gray:   { bg: '#f5f5f5', text: '#525252', border: '#d4d4d4' },
    purple: { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff' },
  },
};

const STATUS_BADGE = {
  approved:    T.badge.green,
  completed:   T.badge.blue,
  pending:     T.badge.amber,
  in_progress: T.badge.purple,
};

const AppointmentCard = ({ appointment, onStartSession, loading }) => {
  const isTerminal  = ['completed', 'cancelled', 'no-show'].includes(appointment.status);
  const isInProgress = appointment.status === 'in_progress';
  const canAct = !isTerminal;

  const badge = STATUS_BADGE[appointment.status] || T.badge.gray;
  const label = appointment.status.replace('_', ' ');

  return (
    <div style={{
      padding: '20px 24px',
      borderBottom: `1px solid ${T.border}`,
      background: T.surface,
      transition: 'background 0.13s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = T.bg}
      onMouseLeave={e => e.currentTarget.style.background = T.surface}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        {/* Left — patient info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            background: T.bg, border: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <User size={20} color={T.textXs} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>
              {appointment.patient.firstName} {appointment.patient.lastName}
            </h4>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4, color: T.textSm, fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={12} color={T.textXs} />
                {format(parseISO(appointment.start), 'EEE, MMM d, yyyy')}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} color={T.textXs} />
                {format(parseISO(appointment.start), 'h:mm a')}
              </span>
            </div>

            <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textSm }}>
              <span style={{ color: T.textXs }}>Reason: </span>
              <span style={{ color: T.textMd }}>{appointment.reason}</span>
            </p>
          </div>
        </div>

        {/* Right — badge + action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '4px 12px', borderRadius: 9999,
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
            background: badge.bg, color: badge.text, border: `1px solid ${badge.border}`,
            textTransform: 'capitalize',
          }}>
            {label}
          </span>

          {canAct && (
            <button
              onClick={() => onStartSession(appointment)}
              disabled={loading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 18px', borderRadius: 8,
                fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1, border: '1px solid transparent',
                background: isInProgress ? '#581c87' : T.primary,
                color: '#fff',
                transition: 'opacity 0.13s',
                whiteSpace: 'nowrap',
              }}
            >
              {isInProgress
                ? <RefreshCw size={15} />
                : <PlayCircle size={15} />
              }
              {isInProgress ? 'Resume Session' : 'Start Session'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppointmentCard;