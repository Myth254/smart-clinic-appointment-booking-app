/* eslint-disable no-unused-vars */
import { useState, useContext, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import Header from './Header'
import registerImage from '../../assets/register-image.jpeg'
import toast from 'react-hot-toast'

export default function Register() {
  const navigate = useNavigate()
  const { register } = useContext(AuthContext)

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    role: 'patient',
    agreeToTerms: false,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Password strength checker
  const passwordStrength = useMemo(() => {
    const password = formData.password
    if (!password) return { score: 0, label: '', color: '', criteria: [] }

    const criteria = [
      { met: password.length >= 8, text: 'At least 8 characters' },
      { met: /[a-z]/.test(password), text: 'One lowercase letter' },
      { met: /[A-Z]/.test(password), text: 'One uppercase letter' },
      { met: /\d/.test(password), text: 'One number' },
      { met: /[!@#$%^&*(),.?":{}|<>]/.test(password), text: 'One special character' },
    ]

    const score = criteria.filter(c => c.met).length

    let label = ''
    let color = ''
    
    if (score <= 2) {
      label = 'Weak'
      color = 'bg-red-500'
    } else if (score === 3) {
      label = 'Fair'
      color = 'bg-orange-500'
    } else if (score === 4) {
      label = 'Good'
      color = 'bg-yellow-500'
    } else {
      label = 'Strong'
      color = 'bg-green-500'
    }

    return { score, label, color, criteria }
  }, [formData.password])

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setFormData({ ...formData, [e.target.name]: value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validation
    if (formData.password !== formData.confirmPassword) {
      return setError('Passwords do not match')
    }

    // Check password strength
    if (passwordStrength.score < 4) {
      return setError('Please create a stronger password. Your password should meet at least 4 of the 5 criteria.')
    }

    if (!formData.phoneNumber.trim()) {
      return setError('Phone number is required')
    }

    if (!formData.emergencyContactName.trim()) {
      return setError('Emergency contact name is required')
    }

    if (!formData.emergencyContactPhone.trim()) {
      return setError('Emergency contact phone number is required')
    }

    if (!formData.dateOfBirth) {
      return setError('Date of birth is required')
    }

    // Validate age (must be at least 13 years old)
    const today = new Date()
    const birthDate = new Date(formData.dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }

    if (age < 13) {
      return setError('You must be at least 13 years old to register')
    }

    if (!formData.agreeToTerms) {
      return setError('Please agree to the Terms of Service and Privacy Policy')
    }

    try {
      setLoading(true)
<<<<<<< Updated upstream
      
      // Prepare registration data (remove confirmPassword and agreeToTerms)
      const { confirmPassword, agreeToTerms, emergencyContactName, emergencyContactPhone, ...registrationData } = formData
      
      // Add emergency contact structure required by backend
      registrationData.emergencyContact = {
        name: emergencyContactName,
        phoneNumber: emergencyContactPhone
      }
      
      // Call register function from AuthContext
=======
      const { ...registrationData } = formData
>>>>>>> Stashed changes
      await register(registrationData)
      
      // ✅ Success - Navigate to login page
      toast.success('Account created successfully! Please login to continue.')
      setTimeout(() => navigate('/login'), 1500)
    } catch (err) {
      console.error('Registration error:', err)
      setError(err.response?.data?.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Header />

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-73px)] bg-gray-50">
        <div className="max-w-7xl mx-auto w-full flex flex-col lg:flex-row px-4 sm:px-6 lg:px-12 xl:px-16">
          {/* Left image section */}
          <div className="lg:w-1/2 flex justify-center items-center py-8 lg:py-12 lg:pr-8">
            <img
              src={registerImage}
              alt="Healthcare professional"
              className="rounded-3xl shadow-2xl object-cover w-full max-w-lg h-[600px]"
            />
          </div>

          {/* Right form section */}
          <div className="lg:w-1/2 flex flex-col justify-center py-8 lg:py-12 lg:pl-8">
            <div className="w-full mx-auto">
              <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-200">
                <h2 className="text-2xl font-semibold mb-2 text-black">
                  Create Patient Account
                </h2>
                <p className="text-gray-500 mb-8 text-sm">
                  Join MediBook to start booking appointments with healthcare providers
                </p>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-black mb-2">
                        First Name
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        placeholder="John"
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                        value={formData.firstName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-black mb-2">
                        Last Name
                      </label>
                      <input
                        type="text"
                        name="lastName"
                        placeholder="Doe"
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                        value={formData.lastName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      name="email"
                      placeholder="john.doe@example.com"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-black mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        name="phoneNumber"
                        placeholder="+254123456789"
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                        value={formData.phoneNumber}
                        onChange={handleChange}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-black mb-2">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        name="dateOfBirth"
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                        value={formData.dateOfBirth}
                        onChange={handleChange}
                        max={new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                  </div>

                  {/* Emergency Contact Section */}
                  <div className="border-t border-gray-200 pt-5 mt-2">
                    <h3 className="text-sm font-semibold text-black mb-3">Emergency Contact</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-black mb-2">
                          Name
                        </label>
                        <input
                          type="text"
                          name="emergencyContactName"
                          placeholder="Jane Doe"
                          className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                          value={formData.emergencyContactName}
                          onChange={handleChange}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-black mb-2">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          name="emergencyContactPhone"
                          placeholder="+254987654321"
                          className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                          value={formData.emergencyContactPhone}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        placeholder="••••••••"
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-11 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                        value={formData.password}
                        onChange={handleChange}
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

                    {/* Password Strength Indicator */}
                    {formData.password && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600">
                            Password Strength:
                          </span>
                          <span className={`text-xs font-semibold ${
                            passwordStrength.score <= 2 ? 'text-red-600' :
                            passwordStrength.score === 3 ? 'text-orange-600' :
                            passwordStrength.score === 4 ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {passwordStrength.label}
                          </span>
                        </div>
                        
                        {/* Strength Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                          <div 
                            className={`h-2 rounded-full transition-all duration-300 ${passwordStrength.color}`}
                            style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                          />
                        </div>

                        {/* Criteria Checklist */}
                        <div className="space-y-1.5">
                          {passwordStrength.criteria.map((criterion, index) => (
                            <div key={index} className="flex items-center gap-2">
                              {criterion.met ? (
                                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                              )}
                              <span className={`text-xs ${criterion.met ? 'text-gray-700' : 'text-gray-500'}`}>
                                {criterion.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-2">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirmPassword"
                        placeholder="••••••••"
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-11 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-gray-50 text-sm"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                      >
                        {showConfirmPassword ? (
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
                    
                    {/* Password Match Indicator */}
                    {formData.confirmPassword && (
                      <div className="mt-2 flex items-center gap-2">
                        {formData.password === formData.confirmPassword ? (
                          <>
                            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-xs text-green-600">Passwords match</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <span className="text-xs text-red-600">Passwords do not match</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      name="agreeToTerms"
                      id="agreeToTerms"
                      className="mt-1 w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
                      checked={formData.agreeToTerms}
                      onChange={handleChange}
                      required
                    />
                    <label htmlFor="agreeToTerms" className="text-sm text-gray-600">
                      I agree to the Terms of Service and Privacy Policy. I consent to receive appointment notifications via SMS and email.
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Creating Account...' : 'Create Account'}
                  </button>

                  <p className="text-sm text-center text-gray-600 pt-2">
                    Already have an account?{' '}
                    <Link to="/login" className="text-black font-medium hover:underline">
                      Sign in
                    </Link>
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}