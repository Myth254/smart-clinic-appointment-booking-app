import React, { useState } from 'react';
import { Calendar, Menu, X, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { Link } from 'react-router-dom';
import { useDashboardRedirect } from '../../hooks/useDashboardRedirect';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();

  const { user, token, getDashboardPath } = useDashboardRedirect();

  return (
    <header className={`${isDark ? 'bg-gray-900' : 'bg-white'} border-b ${isDark ? 'border-gray-800' : 'border-gray-100'} sticky top-0 z-50 transition-colors`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <div className={`${isDark ? 'bg-blue-600' : 'bg-gray-900'} p-2 rounded-lg`}>
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <span className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>MediBook</span>
          </div>

          <div className="hidden md:flex items-center space-x-6">
            <button 
              onClick={toggleTheme}
              className={`p-2 rounded-lg ${isDark ? 'bg-gray-800 text-yellow-400' : 'bg-gray-100 text-gray-600'} hover:opacity-80 transition-opacity`}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Link
              to={token ? getDashboardPath(token, user) : '/login'}
              className={`${isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
            >
              {token ? 'Dashboard' : 'Log In'}
            </Link>

            <Link
              to={token ? getDashboardPath() : '/register'}
              className={`${isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-900 hover:bg-gray-800'} text-white px-6 py-2 rounded-lg transition-colors`}
            >
              {token ? 'Go to Dashboard' : 'Get Started'}
            </Link>
          </div>

          <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X className={isDark ? 'text-white' : 'text-gray-900'} /> : <Menu className={isDark ? 'text-white' : 'text-gray-900'} />}
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className={`md:hidden ${isDark ? 'bg-gray-800' : 'bg-gray-50'} border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="px-4 py-3 space-y-3">
            <button 
              onClick={toggleTheme}
              className={`w-full flex items-center justify-center space-x-2 p-2 rounded-lg ${isDark ? 'bg-gray-700 text-yellow-400' : 'bg-white text-gray-600'}`}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              <span>Toggle Theme</span>
            </button>
            <a href="#" className={`block ${isDark ? 'text-gray-300' : 'text-gray-600'} hover:opacity-80`}>Log In</a>
            <button className={`w-full ${isDark ? 'bg-blue-600' : 'bg-gray-900'} text-white px-6 py-2 rounded-lg`}>
              Get Started
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
