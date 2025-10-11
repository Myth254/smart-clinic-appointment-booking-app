import axios from 'axios'

// Create axios instance with default base URL
const axiosClient = axios.create({
  baseURL: 'http://localhost:3000/api/v1', // backend
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor to attach token to every request if present
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle response errors globally
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('Unauthorized, logging out...')
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default axiosClient