import React, { useState, useEffect } from 'react';
import { Search, MapPin, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { patientAPI, availabilityAPI, appointmentsAPI } from '../../api';
import { format } from 'date-fns';
import AvailabilityChecker from './AvailabilityChecker'

const BookAppointmentModal = ({ onSuccess }) => {
  const [step, setStep] = useState(1);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [appointmentType, setAppointmentType] = useState('consultation'); 
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');

  useEffect(() => {
    fetchDoctors();
  }, []);

  const getDoctorUserId = (doctor) => {
    return doctor.userId?._id || doctor.userId;
  };

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const response = await patientAPI.getAllDoctors();

      const doctors = (response.data || []).map((doctor) => ({
        ...doctor,
        firstName: doctor.userId?.firstName || '',
        lastName: doctor.userId?.lastName || '',
        email: doctor.userId?.email || '',
        phoneNumber: doctor.userId?.phoneNumber || '',
      }));

      setDoctors(doctors);
    } catch (error) {
      console.error(error);
      toast.error('Failed to fetch doctors');
    } finally {
      setLoading(false);
    }
  };

   const fetchAvailableSlots = async (doctorUserId, date) => {
    try {
      setLoading(true);
      console.log('🔍 Fetching slots for:', { doctorUserId, date });
      
      const response = await availabilityAPI.getAvailableSlots(doctorUserId, date);
      
      // Handle nested response structure
      const slotsData = response.data || response;
      const slots = slotsData.slots || [];
      
      console.log('📊 Received slots:', slots.length);
      setAvailableSlots(slots);
      
      if (slots.length === 0) {
        toast('No available slots for this date. Try another date.', {
          icon: '📅',
          duration: 4000
        });
      }
    } catch (error) {
      console.error('❌ Error fetching slots:', error);
      toast.error(error.response?.data?.message || 'Failed to load available slots');
      setAvailableSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = () => {
    if (step === 1 && !selectedDoctor) {
      toast.error('Please select a doctor first');
      return;
    }
    if (step === 2 && !selectedSlot) {
      toast.error('Please choose a time slot');
      return;
    }
    setStep(step + 1);
  };

  const handlePreviousStep = () => setStep(step - 1);

   const handleConfirmBooking = async () => {
    // Validate reason (10-500 characters as per validation.js)
    if (!reason.trim() || reason.trim().length < 10) {
      toast.error('Please enter a reason for your appointment (minimum 10 characters)');
      return;
    }

    if (reason.trim().length > 500) {
      toast.error('Reason must not exceed 500 characters');
      return;
    }

    if (!selectedDoctor?.userId) {
      toast.error('Invalid doctor profile. Please reselect your doctor.');
      return;
    }

    try {
      setLoading(true);

      const doctorUserId = getDoctorUserId(selectedDoctor);

      // ✅ Send data matching validation.js schema
      await appointmentsAPI.createAppointment({
        doctorId: doctorUserId, // Changed from 'doctor' to 'doctorId'
        start: new Date(selectedSlot.start).toISOString(),
        end: new Date(selectedSlot.end).toISOString(),
        reason: reason.trim(),
        type: appointmentType, // Include appointment type
        notes: '' // Optional notes
      });

      toast.success('Appointment booked successfully!');
      resetForm();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Booking error:', error);
      const errorMessage = error.response?.data?.message || 'Booking failed';
      toast.error(errorMessage);

      const availableSlots = error.response?.data?.availableSlots;
      if (availableSlots?.length > 0) {
        toast.error(
          `Try these available times: ${availableSlots.join(', ')}`,
          { duration: 7000 }
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setSelectedDoctor(null);
    setSelectedDate('');
    setAvailableSlots([]);
    setSelectedSlot(null);
    setReason('');
    setAppointmentType('consultation');
  };

  const filteredDoctors = doctors.filter((doc) => {
    const matchesSearch =
      searchTerm === '' ||
      doc.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.specialization?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSpecialty =
      specialtyFilter === '' || doc.specialization === specialtyFilter;

    return matchesSearch && matchesSpecialty;
  });

  const specialties = [
    ...new Set(doctors.map((d) => d.specialization).filter(Boolean)),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 space-y-6">
      {/* Step Progress Indicator */}
       <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
            step >= 1 ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'
          }`}>1</div>
          <span className={`text-sm ${step >= 1 ? 'font-medium' : 'text-gray-500'}`}>
            Select Doctor
          </span>
        </div>

        <div className="flex-1 h-px bg-gray-300 mx-4"></div>

        <div className="flex items-center space-x-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
            step >= 2 ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'
          }`}>2</div>
          <span className={`text-sm ${step >= 2 ? 'font-medium' : 'text-gray-500'}`}>
            Choose Date
          </span>
        </div>

        <div className="flex-1 h-px bg-gray-300 mx-4"></div>

        <div className="flex items-center space-x-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
            step >= 3 ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'
          }`}>3</div>
          <span className={`text-sm ${step >= 3 ? 'font-medium' : 'text-gray-500'}`}>
            Confirm
          </span>
        </div>
      </div>

      {/* Step 1: Select Doctor */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-1">Find a Doctor</h3>
            <p className="text-sm text-gray-500">
              Search by name, specialty, or location
            </p>
          </div>

          {/* Search & Filter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search doctors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>

            <select
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
            >
              <option value="">All Specialties</option>
              {specialties.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </div>

          {/* Doctor List */}
          <div className="space-y-3">
            {loading && filteredDoctors.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Loading doctors...
              </div>
            ) : filteredDoctors.length > 0 ? (
              filteredDoctors.map((doctor) => (
                <div
                  key={doctor._id}
                  className={`p-4 border rounded-lg hover:bg-gray-50 transition cursor-pointer ${
                    selectedDoctor?._id === doctor._id
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200'
                  }`}
                  onClick={() => setSelectedDoctor(doctor)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-medium text-sm">
                        {doctor.firstName?.[0] || ''}
                        {doctor.lastName?.[0] || ''}
                      </div>
                      <div>
                        <h4 className="font-medium">
                          Dr. {doctor.firstName} {doctor.lastName}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {doctor.specialization}
                        </p>
                        <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                          <MapPin className="w-3 h-3" />
                          <span>{doctor.clinic || 'Medical Center'}</span>
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          <span>{doctor.rating || '4.8'}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 text-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDoctor(doctor);
                      }}
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">
                No doctors found matching your criteria.
              </p>
            )}
          </div>

          <div className="flex justify-end mt-6">
            <button
              onClick={handleNextStep}
              disabled={!selectedDoctor || loading}
              className={`px-6 py-2 rounded-lg text-white ${
                selectedDoctor && !loading
                  ? 'bg-black hover:bg-gray-800'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {loading ? 'Loading...' : 'Next'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select Date & Time */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-1">
              Select Appointment Date & Time
            </h3>
          </div>

          <div className="flex items-center space-x-4 bg-gray-50 border border-gray-200 p-4 rounded-lg">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-medium text-sm">
              {selectedDoctor.firstName?.[0]}
              {selectedDoctor.lastName?.[0]}
            </div>
            <div>
              <h4 className="font-medium">
                Dr. {selectedDoctor.firstName} {selectedDoctor.lastName}
              </h4>
              <p className="text-sm text-gray-500">
                {selectedDoctor.specialization}
              </p>
            </div>
          </div>

          <AvailabilityChecker doctorId={getDoctorUserId(selectedDoctor)} />

          <div>
            <label className="block text-sm font-medium mb-2">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => {
                const date = e.target.value;
                setSelectedDate(date);
                setSelectedSlot(null);
                fetchAvailableSlots(getDoctorUserId(selectedDoctor), date);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
            />
          </div>

          {selectedDate && (
            <div>
              <label className="block text-sm font-medium mb-3">
                Available Time Slots
              </label>
              {loading ? (
                <div className="p-8 bg-gray-50 text-gray-500 rounded-lg text-sm text-center">
                  Loading available slots...
                </div>
              ) : availableSlots.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

          <div className="flex justify-between mt-6">
            <button
              onClick={handlePreviousStep}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleNextStep}
              disabled={!selectedSlot}
              className={`px-6 py-2 rounded-lg text-white ${
                selectedSlot
                  ? 'bg-black hover:bg-gray-800'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm & Book */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-1">Confirm Appointment</h3>
            <p className="text-sm text-gray-500">
              Review your appointment details
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Doctor</p>
              <p className="font-medium">
                Dr. {selectedDoctor.firstName} {selectedDoctor.lastName}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Specialization</p>
              <p className="font-medium">{selectedDoctor.specialization}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Date & Time</p>
              <p className="font-medium">
                {format(new Date(selectedDate), 'EEE, MMM d, yyyy')} —{' '}
                {selectedSlot?.label ||
                  format(new Date(selectedSlot?.start), 'h:mm a')}
              </p>
            </div>
          </div>

          {/* Appointment Type Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Appointment Type <span className="text-red-500">*</span>
            </label>
            <select
              value={appointmentType}
              onChange={(e) => setAppointmentType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-black focus:border-transparent"
            >
              <option value="consultation">Consultation</option>
              <option value="follow-up">Follow-up</option>
              <option value="checkup">Checkup</option>
              <option value="emergency">Emergency</option>
              <option value="routine">Routine</option>
            </select>
          </div>

          {/* Reason with character count */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Reason for Visit <span className="text-red-500">*</span>
              <span className="text-xs text-gray-500 ml-2">
                ({reason.length}/500 characters, minimum 10)
              </span>
            </label>
            <textarea
              rows="4"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe your symptoms or concern in detail (minimum 10 characters)..."
              maxLength={500}
              className={`w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-black focus:border-transparent ${
                reason.length > 0 && reason.length < 10 
                  ? 'border-red-300' 
                  : 'border-gray-300'
              }`}
            />
            {reason.length > 0 && reason.length < 10 && (
              <p className="text-sm text-red-600 mt-1">
                Please enter at least {10 - reason.length} more character(s)
              </p>
            )}
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={handlePreviousStep}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleConfirmBooking}
              disabled={!reason.trim() || reason.trim().length < 10 || loading}
              className={`px-6 py-2 rounded-lg text-white ${
                reason.trim() && reason.trim().length >= 10 && !loading
                  ? 'bg-black hover:bg-gray-800'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {loading ? 'Booking...' : 'Confirm & Book'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookAppointmentModal;