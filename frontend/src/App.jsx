import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from './components/layout/ThemeProvider'
import { AuthProvider } from './components/layout/AuthProvider'
import LandingPage from './pages/landing/landingpage'
import Login from './pages/Auth/Login'
import Register from './pages/Auth/Register'
import ProtectedRoute from './pages/Auth/ProtectedRoute'

// Patient pages
import PatientDashboard from './pages/patientDashboard'
// Doctor pages
import DoctorDashboard from './pages/doctorDashboard'
// Admin pages
import AdminDashboard from './pages/adminDashBoard'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Toaster position="top-right" />
          <div className="min-h-screen">
            <Routes>
              {/* 🌍 Public routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* 👨‍⚕️ Patient Dashboard Routes */}
              <Route
                path="/patient/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <PatientDashboard />
                  </ProtectedRoute>
                }
              />

              {/* 👩‍⚕️ Doctor Dashboard Routes */}
              <Route
                path="/doctor/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['doctor']}>
                    <DoctorDashboard />
                  </ProtectedRoute>
                }
              />

              {/* 🔧 Admin Dashboard Routes */}
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />

              {/* 🚫 Unauthorized Access */}
              <Route
                path="/unauthorized"
                element={
                  <div className="flex flex-col items-center justify-center h-screen">
                    <h1 className="text-4xl font-bold mb-4">403 | Unauthorized</h1>
                    <p className="text-gray-600 mb-4">You don't have permission to access this page.</p>
                    <a href="/dashboard" className="text-blue-600 hover:underline">
                      Go back to Dashboard
                    </a>
                  </div>
                }
              />

              {/* 🚫 404 fallback */}
              <Route
                path="*"
                element={
                  <div className="flex flex-col items-center justify-center h-screen">
                    <h1 className="text-4xl font-bold mb-4">404 | Page Not Found</h1>
                    <a href="/" className="text-blue-600 hover:underline">
                      Go back home
                    </a>
                  </div>
                }
              />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App