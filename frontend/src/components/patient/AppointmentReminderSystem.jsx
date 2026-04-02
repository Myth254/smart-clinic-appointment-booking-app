import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'shownFollowUpReminders';
const EXCLUDED_STATES = new Set(['cancelled', 'no-show']);

const formatDate = (date) => {
  if (!date) return 'soon';

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'soon';

  return parsed.toLocaleDateString();
};

const loadShownReminderIds = () => {
  if (typeof window === 'undefined') return new Set();

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Set();

    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

const persistShownReminderIds = (values) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(values)));
  } catch {
    // Best effort only.
  }
};

const AppointmentReminderSystem = ({ appointments }) => {
  const [shownReminders, setShownReminders] = useState(() => loadShownReminderIds());

  const eligibleFollowUps = useMemo(
    () =>
      appointments.filter((appointment) => {
        if (!appointment?.isFollowUpRequired) return false;
        if (!appointment?.activeFollowUpReminder || appointment.activeFollowUpReminder.status !== 'active') {
          return false;
        }
        return !EXCLUDED_STATES.has(appointment.status);
      }),
    [appointments]
  );

  useEffect(() => {
    persistShownReminderIds(shownReminders);
  }, [shownReminders]);

  useEffect(() => {
    eligibleFollowUps.forEach((appointment) => {
      const reminderStateKey = [
        appointment._id,
        appointment.status,
        appointment.followUpDate || 'no-date',
        appointment.activeFollowUpReminder?._id || 'no-reminder'
      ].join(':');

      if (shownReminders.has(reminderStateKey)) {
        return;
      }

      const overdue = appointment.followUpDate
        ? new Date(appointment.followUpDate) < new Date()
        : false;

      toast((t) => (
        <div className="flex items-start space-x-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              overdue ? 'bg-red-100' : 'bg-yellow-100'
            }`}
          >
            {overdue ? (
              <AlertCircle className="w-5 h-5 text-red-600" />
            ) : (
              <Calendar className="w-5 h-5 text-yellow-700" />
            )}
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900">
              {overdue ? 'Follow-Up Overdue' : 'Follow-Up Appointment Required'}
            </h4>
            <p className="text-sm text-gray-600 mt-1">
              {appointment.followUpReason || 'Your doctor recommended a follow-up visit.'}
            </p>
            <div className="mt-2 text-xs text-gray-500">
              Due {formatDate(appointment.followUpDate)} • Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}
            </div>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Got it
            </button>
          </div>
        </div>
      ), {
        duration: overdue ? 10000 : 7000,
        position: 'top-right',
        style: {
          background: overdue ? '#FEF2F2' : '#FFFBEB',
          border: overdue ? '2px solid #FCA5A5' : '2px solid #FCD34D'
        }
      });

      setShownReminders((prev) => new Set([...prev, reminderStateKey]));
    });
  }, [eligibleFollowUps, shownReminders]);

  return null;
};

export default AppointmentReminderSystem;