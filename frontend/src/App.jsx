import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from './components/layout/ThemeProvider'
import { AuthProvider } from './components/layout/AuthProvider'
import { NotificationProvider, NotificationPollingService } from './context/NotificationContext'
import { useAuth } from './context/AuthContext'
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

/**
 * AppContent component - handles routing and notification polling
 * Must be inside AuthProvider to access authentication state
 */
const AppContent = () => {
  const { isAuthenticated } = useAuth();

  return (
    <>
      {/* 
        🔔 Single Notification Polling Service
        Only runs when user is authenticated
        Automatically starts/stops based on auth state
      */}
      {isAuthenticated && (
        <NotificationPollingService 
          onUnreadCountChange={(count) => {
            // Optional: Log unread count changes
            if (import.meta.env.MODE === 'development') {
              console.log(`📬 Unread notifications: ${count}`);
            }
          }}
        />
      )}

      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />

      <div className="min-h-screen">
        <Routes>
          {/* 🌐 Public routes */}
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
    </>
  );
};

/**
 * Main App component
 * Sets up all providers in correct order
 */
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        {/* 
          🔔 NotificationProvider wraps entire app
          Provides notification state to all components
          IMPORTANT: Only render this ONCE here
        */}
        <NotificationProvider>
          <Router>
            <AppContent />
          </Router>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App