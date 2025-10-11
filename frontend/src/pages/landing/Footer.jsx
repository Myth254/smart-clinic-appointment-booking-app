import React from 'react';
import { useTheme } from '../../context/ThemeContext';

const Footer = () => {
  const { isDark } = useTheme();

  return (
    <footer className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border-t py-8 transition-colors`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 text-center">
        <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          © 2025 MediBook. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;