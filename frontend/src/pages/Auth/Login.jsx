import { useState, useContext } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import { authAPI } from '../../api'
import Header from './Header'
import loginImage from '../../assets/login-image.jpeg'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useContext(AuthContext)
  const [role, setRole] = useState('patient')
  const [clinicStaffRole, setClinicStaffRole] = useState('doctor')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // Forgot password modal states
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetError, setResetError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      setLoading(true)

      const loggedInUser = await login(email, password)

      if (!loggedInUser || !loggedInUser.role) {
        throw new Error('Invalid user data returned')
      }

      // Role-based navigation
      switch (loggedInUser.role.toLowerCase()) {
        case 'admin':
          navigate('/admin/dashboard')
          break
        case 'doctor':
          navigate('/doctor/dashboard')
          break
        case 'lab_personnel':
          navigate('/lab/dashboard')
          break
        case 'pharmacy_staff':
          navigate('/pharmacy/dashboard')
          break
        default:
          navigate('/patient/dashboard')
          break
      }
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setResetError('')
    setResetSuccess(false)

    if (!resetEmail) {
      setResetError('Please enter your email address')
      return
    }

    try {
      setResetLoading(true)
      await authAPI.forgotPassword(resetEmail)
      setResetSuccess(true)
      setResetEmail('')
    } catch (err) {
      console.error(err)
      setResetError(err.response?.data?.message || 'Failed to send reset email. Please try again.')
    } finally {
      setResetLoading(false)
    }
  }

  const closeForgotPasswordModal = () => {
    setShowForgotPassword(false)
    setResetEmail('')
    setResetError('')
    setResetSuccess(false)
  }

  // Get display text for roles
  const getRoleDisplayText = () => {
    const roleMap = {
      patient: 'Patient',
      clinic_staff: 'Clinic Staff',
      admin: 'Admin'
    }
    return roleMap[role] || role
  }

  const getClinicStaffDisplayText = () => {
    const staffRoleMap = {
      doctor: 'Doctor',
      lab_personnel: 'Lab Personnel',
      pharmacy_staff: 'Pharmacy Staff'
    }
    return staffRoleMap[clinicStaffRole] || clinicStaffRole
  }

  return (
    <>
      <Header />

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-73px)] bg-gray-50">
        <div className="max-w-7xl mx-auto w-full flex flex-col lg:flex-row px-4 sm:px-6 lg:px-12 xl:px-16">
          {/* Left image */}
          <div className="lg:w-1/2 flex justify-center items-center py-8 lg:py-12 lg:pr-8">
            <img
              src={loginImage}
              alt="Medical professionals"
              className="rounded-3xl shadow-2xl object-cover w-full max-w-lg h-[500px]"
            />
          </div>

          {/* Right form */}
          <div className="lg:w-1/2 flex flex-col justify-center py-8 lg:py-12 lg:pl-8">
            <div className="max-w-md w-full mx-auto">
              {/* Role tabs */}
              <div className="flex justify-between bg-gray-100 rounded-full mb-8 p-1.5">
                {['patient', 'clinic_staff', 'admin'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={`flex-1 py-2.5 rounded-full text-sm font-medium transition-all ${
                      role === r
                        ? 'bg-white shadow-sm text-black'
                        : 'text-gray-600 hover:text-black'
                    }`}
                  >
                    {r === 'clinic_staff' ? 'Clinic Staff' : r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>

              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                {/* Admin warning */}
                {role === 'admin' && (
                  <div className="text-xs text-red-600 mb-4 flex items-center justify-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                    </svg>
                    Authorized personnel only
                  </div>
                )}
                
                <h2 className="text-2xl font-semibold mb-2 text-black">
                  {getRoleDisplayText()} Login
                </h2>
                <p className="text-gray-500 text-sm mb-8">
                  {role === 'patient' && 'Sign in to book and manage your appointments'}
                  {role === 'clinic_staff' && 'Access your clinic management dashboard'}
                  {role === 'admin' && 'Access administrative controls'}
                </p>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Clinic Staff Role Dropdown */}
                  {role === 'clinic_staff' && (
                    <div>
                      <label className="block text-sm font-medium text-black mb-2">
                        Staff Type
                      </label>
                      <div className="relative">
                        <select
                          value={clinicStaffRole}
                          onChange={(e) => setClinicStaffRole(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm appearance-none cursor-pointer"
                        >
                          <option value="doctor">Doctor</option>
                          <option value="lab_personnel">Lab Personnel</option>
                          <option value="pharmacy_staff">Pharmacy Staff</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Currently logging in as: <span className="font-medium text-black">{getClinicStaffDisplayText()}</span>
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-black mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      placeholder={
                        role === 'patient' ? 'patient@example.com' :
                        role === 'clinic_staff' ? 'staff@clinic.com' :
                        'admin@medibook.com'
                      }
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-11 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="text-center">
                    <button 
                      type="button" 
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-black hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Signing In...' : 'Sign In'}
                  </button>

                  {role === 'patient' && (
                    <p className="text-sm text-center text-gray-600 pt-2">
                      Don't have an account?{' '}
                      <Link to="/register" className="text-black font-medium hover:underline">
                        Sign up
                      </Link>
                    </p>
                  )}
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
            <button
              onClick={closeForgotPasswordModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {!resetSuccess ? (
              <>
                <div className="mb-6">
                  <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-semibold text-black mb-2">
                    Forgot Password?
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Enter your email address and we'll send you a link to reset your password.
                  </p>
                </div>

                {resetError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">
                    {resetError}
                  </div>
                )}

                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-black mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeForgotPasswordModal}
                      className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="flex-1 bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resetLoading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold text-black mb-2">
                  Check Your Email
                </h3>
                <p className="text-gray-600 text-sm mb-6">
                  We've sent a password reset link to your email address. Please check your inbox and follow the instructions.
                </p>
                <button
                  onClick={closeForgotPasswordModal}
                  className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
                >
                  Got It
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}