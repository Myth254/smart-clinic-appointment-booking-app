import { useState, useEffect } from 'react';
import { authAPI } from '../../api';
import { AuthContext } from '../../context/AuthContext';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  // ✅ Helper function to normalize user object (ensures both id and _id exist)
  const normalizeUser = (userData) => {
    if (!userData) return null;
    
    return {
      ...userData,
      id: userData._id || userData.id,
      _id: userData._id || userData.id
    };
  };

  // 🔹 Fetch current user profile on mount or token change
  useEffect(() => {
    const fetchProfile = async () => {
      if (token) {
        try {
          const data = await authAPI.getMe();
          
          // ✅ Normalize user data from backend
          const normalizedUser = normalizeUser(data);
          
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ User loaded:', normalizedUser);
          }
          
          setUser(normalizedUser);
          
          // ✅ Sync to localStorage for persistence
          localStorage.setItem('user', JSON.stringify(normalizedUser));
        } catch (err) {
          console.error('❌ Auth check failed:', err);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        }
      } else {
        // No token, check if we have cached user data
        const cachedUser = localStorage.getItem('user');
        if (cachedUser) {
          try {
            const parsedUser = JSON.parse(cachedUser);
            setUser(normalizeUser(parsedUser));
          } catch (err) {
            console.error('Failed to parse cached user:', err);
            localStorage.removeItem('user');
          }
        }
      }
      setLoading(false);
    };

    fetchProfile();
  }, [token]);

  // 🔹 Login: stores token + user info and returns user
  const login = async (email, password) => {
    try {
      const data = await authAPI.login({ email, password });

      if (!data?.token || !data?.user) {
        throw new Error('Invalid login response from server.');
      }

      // ✅ Normalize user object
      const normalizedUser = normalizeUser(data.user);

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      
      setToken(data.token);
      setUser(normalizedUser);

      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Login successful:', normalizedUser.email);
      }

      return normalizedUser;
    } catch (error) {
      console.error('❌ Login failed:', error.response?.data || error.message);
      throw error;
    }
  };

  // 🔹 Register new user
  const register = async (registrationData) => {
    try {
      const data = await authAPI.register(registrationData);

      if (!data?.token || !data?.user) {
        throw new Error('Invalid registration response from server.');
      }

      // ✅ Normalize user object
      const normalizedUser = normalizeUser(data.user);

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      
      setToken(data.token);
      setUser(normalizedUser);

      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Registration successful:', normalizedUser.email);
      }

      return normalizedUser;
    } catch (error) {
      console.error('❌ Registration failed:', error.response?.data || error.message);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
      throw error;
    }
  };

  // 🔹 Logout
  const logout = async () => {
    try {
      // Call logout API endpoint
      await authAPI.logout();
      
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Logout successful');
      }
    } catch (error) {
      console.error('❌ Logout API call failed:', error);
    } finally {
      // Clear local state regardless of API response
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
      setToken(null);
    }
  };

  // 🔹 Update user data (e.g., after profile update)
  const updateUser = (updatedData) => {
    setUser((prevUser) => {
      // ✅ Merge updates with existing user and normalize
      const updatedUser = normalizeUser({
        ...prevUser,
        ...updatedData
      });
      
      // ✅ Sync to localStorage
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ User updated:', updatedUser);
      }
      
      return updatedUser;
    });
  };

  // 🔹 Refresh user data from backend
  const refreshUser = async () => {
    if (!token) return;
    
    try {
      const data = await authAPI.getMe();
      const normalizedUser = normalizeUser(data);
      
      setUser(normalizedUser);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      
      return normalizedUser;
    } catch (error) {
      console.error('❌ Failed to refresh user:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{ 
        user, 
        token, 
        login, 
        register, 
        logout, 
        loading, 
        updateUser,
        refreshUser  // ✅ Export refresh function
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};