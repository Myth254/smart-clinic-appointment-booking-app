import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock } from 'lucide-react';
import { availabilityAPI } from '../../api';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const RescheduleModal = ({ isOpen, onClose, appointment, onSubmit }) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && appointment) {
      // Pre-fill with current appointment date
      const currentDate = new Date(appointment.start).toISOString().split('T')[0];
      setSelectedDate(currentDate);
      fetchAvailableSlots(appointment.doctor._id || appointment.doctor, currentDate);
    }
  }, [isOpen, appointment]);

  const fetchAvailableSlots = async (doctorId, date) => {
    try {
      setLoading(true);
      const response = await availabilityAPI.getAvailableSlots(doctorId, date);
      
      const slotsData = response.data || response;
      const slots = slotsData.slots || [];
      
      setAvailableSlots(slots);
      
      if (slots.length === 0) {
        toast('No available slots for this date. Try another date.', {
          icon: '📅',
          duration: 4000
        });
      }
    } catch (error) {
      console.error('Error fetching slots:', error);
      toast.error('Failed to load available slots');
      setAvailableSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (e) => {
    const date = e.target.value;
    setSelectedDate(date);
    setSelectedSlot(null);
    
    const doctorId = appointment.doctor._id || appointment.doctor;
    fetchAvailableSlots(doctorId, date);
  };

  const handleConfirm = () => {
    if (!selectedSlot) {
      toast.error('Please select a time slot');
      return;
    }
    
    onSubmit(selectedSlot);
  };

  if (!isOpen || !appointment) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative inline-block w-full max-w-2xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold">Reschedule Appointment</h2>
              <p className="text-sm text-gray-500 mt-1">
                Select a new date and time for your appointment
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Appointment Info */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <p className="text-sm text-gray-600 mb-2">Current Appointment:</p>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="font-medium">
                  {format(parseISO(appointment.start), 'EEE, MMM d, yyyy')}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <Clock className="w-4 h-4 text-gray-500" />
                <span className="font-medium">
                  {format(parseISO(appointment.start), 'h:mm a')}
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              with Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}
            </p>
          </div>

          {/* Date & Slot Selection */}
          <div className="p-6 space-y-6">
            {/* Date Picker */}
            <div>
              <label className="block text-sm font-medium mb-2">Select New Date</label>
              <input
                type="date"
                value={selectedDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={handleDateChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>

            {/* Time Slots */}
            {selectedDate && (
              <div>
                <label className="block text-sm font-medium mb-3">
                  Select New Time Slot
                </label>
                {loading ? (
                  <div className="p-8 bg-gray-50 text-gray-500 rounded-lg text-sm text-center">
                    Loading available slots...
                  </div>
                ) : availableSlots.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-64 overflow-y-auto">
                    {availableSlots.map((slot, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedSlot(slot)}
                        className={`px-4 py-3 rounded-lg border text-sm font-medium transition ${
                          selectedSlot?.start === slot.start
                            ? 'bg-black text-white border-black'
                            : 'border-gray-300 hover:border-black'
                        }`}
                      >
                        {slot.label || format(new Date(slot.start), 'h:mm a')}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 bg-gray-50 text-gray-500 rounded-lg text-sm text-center">
                    No available slots for this date. Please select another date.
                  </div>
                )}
              </div>
            )}

            {/* Selected Slot Preview */}
            {selectedSlot && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-1">New Appointment Time:</p>
                <p className="text-sm text-blue-800">
                  {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')} at{' '}
                  {selectedSlot.label || format(new Date(selectedSlot.start), 'h:mm a')}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedSlot || loading}
              className={`px-6 py-2 text-sm font-medium text-white rounded-lg ${
                selectedSlot && !loading
                  ? 'bg-black hover:bg-gray-800'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {loading ? 'Processing...' : 'Confirm Reschedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RescheduleModal;