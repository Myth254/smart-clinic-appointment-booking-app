import React, { useState } from 'react';
import { Calendar, Clock, User, FileText, CheckCircle, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const CreateMedicalRecordsTab = ({ 
  appointments, 
  onSelectAppointment,
  onMarkComplete,
  loading 
}) => {
  const [selectedFilter, setSelectedFilter] = useState('approved');
  
  // Filter appointments based on status
  const filteredAppointments = appointments.filter(apt => {
    if (selectedFilter === 'all') return true;
    return apt.status === selectedFilter;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Instructions Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Create Medical Records
            </h3>
            <ol className="text-blue-800 space-y-1 text-sm list-decimal list-inside">
              <li>View confirmed appointments below</li>
              <li>Click "Create Record" to document the patient visit</li>
              <li>Fill in diagnosis, prescriptions, and other medical details</li>
              <li>Save the record to automatically mark the appointment as complete</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold mb-1">Appointments</h2>
          <p className="text-sm text-gray-500">
            Select an appointment to create medical records
          </p>
        </div>

        <div className="border-b border-gray-200">
          <div className="flex space-x-8 px-6">
            <button
              onClick={() => setSelectedFilter('approved')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                selectedFilter === 'approved'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Confirmed Appointments
            </button>
            <button
              onClick={() => setSelectedFilter('completed')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                selectedFilter === 'completed'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Completed
            </button>
            {/* <button
              onClick={() => setSelectedFilter('all')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                selectedFilter === 'all'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              All Appointments
            </button> */}
          </div>
        </div>

        {/* Appointments List */}
        <div className="divide-y divide-gray-200">
          {loading && filteredAppointments.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              Loading appointments...
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p>No {selectedFilter} appointments</p>
            </div>
          ) : (
            filteredAppointments.map((appointment) => (
              <div
                key={appointment._id}
                className="p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex space-x-4 flex-1">
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-6 h-6 text-gray-600" />
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-lg">
                          {appointment.patient?.firstName}{' '}
                          {appointment.patient?.lastName}
                        </h3>
                        <span
                          className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(
                            appointment.status
                          )}`}
                        >
                          {appointment.status.charAt(0).toUpperCase() +
                            appointment.status.slice(1)}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {format(
                              parseISO(appointment.start),
                              'EEE, MMM d, yyyy'
                            )}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="w-4 h-4" />
                          <span>
                            {format(parseISO(appointment.start), 'h:mm a')}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 text-sm">
                        <div>
                          <span className="text-gray-500">Reason:</span>{' '}
                          <span className="text-gray-900">
                            {appointment.reason || 'General checkup'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Phone:</span>{' '}
                          <span className="text-gray-900">
                            {appointment.patient?.phoneNumber}
                          </span>
                        </div>
                      </div>

                      {appointment.notes && (
                        <div className="text-sm">
                          <span className="text-gray-500">Notes:</span>{' '}
                          <span className="text-gray-700">
                            {appointment.notes}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {appointment.status === 'approved' && (
                      <>
                        <button
                          onClick={() => onSelectAppointment(appointment)}
                          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 flex items-center space-x-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Create Record</span>
                        </button>
                        <button
                          onClick={() => onMarkComplete(appointment._id)}
                          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Mark Complete</span>
                        </button>
                      </>
                    )}
                    {appointment.status === 'completed' && (
                      <button
                        onClick={() => onSelectAppointment(appointment)}
                        className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 flex items-center space-x-2"
                      >
                        <FileText className="w-4 h-4" />
                        <span>View/Add Record</span>
                      </button>
                    )}
                    {appointment.status === 'pending' && (
                      <div className="text-sm text-gray-500">
                        Awaiting confirmation
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateMedicalRecordsTab;