import React from 'react';
import { Calendar, Bell, Clock, Users, BarChart3, Shield } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import FeatureCard from '../../components/ui/FeatureCard';

const Features = () => {
  const { isDark } = useTheme();
  
  const features = [
    {
      icon: Calendar,
      title: "Easy Scheduling",
      description: "View available time slots in real-time and book appointments instantly with your preferred healthcare provider."
    },
    {
      icon: Bell,
      title: "Smart Notifications",
      description: "Receive SMS and email confirmations, reminders, and updates about your appointments automatically."
    },
    {
      icon: Clock,
      title: "Real-Time Updates",
      description: "Stay informed with live calendar updates, appointment status changes, and schedule modifications."
    },
    {
      icon: Users,
      title: "Patient Records",
      description: "Access your complete appointment history and medical notes from previous visits all in one place."
    },
    {
      icon: BarChart3,
      title: "Analytics Dashboard",
      description: "Track appointment trends, patient flow, and clinic performance with comprehensive analytics tools."
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description: "Your health data is protected with enterprise-level security and HIPAA-compliant data handling."
    }
  ];
  
  return (
    <section className={`pt-20 ${isDark ? 'bg-gray-900' : 'bg-white'} transition-colors`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className={`text-3xl md:text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-4`}>
            Everything You Need for Appointment Management
          </h2>
          <p className={`text-lg ${isDark ? 'text-gray-300' : 'text-gray-600'} max-w-3xl mx-auto`}>
            Our comprehensive platform helps patients, doctors, and clinic administrators manage healthcare appointments efficiently.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <FeatureCard 
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
