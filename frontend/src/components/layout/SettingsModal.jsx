import React, { useState, useEffect } from 'react';
import { X, User, Edit, Save, AlertCircle } from 'lucide-react';
import { authAPI, patientAPI } from '../../api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const SettingsModal = ({ isOpen, onClose }) => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  
  const [profileData, setProfileData] = useState(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    dateOfBirth: '',
    residentialAddress: '',
    city: '',
    region: '',
    country: 'Kenya',
    emergencyName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
    allergies: [],
    bloodType: '',
    insuranceProvider: '',
    insurancePolicyNumber: '',
    insuranceGroupNumber: '',
  });

  const [newAllergy, setNewAllergy] = useState('');

  useEffect(() => {
    if (isOpen && user?.id) {
      fetchProfile();
      setIsEditMode(false);
      setActiveTab('personal');
    }
  }, [isOpen, user]);

  useEffect(() => {
    console.log('=== SETTINGS MODAL DEBUG ===');
    console.log('User object:', user);
    console.log('user?.id:', user?.id);
    console.log('user?._id:', user?._id);
    console.log('==========================');
  }, [user]);

  const fetchProfile = async () => {
    try {
      setFetchingProfile(true);
    
      // ✅ Get fresh user data from backend
      const currentUser = await authAPI.getMe();
      const userId = currentUser?.id || currentUser?._id;
      
      if (!userId) {
        toast.error('Unable to load profile');
        return;
      }

      const response = await patientAPI.getProfile(userId);
      setProfileData(response);
      const profile = response.profile || {};
      
      setFormData({
        firstName: response.firstName || '',
        lastName: response.lastName || '',
        email: response.email || '',
        phoneNumber: response.phoneNumber || '',
        dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.split('T')[0] : '',
        residentialAddress: profile.address?.residentialAddress || '',
        city: profile.address?.city || '',
        region: profile.address?.region || '',
        country: profile.address?.country || 'Kenya',
        emergencyName: profile.emergencyContact?.name || '',
        emergencyRelationship: profile.emergencyContact?.relationship || '',
        emergencyPhone: profile.emergencyContact?.phoneNumber || '',
        allergies: profile.allergies || [],
        bloodType: profile.bloodType || '',
        insuranceProvider: profile.insurance?.provider || '',
        insurancePolicyNumber: profile.insurance?.policyNumber || '',
        insuranceGroupNumber: profile.insurance?.groupNumber || '',
      });
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      toast.error('Failed to load profile data');
    } finally {
      setFetchingProfile(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddAllergy = () => {
    if (newAllergy.trim()) {
      setFormData(prev => ({
        ...prev,
        allergies: [...prev.allergies, newAllergy.trim()]
      }));
      setNewAllergy('');
    }
  };

  const handleRemoveAllergy = (index) => {
    setFormData(prev => ({
      ...prev,
      allergies: prev.allergies.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateClick = () => {
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    if (profileData) {
      const profile = profileData.profile || {};
      setFormData({
        firstName: profileData.firstName || '',
        lastName: profileData.lastName || '',
        email: profileData.email || '',
        phoneNumber: profileData.phoneNumber || '',
        dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.split('T')[0] : '',
        residentialAddress: profile.address?.residentialAddress || '',
        city: profile.address?.city || '',
        region: profile.address?.region || '',
        country: profile.address?.country || 'Kenya',
        emergencyName: profile.emergencyContact?.name || '',
        emergencyRelationship: profile.emergencyContact?.relationship || '',
        emergencyPhone: profile.emergencyContact?.phoneNumber || '',
        allergies: profile.allergies || [],
        bloodType: profile.bloodType || '',
        insuranceProvider: profile.insurance?.provider || '',
        insurancePolicyNumber: profile.insurance?.policyNumber || '',
        insuranceGroupNumber: profile.insurance?.groupNumber || '',
      });
    }
    setIsEditMode(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      const updateData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        dateOfBirth: formData.dateOfBirth,
        address: {
          residentialAddress: formData.residentialAddress,
          city: formData.city,
          region: formData.region,
          country: formData.country,
        },
        emergencyContact: {
          name: formData.emergencyName,
          relationship: formData.emergencyRelationship,
          phoneNumber: formData.emergencyPhone,
        },
        allergies: formData.allergies,
        bloodType: formData.bloodType,
        insurance: {
          provider: formData.insuranceProvider,
          policyNumber: formData.insurancePolicyNumber,
          groupNumber: formData.insuranceGroupNumber,
        },
      };

      const response = await patientAPI.updateProfile(user.id, updateData);
      
      if (response.user) {
        updateUser(response.user);
      }
      
      await fetchProfile();
      toast.success('Profile updated successfully');
      setIsEditMode(false);
    } catch (error) {
      console.error('Update error:', error);
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not provided';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'personal', label: 'Personal Info' },
    { id: 'address', label: 'Address' },
    { id: 'emergency', label: 'Emergency Contact' },
    { id: 'medical', label: 'Medical Info' },
    { id: 'insurance', label: 'Insurance' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="relative inline-block w-full max-w-3xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Profile Settings</h2>
                <p className="text-sm text-gray-500">
                  {isEditMode ? 'Update your personal information' : 'View your profile details'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {fetchingProfile ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-500">Loading profile data...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="border-b border-gray-200 bg-gray-50">
                <div className="px-6">
                  <nav className="flex space-x-8">
                    {tabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`py-3 px-1 border-b-2 font-medium text-sm ${
                          activeTab === tab.id
                            ? 'border-black text-black'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </div>
              </div>

              {!isEditMode ? (
                /* VIEW MODE */
                <>
                  <div className="p-6 max-h-96 overflow-y-auto">
                    {activeTab === 'personal' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase">First Name</label>
                            <p className="mt-1 text-sm font-medium">{formData.firstName || 'Not provided'}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase">Last Name</label>
                            <p className="mt-1 text-sm font-medium">{formData.lastName || 'Not provided'}</p>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Email</label>
                          <p className="mt-1 text-sm font-medium">{formData.email || 'Not provided'}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Phone Number</label>
                          <p className="mt-1 text-sm font-medium">{formData.phoneNumber || 'Not provided'}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Date of Birth</label>
                          <p className="mt-1 text-sm font-medium">{formatDate(formData.dateOfBirth)}</p>
                        </div>
                      </div>
                    )}

                    {activeTab === 'address' && (
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Residential Address</label>
                          <p className="mt-1 text-sm font-medium">{formData.residentialAddress || 'Not provided'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase">City</label>
                            <p className="mt-1 text-sm font-medium">{formData.city || 'Not provided'}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase">Region/County</label>
                            <p className="mt-1 text-sm font-medium">{formData.region || 'Not provided'}</p>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Country</label>
                          <p className="mt-1 text-sm font-medium">{formData.country}</p>
                        </div>
                      </div>
                    )}

                    {activeTab === 'emergency' && (
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Full Name</label>
                          <p className="mt-1 text-sm font-medium">{formData.emergencyName || 'Not provided'}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Relationship</label>
                          <p className="mt-1 text-sm font-medium">{formData.emergencyRelationship || 'Not provided'}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Phone Number</label>
                          <p className="mt-1 text-sm font-medium">{formData.emergencyPhone || 'Not provided'}</p>
                        </div>
                      </div>
                    )}

                    {activeTab === 'medical' && (
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Blood Type</label>
                          <p className="mt-1 text-sm font-medium">{formData.bloodType || 'Not provided'}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Allergies</label>
                          {formData.allergies.length > 0 ? (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {formData.allergies.map((allergy, index) => (
                                <span key={index} className="inline-flex items-center px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                                  {allergy}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-sm text-gray-500 italic">No allergies recorded</p>
                          )}
                        </div>
                      </div>
                    )}

                    {activeTab === 'insurance' && (
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Insurance Provider</label>
                          <p className="mt-1 text-sm font-medium">{formData.insuranceProvider || 'Not provided'}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Policy Number</label>
                          <p className="mt-1 text-sm font-medium">{formData.insurancePolicyNumber || 'Not provided'}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Group Number</label>
                          <p className="mt-1 text-sm font-medium">{formData.insuranceGroupNumber || 'Not provided'}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleUpdateClick}
                      className="px-6 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-gray-800 flex items-center space-x-2"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Update Profile</span>
                    </button>
                  </div>
                </>
              ) : (
                /* EDIT MODE */
                <form onSubmit={handleSubmit}>
                  <div className="p-6 max-h-96 overflow-y-auto">
                    {activeTab === 'personal' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                            <input
                              type="text"
                              name="firstName"
                              value={formData.firstName}
                              onChange={handleChange}
                              required
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                            <input
                              type="text"
                              name="lastName"
                              value={formData.lastName}
                              onChange={handleChange}
                              required
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                          <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                          <input
                            type="tel"
                            name="phoneNumber"
                            value={formData.phoneNumber}
                            onChange={handleChange}
                            required
                            placeholder="+254 712 345 678"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                          <input
                            type="date"
                            name="dateOfBirth"
                            value={formData.dateOfBirth}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>
                      </div>
                    )}

                    {activeTab === 'address' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Residential Address</label>
                          <input
                            type="text"
                            name="residentialAddress"
                            value={formData.residentialAddress}
                            onChange={handleChange}
                            placeholder="e.g., Kilimani, Argwings Kodhek Road"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                            <input
                              type="text"
                              name="city"
                              value={formData.city}
                              onChange={handleChange}
                              placeholder="e.g., Nairobi"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Region/County</label>
                            <input
                              type="text"
                              name="region"
                              value={formData.region}
                              onChange={handleChange}
                              placeholder="e.g., Nairobi County"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                          <input
                            type="text"
                            name="country"
                            value={formData.country}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                            readOnly
                          />
                          <p className="text-xs text-gray-500 mt-1">Currently set to Kenya by default</p>
                        </div>
                      </div>
                    )}

                    {activeTab === 'emergency' && (
                      <div className="space-y-4">
                        <div className="flex items-start space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-yellow-800">
                            This contact will be notified in case of emergency during your appointments.
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                          <input
                            type="text"
                            name="emergencyName"
                            value={formData.emergencyName}
                            onChange={handleChange}
                            placeholder="e.g., John Kamau"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                          <input
                            type="text"
                            name="emergencyRelationship"
                            value={formData.emergencyRelationship}
                            onChange={handleChange}
                            placeholder="e.g., Spouse, Parent, Sibling"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                          <input
                            type="tel"
                            name="emergencyPhone"
                            value={formData.emergencyPhone}
                            onChange={handleChange}
                            placeholder="+254 712 345 678"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>
                      </div>
                    )}

                    {activeTab === 'medical' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Blood Type</label>
                          <select
                            name="bloodType"
                            value={formData.bloodType}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          >
                            <option value="">Select blood type</option>
                            <option value="A+">A+</option>
                            <option value="A-">A-</option>
                            <option value="B+">B+</option>
                            <option value="B-">B-</option>
                            <option value="AB+">AB+</option>
                            <option value="AB-">AB-</option>
                            <option value="O+">O+</option>
                            <option value="O-">O-</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Allergies</label>
                          <div className="flex space-x-2 mb-3">
                            <input
                              type="text"
                              value={newAllergy}
                              onChange={(e) => setNewAllergy(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAllergy())}
                              placeholder="e.g., Penicillin, Peanuts"
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                            />
                            <button
                              type="button"
                              onClick={handleAddAllergy}
                              className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                            >
                              Add
                            </button>
                          </div>
                          {formData.allergies.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {formData.allergies.map((allergy, index) => (
                                <span key={index} className="inline-flex items-center px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                                  {allergy}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAllergy(index)}
                                    className="ml-2 hover:text-red-900"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 italic">No allergies added yet</p>
                          )}
                        </div>
                      </div>
                    )}

                    {activeTab === 'insurance' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Provider</label>
                          <input
                            type="text"
                            name="insuranceProvider"
                            value={formData.insuranceProvider}
                            onChange={handleChange}
                            placeholder="e.g., NHIF, AAR, Britam"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Policy Number</label>
                          <input
                            type="text"
                            name="insurancePolicyNumber"
                            value={formData.insurancePolicyNumber}
                            onChange={handleChange}
                            placeholder="Enter policy number"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Group Number</label>
                          <input
                            type="text"
                            name="insuranceGroupNumber"
                            value={formData.insuranceGroupNumber}
                            onChange={handleChange}
                            placeholder="Enter group number (if applicable)"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={loading}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center space-x-2"
                    >
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Save Changes</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;