/* eslint-disable react-hooks/exhaustive-deps */
// components/admin/UserManagement.jsx
/**
 * UserManagement — Refactored
 * ─────────────────────────────────────────────────────────────────────────────
 * Issues fixed:
 *
 * 1. RAPID-FIRE DUPLICATE REQUESTS — fetchUsers was a useCallback that depended
 *    on [searchTerm, roleFilter, statusFilter, pagination.page, pagination.limit].
 *    Because pagination is an object in state, updating its `total`/`pages` fields
 *    inside fetchUsers itself triggered a re-render that changed pagination's
 *    reference → useEffect saw a new dep → called fetchUsers again → infinite loop
 *    risk and guaranteed double-fetch on every load.
 *
 *    Fix: fetchUsers no longer depends on pagination state. page/limit are passed
 *    as explicit arguments. A request-dedup ref prevents concurrent identical calls.
 *
 * 2. SEARCH INPUT DEBOUNCE — every keystroke previously fired a new API call
 *    immediately (fetchUsers was called on every render where searchTerm changed).
 *    Added a 350 ms debounce so the request only fires after the user stops typing.
 *
 * 3. useEffect dependency issue — useEffect([fetchUsers]) where fetchUsers itself
 *    depended on pagination caused unnecessary re-fetches. Now the effect watches
 *    [searchTerm, roleFilter, statusFilter] only (the actual filter inputs), and
 *    pagination page changes call fetchUsers(newPage) directly.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search } from 'lucide-react';
import { adminAPI } from '../../api';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import UserModal from './userModal';

const ROLE_LABELS = {
  patient:        'Patient',
  doctor:         'Doctor',
  admin:          'Admin',
  lab_personnel:  'Lab Personnel',
  pharmacy_staff: 'Pharmacy Staff',
};

const STATUS_COLORS = {
  active:    'bg-green-100 text-green-800',
  inactive:  'bg-gray-100 text-gray-700',
  suspended: 'bg-red-100 text-red-800',
};

const defaultFormData = {
  firstName: '', lastName: '', email: '', phoneNumber: '', password: '', role: 'patient',
  dateOfBirth: '', address: '', emergencyContactName: '', emergencyContactPhone: '',
  specialization: '', clinic: '', qualifications: [], bio: '',
  consultationFee: '', experience: '', languages: [], certifications: [],
  labSpecialization: '', yearsOfExperience: '', assignedLabs: '',
  pharmacyRole: '', licenseNumber: '', licenseExpiry: '', pharmacySpecializations: '',
};

const PAGE_LIMIT = 10;

const UserManagementTab = ({ intent }) => {
  const [users,         setUsers]         = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser,  setSelectedUser]  = useState(null);
  const [searchTerm,    setSearchTerm]    = useState('');
  const [roleFilter,    setRoleFilter]    = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [page,          setPage]          = useState(1);
  const [totalPages,    setTotalPages]    = useState(0);
  const [totalUsers,    setTotalUsers]    = useState(0);
  const [formData,      setFormData]      = useState(defaultFormData);

  // ── Request deduplication ──────────────────────────────────────────────────
  const inFlightRef   = useRef(false);
  const debounceTimer = useRef(null);

  // ── Core fetch — page is an explicit argument, not from state ─────────────
  const fetchUsers = useCallback(async (targetPage = 1) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);

    try {
      const data = await adminAPI.getAllUsers({
        search: searchTerm  || undefined,
        role:   roleFilter  || undefined,
        status: statusFilter || undefined,
        page:   targetPage,
        limit:  PAGE_LIMIT,
      });
      setUsers(data.users || []);
      setTotalPages(data.pagination?.pages || 0);
      setTotalUsers(data.pagination?.total || 0);
      setPage(targetPage); // set page only after successful response
    } catch (err) {
      toast.error('Failed to fetch users');
      console.error(err);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [searchTerm, roleFilter, statusFilter]);
  // ↑ These three deps change only when the user interacts with filters —
  //   not on every render, and they don't include pagination state.

  // ── Debounced filter effect ────────────────────────────────────────────────
  // Fires 350 ms after the last filter change; resets to page 1.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchUsers(1);
    }, 350);
    return () => clearTimeout(debounceTimer.current);
  }, [searchTerm, roleFilter, statusFilter]); // ← NOT fetchUsers (avoid loop)

  // ── Intent-driven add modal ────────────────────────────────────────────────
  useEffect(() => {
    if (!intent?.nonce || intent.mode !== 'add' || !intent.role) return;
    setSelectedUser(null);
    setShowEditModal(false);
    setFormData({ ...defaultFormData, role: intent.role });
    setShowAddModal(true);
  }, [intent]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateForm = (data, isEdit = false) => {
    if (!data.firstName.trim() || !data.lastName.trim()) { toast.error('First and last name are required'); return false; }
    if (!data.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { toast.error('Valid email is required'); return false; }
    if (!data.phoneNumber.trim()) { toast.error('Phone number is required'); return false; }
    if (!isEdit && (!data.password || data.password.length < 6)) { toast.error('Password must be at least 6 characters'); return false; }
    if (data.role === 'doctor' && !data.specialization.trim()) { toast.error('Specialization is required for doctors'); return false; }
    if (data.role === 'patient' && !isEdit) {
      if (!data.dateOfBirth)                  { toast.error('Date of birth is required');          return false; }
      if (!data.emergencyContactName?.trim()) { toast.error('Emergency contact name is required'); return false; }
      if (!data.emergencyContactPhone?.trim()){ toast.error('Emergency contact phone is required');return false; }
    }
    if (data.role === 'lab_personnel' && !data.labSpecialization.trim()) { toast.error('Lab specialization is required'); return false; }
    if (data.role === 'pharmacy_staff') {
      if (!data.licenseNumber.trim()) { toast.error('License number is required'); return false; }
      if (!data.licenseExpiry)        { toast.error('License expiry is required'); return false; }
      if (!data.pharmacyRole.trim())  { toast.error('Pharmacy role is required');  return false; }
    }
    return true;
  };

  // ── Add User ───────────────────────────────────────────────────────────────
  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!validateForm(formData)) return;

    const payload = {
      firstName: formData.firstName.trim(), lastName: formData.lastName.trim(),
      email: formData.email.trim(), phoneNumber: formData.phoneNumber.trim(),
      password: formData.password, role: formData.role,
    };

    if (formData.role === 'patient') {
      Object.assign(payload, {
        dateOfBirth: formData.dateOfBirth, address: formData.address,
        emergencyContact: {
          name: formData.emergencyContactName.trim(),
          phoneNumber: formData.emergencyContactPhone.trim(),
        },
      });
    } else if (formData.role === 'doctor') {
      Object.assign(payload, {
        specialization: formData.specialization.trim(),
        clinic: formData.clinic || null,
        qualifications: Array.isArray(formData.qualifications)
          ? formData.qualifications.filter(q => q.degree || q.institution || q.year)
              .map(q => ({ ...q, year: q.year ? parseInt(q.year) : undefined }))
          : [],
        bio:            formData.bio || '',
        consultationFee: formData.consultationFee !== '' ? parseFloat(formData.consultationFee) : 0,
        experience:      formData.experience      !== '' ? parseInt(formData.experience)         : 0,
        languages:       Array.isArray(formData.languages)     ? formData.languages     : [],
        certifications:  Array.isArray(formData.certifications) ? formData.certifications : [],
      });
    } else if (formData.role === 'lab_personnel') {
      Object.assign(payload, {
        labSpecialization: formData.labSpecialization.trim(),
        clinic:            formData.clinic,
        experience:        formData.yearsOfExperience ? parseInt(formData.yearsOfExperience) : 0,
        assignedLabs:      formData.assignedLabs
          ? formData.assignedLabs.split(',').map(s => s.trim()).filter(Boolean) : [],
      });
    } else if (formData.role === 'pharmacy_staff') {
      Object.assign(payload, {
        pharmacyRole: formData.pharmacyRole.trim(), licenseNumber: formData.licenseNumber.trim(),
        licenseExpiry: formData.licenseExpiry, clinic: formData.clinic,
        pharmacySpecializations: formData.pharmacySpecializations
          ? formData.pharmacySpecializations.split(',').map(s => s.trim()).filter(Boolean) : [],
      });
    }

    try {
      setLoading(true);
      await adminAPI.createUser(payload);
      toast.success('User created successfully');
      setShowAddModal(false);
      resetForm();
      fetchUsers(1);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  // ── Edit User ──────────────────────────────────────────────────────────────
  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!selectedUser || !validateForm(formData, true)) return;

    const payload = {
      firstName: formData.firstName.trim(), lastName: formData.lastName.trim(),
      email: formData.email.trim(), phoneNumber: formData.phoneNumber.trim(),
    };

    if (selectedUser.role === 'patient') {
      Object.assign(payload, {
        dateOfBirth: formData.dateOfBirth, address: formData.address,
        emergencyContact: {
          name: formData.emergencyContactName.trim(),
          phoneNumber: formData.emergencyContactPhone.trim(),
        },
      });
    } else if (selectedUser.role === 'doctor') {
      Object.assign(payload, {
        specialization: formData.specialization.trim(),
        clinic:         formData.clinic || null,
        qualifications: Array.isArray(formData.qualifications)
          ? formData.qualifications.filter(q => q.degree || q.institution || q.year)
              .map(q => ({ ...q, year: q.year ? parseInt(q.year) : undefined }))
          : [],
        bio:            formData.bio || '',
        consultationFee: formData.consultationFee !== '' ? parseFloat(formData.consultationFee) : 0,
        experience:      formData.experience      !== '' ? parseInt(formData.experience)         : 0,
        languages:       Array.isArray(formData.languages)     ? formData.languages     : [],
        certifications:  Array.isArray(formData.certifications) ? formData.certifications : [],
      });
    }

    try {
      setLoading(true);
      await adminAPI.updateUser(selectedUser._id, payload);
      toast.success('User updated successfully');
      setShowEditModal(false);
      setSelectedUser(null);
      resetForm();
      fetchUsers(page); // stay on current page
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  // ── Status toggle ──────────────────────────────────────────────────────────
  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    const label     = newStatus === 'suspended' ? 'suspend' : 'activate';
    if (!window.confirm(`Are you sure you want to ${label} ${user.firstName} ${user.lastName}?`)) return;
    try {
      setLoading(true);
      await adminAPI.updateUserStatus(user._id, newStatus);
      toast.success(`User ${label}d successfully`);
      fetchUsers(page);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${label} user`);
    } finally {
      setLoading(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Delete this user? This cannot be undone.')) return;
    try {
      setLoading(true);
      await adminAPI.deleteUser(userId);
      toast.success('User deleted successfully');
      fetchUsers(page > 1 && users.length === 1 ? page - 1 : page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  // ── Open edit modal ────────────────────────────────────────────────────────
  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      ...defaultFormData,
      firstName:   user.firstName   || '', lastName:    user.lastName    || '',
      email:       user.email       || '', phoneNumber: user.phoneNumber || '',
      role:        user.role        || 'patient',
      specialization: user.specialization || '', clinic: user.clinic || '',
      qualifications: Array.isArray(user.qualifications) ? user.qualifications : [],
      bio:            user.bio            || '',
      consultationFee: user.consultationFee != null ? String(user.consultationFee) : '',
      experience:      user.experience     != null ? String(user.experience)       : '',
      languages:       Array.isArray(user.languages)     ? user.languages     : [],
      certifications:  Array.isArray(user.certifications) ? user.certifications : [],
      dateOfBirth:           user.dateOfBirth                   || '',
      address:               user.address                       || '',
      emergencyContactName:  user.emergencyContact?.name        || '',
      emergencyContactPhone: user.emergencyContact?.phoneNumber || '',
    });
    setShowEditModal(true);
  };

  const resetForm = () => setFormData(defaultFormData);
  const handleFormChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold">User Management</h2>
            <p className="text-sm text-gray-500">Manage all system users and their permissions</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-black text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />
            <span>Add User</span>
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
          >
            <option value="">All Roles</option>
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
            <option value="admin">Admin</option>
            <option value="lab_personnel">Lab Personnel</option>
            <option value="pharmacy_staff">Pharmacy Staff</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && users.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-12 text-center">Loading users...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-500">No users found</td></tr>
              ) : (
                users.map(user => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-sm">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {ROLE_LABELS[user.role] || user.role}
                      {user.role === 'doctor' && user.specialization && (
                        <div className="text-xs text-gray-400">{user.specialization}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {user.createdAt ? format(parseISO(user.createdAt), 'MMM d, yyyy') : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[user.status] || 'bg-gray-100 text-gray-800'}`}>
                        {user.status || 'active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2 whitespace-nowrap">
                      <button onClick={() => openEditModal(user)} className="text-black hover:underline">Edit</button>
                      <button
                        onClick={() => handleToggleStatus(user)}
                        className={user.status === 'active' ? 'text-orange-600 hover:underline' : 'text-green-600 hover:underline'}
                      >
                        {user.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                      <button onClick={() => handleDeleteUser(user._id)} className="text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages} ({totalUsers} users)
            </span>
            <div className="flex space-x-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => fetchUsers(page - 1)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => fetchUsers(page + 1)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <UserModal
        show={showAddModal}
        mode="add"
        onClose={() => { setShowAddModal(false); resetForm(); }}
        onSubmit={handleAddUser}
        formData={formData}
        handleFormChange={handleFormChange}
        loading={loading}
      />
      <UserModal
        show={showEditModal}
        mode="edit"
        onClose={() => { setShowEditModal(false); setSelectedUser(null); resetForm(); }}
        onSubmit={handleEditUser}
        formData={formData}
        handleFormChange={handleFormChange}
        loading={loading}
      />
    </div>
  );
};

export default UserManagementTab;