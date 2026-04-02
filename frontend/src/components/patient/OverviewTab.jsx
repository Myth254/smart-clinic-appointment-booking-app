import React from 'react';
import { Calendar, User, Clock, Plus, FileText, Bell, Settings } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const OverviewTab = ({ 
  appointments, 
  loading, 
  onBookNew, 
  onReschedule, 
  onCancel,
  onViewRecords,
  onViewNotifications,
  onViewSettings 
}) => {
  const formatDate = (dateString) => {
    try {
      return format(parseISO(dateString), 'EEE, MMM d');
    } catch {
      return dateString;
    }
  };

  const formatTime = (dateString) => {
    try {
      return format(parseISO(dateString), 'h:mm a');
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      approved: 'bg-green-100 text-green-800',
      pending_confirmation: 'bg-amber-100 text-amber-800',
      pending: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
      completed: 'bg-blue-100 text-blue-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Upcoming Appointments Section */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Upcoming Appointments</h2>
              <p className="text-sm text-gray-500">Your scheduled appointments</p>
            </div>
            <button
              onClick={onBookNew}
              className="bg-black text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-gray-800"
            >
              <Plus className="w-4 h-4" />
              <span>Book New</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {loading && appointments.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              Loading appointments...
            </div>
          ) : appointments.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No upcoming appointments</p>
              <p className="text-xs mt-1">Book one to get started!</p>
              <button
                onClick={onBookNew}
                className="mt-4 px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
              >
                Book Appointment
              </button>
            </div>
          ) : (
            appointments.map((appointment) => (
              <div key={appointment._id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex space-x-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-6 h-6 text-gray-600" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-medium">
                        Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {appointment.doctor?.specialization}
                      </p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(appointment.start)}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="w-4 h-4" />
                          <span>{formatTime(appointment.start)}</span>
                        </div>
                      </div>
                      {appointment.reason && (
                        <p className="text-sm text-gray-600 mt-2">
                          <span className="font-medium">Reason:</span> {appointment.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(appointment.status)}`}>
                      {appointment.status}
                    </span>
                    <button
                      onClick={() => onReschedule(appointment)}
                      disabled={loading}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Reschedule
                    </button>
                    <button
                      onClick={() => onCancel(appointment._id)}
                      disabled={loading}
                      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={onBookNew}
            className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium">Book Appointment</div>
              <div className="text-sm text-gray-500">Schedule a new visit</div>
            </div>
          </button>

          <button
            onClick={onViewRecords}
            className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium">View Records</div>
              <div className="text-sm text-gray-500">Access medical history</div>
            </div>
          </button>

          <button 
            onClick={onViewNotifications}
            className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium">Notifications</div>
              <div className="text-sm text-gray-500">Manage reminders</div>
            </div>
          </button>

          <button 
            onClick={onViewSettings}
            className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium">Settings</div>
              <div className="text-sm text-gray-500">Update your profile</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;