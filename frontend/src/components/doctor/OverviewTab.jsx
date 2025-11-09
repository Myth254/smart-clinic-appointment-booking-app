import React from 'react';
import { Calendar as CalendarIcon, Clock, User, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const OverviewTab = ({
  stats,
  todayAppointments,
  availabilityRules,
  currentDate,
  selectedDate,
  weekDays,
  weekDaysFull,
  getDaysInMonth,
  getAppointmentsForDate,
  onSetCurrentDate,
  onSetSelectedDate,
  onShowAvailabilityModal,
  onShowBlockTimeModal,
  onViewAppointmentDetails,
  onUpdateStatus,
  onDeleteRule,
  loading
}) => {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">
              Today's Appointments
            </h3>
            <CalendarIcon className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{stats.todayCount}</p>
            <p className="text-sm text-gray-500">
              Next at{' '}
              {todayAppointments[0]
                ? format(parseISO(todayAppointments[0].start), 'h:mm a')
                : 'N/A'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">
              Total Patients
            </h3>
            <User className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{stats.totalPatients}</p>
            <p className="text-sm text-gray-500">this month</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">Confirmed</h3>
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{stats.confirmedCount}</p>
            <p className="text-sm text-gray-500">
              {todayAppointments.filter((apt) => apt.status === 'pending').length}{' '}
              pending
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-600 text-sm font-medium">Availability</h3>
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{stats.availabilityPercent}%</p>
            <p className="text-sm text-gray-500">This week</p>
          </div>
        </div>
      </div>

      {/* Availability Setup Banner */}
      {availabilityRules.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start space-x-4">
            <CalendarIcon className="w-6 h-6 text-blue-600 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                Set Up Your Availability
              </h3>
              <p className="text-blue-800 mb-4">
                Before patients can book appointments, configure your available
                hours using the calendar below.
              </p>
              <button
                onClick={onShowAvailabilityModal}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Set Availability Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Calendar */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold mb-1">Calendar</h2>
            <p className="text-sm text-gray-500">
              View and manage your schedule
            </p>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => onSetCurrentDate('prev')}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h3 className="font-semibold">
                {format(currentDate, 'MMMM yyyy')}
              </h3>
              <button
                onClick={() => onSetCurrentDate('next')}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-gray-500 py-2"
                >
                  {day}
                </div>
              ))}
              {getDaysInMonth().map((day, idx) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                const hasAppointments = getAppointmentsForDate(day) > 0;
                const isSelected = format(day, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');

                return (
                  <button
                    key={idx}
                    onClick={() => onSetSelectedDate(day)}
                    className={`aspect-square p-2 text-sm rounded-lg transition-colors ${
                      !isCurrentMonth
                        ? 'text-gray-300'
                        : isToday
                          ? 'bg-black text-white font-semibold'
                          : isSelected
                            ? 'bg-gray-200'
                            : 'hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center h-full">
                      <span>{format(day, 'd')}</span>
                      {hasAppointments && isCurrentMonth && (
                        <div className="w-1 h-1 bg-blue-500 rounded-full mt-1"></div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-2">
              <button
                onClick={onShowAvailabilityModal}
                className="w-full bg-black text-white py-2 px-4 rounded-lg hover:bg-gray-800"
              >
                Set Availability
              </button>
              <button
                onClick={onShowBlockTimeModal}
                className="w-full border border-gray-300 py-2 px-4 rounded-lg hover:bg-gray-50"
              >
                Block Time Slot
              </button>
            </div>

            {/* Availability Rules */}
            <div className="mt-6">
              <h3 className="text-sm font-medium mb-3">Your Availability</h3>
              {availabilityRules.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No availability rules set
                </p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {availabilityRules
                    .sort((a, b) => a.weekday - b.weekday)
                    .map((rule) => (
                      <div
                        key={rule._id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                      >
                        <div>
                          <span className="font-medium">
                            {weekDaysFull[rule.weekday]}
                          </span>
                          <span className="text-gray-600 ml-2">
                            {rule.startTime} - {rule.endTime}
                          </span>
                        </div>
                        <button
                          onClick={() => onDeleteRule(rule._id)}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold mb-1">Today's Schedule</h2>
            <p className="text-sm text-gray-500">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
          <div className="divide-y divide-gray-200 max-h-[500px] overflow-y-auto">
            {loading && todayAppointments.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                Loading schedule...
              </div>
            ) : todayAppointments.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                No appointments for today
              </div>
            ) : (
              todayAppointments.map((appointment) => (
                <div key={appointment._id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex space-x-4">
                      <div className="flex flex-col items-center justify-center bg-gray-100 rounded-lg px-3 py-2">
                        <Clock className="w-4 h-4 text-gray-600 mb-1" />
                        <span className="text-sm font-medium">
                          {format(parseISO(appointment.start), 'h:mm a')}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-medium">
                          {appointment.patient?.firstName}{' '}
                          {appointment.patient?.lastName}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {appointment.reason || 'General checkup'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {appointment.patient?.phoneNumber}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {appointment.status === 'pending' ? (
                        <>
                          <button
                            onClick={() =>
                              onUpdateStatus(
                                appointment._id,
                                'approved',
                                'Appointment confirmed'
                              )
                            }
                            disabled={loading}
                            className="px-3 py-1 bg-black text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => onViewAppointmentDetails(appointment)}
                            className="px-3 py-1 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
                          >
                            View
                          </button>
                        </>
                      ) : (
                        <>
                          <span
                            className={`px-3 py-1 text-xs font-medium rounded-full ${
                              appointment.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : appointment.status === 'completed'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {appointment.status === 'approved'
                              ? 'Confirmed'
                              : appointment.status}
                          </span>
                          <button
                            onClick={() => onViewAppointmentDetails(appointment)}
                            className="px-3 py-1 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
                          >
                            View
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;