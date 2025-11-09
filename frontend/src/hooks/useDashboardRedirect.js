import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

export const useDashboardRedirect = () => {
  const { user, token } = useContext(AuthContext)

  const getDashboardPath = () => {
    if (!token || !user) return '/login'
    switch (user.role) {
      case 'admin':
        return '/admin/dashboard'
      case 'doctor':
        return '/doctor/dashboard'
      default:
        return '/patient/dashboard'
    }
  }

  return { user, token, getDashboardPath }
}