import React, { useState, useEffect, useCallback } from 'react';
import { Search, MapPin, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { patientAPI, availabilityAPI, appointmentsAPI } from '../../api';
import { format } from 'date-fns';
import AvailabilityChecker from './AvailabilityChecker'
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { isAfter, isEqual } from 'date-fns';

const TIMEZONE = 'Africa/Nairobi';
const MIN_BOOKING_NOTICE_MINUTES = 5;

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
  const [followUpContext, setFollowUpContext] = useState(null);
  const slotContainerRef = React.useRef(null);

  const filterFutureSlots = (slots) => {
    const nowLocal = toZonedTime(new Date(), TIMEZONE);
    const nowUTC = fromZonedTime(nowLocal, TIMEZONE);

    return slots.filter((slot) => {
      const slotStartUTC = new Date(slot.start);

      const diffMinutes = (slotStartUTC - nowUTC) / 60000;
      if (diffMinutes < MIN_BOOKING_NOTICE_MINUTES) return false;

      return isAfter(slotStartUTC, nowUTC) || isEqual(slotStartUTC, nowUTC);
    });
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('followUpContext');
      if (!stored) return;

      const parsed = JSON.parse(stored);
      
      // ✅ FIX: Validate followUpOf is a valid string (ObjectId)
      if (parsed.followUpOf && typeof parsed.followUpOf !== 'string') {
        console.error('❌ Invalid followUpOf type in context:', typeof parsed.followUpOf);
        sessionStorage.removeItem('followUpContext');
        return;
      }

      setFollowUpContext(parsed);
      setAppointmentType('follow-up');
      setReason(parsed.reason || '');
      console.log('✅ Follow-up context restored:', {
        followUpOf: parsed.followUpOf,
        doctorId: parsed.doctorId,
        suggestedDate: parsed.suggestedDate
      });
    } catch (error) {
      console.error('❌ Failed to restore follow-up booking context:', error);
      sessionStorage.removeItem('followUpContext');
    }
  }, []);

  const getDoctorUserId = (doctor) => {
    return doctor.userId?._id || doctor.userId;
  };

  const fetchAvailableSlots = useCallback(async (doctorUserId, date) => {
    try {
      setLoading(true);

      const response = await availabilityAPI.getAvailableSlots(
        doctorUserId,
        date
      );
      const slotsData = response.data || response;
      let slots = slotsData.slots || [];

      // Keep only future slots
      slots = filterFutureSlots(slots);

      setAvailableSlots(slots);

      // Auto-select nearest future slot
      if (slots.length > 0) {
        setSelectedSlot(slots[0]);

        // Scroll to top where nearest slot is located
        setTimeout(() => {
          if (slotContainerRef.current) {
            slotContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 100);
      }

      if (slots.length === 0) {
        toast('No available slots for the rest of the day.', {
          icon: '📅',
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('❌ Error fetching slots:', error);
      toast.error(
        error.response?.data?.message || 'Failed to load available slots'
      );
      setAvailableSlots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!followUpContext || doctors.length === 0 || selectedDoctor) return;

    const matchedDoctor = doctors.find(
      (doctor) => getDoctorUserId(doctor) === followUpContext.doctorId
    );

    if (matchedDoctor) {
      setSelectedDoctor(matchedDoctor);
      if (followUpContext.suggestedDate) {
        setSelectedDate(followUpContext.suggestedDate.slice(0, 10));
      }
      setStep(2);
    }
  }, [doctors, followUpContext, selectedDoctor]);

  useEffect(() => {
    if (step !== 2 || !selectedDoctor || !selectedDate || availableSlots.length > 0) return;
    fetchAvailableSlots(getDoctorUserId(selectedDoctor), selectedDate);
  }, [availableSlots.length, fetchAvailableSlots, selectedDate, selectedDoctor, step]);

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
    // Prevent double-submit on slow connections or accidental double-click
    if (loading) return

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

      // ✅ Build payload with conditional followUpOf
      const appointmentPayload = {
        doctorId: doctorUserId, // Changed from 'doctor' to 'doctorId'
        start: new Date(selectedSlot.start).toISOString(),
        end: new Date(selectedSlot.end).toISOString(),
        reason: reason.trim(),
        type: appointmentType, // Include appointment type
        notes: '', // Optional notes
      };

      // ✅ FIX: Only include followUpOf if it's valid
      // Defensive check: ensure it's a string (ObjectId)
      if (followUpContext?.followUpOf && typeof followUpContext.followUpOf === 'string') {
        appointmentPayload.followUpOf = followUpContext.followUpOf;
        console.log('📝 Follow-up appointment linking to:', followUpContext.followUpOf);
      } else if (followUpContext?.followUpOf) {
        // Warn if followUpOf exists but is invalid type
        console.warn('⚠️ Invalid followUpOf type:', typeof followUpContext.followUpOf, followUpContext.followUpOf);
      }

      console.log('📤 Final appointment payload:', appointmentPayload);

      await appointmentsAPI.createAppointment(appointmentPayload);

      toast.success('Appointment booked successfully!');
      resetForm();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Booking error:', error)
      const status = error.response?.status
      const msg = error.response?.data?.message

      if (status === 409) {
        // The slot was taken between when the user loaded it and when they
        // submitted. Send them back to pick again with fresh slot data.
        toast.error(
          'That slot was just taken by another patient. Please choose a different time.',
          { duration: 6000 }
        )
        setSelectedSlot(null)
        // Re-fetch so the slot grid immediately reflects reality
        if (selectedDoctor && selectedDate) {
          fetchAvailableSlots(getDoctorUserId(selectedDoctor), selectedDate)
        }
        setStep(2)
        return
      }

      if (status === 500) {
        // The appointment may have been created server-side despite the error.
        // Warn the user to check before retrying to avoid a duplicate booking.
        toast.error(
          'Something went wrong confirming your booking. Please check "My Appointments" before retrying to avoid a duplicate.',
          { duration: 8000 }
        )
        return
      }

      toast.error(msg || 'Booking failed. Please try again.')

      const suggestedSlots = error.response?.data?.availableSlots
      if (suggestedSlots?.length > 0) {
        toast(
          `Try these available times: ${suggestedSlots.join(', ')}`,
          { icon: '📅', duration: 7000 }
        )
      }
    } finally {
      setLoading(false)
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
    setFollowUpContext(null);
    sessionStorage.removeItem('followUpContext');
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

          {/* === Section Header === */}
          <div>
            <h3 className="text-lg font-semibold mb-1">Select Appointment Date & Time</h3>
          </div>

          {/* Doctor Summary */}
          <div className="flex items-center space-x-4 bg-gray-50 border border-gray-200 p-4 rounded-lg">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-medium text-sm">
              {selectedDoctor.firstName?.[0]}
              {selectedDoctor.lastName?.[0]}
            </div>
            <div>
              <h4 className="font-medium">
                Dr. {selectedDoctor.firstName} {selectedDoctor.lastName}
              </h4>
              <p className="text-sm text-gray-500">{selectedDoctor.specialization}</p>
            </div>
          </div>

          {/* Availability Status Box */}
          <AvailabilityChecker doctorId={getDoctorUserId(selectedDoctor)} />

          {/* Choose Date */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => {
                const date = e.target.value;
                setSelectedDate(date);
                setSelectedSlot(null);
                fetchAvailableSlots(getDoctorUserId(selectedDoctor), date);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
            />
          </div>

          {/* Time Slots */}
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
                <div
                  ref={slotContainerRef}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-72 overflow-y-auto pr-2"
                >
                  {availableSlots.map((slot, i) => {
                    const isNext = i === 0;
                    const isSelected = selectedSlot?.start === slot.start;

                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedSlot(slot)}
                        className={`px-4 py-3 rounded-lg border text-sm font-medium transition relative
                          ${isSelected ? "bg-black text-white border-black" : "border-gray-300 hover:border-black"}
                          ${isNext && !isSelected ? "ring-2 ring-green-400" : ""}
                        `}
                      >
                        {/* Slot Label */}
                        {slot.label || format(new Date(slot.start), "h:mm a")}

                        {/* "Next Available" Indicator */}
                        {isNext && !isSelected && (
                          <span className="block text-xs text-green-600 mt-1">
                            Next Available
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 bg-gray-50 text-gray-500 rounded-lg text-sm text-center">
                  No available slots for the rest of the day. Please select another date.
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
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
                  ? "bg-black hover:bg-gray-800"
                  : "bg-gray-400 cursor-not-allowed"
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
            {followUpContext?.followUpOf && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Booking Context</p>
                <p className="font-medium">This visit will be linked to your previous appointment follow-up request.</p>
              </div>
            )}
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
