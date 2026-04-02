import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Link } from 'react-router-dom';
import { useDashboardRedirect } from '../../hooks/useDashboardRedirect';

const Hero = () => {
  const { isDark } = useTheme();

  const { token, getDashboardPath } = useDashboardRedirect();

  return (
    <section className={`${isDark ? 'bg-gradient-to-b from-gray-900 to-gray-800' : 'bg-gradient-to-b from-white to-gray-50'} pt-8 md:pt-16 pb-16 transition-colors`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className={`text-4xl md:text-5xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-6`}>
              Clinic Appointments Made Simple
            </h1>
            <p className={`text-lg ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-8`}>
              Book appointments with your healthcare providers instantly. Get real-time confirmations, reminders, and manage all your medical appointments in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to={token ? getDashboardPath() : '/login'}
                className={`${isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-900 hover:bg-gray-800'} text-white px-8 py-3 rounded-lg font-medium transition-colors`}
              >
                {token ? 'Go to Dashboard' : 'Book an Appointment'}
              </Link>
              <Link
                to={token ? getDashboardPath() : '/login'}
                className={`${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-white hover:bg-gray-50 text-gray-900'} border ${isDark ? 'border-gray-600' : 'border-gray-300'} px-8 py-3 rounded-lg font-medium transition-colors`}
              >
                {token ? 'Go to Dashboard' : 'Sign In'}
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-8 mt-12">
              <div>
                <div className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-1`}>800+</div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Patients</div>
              </div>
              <div>
                <div className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-1`}>50+</div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Doctors</div>
              </div>
              <div>
                <div className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-1`}>10+</div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Clinics</div>
              </div>
            </div>
          </div>
          <div className={`${isDark ? 'bg-gradient-to-br from-gray-700 to-gray-800' : 'bg-gradient-to-br from-gray-200 to-gray-300'} rounded-2xl overflow-hidden shadow-2xl transition-colors`}>
            <img 
              src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&h=600&fit=crop" 
              alt="Healthcare professional"
              className="w-full h-full object-cover opacity-90"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
