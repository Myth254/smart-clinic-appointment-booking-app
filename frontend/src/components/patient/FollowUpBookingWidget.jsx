import React, { useState } from 'react';
import { Calendar, Clock, User, X } from 'lucide-react';

const formatDate = (dateString) => {
  if (!dateString) return 'To be scheduled';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'To be scheduled';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

const FollowUpBookingWidget = ({ appointment, onBook, onDismiss }) => {
  const [showDetails, setShowDetails] = useState(false);

  const hasActiveReminder = appointment?.activeFollowUpReminder?.status === 'active';

  if (!appointment?.isFollowUpRequired || !hasActiveReminder) {
    return null;
  }

  const followUpDate = appointment.followUpDate ? new Date(appointment.followUpDate) : null;
  const today = new Date();
  const daysUntil = followUpDate
    ? Math.ceil((followUpDate - today) / (1000 * 60 * 60 * 24))
    : null;
  const isOverdue = followUpDate ? daysUntil < 0 : false;
  const isUrgent = followUpDate ? daysUntil <= 7 && daysUntil >= 0 : false;

  return (
    <div
      className={`border-2 rounded-lg p-4 ${
        isOverdue ? 'bg-red-50 border-red-300' :
        isUrgent ? 'bg-yellow-50 border-yellow-300' :
        'bg-blue-50 border-blue-300'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isOverdue ? 'bg-red-200' : isUrgent ? 'bg-yellow-200' : 'bg-blue-200'
            }`}
          >
            <Calendar
              className={`w-5 h-5 ${
                isOverdue ? 'text-red-700' : isUrgent ? 'text-yellow-700' : 'text-blue-700'
              }`}
            />
          </div>

          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h4
                className={`font-semibold ${
                  isOverdue ? 'text-red-900' : isUrgent ? 'text-yellow-900' : 'text-blue-900'
                }`}
              >
                {isOverdue ? 'Overdue Follow-Up' : 'Follow-Up Appointment Required'}
              </h4>
              {isOverdue && (
                <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full">
                  OVERDUE
                </span>
              )}
              {isUrgent && !isOverdue && (
                <span className="px-2 py-0.5 bg-yellow-600 text-white text-xs font-bold rounded-full">
                  URGENT
                </span>
              )}
            </div>

            <p
              className={`text-sm mb-2 ${
                isOverdue ? 'text-red-800' : isUrgent ? 'text-yellow-800' : 'text-blue-800'
              }`}
            >
              {followUpDate ? (
                isOverdue ? (
                  <>This follow-up was due on <strong>{formatDate(appointment.followUpDate)}</strong></>
                ) : (
                  <>Recommended follow-up: <strong>{formatDate(appointment.followUpDate)}</strong> ({daysUntil} days)</>
                )
              ) : (
                <>Your doctor recommended a follow-up appointment.</>
              )}
            </p>

            <div className="flex items-center space-x-2 text-sm text-gray-600 mb-3">
              <User className="w-4 h-4" />
              <span>
                Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}
              </span>
            </div>

            {appointment.followUpNotes && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm text-blue-600 hover:text-blue-800 underline mb-3"
              >
                {showDetails ? 'Hide' : 'View'} follow-up instructions
              </button>
            )}

            {showDetails && appointment.followUpNotes && (
              <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                <p className="text-sm text-gray-700">{appointment.followUpNotes}</p>
              </div>
            )}

            {appointment.followUpReason && (
              <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                <p className="text-xs font-medium text-gray-700 mb-1">Reason for Follow-Up:</p>
                <p className="text-sm text-gray-600">{appointment.followUpReason}</p>
              </div>
            )}

            <div className="flex items-center space-x-3">
              <button
                onClick={() => onBook(appointment)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                  isOverdue ? 'bg-red-600 hover:bg-red-700' :
                  isUrgent ? 'bg-yellow-600 hover:bg-yellow-700' :
                  'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Book Follow-Up Now</span>
              </button>

              {!isOverdue && (
                <button
                  onClick={() => {
                    if (window.confirm('Dismiss this follow-up reminder for now? You can still book it later from your appointments.')) {
                      onDismiss(appointment);
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Remind Later
                </button>
              )}
            </div>
          </div>
        </div>

        {!isOverdue && (
          <button
            onClick={() => onDismiss(appointment)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        )}
      </div>

      {isOverdue && (
        <div className="mt-4 pt-4 border-t border-red-300">
          <div className="flex items-start space-x-2 text-red-800">
            <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs">
              <strong>Important:</strong> This follow-up is overdue. Please book an appointment as soon as possible.
              If you are experiencing concerning symptoms, contact your doctor immediately or visit the emergency department.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export const FollowUpsList = ({ appointments, onBook, onDismiss }) => {
  const pendingFollowUps = appointments.filter(
    (appointment) =>
      appointment.isFollowUpRequired &&
      appointment.activeFollowUpReminder?.status === 'active'
  );

  if (pendingFollowUps.length === 0) return null;

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Follow-Up Appointments</h3>
        <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
          {pendingFollowUps.length} pending
        </span>
      </div>

      {pendingFollowUps.map((appointment) => (
        <FollowUpBookingWidget
          key={appointment._id}
          appointment={appointment}
          onBook={onBook}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
};

export default FollowUpBookingWidget;