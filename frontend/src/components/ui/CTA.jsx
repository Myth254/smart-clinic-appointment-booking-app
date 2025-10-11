import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { useDashboardRedirect } from '../../hooks/useDashboardRedirect';

const CTA = () => {
  const { isDark } = useTheme();

  // eslint-disable-next-line no-unused-vars
  const { user, token, getDashboardPath } = useDashboardRedirect()

  return (
    <section
      className={`py-20 ${isDark ? 'bg-gray-950' : 'bg-white'} flex justify-center transition-colors`}
    >
      <div
        className={`
          max-w-5xl w-full mx-4 text-center rounded-2xl p-12 shadow-xl
          ${isDark ? 'bg-gray-900' : 'bg-[#0B0B14]'} 
          transition-all
        `}
      >
        <h2 className="text-2xl md:text-3xl font-semibold text-white mb-4">
          Ready to Get Started?
        </h2>
        <p className="text-gray-300 text-lg mb-8">
          Join thousands of patients and healthcare providers using MediBook to manage appointments
          efficiently.
        </p>
        <Link
          to={token ? getDashboardPath() : '/register'}
          className="bg-white text-gray-900 hover:bg-gray-100 px-8 py-3 rounded-lg font-medium transition-colors shadow-sm"
        >
          {token ? 'Go to Dashboard' : 'Create Your Account'}
        </Link>
      </div>
    </section>
  );
};

export default CTA;
