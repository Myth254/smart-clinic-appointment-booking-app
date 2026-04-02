// components/patient/ActiveConsultationBanner.jsx
//
// ✅ REFACTORED — duplicate socket listener and aggressive status polling removed.
//
// Before (two problems):
//
// 1. DUPLICATE SOCKET LISTENER
//    This component registered socketService.onSessionProgress(handler) on its
//    own. PatientDashboard's socket useEffect registers the *same* event
//    (session:progress). So every progress event triggered two handlers:
//    the dashboard one (toast) and this one (setRecentUpdate + refreshConsultations).
//    The `refreshConsultations` call was also entirely redundant because the
//    dashboard already re-fetches relevant state on session events.
//
// 2. AGGRESSIVE CONNECTION POLLING
//    setInterval(() => setSocketConnected(...), 1_000) ran every second — 60
//    renders per minute just to show a Live/Offline badge. This is excessive.
//    Replaced with a socket connect/disconnect event listener (event-driven,
//    zero polling) and a one-time status check on mount.
//
// After:
//   - No socket event listeners inside this component.
//   - Connection status is passed as a prop (`isConnected`) from PatientDashboard,
//     which already tracks it via the single polling interval it owns.
//   - `recentUpdate` state is also driven by a prop (`recentUpdate`) so the
//     banner can still show "update received" messages when the parent decides.
//   - The component is now purely presentational (renders consultation state).
//
// Props:
//   activeConsultations  Consultation[]  — from ConsultationContext (unchanged)
//   isConnected          bool            — socket status from PatientDashboard
//   recentUpdate         { message, timestamp } | null  — optional update bubble
//   onViewDetails        fn(consultation)

import React, { useState, useEffect } from 'react';
import {
  Activity, Clock, User, AlertCircle, CheckCircle, Wifi, WifiOff,
} from 'lucide-react';
import { useConsultation } from '../../context/ConsultationContext';

const ActiveConsultationBanner = ({ onViewDetails, isConnected = false, recentUpdate = null }) => {
  const { activeConsultations } = useConsultation();
  const [currentTime, setCurrentTime]   = useState(new Date());

  // Update current time every minute — only needed for "time ago" labels.
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (activeConsultations.length === 0) return null;

  const formatTimeAgo = (date) => {
    const seconds = Math.floor((currentTime - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  const formatTime = (date) => {
    const d = new Date(date);
    const hours   = d.getHours();
    const minutes = d.getMinutes();
    const ampm    = hours >= 12 ? 'PM' : 'AM';
    const displayHours   = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  return (
    <div className="space-y-4 mb-6">
      {activeConsultations.map((consultation) => {
        const { appointment, session, labRequests, prescriptions } = consultation;

        const pendingLabs = labRequests.filter((l) =>
          ['pending', 'assigned', 'processing'].includes(l.status)
        ).length;
        const completedLabs = labRequests.filter(
          (l) => l.status === 'completed'
        ).length;
        const pendingPrescriptions = prescriptions.filter((p) =>
          ['new', 'pending_pharmacy'].includes(p.status)
        ).length;

        return (
          <div
            key={appointment._id}
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-lg shadow-lg relative overflow-hidden"
          >
            {/* Animated background pulse */}
            <div className="absolute inset-0 bg-white opacity-5">
              <div className="absolute inset-0 animate-pulse" />
            </div>

            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center animate-pulse">
                    <Activity className="w-6 h-6" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-1">
                      <h3 className="text-xl font-semibold">Active Consultation</h3>

                      {/* Connection badge — driven by prop, no internal polling */}
                      <div
                        className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs ${
                          isConnected
                            ? 'bg-green-500 bg-opacity-30'
                            : 'bg-red-500 bg-opacity-30'
                        }`}
                      >
                        {isConnected ? (
                          <><Wifi className="w-3 h-3" /><span>Live</span></>
                        ) : (
                          <><WifiOff className="w-3 h-3" /><span>Offline</span></>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 text-blue-100">
                      <User className="w-4 h-4" />
                      <span>
                        Dr. {appointment.doctor?.firstName} {appointment.doctor?.lastName}
                      </span>
                      <span className="text-blue-300">•</span>
                      <span>{appointment.doctor?.specialization}</span>
                    </div>

                    <div className="flex items-center space-x-2 mt-2 text-sm text-blue-100">
                      <Clock className="w-4 h-4" />
                      <span>Started {formatTime(session.createdAt)}</span>
                      <span className="text-blue-300">•</span>
                      <span>Last updated {formatTimeAgo(session.updatedAt)}</span>
                    </div>

                    {/* Recent Update Notification — driven by prop from parent */}
                    {recentUpdate && (
                      <div className="mt-3 p-3 bg-white bg-opacity-20 rounded-lg animate-fadeIn">
                        <p className="text-sm font-medium flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                          <span>{recentUpdate.message}</span>
                        </p>
                      </div>
                    )}

                    {/* Progress Indicators */}
                    <div className="flex flex-wrap items-center gap-3 mt-4">
                      {pendingLabs > 0 && (
                        <div className="flex items-center space-x-2 bg-white bg-opacity-20 px-3 py-1 rounded-full text-sm">
                          <AlertCircle className="w-4 h-4" />
                          <span>
                            {pendingLabs} Lab test{pendingLabs > 1 ? 's' : ''} in progress
                          </span>
                        </div>
                      )}
                      {completedLabs > 0 && (
                        <div className="flex items-center space-x-2 bg-green-500 bg-opacity-30 px-3 py-1 rounded-full text-sm">
                          <CheckCircle className="w-4 h-4" />
                          <span>
                            {completedLabs} Lab result{completedLabs > 1 ? 's' : ''} ready
                          </span>
                        </div>
                      )}
                      {pendingPrescriptions > 0 && (
                        <div className="flex items-center space-x-2 bg-purple-500 bg-opacity-30 px-3 py-1 rounded-full text-sm">
                          <AlertCircle className="w-4 h-4" />
                          <span>
                            {pendingPrescriptions} Prescription{pendingPrescriptions > 1 ? 's' : ''} processing
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onViewDetails(consultation)}
                  className="px-4 py-2 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
                >
                  View Details
                </button>
              </div>

              {/* Session Status */}
              <div className="mt-4 pt-4 border-t border-blue-500">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-blue-200">Complaints Recorded</p>
                    <p className="font-semibold flex items-center space-x-1">
                      {session.complaints ? (
                        <><CheckCircle className="w-4 h-4 text-green-400" /><span>Yes</span></>
                      ) : (
                        <span>Pending</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-200">Vitals Taken</p>
                    <p className="font-semibold flex items-center space-x-1">
                      {session.vitalSigns && Object.keys(session.vitalSigns).length > 0 ? (
                        <><CheckCircle className="w-4 h-4 text-green-400" /><span>Yes</span></>
                      ) : (
                        <span>Pending</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-200">Diagnosis</p>
                    <p className="font-semibold">
                      {session.provisionalDiagnosis ? 'In Progress' : 'Pending'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0);     }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default ActiveConsultationBanner;