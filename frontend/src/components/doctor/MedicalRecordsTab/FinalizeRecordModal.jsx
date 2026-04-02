/* eslint-disable no-empty */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import {
  X, FileText, Plus, Info, CheckCircle,
  Printer, FileDown, Mic, MicOff, Loader2,
  Activity, Thermometer, FlaskConical, AlertCircle,
  ChevronDown, ChevronUp, Eye, Pill, Stethoscope,
  ClipboardList, User, Calendar, Clock,
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Design tokens ─────────────────────────────────────────────────────────────
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
    sky:    { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
    amber:  { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    gray:   { bg: '#f5f5f5', text: '#525252', border: '#d4d4d4' },
    purple: { bg: '#faf5ff', text: '#6b21a8', border: '#e9d5ff' },
  },
};

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
  border: `1px solid ${T.border}`, background: T.surface,
  color: T.text, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

const readonlyStyle = {
  ...inputStyle,
  background: T.bg,
  color: T.textMd,
  cursor: 'default',
  resize: 'none',
};

const FieldLabel = ({ label, required, children, action, hint }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: T.textMd }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {action}
    </div>
    {hint && <p style={{ margin: '0 0 6px', fontSize: 12, color: T.textSm }}>{hint}</p>}
    {children}
  </div>
);

const VoiceButton = ({ active, onToggle }) => (
  <button onClick={onToggle} style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600,
    background: active ? T.badge.red.bg : T.badge.blue.bg,
    color: active ? T.badge.red.text : T.badge.blue.text,
    border: `1px solid ${active ? T.badge.red.border : T.badge.blue.border}`,
    cursor: 'pointer',
    animation: active ? 'pulse 1.5s ease-in-out infinite' : 'none',
  }}>
    {active ? <MicOff size={11} /> : <Mic size={11} />}
    {active ? 'Stop' : 'Voice'}
  </button>
);

// ─── Vital badge (read-only display) ──────────────────────────────────────────
const VitalBadge = ({ label, value, unit }) => {
  if (!value) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: '8px 12px', borderRadius: 8,
      background: T.surface, border: `1px solid ${T.border}`,
      minWidth: 80,
    }}>
      <span style={{ fontSize: 11, color: T.textXs, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
        {value}<span style={{ fontSize: 11, fontWeight: 400, color: T.textSm, marginLeft: 2 }}>{unit}</span>
      </span>
    </div>
  );
};

