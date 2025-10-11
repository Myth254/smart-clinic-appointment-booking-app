import { useState } from 'react'
import { createUser } from '../../api/userApi'

export default function AdminDashboard() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    role: 'doctor'
  })
  const [message, setMessage] = useState('')

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const res = await createUser(formData)
      setMessage(res.data.message)
    } catch (err) {
      setMessage(err.response?.data?.message || 'Error creating user')
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-12 bg-white p-6 rounded-xl shadow">
      <h2 className="text-xl font-semibold mb-4">Create Doctor Account</h2>
      {message && <p className="text-sm text-center text-gray-700 mb-4">{message}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input name="firstName" placeholder="First Name" value={formData.firstName} onChange={handleChange} required />
        <input name="lastName" placeholder="Last Name" value={formData.lastName} onChange={handleChange} required />
        <input name="email" type="email" placeholder="Email" value={formData.email} onChange={handleChange} required />
        <input name="phoneNumber" placeholder="Phone Number" value={formData.phoneNumber} onChange={handleChange} required />
        <input name="password" type="password" placeholder="Password" value={formData.password} onChange={handleChange} required />
        <select name="role" value={formData.role} onChange={handleChange}>
          <option value="doctor">Doctor</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" className="w-full bg-black text-white py-2 rounded">Create</button>
      </form>
    </div>
  )
}
