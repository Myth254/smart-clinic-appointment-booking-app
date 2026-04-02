/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
/* eslint-disable no-empty */
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Activity, Save, FlaskConical, Eye, CheckCircle,
  Thermometer, Clock, Mic, MicOff, FileText, Plus, Pill,
  Loader2, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
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
    red:    { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
    blue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    amber:  { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    gray:   { bg: '#f5f5f5', text: '#525252', border: '#d4d4d4' },
  },
};

const inputStyle = (disabled = false) => ({
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
  border: `1px solid ${T.border}`, background: disabled ? T.bg : T.surface,
  color: T.text, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
});

const FieldLabel = ({ label, children, action }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: T.textMd }}>{label}</label>
      {action}
    </div>
    {children}
  </div>
);

const VoiceButton = ({ isRecording, onStart, onStop }) =>
  isRecording ? (
    <button onClick={onStop} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600,
      background: T.badge.red.bg, color: T.badge.red.text, border: `1px solid ${T.badge.red.border}`,
      cursor: 'pointer', animation: 'pulse 1.5s ease-in-out infinite',
    }}>
      <MicOff size={11} /> Stop
    </button>
  ) : (
    <button onClick={onStart} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600,
      background: T.badge.blue.bg, color: T.badge.blue.text, border: `1px solid ${T.badge.blue.border}`,
      cursor: 'pointer',
    }}>
      <Mic size={11} /> Voice
    </button>
  );

const VitalSignInput = ({ label, type = 'text', placeholder, value, onChange, step }) => (
  <div>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: T.textSm, marginBottom: 5 }}>
      {label}
    </label>
    <input
      type={type} placeholder={placeholder} value={value}
      onChange={onChange} step={step} style={inputStyle()}
    />
  </div>
);

