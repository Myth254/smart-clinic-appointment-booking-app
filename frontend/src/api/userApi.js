import axiosClient from './axiosClient'

// Create a new user (admin-only)
export const createUser = (userData) =>
  axiosClient.post('/admin/users', userData)

// Get all users (admin-only)
export const getAllUsers = () => axiosClient.get('/admin/users')

// Get user by ID
export const getUserById = (id) => axiosClient.get(`/admin/users/${id}`)

// Update user info
export const updateUser = (id, updates) =>
  axiosClient.put(`/admin/users/${id}`, updates)
