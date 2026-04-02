import React from 'react';
import { Calendar, Pill, CreditCard } from 'lucide-react';

const StatsCards = ({ stats, statsLoading, onCardClick }) => {
  if (statsLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((card) => (
          <div
            key={card}
            className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-5 w-5 bg-gray-200 rounded" />
            </div>
            <div className="space-y-2">
              <div className="h-9 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      id: 'appointments',
      title: 'Upcoming Appointments',
      value: stats.upcomingAppointments,
      subtitle: stats.upcomingAppointments > 0 
        ? `Next in ${stats.nextAppointmentDays} days`
        : 'No upcoming appointments',
      icon: Calendar,
      color: 'gray'
    },
    {
      id: 'prescriptions',
      title: 'Prescriptions',
      value: stats.activePrescriptions,
      subtitle: 'Active prescriptions',
      icon: Pill,
      color: 'gray',
      clickable: true
    },
    {
      id: 'payments',
      title: 'Payments',
      value: stats.pendingPayments,
      subtitle: 'Pending payments',
      icon: CreditCard,
      color: 'gray',
      clickable: true
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            onClick={() => card.clickable && onCardClick(card.id)}
            className={`bg-white rounded-lg border border-gray-200 p-6 ${
              card.clickable ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-gray-600 text-sm font-medium">{card.title}</h3>
              <Icon className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-bold">{card.value}</p>
              <p className="text-sm text-gray-500">{card.subtitle}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsCards;
