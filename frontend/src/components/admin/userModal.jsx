// components/admin/UserModal.jsx
//
// DOCTOR FIELD AUDIT vs Doctor.js model:
// ─────────────────────────────────────────────────────────────────────────────
// Field              Model type              Before          After
// ─────────────────────────────────────────────────────────────────────────────
// specialization     String (required)       ✅ text input   ✅ unchanged
// clinic             ObjectId ref Clinic     ✅ select        ✅ unchanged
// qualifications     [{degree,institution,   ❌ plain         ✅ dynamic rows
//                    year}]                    textarea         (add/remove)
// bio                String max 1000         ✅ textarea      ✅ unchanged
// consultationFee    Number                  ❌ MISSING       ✅ number input
// experience         Number (years)          ❌ MISSING       ✅ number input
// languages          [String]                ❌ MISSING       ✅ tag input
// certifications     [String]                ❌ MISSING       ✅ tag input
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: rating / totalReviews are system-managed (aggregated) — not editable.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import axiosClient from '../../api/axiosClient';

// ── Constants ──────────────────────────────────────────────────────────────────

const LAB_SPECIALIZATIONS = [
  'Clinical Pathology', 'Hematology', 'Microbiology', 'Biochemistry',
  'Immunology', 'Molecular Biology', 'Cytology', 'Histopathology',
  'General Laboratory', 'Other',
];

const PHARMACY_SPECIALIZATIONS = [
  'Clinical Pharmacy', 'Hospital Pharmacy', 'Community Pharmacy',
  'Pharmaceutical Care', 'Drug Information', 'Oncology Pharmacy',
  'Pediatric Pharmacy', 'Geriatric Pharmacy', 'Other',
];

const PHARMACY_ROLES = ['Pharmacist', 'Pharmacy Technician', 'Pharmacy Assistant'];

