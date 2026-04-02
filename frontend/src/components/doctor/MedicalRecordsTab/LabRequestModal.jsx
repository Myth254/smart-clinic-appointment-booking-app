import React from 'react';
import { X, FlaskConical, Plus, Send } from 'lucide-react';

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
    red:  { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
    blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  },
};

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
  border: `1px solid ${T.border}`, background: T.surface,
  color: T.text, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const FieldLabel = ({ label, children }) => (
  <div style={{ marginBottom: 18 }}>
    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.textMd, marginBottom: 6 }}>
      {label}
    </label>
    {children}
  </div>
);

const LabRequestModal = ({
  isOpen,
  onClose,
  labRequestForm,
  setLabRequestForm,
  newTest,
  setNewTest,
  onAddTest,
  onRemoveTest,
  onSubmit,
  loading,
  commonLabTests,
}) => {
  if (!isOpen) return null;

  // ── Bug 2 fix: quick-select must push a fully-formed test object directly
  // rather than calling setNewTest() + onAddTest() in sequence.
  // setNewTest() is async (React state batching) so onAddTest() would read
  // the stale prior value of newTest, producing a blank or wrong entry.
  const handleQuickAdd = (testName, category) => {
    const alreadyAdded = labRequestForm.tests.some(
      t => t.testName === testName
    );
    if (alreadyAdded) return;
    setLabRequestForm(prev => ({
      ...prev,
      tests: [
        ...prev.tests,
        {
          id:           Date.now(),
          testName,
          // Bug 1 fix: use schema field names (category, specimenType)
          // instead of testType / specimen which are never stored.
          category,
          specimenType: '',
          instructions: '',
        },
      ],
    }));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: T.surface, borderRadius: 14, width: '100%', maxWidth: 720,
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
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Request Laboratory Tests</h3>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: T.textSm }}>Add tests for this patient</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8,
            display: 'flex', alignItems: 'center', color: T.textSm,
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {/* Priority */}
          <FieldLabel label="Priority Level">
            <select
              value={labRequestForm.priority}
              onChange={e => setLabRequestForm({ ...labRequestForm, priority: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="emergency">Emergency</option>
            </select>
          </FieldLabel>

          {/* Quick select */}
          <FieldLabel label="Quick Select Common Tests">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {commonLabTests.map(category => (
                <div key={category.category} style={{
                  border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 16px',
                }}>
                  <p style={{
                    margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: T.textXs,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}>{category.category}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {category.tests.map(test => {
                      const added = labRequestForm.tests.some(t => t.testName === test);
                      return (
                        <button
                          key={test}
                          onClick={() => handleQuickAdd(test, category.category)}
                          disabled={added}
                          style={{
                            textAlign: 'left', padding: '7px 12px', borderRadius: 7,
                            cursor: added ? 'default' : 'pointer',
                            border: `1px solid ${added ? T.badge.blue.border : T.border}`,
                            background: added ? T.badge.blue.bg : T.surface,
                            fontSize: 13, color: added ? T.badge.blue.text : T.textMd,
                            transition: 'background 0.12s, border-color 0.12s',
                          }}
                          onMouseEnter={e => { if (!added) { e.currentTarget.style.background = T.bg; e.currentTarget.style.borderColor = T.textXs; } }}
                          onMouseLeave={e => { if (!added) { e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = T.border; } }}
                        >
                          {test}{added ? ' ✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </FieldLabel>

          {/* Custom test — now uses schema-correct field names */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18, marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.textMd, marginBottom: 8 }}>
              Or Add Custom Test
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Test name"
                value={newTest.testName}
                onChange={e => setNewTest({ ...newTest, testName: e.target.value })}
                style={{ ...inputStyle, flex: 2 }}
              />
              {/* Bug 1 fix: field renamed from `specimen` to `specimenType` to match schema */}
              <input
                type="text"
                placeholder="Specimen type"
                value={newTest.specimenType || ''}
                onChange={e => setNewTest({ ...newTest, specimenType: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={onAddTest}
                style={{
                  flexShrink: 0, padding: '9px 14px', borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.bg, cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <Plus size={15} color={T.textMd} />
              </button>
            </div>
          </div>

          {/* Selected tests */}
          {labRequestForm.tests.length > 0 && (
            <FieldLabel label={`Selected Tests (${labRequestForm.tests.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {labRequestForm.tests.map(test => (
                  <div key={test.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: 8,
                    background: T.badge.blue.bg, border: `1px solid ${T.badge.blue.border}`,
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13, color: T.text }}>{test.testName}</span>
                      {/* Bug 1 fix: read specimenType (schema name), not specimen */}
                      {test.specimenType && (
                        <span style={{ fontSize: 12, color: T.textSm, marginLeft: 8 }}>Specimen: {test.specimenType}</span>
                      )}
                      {test.category && (
                        <span style={{ fontSize: 12, color: T.textSm, marginLeft: 8 }}>· {test.category}</span>
                      )}
                    </div>
                    <button
                      onClick={() => onRemoveTest(test.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: T.badge.red.text, padding: 2, display: 'flex',
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </FieldLabel>
          )}

          {/* Clinical notes */}
          <FieldLabel label="Clinical Notes for Lab">
            <textarea
              value={labRequestForm.clinicalNotes}
              onChange={e => setLabRequestForm({ ...labRequestForm, clinicalNotes: e.target.value })}
              rows={3}
              placeholder="Relevant clinical information…"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </FieldLabel>

          {/* Provisional diagnosis */}
          <FieldLabel label="Provisional Diagnosis">
            <input
              type="text"
              value={labRequestForm.provisionalDiagnosis}
              onChange={e => setLabRequestForm({ ...labRequestForm, provisionalDiagnosis: e.target.value })}
              placeholder="Suspected diagnosis…"
              style={inputStyle}
            />
          </FieldLabel>

        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: `1px solid ${T.border}`,
          background: T.bg, display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              border: `1px solid ${T.border}`, background: T.surface, color: T.textMd, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={loading || labRequestForm.tests.length === 0}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              border: `1px solid ${T.primary}`, background: T.primary, color: '#fff',
              cursor: (loading || labRequestForm.tests.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (loading || labRequestForm.tests.length === 0) ? 0.5 : 1,
            }}
          >
            <Send size={14} />
            Submit Lab Request
          </button>
        </div>
      </div>
    </div>
  );
};

export default LabRequestModal;