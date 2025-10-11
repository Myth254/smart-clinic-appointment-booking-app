import { useState, useEffect } from 'react';
import axiosClient from '../../api/axiosClient';
import { AuthContext } from '../../context/AuthContext';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (token) {
        try {
          const res = await axiosClient.get('/auth/me');
          setUser(res.data);
        } catch (err) {
          console.error('Auth check failed:', err);
          localStorage.removeItem('token');
          setToken(null);
        }
      }
      setLoading(false);
    };
    fetchProfile();
  }, [token]);

  const login = async (email, password) => {
    const res = await axiosClient.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  const register = async (data) => {
    try {
      const res = await axiosClient.post('/auth/register', data)

      if (!res.data || !res.data.token || !res.data.user) {
        throw new Error('Invalid server response. Please try again.')
      }

      // Save token and user to local storage + state
      localStorage.setItem('token', res.data.token)
      setToken(res.data.token)
      setUser(res.data.user)
    } catch (error) {
      console.error('Registration failed:', error.response?.data || error.message)

      // Optional: clear any partial session
      localStorage.removeItem('token')
      setToken(null)
      setUser(null)

      // Re-throw so the component using it (Register.jsx) can display the error
      throw error
    }
  }

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, register, logout, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
};