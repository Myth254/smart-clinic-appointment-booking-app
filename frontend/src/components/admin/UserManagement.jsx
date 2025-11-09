import React, { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { adminAPI } from '../../api';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import UserModal from './userModal';

const UserManagementTab = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
  });

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    role: 'patient',
    specialization: '',
    // Patient fields
    dateOfBirth: '',
    address: '',
    emergencyContact: '',
    // Doctor fields
    clinic: '',
    qualifications: '',
    bio: ''
  });

  const fetchUsers = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminAPI.getAllUsers({
        search: searchTerm,
        role: roleFilter,
        page: pagination.page,
        limit: pagination.limit,
      });
      setUsers(data.users || []);
      setPagination((prev) => ({
        ...prev,
        total: data.pagination?.total || 0,
        pages: data.pagination?.pages || 0,
      }));
    } catch (error) {
      toast.error('Failed to fetch users');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, roleFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 🔹 Add User
  const handleAddUser = async (e) => {
    e.preventDefault();

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast.error('First name and last name are required');
      return;
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error('Valid email is required');
      return;
    }
    if (!formData.phoneNumber.trim()) {
      toast.error('Phone number is required');
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (formData.role === 'doctor' && !formData.specialization.trim()) {
      toast.error('Specialization is required for doctors');
      return;
    }

    try {
      setLoading(true);
      const createData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        password: formData.password,
        role: formData.role,
        ...(formData.role === 'patient' && {
          dateOfBirth: formData.dateOfBirth,
          address: formData.address,
          emergencyContact: formData.emergencyContact
        }),
        ...(formData.role === 'doctor' && {
          specialization: formData.specialization.trim(),
          clinic: formData.clinic,
          qualifications: formData.qualifications,
          bio: formData.bio
        })
      };

      await adminAPI.createUser(createData);
      toast.success('User created successfully');
      setShowAddModal(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Edit User
  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!selectedUser) return toast.error('No user selected');

    try {
      setLoading(true);
      const updateData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        role: formData.role,
      };

      if (formData.role === 'patient') {
        updateData.dateOfBirth = formData.dateOfBirth;
        updateData.address = formData.address;
        updateData.emergencyContact = formData.emergencyContact;
      }
      if (formData.role === 'doctor') {
        updateData.specialization = formData.specialization.trim();
        updateData.clinic = formData.clinic;
        updateData.qualifications = formData.qualifications;
        updateData.bio = formData.bio;
      }

      await adminAPI.updateUser(selectedUser._id, updateData);
      toast.success('User updated successfully');
      setShowEditModal(false);
      setSelectedUser(null);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Delete User
  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      setLoading(true);
      await adminAPI.deleteUser(userId);
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Open Edit Modal
  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      password: '',
      role: user.role,
      specialization: user.specialization || '',
      dateOfBirth: user.dateOfBirth || '',
      address: user.address || '',
      emergencyContact: user.emergencyContact || '',
      clinic: user.clinic || '',
      qualifications: user.qualifications || '',
      bio: user.bio || ''
    });
    setShowEditModal(true);
  };

  // 🔹 Reset Form
  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      password: '',
      role: 'patient',
      specialization: '',
      dateOfBirth: '',
      address: '',
      emergencyContact: '',
      clinic: '',
      qualifications: '',
      bio: ''
    });
  };

  // 🔹 Handle Form Changes
  const handleFormChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold">User Management</h2>
            <p className="text-sm text-gray-500">
              Manage all system users and their permissions
            </p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
          >
            <option value="">All Roles</option>
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
            <option value="admin">Admin</option>
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
                users.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">{user.firstName} {user.lastName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 capitalize text-sm text-gray-600">
                      {user.role}
                      {user.role === 'doctor' && user.specialization && (
                        <div className="text-xs text-gray-400">{user.specialization}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {user.createdAt ? format(parseISO(user.createdAt), 'MMM d, yyyy') : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 text-xs font-medium bg-black text-white rounded-full">Active</span>
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <button onClick={() => openEditModal(user)} className="text-black hover:underline">Edit</button>
                      <button onClick={() => handleDeleteUser(user._id)} className="text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ✅ Reusable Modal Components */}
      <UserModal
        show={showAddModal}
        mode="add"
        onClose={() => {
          setShowAddModal(false);
          resetForm();
        }}
        onSubmit={handleAddUser}
        formData={formData}
        handleFormChange={handleFormChange}
        loading={loading}
      />

      <UserModal
        show={showEditModal}
        mode="edit"
        onClose={() => {
          setShowEditModal(false);
          setSelectedUser(null);
          resetForm();
        }}
        onSubmit={handleEditUser}
        formData={formData}
        handleFormChange={handleFormChange}
        loading={loading}
      />
    </div>
  );
};

export default UserManagementTab;