// ─── Section header for the summary panel ─────────────────────────────────────
const SummarySection = ({ icon: Icon, title, color = T.textSm, children, collapsible = false }) => {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: open ? 10 : 0,
          cursor: collapsible ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon size={13} color={color} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.textSm, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        </div>
        {collapsible && (open ? <ChevronUp size={13} color={T.textXs} /> : <ChevronDown size={13} color={T.textXs} />)}
      </div>
      {open && children}
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
const FinalizeRecordModal = ({
  isOpen,
  onClose,
  finalRecordData,
  setFinalRecordData,
  onSubmit,
  loading,
  selectedAppointment,
  sessionData,
  labResults = [],
}) => {
  const [showPrescriptionTemplates, setShowPrescriptionTemplates] = useState(false);
  const [isRecording, setIsRecording]       = useState(false);
  const [recordingField, setRecordingField] = useState(null);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [symptomInput, setSymptomInput] = useState('');

  // ✅ FIX: submit error state — surfaces backend errors in-modal rather than
  //    swallowing them. The parent's onSubmit should throw on failure so we
  //    can catch and display it here without closing the modal.
  const [submitError, setSubmitError] = useState(null);

  const prescriptionTemplates = [
    { medication: 'Amoxicillin',  dosage: '500mg',  frequency: '3 times daily',              duration: '7 days',  instructions: 'Take with food' },
    { medication: 'Paracetamol',  dosage: '500mg',  frequency: 'Every 6 hours as needed',    duration: '5 days',  instructions: 'Do not exceed 4 g per day' },
    { medication: 'Ibuprofen',    dosage: '400mg',  frequency: '3 times daily',              duration: '5 days',  instructions: 'Take with food' },
    { medication: 'Omeprazole',   dosage: '20mg',   frequency: 'Once daily before breakfast', duration: '14 days', instructions: 'Take 30 min before food' },
    { medication: 'Metformin',    dosage: '500mg',  frequency: 'Twice daily with meals',     duration: '30 days', instructions: 'Start with lower dose' },
    { medication: 'Lisinopril',   dosage: '10mg',   frequency: 'Once daily',                 duration: '30 days', instructions: 'Take at same time daily' },
    { medication: 'Azithromycin', dosage: '500mg',  frequency: 'Once daily',                 duration: '3 days',  instructions: 'Complete full course' },
    { medication: 'Cetirizine',   dosage: '10mg',   frequency: 'Once daily',                 duration: '7 days',  instructions: 'May cause drowsiness' },
  ];

  // ── Voice recognition ──────────────────────────────────────────────────────
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR || !isRecording || !recordingField) return;
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = 'en-US';
    r.onresult = event => {
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript + ' ';
      }
      if (final) setFinalRecordData(prev => ({ ...prev, [recordingField]: (prev[recordingField] || '') + final }));
    };
    r.onerror = () => setIsRecording(false);
    r.onend   = () => setIsRecording(false);
    r.start();
    return () => { try { r.stop(); } catch (_) {} };
  }, [isRecording, recordingField, setFinalRecordData]);

  const toggleRecording = field => {
    if (isRecording && recordingField === field) { setIsRecording(false); setRecordingField(null); }
    else { setIsRecording(true); setRecordingField(field); }
  };

  // ── On open: seed finalRecordData from sessionData only if fields are empty ──
  React.useEffect(() => {
    if (!isOpen) return;
    // Clear any previous submission errors when modal re-opens
    setSubmitError(null);

    const sessionRx = (sessionData?.prescriptions || []).map(p => ({
      medication: p.medication || '', dosage: p.dosage || '',
      frequency: p.frequency || '', duration: p.duration || '', instructions: p.instructions || '',
    }));
    if (sessionRx.length === 0) return;
    setFinalRecordData(prev => {
      const existing = new Set(prev.prescription.map(p => p.medication?.toLowerCase()));
      const toAdd = sessionRx.filter(p => !existing.has(p.medication?.toLowerCase()));
      if (toAdd.length === 0) return prev;
      return { ...prev, prescription: [...prev.prescription, ...toAdd] };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── ✅ FIX: Wrapped submit handler that builds the correct payload shape ──
  //
  // ROOT CAUSE of the 500: The controller's finalizeMedicalRecord expects:
  //
  //   prescriptionData: {
  //     medications: [{ medication, dosage, frequency, duration, instructions }],
  //     generalInstructions: string,
  //     warnings: [],
  //     refillsAllowed: number,
  //     validUntil: ISO string
  //   }
  //
  // But FinalizeRecordModal was storing medications in `finalRecordData.prescription`
  // (a flat array of objects) and the parent was forwarding `finalRecordData` directly
  // to the API, meaning the backend received `prescription[]` instead of
  // `prescriptionData.medications[]`, so prescriptionData?.medications?.length was
  // always 0 — the prescription block was skipped but the notification block still ran
  // with type:'prescription_created' which isn't a valid Notification.type enum.
  //
  // This handler:
  //   1. Strips internal-only fields (_key) from each medication row
  //   2. Wraps the flat array under prescriptionData.medications
  //   3. Maps finalRecordData.diagnosis → finalDiagnosis (the field name the
  //      controller destructures)
  //   4. Passes symptoms[] through correctly
  //   5. Catches errors and surfaces them in-modal without closing
  const handleSubmit = async () => {
    setSubmitError(null);

    // Strip React-only _key from medication rows before sending to backend
    const medications = (finalRecordData.prescription || [])
      .filter(m => m.medication?.trim())
      .map(({ _key, ...rest }) => rest);  // remove _key if present

    const payload = {
      // ✅ Controller destructures `finalDiagnosis`, NOT `diagnosis`
      finalDiagnosis:    finalRecordData.diagnosis,
      clinicalSummary:   finalRecordData.notes,         // notes → clinicalSummary
      treatmentPlan:     finalRecordData.treatmentPlan,
      dischargeNotes:    finalRecordData.dischargeNotes || '',
      symptoms:          finalRecordData.symptoms || [],
      followUpRequired:  finalRecordData.followUpRequired,
      followUpDate:      finalRecordData.followUpDate || null,

      // ✅ Wrap medications under prescriptionData.medications as the controller expects
      prescriptionData: medications.length > 0
        ? {
            medications,
            generalInstructions: finalRecordData.generalInstructions || '',
            warnings:            [],
            refillsAllowed:      0,
            validUntil:          null,  // controller defaults to 30 days
          }
        : null,
    };

    try {
      await onSubmit(payload);
      // onSubmit should close the modal on success — nothing else needed here
    } catch (err) {
      // Modal stays open; error is shown inline so no data is lost
      setSubmitError(err?.response?.data?.message || err?.message || 'Finalization failed. Please try again.');
    }
  };

  // ── Print ──────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const win = window.open('', '_blank');
    const vRow = (label, value, unit) =>
      value ? `<div class="vital-box"><div class="vital-label">${label}</div><div class="vital-value">${value}${unit ? ' ' + unit : ''}</div></div>` : '';
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Medical Record — ${selectedAppointment?.patient?.firstName} ${selectedAppointment?.patient?.lastName}</title>
      <style>body{font-family:Arial,sans-serif;margin:40px;line-height:1.6}.header{text-align:center;border-bottom:3px solid #000;padding-bottom:20px;margin-bottom:30px}.section{margin-bottom:25px;page-break-inside:avoid}.section h2{font-size:16px;border-bottom:2px solid #333;padding-bottom:5px;margin-bottom:10px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.info-label{font-weight:bold;color:#555}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ddd;padding:10px;text-align:left}th{background:#f5f5f5}.vitals-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.vital-box{border:1px solid #ddd;padding:10px;border-radius:5px}.vital-label{font-size:12px;color:#666}.vital-value{font-size:18px;font-weight:bold}.footer{margin-top:50px;padding-top:20px;border-top:2px solid #333}.sig{margin-top:40px;border-top:1px solid #000;width:300px}@media print{.no-print{display:none}}</style></head><body>
      <div class="header"><h1>MEDICAL RECORD</h1><p>Date: ${format(new Date(), 'MMMM dd, yyyy')}</p></div>
      <div class="section"><h2>Patient</h2><div class="info-grid"><div><span class="info-label">Name:</span> ${selectedAppointment?.patient?.firstName} ${selectedAppointment?.patient?.lastName}</div><div><span class="info-label">Phone:</span> ${selectedAppointment?.patient?.phoneNumber || 'N/A'}</div></div></div>
      ${sessionData?.vitalSigns ? `<div class="section"><h2>Vital Signs</h2><div class="vitals-grid">${vRow('Blood Pressure',sessionData.vitalSigns.bloodPressure,'mmHg')}${vRow('Heart Rate',sessionData.vitalSigns.heartRate,'bpm')}${vRow('Temperature',sessionData.vitalSigns.temperature,'°C')}${vRow('Weight',sessionData.vitalSigns.weight,'kg')}${vRow('SpO₂',sessionData.vitalSigns.oxygenSaturation,'%')}</div></div>` : ''}
      ${sessionData?.complaints ? `<div class="section"><h2>Chief Complaints</h2><p>${sessionData.complaints}</p></div>` : ''}
      ${sessionData?.clinicalObservations ? `<div class="section"><h2>Clinical Observations</h2><p>${sessionData.clinicalObservations}</p></div>` : ''}
      ${finalRecordData.diagnosis ? `<div class="section"><h2>Final Diagnosis</h2><p><strong>${finalRecordData.diagnosis}</strong></p></div>` : ''}
      ${finalRecordData.treatmentPlan ? `<div class="section"><h2>Treatment Plan</h2><p>${finalRecordData.treatmentPlan}</p></div>` : ''}
      ${finalRecordData.prescription.length > 0 ? `<div class="section"><h2>Prescription</h2><table><thead><tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead><tbody>${finalRecordData.prescription.map(m=>`<tr><td>${m.medication}</td><td>${m.dosage}</td><td>${m.frequency}</td><td>${m.duration}</td><td>${m.instructions||''}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${finalRecordData.notes ? `<div class="section"><h2>Clinical Notes</h2><p>${finalRecordData.notes}</p></div>` : ''}
      ${finalRecordData.followUpRequired ? `<div class="section"><h2>Follow-Up</h2><p>Required on: <strong>${finalRecordData.followUpDate ? format(new Date(finalRecordData.followUpDate), 'MMMM dd, yyyy') : 'TBD'}</strong></p></div>` : ''}
      <div class="footer"><div><span class="info-label">Physician:</span> Dr. ${selectedAppointment?.doctor?.firstName} ${selectedAppointment?.doctor?.lastName}</div><div class="sig"><p style="margin-top:5px;font-size:12px">Physician's Signature</p></div></div>
      <div class="no-print" style="margin-top:30px;text-align:center"><button onclick="window.print()" style="padding:10px 20px;font-size:16px;cursor:pointer">Print</button></div>
    </body></html>`);
    win.document.close();
    win.focus();
  };

  if (!isOpen) return null;

  const rxCount = finalRecordData.prescription.filter(p => p.medication?.trim()).length;
  const vs = sessionData?.vitalSigns || {};
  const hasVitals = Object.values(vs).some(v => v);
  const completedLabs = labResults.filter(l => l.status === 'completed');

  // Validation
  const diagnosisEmpty = !finalRecordData.diagnosis?.trim();

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform: translateY(0) } }
      `}</style>

      <div style={{
        background: T.surface, borderRadius: 16, width: '100%', maxWidth: 1060,
        maxHeight: '94vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,0.22)',
        animation: 'fadeIn 0.18s ease-out',
      }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '16px 24px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: T.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileText size={17} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Finalize Medical Record</h3>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: T.textSm }}>
                Review session summary, confirm and complete the record
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={handlePrint} title="Print record" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${T.border}`, background: T.bg, color: T.textMd, cursor: 'pointer',
            }}>
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose} style={{
              padding: 7, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: T.textSm,
            }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── ✅ NEW: Inline error banner — visible when submit fails ──────── */}
        {submitError && (
          <div style={{
            margin: '0 24px', marginTop: 12, padding: '10px 16px',
            borderRadius: 10, background: T.badge.red.bg,
            border: `1px solid ${T.badge.red.border}`,
            display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0,
          }}>
            <AlertCircle size={15} color={T.badge.red.text} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.badge.red.text }}>
                Finalization failed
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: T.badge.red.text, opacity: 0.85 }}>
                {submitError}
              </p>
            </div>
            <button
              onClick={() => setSubmitError(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
            >
              <X size={14} color={T.badge.red.text} />
            </button>
          </div>
        )}

        {/* ── Body: two-column layout ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── LEFT: Session summary (read-only reference) ──────────────── */}
          <div style={{
            width: 340, flexShrink: 0,
            borderRight: `1px solid ${T.border}`,
            overflowY: 'auto',
            background: T.bg,
            padding: '20px 20px',
          }}>
            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Eye size={13} color={T.textSm} />
                <span style={{ fontSize: 12, fontWeight: 700, color: T.textSm, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Session Summary
                </span>
              </div>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 99,
                background: T.badge.gray.bg, color: T.badge.gray.text, border: `1px solid ${T.badge.gray.border}`,
                fontWeight: 600,
              }}>Read-only</span>
            </div>

            {/* Patient info */}
            <SummarySection icon={User} title="Patient">
              <div style={{
                padding: '10px 12px', borderRadius: 8, background: T.surface,
                border: `1px solid ${T.border}`, fontSize: 13,
              }}>
                <div style={{ fontWeight: 600, color: T.text, marginBottom: 2 }}>
                  {selectedAppointment?.patient?.firstName} {selectedAppointment?.patient?.lastName}
                </div>
                <div style={{ color: T.textSm, fontSize: 12 }}>
                  {selectedAppointment?.patient?.phoneNumber || '—'}
                </div>
              </div>
            </SummarySection>

            {/* Vital signs */}
            {hasVitals && (
              <SummarySection icon={Thermometer} title="Vital Signs" collapsible>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <VitalBadge label="BP"    value={vs.bloodPressure}    unit="mmHg" />
                  <VitalBadge label="HR"    value={vs.heartRate}        unit="bpm" />
                  <VitalBadge label="Temp"  value={vs.temperature}      unit="°C" />
                  <VitalBadge label="Wt"    value={vs.weight}           unit="kg" />
                  <VitalBadge label="Ht"    value={vs.height}           unit="cm" />
                  <VitalBadge label="RR"    value={vs.respiratoryRate}  unit="/min" />
                  <VitalBadge label="SpO₂"  value={vs.oxygenSaturation} unit="%" />
                </div>
              </SummarySection>
            )}

            {/* Chief complaints */}
            {sessionData?.complaints && (
              <SummarySection icon={ClipboardList} title="Chief Complaints" collapsible>
                <div style={{
                  padding: '10px 12px', borderRadius: 8, background: T.surface,
                  border: `1px solid ${T.border}`, fontSize: 13, color: T.textMd,
                  lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {sessionData.complaints}
                </div>
              </SummarySection>
            )}

            {/* Clinical observations */}
            {sessionData?.clinicalObservations && (
              <SummarySection icon={Stethoscope} title="Clinical Observations" collapsible>
                <div style={{
                  padding: '10px 12px', borderRadius: 8, background: T.surface,
                  border: `1px solid ${T.border}`, fontSize: 13, color: T.textMd,
                  lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {sessionData.clinicalObservations}
                </div>
              </SummarySection>
            )}

            {/* Provisional diagnosis */}
            {sessionData?.provisionalDiagnosis && (
              <SummarySection icon={Activity} title="Provisional Diagnosis" collapsible>
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: T.badge.amber.bg, border: `1px solid ${T.badge.amber.border}`,
                  fontSize: 13, color: T.badge.amber.text, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {sessionData.provisionalDiagnosis}
                </div>
              </SummarySection>
            )}

            {/* Session notes */}
            {sessionData?.sessionNotes && (
              <SummarySection icon={FileText} title="Session Notes" collapsible>
                <div style={{
                  padding: '10px 12px', borderRadius: 8, background: T.surface,
                  border: `1px solid ${T.border}`, fontSize: 13, color: T.textMd,
                  lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {sessionData.sessionNotes}
                </div>
              </SummarySection>
            )}

            {/* Lab results */}
            {completedLabs.length > 0 && (
              <SummarySection icon={FlaskConical} title={`Lab Results (${completedLabs.length})`} collapsible>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {completedLabs.map((lab, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', borderRadius: 8, background: T.surface,
                      border: `1px solid ${T.border}`, fontSize: 12,
                    }}>
                      <div style={{ fontWeight: 600, color: T.text }}>{lab.testName || lab.requestNumber}</div>
                      {lab.results && (
                        <div style={{ color: T.textSm, marginTop: 2 }}>{lab.results}</div>
                      )}
                    </div>
                  ))}
                </div>
              </SummarySection>
            )}
          </div>

          {/* ── RIGHT: Editable finalization fields ──────────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

            {/* ── Diagnosis ── */}
            <FieldLabel
              label="Final Diagnosis"
              required
              hint="Review the provisional diagnosis on the left, then confirm or refine it here."
              action={<VoiceButton active={isRecording && recordingField === 'diagnosis'} onToggle={() => toggleRecording('diagnosis')} />}
            >
              <textarea
                value={finalRecordData.diagnosis}
                onChange={e => setFinalRecordData({ ...finalRecordData, diagnosis: e.target.value })}
                rows={3}
                placeholder="Confirmed diagnosis based on examination, observations, and lab results…"
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6,
                  border: diagnosisEmpty ? '1.5px solid #fca5a5' : `1px solid ${T.border}`,
                }}
              />
              {diagnosisEmpty && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 12, color: T.badge.red.text }}>
                  <AlertCircle size={12} /> Diagnosis is required to finalize
                </div>
              )}
            </FieldLabel>

            {/* ── Documented Symptoms ── */}
            <FieldLabel label="Documented Symptoms">
              <input
                type="text"
                placeholder="Type symptom and press Enter…"
                value={symptomInput}
                onChange={e => setSymptomInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && symptomInput.trim()) {
                    e.preventDefault();
                    setFinalRecordData(prev => ({
                      ...prev,
                      symptoms: [...prev.symptoms, symptomInput.trim()],
                    }));
                    setSymptomInput('');
                  }
                }}
                style={{ ...inputStyle, marginBottom: finalRecordData.symptoms.length ? 8 : 0 }}
              />
              {finalRecordData.symptoms.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {finalRecordData.symptoms.map((s, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 9999, fontSize: 13,
                      background: T.bg, border: `1px solid ${T.border}`, color: T.textMd,
                    }}>
                      {s}
                      <button
                        onClick={() => setFinalRecordData({ ...finalRecordData, symptoms: finalRecordData.symptoms.filter((_, idx) => idx !== i) })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                      >
                        <X size={11} color={T.textXs} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </FieldLabel>

            {/* ── Treatment Plan ── */}
            <FieldLabel
              label="Treatment Plan"
              hint="Outline the management steps: medication rationale, lifestyle changes, procedures ordered."
              action={<VoiceButton active={isRecording && recordingField === 'treatmentPlan'} onToggle={() => toggleRecording('treatmentPlan')} />}
            >
              <textarea
                value={finalRecordData.treatmentPlan || ''}
                onChange={e => setFinalRecordData({ ...finalRecordData, treatmentPlan: e.target.value })}
                rows={3}
                placeholder="Medications prescribed, lifestyle advice, referrals, planned procedures…"
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
            </FieldLabel>

            {/* ── Prescription ── */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Pill size={13} color={T.textSm} />
                  <label style={{ fontSize: 13, fontWeight: 600, color: T.textMd }}>
                    Prescription
                    {rxCount > 0 && (
                      <span style={{
                        marginLeft: 8, padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
                        background: T.badge.green.bg, color: T.badge.green.text, border: `1px solid ${T.badge.green.border}`,
                      }}>
                        {rxCount} med{rxCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setShowPrescriptionTemplates(s => !s)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${T.border}`, background: T.bg, color: T.textMd, cursor: 'pointer',
                    }}
                  >
                    <FileText size={12} /> Common Meds
                  </button>
                  <button
                    onClick={() => setFinalRecordData({
                      ...finalRecordData,
                      prescription: [...finalRecordData.prescription, { medication: '', dosage: '', frequency: '', duration: '', instructions: '' }],
                    })}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${T.border}`, background: T.bg, color: T.textMd, cursor: 'pointer',
                    }}
                  >
                    <Plus size={12} /> Add Custom
                  </button>
                </div>
              </div>

              {showPrescriptionTemplates && (
                <div style={{
                  marginBottom: 12, padding: 12, background: T.bg,
                  border: `1px solid ${T.border}`, borderRadius: 9,
                  maxHeight: 220, overflowY: 'auto',
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                }}>
                  {prescriptionTemplates.map((t, i) => (
                    <button key={i}
                      onClick={() => {
                        setFinalRecordData(prev => ({ ...prev, prescription: [...prev.prescription, t] }));
                        setShowPrescriptionTemplates(false);
                      }}
                      style={{
                        textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                        border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: T.text }}>{t.medication}</div>
                      <div style={{ fontSize: 11, color: T.textSm, marginTop: 2 }}>{t.dosage} · {t.frequency}</div>
                    </button>
                  ))}
                </div>
              )}

              {finalRecordData.prescription.map((med, idx) => (
                <div key={idx} style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr auto',
                  gap: 8, marginBottom: 8, alignItems: 'start',
                }}>
                  {[['Medication', 'medication'], ['Dosage', 'dosage'], ['Frequency', 'frequency'], ['Duration', 'duration']].map(([ph, field]) => (
                    <input key={field} type="text" placeholder={ph} value={med[field]}
                      onChange={e => {
                        const updated = [...finalRecordData.prescription];
                        updated[idx] = { ...updated[idx], [field]: e.target.value };
                        setFinalRecordData({ ...finalRecordData, prescription: updated });
                      }}
                      style={inputStyle}
                    />
                  ))}
                  <button
                    onClick={() => setFinalRecordData({ ...finalRecordData, prescription: finalRecordData.prescription.filter((_, i) => i !== idx) })}
                    style={{
                      padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${T.badge.red.border}`, background: T.badge.red.bg, color: T.badge.red.text,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* ── Clinical Notes ── */}
            <FieldLabel
              label="Clinical Notes"
              hint="Discharge notes, patient education, special instructions — kept distinct from the treatment plan."
              action={<VoiceButton active={isRecording && recordingField === 'notes'} onToggle={() => toggleRecording('notes')} />}
            >
              <textarea
                value={finalRecordData.notes}
                onChange={e => setFinalRecordData({ ...finalRecordData, notes: e.target.value })}
                rows={3}
                placeholder="Discharge instructions, patient education, warnings to watch for…"
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
            </FieldLabel>

            {/* ── Follow-up ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={finalRecordData.followUpRequired}
                  onChange={e => setFinalRecordData({ ...finalRecordData, followUpRequired: e.target.checked })}
                  style={{ width: 15, height: 15 }}
                />
                <span style={{ fontSize: 14, fontWeight: 500, color: T.textMd }}>Follow-up Required</span>
              </label>
              {finalRecordData.followUpRequired && (
                <input
                  type="date"
                  value={finalRecordData.followUpDate}
                  onChange={e => setFinalRecordData({ ...finalRecordData, followUpDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  style={{ ...inputStyle, width: 'auto' }}
                />
              )}
            </div>

            {/* ── What finalizing will do ── */}
            <div style={{
              background: T.badge.sky.bg, border: `1px solid ${T.badge.sky.border}`,
              borderRadius: 10, padding: '14px 18px',
            }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <Info size={15} color="#0369a1" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#0c4a6e' }}>
                    Finalizing will:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#075985', lineHeight: 1.9 }}>
                    <li>Close the active session and mark the appointment as completed</li>
                    {rxCount > 0 && <li>Send prescription ({rxCount} medication{rxCount !== 1 ? 's' : ''}) to pharmacy</li>}
                    <li>Save the full medical record to the database</li>
                    <li>Notify the patient that their record is available</li>
                  </ul>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 24px', borderTop: `1px solid ${T.border}`, background: T.bg,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: T.textSm }}>
            This record will be permanently saved. Ensure all information is accurate before confirming.
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{
              padding: '9px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              border: `1px solid ${T.border}`, background: T.surface, color: T.textMd, cursor: 'pointer',
            }}>
              Cancel
            </button>
            {/* ✅ FIX: button now calls handleSubmit (not onSubmit directly) so payload
                is correctly shaped before reaching the API */}
            <button
              onClick={handleSubmit}
              disabled={loading || diagnosisEmpty}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                border: `1px solid ${T.primary}`, background: T.primary, color: '#fff',
                cursor: (loading || diagnosisEmpty) ? 'not-allowed' : 'pointer',
                opacity: (loading || diagnosisEmpty) ? 0.5 : 1,
              }}
            >
              {loading ? (
                <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Finalizing…</>
              ) : (
                <><CheckCircle size={14} /> Finalize & Complete</>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FinalizeRecordModal;