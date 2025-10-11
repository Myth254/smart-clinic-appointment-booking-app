import { useContext } from 'react'
import { AuthContext } from '../../context/AuthContext'

export default function Dashboard() {
  const { user, logout } = useContext(AuthContext)

  if (!user) {
    return (
      <div className="flex justify-center items-center h-screen text-gray-600">
        Loading user data...
      </div>
    )
  }

  const { firstName, lastName, email, role } = user

  // Define role-based greeting
  const greeting =
    role === 'doctor'
      ? `Welcome, Dr. ${lastName || firstName}`
      : role === 'admin'
      ? `Welcome, Admin ${firstName}`
      : `Welcome, ${firstName}`

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <header className="flex justify-between items-center bg-white shadow-sm p-4 px-8">
        <h1 className="text-xl font-semibold text-gray-800">
          MediBook Dashboard
        </h1>
        <button
          onClick={logout}
          className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition"
        >
          Logout
        </button>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center justify-center flex-1 text-center p-6">
        <div className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-md">
          <h2 className="text-2xl font-semibold mb-2">
            {greeting}👋
          </h2>
          <p className="text-gray-500 mb-6">Role: {role}</p>

          <div className="text-left text-gray-700 space-y-3">
            <div>
              <span className="font-medium">Email:</span> {email}
            </div>
            <div>
              <span className="font-medium">Account Type:</span>{' '}
              {role === 'patient'
                ? 'Patient (Book and manage appointments)'
                : role === 'doctor'
                ? 'Doctor (View and manage your schedule)'
                : 'Admin (Manage users and appointments)'}
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={logout}
              className="bg-black text-white w-full py-2 rounded hover:bg-gray-900 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}