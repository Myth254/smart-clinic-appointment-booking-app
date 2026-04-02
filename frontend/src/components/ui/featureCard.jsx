import React from 'react';
import { useTheme } from '../../context/ThemeContext';

// eslint-disable-next-line no-unused-vars
const FeatureCard = ({ icon: Icon, title, description }) => {
  const { isDark } = useTheme();
  
  return (
    <div 
      className={`${isDark ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'} p-8 rounded-xl transition-all hover:shadow-lg`}
    >
      <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-200'} w-14 h-14 rounded-lg flex items-center justify-center mb-6 transition-colors`}>
        <Icon className={`w-7 h-7 ${isDark ? 'text-blue-400' : 'text-gray-700'}`} />
      </div>
      <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-3`}>
        {title}
      </h3>
      <p className={`${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
        {description}
      </p>
    </div>
  );
};

export default FeatureCard;