// ─── Minimised pill that floats at the bottom of the screen ──────────────────
const MinimisedPill = ({ appointment, elapsedTime, remainingTime, isExpiring, onExpand }) => (
  <div
    onClick={onExpand}
    style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px', borderRadius: 50,
      background: isExpiring ? T.badge.amber.bg : T.primary,
      border: isExpiring ? `2px solid ${T.badge.amber.border}` : '2px solid transparent',
      boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
      cursor: 'pointer', userSelect: 'none',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.3)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.22)'; }}
  >
    {/* Pulse dot */}
    <span style={{
      width: 9, height: 9, borderRadius: '50%',
      background: isExpiring ? T.badge.amber.text : '#22c55e',
      display: 'inline-block', flexShrink: 0,
      animation: 'pulse 1.5s ease-in-out infinite',
    }} />

    {isExpiring && <AlertTriangle size={14} color={T.badge.amber.text} />}

    <span style={{
      fontSize: 13, fontWeight: 700,
      color: isExpiring ? T.badge.amber.text : '#fff',
      maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {appointment?.patient?.firstName} {appointment?.patient?.lastName}
    </span>

    <span style={{
      fontSize: 12, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em',
      color: isExpiring ? T.badge.amber.text : 'rgba(255,255,255,0.75)',
    }}>
      {elapsedTime}
    </span>

    {remainingTime !== null && (
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
        background: isExpiring ? T.badge.amber.text : 'rgba(255,255,255,0.15)',
        color: isExpiring ? '#fff' : 'rgba(255,255,255,0.9)',
      }}>
        {remainingTime} left
      </span>
    )}

    <ChevronUp size={14} color={isExpiring ? T.badge.amber.text : 'rgba(255,255,255,0.7)'} />
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const SessionModal = ({
  isOpen,
  onClose,           // called only when doctor explicitly ends the session
  selectedAppointment,
  sessionData,
  setSessionData,
  onSave,
  onRequestLabs,
  onViewResults,
  onFinalize,
  loading,
  // NEW props for persistence
  sessionStartTime,   // Date | null — actual backend start time (for elapsed counter)
  appointmentEndTime, // Date | null — appointment.end (for remaining-time countdown)
  // FIX D: extend-session props
  showExtendPrompt = false, // boolean — true when backend fires session:expiring_soon
  onExtend,                 // (extraMinutes: 15|30) => void
  onDismissExtend,          // () => void — hides the banner without extending
}) => {
  // ── Minimise / expand ──────────────────────────────────────────────────────
  // Minimising collapses the modal into a floating pill but DOES NOT end the
  // session. The pill is always visible so the doctor can return at any time.
  const [minimised, setMinimised] = useState(false);

  // ── Elapsed timer (counts UP from session start) ───────────────────────────
  const startEpoch = sessionStartTime
    ? new Date(sessionStartTime).getTime()
    : Date.now();
  const [elapsedTime, setElapsedTime] = useState('00:00:00');

  useEffect(() => {
    if (!isOpen) return;
    const tick = () => {
      const ms = Date.now() - startEpoch;
      const h  = Math.floor(ms / 3_600_000);
      const m  = Math.floor((ms % 3_600_000) / 60_000);
      const s  = Math.floor((ms % 60_000) / 1_000);
      setElapsedTime(
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isOpen, startEpoch]);

  // ── Remaining time (counts DOWN to appointment end) ────────────────────────
  const [remainingLabel, setRemainingLabel] = useState(null);
  const [isExpiring, setIsExpiring] = useState(false);

  // Reset on mount and whenever appointmentEndTime changes (e.g. after an extension).
  // Without this the old endEpoch is captured in the closure and the countdown
  // doesn't update until the next full re-render cycle.
  useEffect(() => {
    setRemainingLabel(null);
    setIsExpiring(false);
  }, [appointmentEndTime]);

  useEffect(() => {
    if (!isOpen || !appointmentEndTime) return;
    const endEpoch = new Date(appointmentEndTime).getTime();

    const tick = () => {
      const ms = endEpoch - Date.now();
      if (ms <= 0) {
        setRemainingLabel('Expired');
        setIsExpiring(true);
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      setIsExpiring(ms < 5 * 60 * 1000); // warn when < 5 min
      setRemainingLabel(
        h > 0
          ? `${h}h ${String(m).padStart(2,'0')}m`
          : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isOpen, appointmentEndTime]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  const onSaveRef     = useRef(onSave);
  const onLabsRef     = useRef(onRequestLabs);
  const onFinalizeRef = useRef(onFinalize);
  useEffect(() => { onSaveRef.current     = onSave;        }, [onSave]);
  useEffect(() => { onLabsRef.current     = onRequestLabs; }, [onRequestLabs]);
  useEffect(() => { onFinalizeRef.current = onFinalize;    }, [onFinalize]);

  useEffect(() => {
    if (!isOpen || minimised) return;
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSaveRef.current(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); onLabsRef.current(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); onFinalizeRef.current(); }
      // ESC now minimises instead of offering to close
      if (e.key === 'Escape') { e.preventDefault(); setMinimised(true); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, minimised]);

  // ── Voice recognition ──────────────────────────────────────────────────────
  const [isRecording, setIsRecording]       = useState(false);
  const [recordingField, setRecordingField] = useState(null);
  const recognitionRef    = useRef(null);
  const recordingFieldRef = useRef(recordingField);
  useEffect(() => { recordingFieldRef.current = recordingField; }, [recordingField]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = 'en-US';
    r.onresult = event => {
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript + ' ';
      }
      if (final && recordingFieldRef.current) {
        setSessionData(prev => ({
          ...prev,
          [recordingFieldRef.current]: (prev[recordingFieldRef.current] || '') + final,
        }));
      }
    };
    r.onerror = () => setIsRecording(false);
    r.onend   = () => setIsRecording(false);
    recognitionRef.current = r;
    return () => { try { r.stop(); } catch (_) {} };
  }, []);

  const startRecording = field => {
    if (!recognitionRef.current) { alert('Voice recognition not supported in this browser.'); return; }
    setRecordingField(field); setIsRecording(true);
    try { recognitionRef.current.start(); } catch (_) {}
  };
  const stopRecording = () => {
    try { recognitionRef.current?.stop(); } catch (_) {}
    setIsRecording(false); setRecordingField(null);
  };

  // ── Diagnosis templates ────────────────────────────────────────────────────
  const diagnosisTemplates = [
    'Upper Respiratory Tract Infection (URTI)', 'Acute Gastroenteritis',
    'Hypertension - Essential', 'Type 2 Diabetes Mellitus',
    'Urinary Tract Infection (UTI)', 'Migraine',
    'Acute Bronchitis', 'Allergic Rhinitis',
  ];
  const [showDiagTemplates, setShowDiagTemplates] = useState(false);
  const applyDiagTemplate = d => {
    setSessionData(prev => ({
      ...prev,
      provisionalDiagnosis: prev.provisionalDiagnosis ? `${prev.provisionalDiagnosis}\n${d}` : d,
    }));
    setShowDiagTemplates(false);
  };

  // ── Prescriptions ──────────────────────────────────────────────────────────
  const prescriptions = sessionData.prescriptions || [];
  const setPrescriptions = updater =>
    setSessionData(prev => ({
      ...prev,
      prescriptions: typeof updater === 'function' ? updater(prev.prescriptions || []) : updater,
    }));
  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false);
  const [currentRx, setCurrentRx] = useState({ medication: '', dosage: '', frequency: '', duration: '' });

  const prescriptionTemplates = [
    { medication: 'Amoxicillin',  dosage: '500mg', frequency: '3 times daily',              duration: '7 days'  },
    { medication: 'Paracetamol',  dosage: '500mg', frequency: 'As needed (max 4/day)',       duration: '5 days'  },
    { medication: 'Ibuprofen',    dosage: '400mg', frequency: '3 times daily with food',     duration: '5 days'  },
    { medication: 'Omeprazole',   dosage: '20mg',  frequency: 'Once daily before breakfast', duration: '14 days' },
    { medication: 'Metformin',    dosage: '500mg', frequency: 'Twice daily with meals',      duration: '30 days' },
    { medication: 'Lisinopril',   dosage: '10mg',  frequency: 'Once daily',                  duration: '30 days' },
  ];

  const addPrescription = () => {
    if (!currentRx.medication.trim() || !currentRx.dosage.trim()) { alert('Medication name and dosage are required'); return; }
    // _key is only for React list rendering — it is NOT included in the
    // prescription data object so it never reaches the backend schema.
    setPrescriptions(prev => [...prev, { ...currentRx, _key: Date.now() }]);
    setCurrentRx({ medication: '', dosage: '', frequency: '', duration: '' });
    setShowPrescriptionForm(false);
  };

  const setVS = key => e =>
    setSessionData(prev => ({ ...prev, vitalSigns: { ...prev.vitalSigns, [key]: e.target.value } }));

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!isOpen || !selectedAppointment) return null;

  // ── Minimised pill ─────────────────────────────────────────────────────────
  if (minimised) {
    return (
      <>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        <MinimisedPill
          appointment={selectedAppointment}
          elapsedTime={elapsedTime}
          remainingTime={remainingLabel}
          isExpiring={isExpiring}
          onExpand={() => setMinimised(false)}
        />
      </>
    );
  }

  // ── Full modal ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .expiring-border { animation: expiring-pulse 1.5s ease-in-out infinite; }
        @keyframes expiring-pulse {
          0%,100% { box-shadow: 0 24px 72px rgba(0,0,0,0.2); }
          50%     { box-shadow: 0 24px 72px rgba(0,0,0,0.2), 0 0 0 3px ${T.badge.amber.border}; }
        }
      `}</style>

      <div
        className={isExpiring ? 'expiring-border' : ''}
        style={{
          background: T.surface, borderRadius: 14, width: '100%', maxWidth: 900,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 72px rgba(0,0,0,0.2)',
          border: isExpiring ? `2px solid ${T.badge.amber.border}` : '2px solid transparent',
        }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{
          padding: '16px 24px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, background: T.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Activity size={17} color={T.textMd} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Active Session</h3>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: T.textSm }}>
                {selectedAppointment.patient?.firstName} {selectedAppointment.patient?.lastName}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Elapsed timer */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg,
            }}>
              <Clock size={13} color={T.textSm} />
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
                {elapsedTime}
              </span>
            </div>

            {/* Remaining time badge */}
            {remainingLabel && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8,
                background: isExpiring ? T.badge.amber.bg : T.badge.green.bg,
                border: `1px solid ${isExpiring ? T.badge.amber.border : T.badge.green.border}`,
              }}>
                {isExpiring && <AlertTriangle size={12} color={T.badge.amber.text} />}
                <span style={{ fontSize: 12, fontWeight: 700, color: isExpiring ? T.badge.amber.text : T.badge.green.text }}>
                  {remainingLabel} remaining
                </span>
              </div>
            )}

            {/* Auto-save indicator */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.badge.green.text }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              Auto-saving
            </span>

            {/* Minimise — collapses to pill, session stays active */}
            <button
              onClick={() => setMinimised(true)}
              title="Minimise (session stays active)"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                background: T.bg, border: `1px solid ${T.border}`, color: T.textSm,
                fontSize: 12, fontWeight: 600,
              }}
            >
              <ChevronDown size={14} /> Minimise
            </button>

            {/* End session — asks for confirmation */}
            <button
              onClick={() => {
                if (window.confirm('End session? This will permanently close it. Use Minimise if you plan to return.'))
                  onClose();
              }}
              title="End session"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', color: T.textSm }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Shortcuts bar ─────────────────────────────────────────────── */}
        <div style={{
          padding: '7px 24px', borderBottom: `1px solid ${T.border}`,
          background: T.bg, display: 'flex', alignItems: 'center', gap: 16,
          flexShrink: 0, fontSize: 12, color: T.textSm,
        }}>
          {[['Ctrl+S','Save'],['Ctrl+L','Labs'],['Ctrl+F','Finalize'],['ESC','Minimise']].map(([k, v]) => (
            <span key={k}>
              <kbd style={{ padding: '2px 7px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11, fontFamily: 'monospace' }}>{k}</kbd>
              {' '}{v}
            </span>
          ))}
          {isExpiring && (
            <span style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 99,
              background: T.badge.amber.bg, color: T.badge.amber.text,
              border: `1px solid ${T.badge.amber.border}`, fontWeight: 600,
            }}>
              <AlertTriangle size={11} /> Appointment window ending soon
            </span>
          )}
        </div>

        {/* ── FIX D: Extend-session banner ───────────────────────────────── */}
        {/* Shown when backend fires session:expiring_soon OR the countdown    */}
        {/* hits < 5 min naturally. Doctor can extend by 15 or 30 min, or     */}
        {/* dismiss the banner if they're already wrapping up.                 */}
        {(showExtendPrompt || isExpiring) && (
          <div style={{
            margin: '0 24px',
            marginTop: 12,
            padding: '10px 16px',
            borderRadius: 10,
            background: remainingLabel === 'Expired' ? T.badge.red.bg : T.badge.amber.bg,
            border: `1px solid ${remainingLabel === 'Expired' ? T.badge.red.border : T.badge.amber.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} color={remainingLabel === 'Expired' ? T.badge.red.text : T.badge.amber.text} />
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: remainingLabel === 'Expired' ? T.badge.red.text : T.badge.amber.text,
              }}>
                {remainingLabel === 'Expired'
                  ? 'Appointment time has ended — please wrap up or extend.'
                  : `Session ending in ${remainingLabel} — extend if needed.`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {onExtend && (
                <>
                  <button
                    onClick={() => onExtend(15)}
                    style={{
                      padding: '5px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: T.surface,
                      border: `1px solid ${T.badge.amber.border}`,
                      color: T.badge.amber.text,
                    }}
                  >+15 min</button>
                  <button
                    onClick={() => onExtend(30)}
                    style={{
                      padding: '5px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: T.surface,
                      border: `1px solid ${T.badge.amber.border}`,
                      color: T.badge.amber.text,
                    }}
                  >+30 min</button>
                </>
              )}
              {onDismissExtend && remainingLabel !== 'Expired' && (
                <button
                  onClick={onDismissExtend}
                  style={{
                    padding: '5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                    background: 'none', border: 'none', color: T.textSm,
                  }}
                >Dismiss</button>
              )}
            </div>
          </div>
        )}

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Chief Complaints */}
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel label="Chief Complaints" action={
                <VoiceButton isRecording={isRecording && recordingField === 'complaints'}
                  onStart={() => startRecording('complaints')} onStop={stopRecording} />
              }>
                <textarea value={sessionData.complaints}
                  onChange={e => setSessionData({ ...sessionData, complaints: e.target.value })}
                  rows={3} placeholder="Patient's main concerns and symptoms…"
                  style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6 }} />
              </FieldLabel>
            </div>

            {/* Vital Signs */}
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: T.textMd, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Thermometer size={14} color={T.textSm} /> Vital Signs
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <VitalSignInput label="BP (mmHg)"        placeholder="120/80"  value={sessionData.vitalSigns?.bloodPressure}    onChange={setVS('bloodPressure')} />
                <VitalSignInput label="Heart Rate (bpm)" type="number" placeholder="72"     value={sessionData.vitalSigns?.heartRate}       onChange={setVS('heartRate')} />
                <VitalSignInput label="Temp (°C)"        type="number" step="0.1" placeholder="37.0" value={sessionData.vitalSigns?.temperature}    onChange={setVS('temperature')} />
                <VitalSignInput label="Weight (kg)"      type="number" step="0.1" placeholder="70"   value={sessionData.vitalSigns?.weight}          onChange={setVS('weight')} />
                <VitalSignInput label="Height (cm)"      type="number" step="0.1" placeholder="170"  value={sessionData.vitalSigns?.height}          onChange={setVS('height')} />
                <VitalSignInput label="Resp Rate (/min)" type="number" placeholder="16"    value={sessionData.vitalSigns?.respiratoryRate}  onChange={setVS('respiratoryRate')} />
                <VitalSignInput label="SpO₂ (%)"         type="number" placeholder="98"    value={sessionData.vitalSigns?.oxygenSaturation} onChange={setVS('oxygenSaturation')} />
              </div>
            </div>

            {/* Clinical Observations */}
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel label="Clinical Observations" action={
                <VoiceButton isRecording={isRecording && recordingField === 'clinicalObservations'}
                  onStart={() => startRecording('clinicalObservations')} onStop={stopRecording} />
              }>
                <textarea value={sessionData.clinicalObservations}
                  onChange={e => setSessionData({ ...sessionData, clinicalObservations: e.target.value })}
                  rows={4} placeholder="Physical examination findings, patient appearance…"
                  style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6 }} />
              </FieldLabel>
            </div>

            {/* Provisional Diagnosis */}
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel label="Provisional Diagnosis" action={
                <button onClick={() => setShowDiagTemplates(s => !s)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                  background: T.bg, border: `1px solid ${T.border}`, color: T.textMd, cursor: 'pointer',
                }}>
                  <FileText size={11} /> Common Diagnoses
                </button>
              }>
                {showDiagTemplates && (
                  <div style={{
                    marginBottom: 8, padding: 12, background: T.bg,
                    border: `1px solid ${T.border}`, borderRadius: 9,
                    maxHeight: 160, overflowY: 'auto',
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
                  }}>
                    {diagnosisTemplates.map(d => (
                      <button key={d} onClick={() => applyDiagTemplate(d)} style={{
                        textAlign: 'left', padding: '7px 10px', borderRadius: 7,
                        border: `1px solid ${T.border}`, background: T.surface,
                        fontSize: 12, color: T.textMd, cursor: 'pointer', lineHeight: 1.4,
                      }}>{d}</button>
                    ))}
                  </div>
                )}
                <textarea value={sessionData.provisionalDiagnosis}
                  onChange={e => setSessionData({ ...sessionData, provisionalDiagnosis: e.target.value })}
                  rows={2} placeholder="Initial assessment and suspected conditions…"
                  style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6 }} />
              </FieldLabel>
            </div>

            {/* Session Notes */}
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel label="Session Notes" action={
                <VoiceButton isRecording={isRecording && recordingField === 'sessionNotes'}
                  onStart={() => startRecording('sessionNotes')} onStop={stopRecording} />
              }>
                <textarea value={sessionData.sessionNotes}
                  onChange={e => setSessionData({ ...sessionData, sessionNotes: e.target.value })}
                  rows={3} placeholder="Additional notes, plan of care…"
                  style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6 }} />
              </FieldLabel>
            </div>

            {/* Prescriptions */}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Pill size={14} color={T.textSm} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.textMd }}>Prescriptions</span>
                  {prescriptions.length > 0 && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
                      background: T.badge.green.bg, color: T.badge.green.text, border: `1px solid ${T.badge.green.border}`,
                    }}>{prescriptions.length}</span>
                  )}
                </div>
                <button onClick={() => setShowPrescriptionForm(s => !s)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                  background: T.primary, color: '#fff', border: `1px solid ${T.primary}`, cursor: 'pointer',
                }}>
                  <Plus size={12} /> Add Prescription
                </button>
              </div>

              {showPrescriptionForm && (
                <div style={{ marginBottom: 14, padding: 16, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                    {[['Medication name *','medication'],['Dosage (e.g. 500mg) *','dosage'],['Frequency','frequency'],['Duration','duration']].map(([ph, key]) => (
                      <input key={key} type="text" placeholder={ph}
                        value={currentRx[key]}
                        onChange={e => setCurrentRx(r => ({ ...r, [key]: e.target.value }))}
                        style={inputStyle()} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {prescriptionTemplates.map(t => (
                      <button key={t.medication} onClick={() => setCurrentRx(t)} style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12,
                        border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', color: T.textMd,
                      }} title={`${t.medication} ${t.dosage}`}>{t.medication}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={addPrescription} style={{
                      padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: T.primary, color: '#fff', border: `1px solid ${T.primary}`, cursor: 'pointer',
                    }}>Add to List</button>
                    <button onClick={() => { setShowPrescriptionForm(false); setCurrentRx({ medication: '', dosage: '', frequency: '', duration: '' }); }} style={{
                      padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: `1px solid ${T.border}`, background: T.surface, color: T.textMd, cursor: 'pointer',
                    }}>Cancel</button>
                  </div>
                </div>
              )}

              {prescriptions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {prescriptions.map(rx => (
                    <div key={rx._key} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderRadius: 8,
                      background: T.badge.green.bg, border: `1px solid ${T.badge.green.border}`,
                    }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: T.text }}>{rx.medication} — {rx.dosage}</span>
                        {(rx.frequency || rx.duration) && (
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: T.textSm }}>
                            {rx.frequency}{rx.duration ? ` for ${rx.duration}` : ''}
                          </p>
                        )}
                      </div>
                      <button onClick={() => setPrescriptions(prev => prev.filter(p => p._key !== rx._key))} style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: T.badge.red.bg, color: T.badge.red.text, border: `1px solid ${T.badge.red.border}`, cursor: 'pointer',
                      }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 24px', borderTop: `1px solid ${T.border}`, background: T.bg,
          display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={onSave} disabled={loading} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              border: `1px solid ${T.border}`, background: T.surface, color: T.textMd,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1,
            }} title="Save (Ctrl+S)">
              {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
              Save Progress
            </button>
            <button onClick={onRequestLabs} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              border: `1px solid ${T.border}`, background: T.surface, color: T.textMd, cursor: 'pointer',
            }} title="Request Labs (Ctrl+L)">
              <FlaskConical size={14} /> Request Labs
            </button>
            <button onClick={onViewResults} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              border: `1px solid ${T.border}`, background: T.surface, color: T.textMd, cursor: 'pointer',
            }}>
              <Eye size={14} /> View Lab Results
            </button>
          </div>

          <button onClick={onFinalize} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            border: `1px solid ${T.primary}`, background: T.primary, color: '#fff', cursor: 'pointer',
          }} title="Finalize (Ctrl+F)">
            <CheckCircle size={14} /> Finalize Medical Record
          </button>
        </div>

      </div>
    </div>
  );
};

export default SessionModal;