import { useState, useContext } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import Header from './Header'
import loginImage from '../../assets/login-image.jpeg'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useContext(AuthContext)
  const [role, setRole] = useState('patient')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      setLoading(true)
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
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
              {['patient', 'doctor', 'admin'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2.5 rounded-full text-sm font-medium capitalize transition-all ${
                    role === r
                      ? 'bg-white shadow-sm text-black'
                      : 'text-gray-600 hover:text-black'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
              {role === 'admin' && (
                <div className="text-xs text-red-600 mb-4 flex items-center justify-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                  </svg>
                  Authorized personnel only
                </div>
              )}
              
              <h2 className="text-2xl font-semibold mb-2 capitalize text-black">
                {role} Login
              </h2>
              <p className="text-gray-500 text-sm mb-8">
                Sign in to book and manage your appointments
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="patient@example.com"
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
                  <button type="button" className="text-sm text-black hover:underline font-medium">
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

                <p className="text-sm text-center text-gray-600 pt-2">
                  Don't have an account?{' '}
                  <Link to="/register" className="text-black font-medium hover:underline">
                    Sign up
                  </Link>
                </p>
              </form>
            </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}