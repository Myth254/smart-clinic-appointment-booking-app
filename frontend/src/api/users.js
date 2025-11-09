import axiosClient from './axiosClient'

export const authAPI = {
  // Register new user
  register: async (userData) => {
    const response = await axiosClient.post('/auth/register', userData);
    return response.data;
  },

  // Login user
  login: async (credentials) => {
    const response = await axiosClient.post('/auth/login', credentials);
    return response.data;
  },

  // Get current user profile
  getMe: async () => {
    const response = await axiosClient.get('/auth/me');
    return response.data;
  },

  // Logout user
  logout: async () => {
    const response = await axiosClient.post('/auth/logout');
    return response.data;
  },

  // Forgot password
  forgotPassword: async (email) => {
    const response = await axiosClient.post('/auth/forgot-password', { email });
    return response.data;
  },

  // Reset password
  resetPassword: async (token, newPassword) => {
    const response = await axiosClient.post('/auth/reset-password', {
      token,
      newPassword
    });
    return response.data;
  },

  // Refresh token
  refreshToken: async (refreshToken) => {
    const response = await axiosClient.post('/auth/refresh-token', {
      refreshToken
    });
    return response.data;
  },

  // Get user profile (authenticated user)
  getProfile: async () => {
    const response = await axiosClient.get('/auth/me');
    return response.data;
  },

  // Update user profile
  updateProfile: async (profileData) => {
    const response = await axiosClient.put('/users/profile', profileData);
    return response.data;
  },
};

export default authAPI;