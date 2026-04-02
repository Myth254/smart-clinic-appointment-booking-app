import React from 'react';
import { X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

// Add helper function for time comparison
const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// ── FIX E: centralised status display maps ────────────────────────────────────
const STATUS_LABEL = {
  pending:     'Pending',
  approved:    'Confirmed',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
  'no-show':   'No Show',
};

const STATUS_COLOR = {
  pending:     'bg-yellow-100 text-yellow-800',
  approved:    'bg-green-100 text-green-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed:   'bg-blue-100 text-blue-800',
  cancelled:   'bg-red-100 text-red-800',
  'no-show':   'bg-orange-100 text-orange-800',
};
// ─────────────────────────────────────────────────────────────────────────────

const DoctorModals = ({
  // Availability Modal
  showAvailabilityModal,
  setShowAvailabilityModal,
  availabilityForm,
  setAvailabilityForm,
  availabilityRules,
  weekDaysFull,
  handleSetAvailability,
  
  // Block Time Modal
  showBlockTimeModal,
  setShowBlockTimeModal,
  blockTimeForm,
  setBlockTimeForm,
  handleBlockTime,
  
  // Appointment Details Modal
  showAppointmentDetails,
  setShowAppointmentDetails,
  selectedAppointment,
  handleUpdateStatus,
  handleSelectAppointment,
  onStartSession,   // FIX B: (appointment) => void — switches tab and starts session

  loading
}) => {
  
  // Client-side validation for overlapping availability
  const handleAvailabilitySubmit = (e) => {
    e.preventDefault();
    
    // Check for overlaps with existing rules on the same weekday
    const hasOverlap = availabilityRules
      .filter(r => r.weekday === availabilityForm.weekday)
      .some(rule => {
        const reqStart = timeToMinutes(availabilityForm.startTime);
        const reqEnd = timeToMinutes(availabilityForm.endTime);
        const ruleStart = timeToMinutes(rule.startTime);
        const ruleEnd = timeToMinutes(rule.endTime);
        
        // Check if times overlap: start before end AND end after start
        return reqStart < ruleEnd && reqEnd > ruleStart;
      });
    
    if (hasOverlap) {
      toast.error('Time slot overlaps with existing availability rule');
      return;
    }
    
    // Validate start time is before end time
    if (timeToMinutes(availabilityForm.startTime) >= timeToMinutes(availabilityForm.endTime)) {
      toast.error('End time must be after start time');
      return;
    }
    
    // Call the original handler if validation passes
    handleSetAvailability(e);
  };

  return (
    <>
      {/* Set Availability Modal */}
      {showAvailabilityModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Set Availability</h3>
                <button onClick={() => setShowAvailabilityModal(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {availabilityRules.filter(
              (r) => r.weekday === availabilityForm.weekday
            ).length > 0 && (
              <div className="mx-6 mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 font-medium mb-2">
                  Existing availability for{' '}
                  {weekDaysFull[availabilityForm.weekday]}:
                </p>
                <div className="space-y-1">
                  {availabilityRules
                    .filter((r) => r.weekday === availabilityForm.weekday)
                    .map((rule) => (
                      <p key={rule._id} className="text-xs text-yellow-700">
                        • {rule.startTime} - {rule.endTime}
                      </p>
                    ))}
                </div>
                <p className="text-xs text-yellow-600 mt-2">
                  New time slots cannot overlap with existing ones.
                </p>
              </div>
            )}

            <form onSubmit={handleAvailabilitySubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Day of Week
                </label>
                <select
                  value={availabilityForm.weekday}
                  onChange={(e) =>
                    setAvailabilityForm({
                      ...availabilityForm,
                      weekday: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                >
                  {weekDaysFull.map((day, idx) => (
                    <option key={idx} value={idx}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Start Time
                </label>
                <input
                  type="time"
                  value={availabilityForm.startTime}
                  onChange={(e) =>
                    setAvailabilityForm({
                      ...availabilityForm,
                      startTime: e.target.value,
                    })
                  }
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  End Time
                </label>
                <input
                  type="time"
                  value={availabilityForm.endTime}
                  onChange={(e) =>
                    setAvailabilityForm({
                      ...availabilityForm,
                      endTime: e.target.value,
                    })
                  }
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Slot Duration (minutes)
                </label>
                <select
                  value={availabilityForm.slotDurationMinutes}
                  onChange={(e) =>
                    setAvailabilityForm({
                      ...availabilityForm,
                      slotDurationMinutes: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Availability'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Block Time Modal */}
      {showBlockTimeModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Block Time Slot</h3>
                <button onClick={() => setShowBlockTimeModal(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <form onSubmit={handleBlockTime} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Date</label>
                <input
                  type="date"
                  value={blockTimeForm.date}
                  onChange={(e) =>
                    setBlockTimeForm({ ...blockTimeForm, date: e.target.value })
                  }
                  min={new Date().toISOString().split('T')[0]}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Reason (Optional)
                </label>
                <textarea
                  value={blockTimeForm.reason}
                  onChange={(e) =>
                    setBlockTimeForm({
                      ...blockTimeForm,
                      reason: e.target.value,
                    })
                  }
                  rows="3"
                  placeholder="e.g., Conference, Personal time off..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? 'Blocking...' : 'Block Time'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Appointment Details Modal */}
      {showAppointmentDetails && selectedAppointment && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Appointment Details</h3>
                <button onClick={() => setShowAppointmentDetails(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-3">
                  Patient Information
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Name</p>
                    <p className="text-sm font-medium">
                      {selectedAppointment.patient?.firstName}{' '}
                      {selectedAppointment.patient?.lastName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Phone Number</p>
                    <p className="text-sm font-medium">
                      {selectedAppointment.patient?.phoneNumber}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Email</p>
                    <p className="text-sm font-medium">
                      {selectedAppointment.patient?.email || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Date of Birth</p>
                    <p className="text-sm font-medium">
                      {selectedAppointment.patient?.dateOfBirth
                        ? format(
                            parseISO(selectedAppointment.patient.dateOfBirth),
                            'MMM d, yyyy'
                          )
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-3">
                  Appointment Information
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Date & Time</p>
                    <p className="text-sm font-medium">
                      {format(
                        parseISO(selectedAppointment.start),
                        'EEEE, MMMM d, yyyy'
                      )}{' '}
                      at {format(parseISO(selectedAppointment.start), 'h:mm a')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Duration</p>
                    <p className="text-sm font-medium">
                      {selectedAppointment.duration || 30} minutes
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      Reason for Visit
                    </p>
                    <p className="text-sm font-medium">
                      {selectedAppointment.reason || 'General checkup'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Status</p>
                    <span
                      className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                        STATUS_COLOR[selectedAppointment.status] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {STATUS_LABEL[selectedAppointment.status] || selectedAppointment.status}
                    </span>
                  </div>
                </div>
              </div>

              {selectedAppointment.notes && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">
                    Notes
                  </h4>
                  <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
                    {selectedAppointment.notes}
                  </p>
                </div>
              )}

              <div className="flex space-x-3">
                {selectedAppointment.status === 'pending' && (
                  <div className="w-full space-y-3">
                    <button
                      onClick={() => {
                        handleUpdateStatus(
                          selectedAppointment._id,
                          'approved',
                          'Appointment confirmed'
                        );
                        setShowAppointmentDetails(false);
                      }}
                      disabled={loading}
                      className="w-full bg-black text-white py-2 px-4 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      {loading ? 'Confirming...' : 'Confirm Appointment'}
                    </button>
                    <p className="text-xs text-gray-500 text-center">
                      ℹ️ Note: Patients can cancel appointments from their dashboard
                    </p>
                  </div>
                )}

                {selectedAppointment.status === 'approved' && (
                  <div className="w-full space-y-3">
                    {/* FIX B: primary CTA — start a session and navigate to the sessions tab */}
                    <button
                      onClick={() => {
                        setShowAppointmentDetails(false);
                        if (onStartSession) onStartSession(selectedAppointment);
                      }}
                      disabled={loading}
                      className="w-full bg-black text-white py-2 px-4 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      Start Session
                    </button>
                    <div className="flex space-x-3">
                      <button
                        onClick={() => {
                          handleUpdateStatus(
                            selectedAppointment._id,
                            'completed',
                            'Visit completed'
                          );
                          setShowAppointmentDetails(false);
                        }}
                        disabled={loading}
                        className="flex-1 border border-gray-300 py-2 px-4 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                      >
                        Mark as Completed
                      </button>
                      <button
                        onClick={() => {
                          handleSelectAppointment(selectedAppointment);
                          setShowAppointmentDetails(false);
                        }}
                        className="flex-1 border border-gray-300 py-2 px-4 rounded-lg hover:bg-gray-50 text-sm"
                      >
                        Create Medical Record
                      </button>
                    </div>
                  </div>
                )}

                {/* FIX E: in_progress — doctor can resume the live session */}
                {selectedAppointment.status === 'in_progress' && (
                  <div className="w-full space-y-3">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <p className="text-sm text-purple-800">
                        A session is currently in progress for this appointment.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setShowAppointmentDetails(false);
                        if (onStartSession) onStartSession(selectedAppointment);
                      }}
                      disabled={loading}
                      className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      Resume Session
                    </button>
                  </div>
                )}

                {selectedAppointment.status === 'completed' && (
                  <div className="w-full space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        ✓ This appointment is completed and cannot be modified.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        handleSelectAppointment(selectedAppointment);
                        setShowAppointmentDetails(false);
                      }}
                      className="w-full bg-black text-white py-2 px-4 rounded-lg hover:bg-gray-800"
                    >
                      View/Create Medical Record
                    </button>
                  </div>
                )}

                {/* FIX E: no-show — informational only, no actions */}
                {selectedAppointment.status === 'no-show' && (
                  <div className="w-full">
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="text-sm text-orange-800 font-medium mb-1">Missed Appointment</p>
                      <p className="text-sm text-orange-700">
                        This appointment was automatically marked as a no-show. The patient was
                        notified and can reschedule from their dashboard.
                      </p>
                    </div>
                  </div>
                )}

                {/* FIX E: cancelled — informational only */}
                {selectedAppointment.status === 'cancelled' && (
                  <div className="w-full">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-800 font-medium mb-1">Appointment Cancelled</p>
                      <p className="text-sm text-red-700">
                        {selectedAppointment.cancellationReason || 'This appointment has been cancelled.'}
                      </p>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowAppointmentDetails(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 self-end"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DoctorModals;