// api/users.js
import axiosClient from './axiosClient'

export const usersAPI = {
  // Update authenticated user's own profile
  updateProfile: async (profileData) => {
    const response = await axiosClient.put('/users/profile', profileData);
    return response.data;
  },

  // Search doctors publicly (for patient appointment booking)
  searchDoctors: async (params = {}) => {
    const response = await axiosClient.get('/users/doctors', { params });
    return response.data;
  },
};

export default usersAPI;