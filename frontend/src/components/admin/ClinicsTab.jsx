/* eslint-disable react-hooks/exhaustive-deps */
// components/admin/ClinicsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, X, Building2, Phone, Mail, Globe,
  MapPin, Clock, ChevronDown, ChevronUp, BarChart2,
  Stethoscope, Edit2, Trash2, ToggleLeft, ToggleRight
} from 'lucide-react';
import { clinicAPI } from '../../api';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const STATUS_STYLES = {
  active:   'bg-green-100 text-green-800',
  inactive: 'bg-gray-100  text-gray-600',
};

const defaultHours = DAYS.map(day => ({
  day,
  openTime:  '08:00',
  closeTime: '17:00',
  isClosed:  day === 'Saturday' || day === 'Sunday',
}));

const emptyForm = {
  name:           '',
  email:          '',
  phoneNumber:    '',
  website:        '',
  description:    '',
  // address
  street:         '',
  city:           '',
  state:          '',
  zipCode:        '',
  country:        '',
  // structured sub-fields
  facilities:     '',        // comma-separated string in UI → array on submit
  operatingHours: defaultHours,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildPayload = (form) => ({
  name:        form.name.trim(),
  email:       form.email.trim(),
  phoneNumber: form.phoneNumber.trim(),
  website:     form.website.trim(),
  description: form.description.trim(),
  address: {
    street:  form.street.trim(),
    city:    form.city.trim(),
    state:   form.state.trim(),
    zipCode: form.zipCode.trim(),
    country: form.country.trim(),
  },
  facilities:     form.facilities
    ? form.facilities.split(',').map(f => f.trim()).filter(Boolean)
    : [],
  operatingHours: form.operatingHours,
});

const formFromClinic = (clinic) => ({
  name:        clinic.name        || '',
  email:       clinic.email       || '',
  phoneNumber: clinic.phoneNumber || '',
  website:     clinic.website     || '',
  description: clinic.description || '',
  street:      clinic.address?.street  || '',
  city:        clinic.address?.city    || '',
  state:       clinic.address?.state   || '',
  zipCode:     clinic.address?.zipCode || '',
  country:     clinic.address?.country || '',
  facilities:  (clinic.facilities || []).join(', '),
  operatingHours: DAYS.map(day => {
    const existing = (clinic.operatingHours || []).find(h => h.day === day);
    return existing
      ? { day, openTime: existing.openTime, closeTime: existing.closeTime, isClosed: existing.isClosed }
      : { day, openTime: '08:00', closeTime: '17:00', isClosed: false };
  }),
});

// ─── Clinic Modal ─────────────────────────────────────────────────────────────

const ClinicModal = ({ show, mode, form, onChange, onHoursChange, onSubmit, onClose, loading }) => {
  if (!show) return null;
  const isEdit = mode === 'edit';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-lg font-semibold">{isEdit ? 'Edit Clinic' : 'Add New Clinic'}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-6">

          {/* Basic Info */}
          <section>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Basic Information</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Clinic Name *</label>
                <input
                  required type="text" placeholder="e.g. Nairobi Medical Centre"
                  value={form.name}
                  onChange={e => onChange('name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Email *</label>
                  <input
                    required type="email" placeholder="clinic@example.com"
                    value={form.email}
                    onChange={e => onChange('email', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone *</label>
                  <input
                    required type="tel" placeholder="+2547XXXXXXXX"
                    value={form.phoneNumber}
                    onChange={e => onChange('phoneNumber', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Website</label>
                <input
                  type="url" placeholder="https://example.com"
                  value={form.website}
                  onChange={e => onChange('website', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  rows={3} placeholder="Brief description of the clinic..."
                  value={form.description}
                  onChange={e => onChange('description', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm resize-none"
                />
              </div>
            </div>
          </section>

          {/* Address */}
          <section>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Address</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Street *</label>
                <input
                  required type="text" placeholder="123 Moi Avenue"
                  value={form.street}
                  onChange={e => onChange('street', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">City *</label>
                  <input
                    required type="text" placeholder="Nairobi"
                    value={form.city}
                    onChange={e => onChange('city', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">State / County</label>
                  <input
                    type="text" placeholder="Nairobi County"
                    value={form.state}
                    onChange={e => onChange('state', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">ZIP / Postal Code</label>
                  <input
                    type="text" placeholder="00100"
                    value={form.zipCode}
                    onChange={e => onChange('zipCode', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Country *</label>
                  <input
                    required type="text" placeholder="Kenya"
                    value={form.country}
                    onChange={e => onChange('country', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Facilities */}
          <section>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Facilities</h4>
            <div>
              <label className="block text-sm font-medium mb-1">Facilities (comma-separated)</label>
              <input
                type="text" placeholder="ICU, X-Ray, Laboratory, Pharmacy, Emergency"
                value={form.facilities}
                onChange={e => onChange('facilities', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">Separate each facility with a comma</p>
            </div>
          </section>

          {/* Operating Hours */}
          <section>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Operating Hours</h4>
            <div className="space-y-2">
              {form.operatingHours.map((h, i) => (
                <div key={h.day} className={`grid grid-cols-12 items-center gap-2 px-3 py-2 rounded-lg ${h.isClosed ? 'bg-gray-50' : 'bg-white border border-gray-200'}`}>
                  <span className="col-span-3 text-sm font-medium text-gray-700">{h.day}</span>
                  <div className="col-span-3">
                    <input
                      type="time"
                      value={h.openTime}
                      disabled={h.isClosed}
                      onChange={e => onHoursChange(i, 'openTime', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </div>
                  <span className="col-span-1 text-center text-xs text-gray-400">to</span>
                  <div className="col-span-3">
                    <input
                      type="time"
                      value={h.closeTime}
                      disabled={h.isClosed}
                      onChange={e => onHoursChange(i, 'closeTime', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </div>
                  <label className="col-span-2 flex items-center gap-1 cursor-pointer justify-end">
                    <input
                      type="checkbox"
                      checked={h.isClosed}
                      onChange={e => onHoursChange(i, 'isClosed', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-500">Closed</span>
                  </label>
                </div>
              ))}
            </div>
          </section>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm"
            >
              {loading
                ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />{isEdit ? 'Saving...' : 'Creating...'}</>
                : isEdit ? 'Save Changes' : 'Create Clinic'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Stats Drawer ─────────────────────────────────────────────────────────────

const StatsDrawer = ({ clinic, stats, loading, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-end z-50">
    <div className="bg-white w-full max-w-md h-full overflow-y-auto shadow-xl">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-base">{clinic?.name}</h3>
          <p className="text-xs text-gray-500">Clinic Statistics</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
          </div>
        ) : stats ? (
          <div className="space-y-6">
            {/* Doctor counts */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Doctors',    value: stats.totalDoctors,    color: 'bg-black text-white' },
                { label: 'Active',           value: stats.activeDoctors,   color: 'bg-green-50 text-green-800' },
                { label: 'Inactive',         value: stats.inactiveDoctors, color: 'bg-gray-50 text-gray-700' },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-lg p-4 text-center ${color}`}>
                  <div className="text-2xl font-bold">{value ?? 0}</div>
                  <div className="text-xs mt-1 opacity-80">{label}</div>
                </div>
              ))}
            </div>

            {/* Specializations breakdown */}
            {stats.specializations?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Doctors by Specialization
                </h4>
                <div className="space-y-2">
                  {stats.specializations.map(({ specialization, doctorCount }) => {
                    const pct = stats.totalDoctors > 0
                      ? Math.round((doctorCount / stats.totalDoctors) * 100)
                      : 0;
                    return (
                      <div key={specialization}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{specialization || 'Unspecified'}</span>
                          <span className="font-medium">{doctorCount} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full">
                          <div
                            className="h-1.5 bg-black rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Clinic address detail */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Location</h4>
              <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm text-gray-700">
                <p>{clinic.address?.street}</p>
                <p>{clinic.address?.city}{clinic.address?.state ? `, ${clinic.address.state}` : ''}</p>
                <p>{clinic.address?.country}</p>
              </div>
            </div>

            {/* Facilities */}
            {clinic.facilities?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Facilities</h4>
                <div className="flex flex-wrap gap-2">
                  {clinic.facilities.map(f => (
                    <span key={f} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">{f}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Operating hours */}
            {clinic.operatingHours?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Operating Hours</h4>
                <div className="space-y-1">
                  {clinic.operatingHours.map(h => (
                    <div key={h.day} className="flex justify-between text-sm">
                      <span className="text-gray-500 w-28">{h.day}</span>
                      <span className={h.isClosed ? 'text-gray-400' : 'text-gray-800 font-medium'}>
                        {h.isClosed ? 'Closed' : `${h.openTime} – ${h.closeTime}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-12">No stats available.</p>
        )}
      </div>
    </div>
  </div>
);

// ─── Main ClinicsTab ──────────────────────────────────────────────────────────

const ClinicsTab = () => {
  const [clinics, setClinics]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [searchTerm, setSearchTerm]     = useState('');
  const [cityFilter, setCityFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination]     = useState({ total: 0, offset: 0, limit: 10, hasMore: false });

  const [showAddModal, setShowAddModal]   = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState(null);
  const [form, setForm]                   = useState(emptyForm);

  const [statsClinic, setStatsClinic] = useState(null);
  const [stats, setStats]             = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchClinics = useCallback(async (offset = 0) => {
    try {
      setLoading(true);
      const params = {
        limit:  pagination.limit,
        offset,
        status: statusFilter || undefined,
        search: searchTerm   || undefined,
        city:   cityFilter   || undefined,
      };
      const data = await clinicAPI.getAllClinics(params);
      setClinics(data.clinics || []);
      setPagination(p => ({
        ...p,
        offset,
        total:   data.pagination?.total   ?? 0,
        hasMore: data.pagination?.hasMore  ?? false,
      }));
    } catch {
      toast.error('Failed to load clinics');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, cityFilter, statusFilter, pagination.limit]);

  useEffect(() => { fetchClinics(0); }, [searchTerm, cityFilter, statusFilter]);

  // ── Form helpers ───────────────────────────────────────────────────────────

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleHoursChange = (index, field, value) =>
    setForm(f => ({
      ...f,
      operatingHours: f.operatingHours.map((h, i) => i === index ? { ...h, [field]: value } : h),
    }));

  const resetForm  = () => setForm(emptyForm);

  // ── Validate ───────────────────────────────────────────────────────────────

  const validate = (f) => {
    if (!f.name.trim())        { toast.error('Clinic name is required');  return false; }
    if (!f.email.trim())       { toast.error('Email is required');         return false; }
    if (!f.phoneNumber.trim()) { toast.error('Phone number is required');  return false; }
    if (!f.street.trim())      { toast.error('Street address is required');return false; }
    if (!f.city.trim())        { toast.error('City is required');          return false; }
    if (!f.country.trim())     { toast.error('Country is required');       return false; }
    return true;
  };

  // ── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!validate(form)) return;
    try {
      setSubmitting(true);
      await clinicAPI.createClinic(buildPayload(form));
      toast.success('Clinic created successfully');
      setShowAddModal(false);
      resetForm();
      fetchClinics(0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create clinic');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────

  const openEdit = (clinic) => {
    setSelectedClinic(clinic);
    setForm(formFromClinic(clinic));
    setShowEditModal(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!validate(form)) return;
    try {
      setSubmitting(true);
      await clinicAPI.updateClinic(selectedClinic._id, buildPayload(form));
      toast.success('Clinic updated successfully');
      setShowEditModal(false);
      setSelectedClinic(null);
      resetForm();
      fetchClinics(pagination.offset);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update clinic');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Status toggle ──────────────────────────────────────────────────────────

  const handleToggleStatus = async (clinic) => {
    const next = clinic.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`Set ${clinic.name} to ${next}?`)) return;
    try {
      await clinicAPI.updateClinicStatus(clinic._id, next);
      toast.success(`Clinic marked as ${next}`);
      fetchClinics(pagination.offset);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (clinic) => {
    if (!window.confirm(`Delete "${clinic.name}"? This cannot be undone.`)) return;
    try {
      await clinicAPI.deleteClinic(clinic._id);
      toast.success('Clinic deleted');
      fetchClinics(0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete clinic');
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────

  const openStats = async (clinic) => {
    setStatsClinic(clinic);
    setStats(null);
    setStatsLoading(true);
    try {
      const data = await clinicAPI.getClinicStats(clinic._id);
      setStats(data.stats);
    } catch {
      toast.error('Failed to load clinic stats');
    } finally {
      setStatsLoading(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeClinics = clinics.filter(c => c.status === 'active').length;
  const totalDoctors  = clinics.reduce((sum, c) => sum + (c.doctorCount || 0), 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Clinics',   value: pagination.total, sub: 'registered facilities' },
          { label: 'Active Clinics',  value: activeClinics,    sub: 'currently operating'   },
          { label: 'Total Doctors',   value: totalDoctors,     sub: 'across all clinics'    },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-lg font-semibold">Clinic Management</h2>
            <p className="text-sm text-gray-500">Create and manage clinic facilities</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-800 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Clinic
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search clinics..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
            />
          </div>
          <input
            type="text"
            placeholder="Filter by city..."
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-sm"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clinic</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doctors</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Added</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && clinics.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black" />
                      <span className="text-sm">Loading clinics...</span>
                    </div>
                  </td>
                </tr>
              ) : clinics.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Building2 className="w-10 h-10 opacity-30" />
                      <div>
                        <p className="text-sm font-medium text-gray-600">No clinics found</p>
                        <p className="text-xs mt-1">Add your first clinic to get started</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                clinics.map(clinic => (
                  <tr key={clinic._id} className="hover:bg-gray-50 transition-colors">
                    {/* Name + description */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{clinic.name}</p>
                          {clinic.description && (
                            <p className="text-xs text-gray-400 mt-0.5 max-w-[200px] truncate">{clinic.description}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          {clinic.phoneNumber}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          {clinic.email}
                        </div>
                        {clinic.website && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Globe className="w-3 h-3 flex-shrink-0" />
                            <a
                              href={clinic.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline truncate max-w-[140px]"
                            >
                              {clinic.website.replace(/^https?:\/\//, '')}
                            </a>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Location */}
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span>
                          {clinic.address?.city}
                          {clinic.address?.country ? `, ${clinic.address.country}` : ''}
                        </span>
                      </div>
                    </td>

                    {/* Doctor count */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Stethoscope className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{clinic.doctorCount ?? 0}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${STATUS_STYLES[clinic.status] || 'bg-gray-100 text-gray-600'}`}>
                        {clinic.status}
                      </span>
                    </td>

                    {/* Date added */}
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {clinic.createdAt ? format(parseISO(clinic.createdAt), 'MMM d, yyyy') : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openStats(clinic)}
                          title="View stats"
                          className="text-gray-400 hover:text-black transition-colors"
                        >
                          <BarChart2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(clinic)}
                          title="Edit"
                          className="text-gray-400 hover:text-black transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(clinic)}
                          title={clinic.status === 'active' ? 'Deactivate' : 'Activate'}
                          className={`transition-colors ${clinic.status === 'active' ? 'text-gray-400 hover:text-orange-500' : 'text-gray-400 hover:text-green-600'}`}
                        >
                          {clinic.status === 'active'
                            ? <ToggleRight className="w-4 h-4" />
                            : <ToggleLeft  className="w-4 h-4" />
                          }
                        </button>
                        <button
                          onClick={() => handleDelete(clinic)}
                          title="Delete"
                          className="text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.total > pagination.limit && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Showing {pagination.offset + 1}–{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} clinics
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.offset === 0 || loading}
                onClick={() => fetchClinics(pagination.offset - pagination.limit)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={!pagination.hasMore || loading}
                onClick={() => fetchClinics(pagination.offset + pagination.limit)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ClinicModal
        show={showAddModal}
        mode="add"
        form={form}
        onChange={handleChange}
        onHoursChange={handleHoursChange}
        onSubmit={handleCreate}
        onClose={() => { setShowAddModal(false); resetForm(); }}
        loading={submitting}
      />

      <ClinicModal
        show={showEditModal}
        mode="edit"
        form={form}
        onChange={handleChange}
        onHoursChange={handleHoursChange}
        onSubmit={handleEdit}
        onClose={() => { setShowEditModal(false); setSelectedClinic(null); resetForm(); }}
        loading={submitting}
      />

      {statsClinic && (
        <StatsDrawer
          clinic={statsClinic}
          stats={stats}
          loading={statsLoading}
          onClose={() => { setStatsClinic(null); setStats(null); }}
        />
      )}
    </div>
  );
};

export default ClinicsTab;