// ── TagInput ───────────────────────────────────────────────────────────────────
// Renders a list of string tags with an inline add-field and remove buttons.
// value   : string[]
// onChange: (newArray: string[]) => void
const TagInput = ({ value = [], onChange, placeholder = 'Add item...', label }) => {
  const [draft, setDraft] = useState('');

  const add = () => {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setDraft('');
  };

  const remove = (idx) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div>
      {label && <label className="block text-sm font-medium mb-2">{label}</label>}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-teal-500"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
        >
          Add
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {value.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 text-teal-800 rounded-full text-xs">
              {tag}
              <button type="button" onClick={() => remove(i)} className="hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ── QualificationRows ──────────────────────────────────────────────────────────
// Manages the qualifications array: [{degree, institution, year}]
const QualificationRows = ({ value = [], onChange }) => {
  const addRow    = () => onChange([...value, { degree: '', institution: '', year: '' }]);
  const removeRow = (idx) => onChange(value.filter((_, i) => i !== idx));
  const updateRow = (idx, field, val) =>
    onChange(value.map((row, i) => (i === idx ? { ...row, [field]: val } : row)));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium">Qualifications</label>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900 font-medium"
        >
          <Plus className="w-3 h-3" /> Add qualification
        </button>
      </div>

      {value.length === 0 && (
        <p className="text-xs text-gray-400 italic">No qualifications added yet.</p>
      )}

      <div className="space-y-2">
        {value.map((row, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_5rem_2rem] gap-2 items-center">
            <input
              type="text"
              placeholder="Degree (e.g. MBChB)"
              value={row.degree}
              onChange={(e) => updateRow(idx, 'degree', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-teal-500"
            />
            <input
              type="text"
              placeholder="Institution"
              value={row.institution}
              onChange={(e) => updateRow(idx, 'institution', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-teal-500"
            />
            <input
              type="number"
              placeholder="Year"
              min="1950"
              max={new Date().getFullYear()}
              value={row.year}
              onChange={(e) => updateRow(idx, 'year', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="flex items-center justify-center text-red-400 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main Modal ─────────────────────────────────────────────────────────────────

const UserModal = ({ show, onClose, onSubmit, formData, handleFormChange, loading, mode = 'add' }) => {
  const isEdit = mode === 'edit';
  const [showPassword, setShowPassword] = useState(false);
  const [clinics, setClinics] = useState([]);
  const [clinicsLoading, setClinicsLoading] = useState(false);

  useEffect(() => {
    if (!show) return;
    const fetchClinics = async () => {
      try {
        setClinicsLoading(true);
        const response = await axiosClient.get('/clinics');
        const list = Array.isArray(response.data) ? response.data : (response.data.clinics || []);
        setClinics(list);
      } catch (err) {
        console.error('Failed to load clinics:', err);
        setClinics([]);
      } finally {
        setClinicsLoading(false);
      }
    };
    fetchClinics();
  }, [show]);

  if (!show) return null;

  // Safe array getter — handles the case where the field is still a plain string
  // (e.g. when editing an older record before the migration).
  const getArr = (field) => {
    const v = formData[field];
    if (Array.isArray(v)) return v;
    return [];
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200 flex justify-between items-center rounded-t-xl z-10">
          <h3 className="text-lg font-semibold">
            {isEdit ? 'Edit User' : 'Add New User'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">

          {/* ── Core Fields ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">First Name *</label>
              <input
                type="text" required
                value={formData.firstName}
                onChange={(e) => handleFormChange('firstName', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Last Name *</label>
              <input
                type="text" required
                value={formData.lastName}
                onChange={(e) => handleFormChange('lastName', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Email *</label>
            <input
              type="email" required
              value={formData.email}
              onChange={(e) => handleFormChange('email', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
              placeholder="john.doe@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Phone *</label>
            <input
              type="tel" required
              placeholder="+2547XXXXXXX"
              value={formData.phoneNumber}
              onChange={(e) => handleFormChange('phoneNumber', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
            />
          </div>

          {/* Password — add mode only */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium mb-2">Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required minLength="6"
                  value={formData.password}
                  onChange={(e) => handleFormChange('password', e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                  placeholder="Minimum 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Do not share this password by email — deliver it directly to the user.
              </p>
            </div>
          )}

          {/* Role selector */}
          <div>
            <label className="block text-sm font-medium mb-2">Role *</label>
            <select
              value={formData.role}
              onChange={(e) => handleFormChange('role', e.target.value)}
              disabled={isEdit}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black ${isEdit ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
            >
              <option value="patient">Patient</option>
              <option value="doctor">Doctor</option>
              <option value="admin">Admin</option>
              <option value="lab_personnel">Lab Personnel</option>
              <option value="pharmacy_staff">Pharmacy Staff</option>
            </select>
            {isEdit && (
              <p className="mt-1 text-xs text-gray-500">
                Role cannot be changed after creation. To reassign, delete and recreate the user.
              </p>
            )}
          </div>

          {/* ── Patient Fields ────────────────────────────────────────────────── */}
          {formData.role === 'patient' && (
            <div className="space-y-4 border border-blue-100 bg-blue-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-800">Patient Details</h4>
              <div>
                <label className="block text-sm font-medium mb-2">Date of Birth *</label>
                <input
                  type="date" required
                  value={formData.dateOfBirth}
                  onChange={(e) => handleFormChange('dateOfBirth', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Address</label>
                <input
                  type="text" placeholder="123 Main St"
                  value={formData.address}
                  onChange={(e) => handleFormChange('address', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Emergency Contact Name *</label>
                <input
                  type="text" required={!isEdit} placeholder="Jane Doe"
                  value={formData.emergencyContactName}
                  onChange={(e) => handleFormChange('emergencyContactName', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Emergency Contact Phone *</label>
                <input
                  type="tel" required={!isEdit} placeholder="+2547XXXXXXX"
                  value={formData.emergencyContactPhone}
                  onChange={(e) => handleFormChange('emergencyContactPhone', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                />
              </div>
            </div>
          )}

          {/* ── Doctor Fields ─────────────────────────────────────────────────── */}
          {formData.role === 'doctor' && (
            <div className="space-y-5 border border-teal-100 bg-teal-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-teal-800">Doctor Details</h4>

              {/* Specialization */}
              <div>
                <label className="block text-sm font-medium mb-2">Specialization *</label>
                <input
                  type="text" required
                  placeholder="e.g. Cardiology, Dermatology"
                  value={formData.specialization}
                  onChange={(e) => handleFormChange('specialization', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Clinic */}
              <div>
                <label className="block text-sm font-medium mb-2">Clinic</label>
                <select
                  value={formData.clinic}
                  onChange={(e) => handleFormChange('clinic', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500"
                  disabled={clinicsLoading}
                >
                  <option value="">{clinicsLoading ? 'Loading clinics...' : 'Select clinic (optional)'}</option>
                  {clinics.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Consultation Fee + Experience */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Consultation Fee (KES)</label>
                  <input
                    type="number" min="0" step="50"
                    placeholder="e.g. 2000"
                    value={formData.consultationFee ?? ''}
                    onChange={(e) => handleFormChange('consultationFee', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Years of Experience</label>
                  <input
                    type="number" min="0" max="60"
                    placeholder="e.g. 5"
                    value={formData.experience ?? ''}
                    onChange={(e) => handleFormChange('experience', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Qualifications — structured rows matching {degree, institution, year} */}
              <QualificationRows
                value={getArr('qualifications')}
                onChange={(val) => handleFormChange('qualifications', val)}
              />

              {/* Languages */}
              <TagInput
                label="Languages Spoken"
                value={getArr('languages')}
                onChange={(val) => handleFormChange('languages', val)}
                placeholder="e.g. English, Swahili"
              />

              {/* Certifications */}
              <TagInput
                label="Certifications"
                value={getArr('certifications')}
                onChange={(val) => handleFormChange('certifications', val)}
                placeholder="e.g. ACLS, BLS"
              />

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Bio
                  <span className="ml-1 text-xs font-normal text-gray-400">(max 1000 chars)</span>
                </label>
                <textarea
                  rows="3"
                  maxLength={1000}
                  value={formData.bio}
                  onChange={(e) => handleFormChange('bio', e.target.value)}
                  placeholder="Brief professional summary..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 resize-none"
                />
                <p className="text-right text-xs text-gray-400 mt-1">
                  {(formData.bio || '').length}/1000
                </p>
              </div>
            </div>
          )}

          {/* ── Lab Personnel Fields ─────────────────────────────────────────── */}
          {formData.role === 'lab_personnel' && (
            <div className="space-y-4 border border-purple-100 bg-purple-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-purple-800">Lab Personnel Details</h4>
              <div>
                <label className="block text-sm font-medium mb-2">Lab Specialization *</label>
                <select
                  required
                  value={formData.labSpecialization}
                  onChange={(e) => handleFormChange('labSpecialization', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select specialization...</option>
                  {LAB_SPECIALIZATIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Clinic *</label>
                <select
                  required
                  value={formData.clinic}
                  onChange={(e) => handleFormChange('clinic', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                  disabled={clinicsLoading}
                >
                  <option value="">{clinicsLoading ? 'Loading clinics...' : 'Select clinic'}</option>
                  {clinics.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Years of Experience</label>
                <input
                  type="number" min="0" max="50"
                  value={formData.yearsOfExperience}
                  onChange={(e) => handleFormChange('yearsOfExperience', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Assigned Labs</label>
                <input
                  type="text"
                  value={formData.assignedLabs}
                  onChange={(e) => handleFormChange('assignedLabs', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                  placeholder="Comma-separated lab names"
                />
              </div>
            </div>
          )}

          {/* ── Pharmacy Staff Fields ─────────────────────────────────────────── */}
          {formData.role === 'pharmacy_staff' && (
            <div className="space-y-4 border border-orange-100 bg-orange-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-orange-800">Pharmacy Staff Details</h4>
              <div>
                <label className="block text-sm font-medium mb-2">Pharmacy Role *</label>
                <select
                  required
                  value={formData.pharmacyRole}
                  onChange={(e) => handleFormChange('pharmacyRole', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select role...</option>
                  {PHARMACY_ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">License Number *</label>
                  <input
                    type="text" required
                    value={formData.licenseNumber}
                    onChange={(e) => handleFormChange('licenseNumber', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                    placeholder="e.g. RPH-12345"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">License Expiry *</label>
                  <input
                    type="date" required
                    value={formData.licenseExpiry}
                    onChange={(e) => handleFormChange('licenseExpiry', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Clinic *</label>
                <select
                  required
                  value={formData.clinic}
                  onChange={(e) => handleFormChange('clinic', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500"
                  disabled={clinicsLoading}
                >
                  <option value="">{clinicsLoading ? 'Loading clinics...' : 'Select clinic'}</option>
                  {clinics.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Specializations</label>
                <div className="grid grid-cols-2 gap-2">
                  {PHARMACY_SPECIALIZATIONS.map(s => (
                    <label key={s} className="flex items-center space-x-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(formData.pharmacySpecializations || '').split(',').map(x => x.trim()).includes(s)}
                        onChange={(e) => {
                          const current = formData.pharmacySpecializations
                            ? formData.pharmacySpecializations.split(',').map(x => x.trim()).filter(Boolean)
                            : [];
                          const updated = e.target.checked ? [...current, s] : current.filter(x => x !== s);
                          handleFormChange('pharmacySpecializations', updated.join(','));
                        }}
                        className="rounded"
                      />
                      <span>{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                  {isEdit ? 'Updating...' : 'Creating...'}
                </>
              ) : isEdit ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserModal;