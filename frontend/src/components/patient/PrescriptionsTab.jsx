// components/patient/PrescriptionsTab.jsx
//
// ✅ REFACTORED — socket listeners removed from this component entirely.
//
// Before: PrescriptionsTab registered its own listeners for
//   prescription:confirmed / ready / dispensed / alternative_suggested
//   via socketService directly. PatientDashboard registers the *same* events
//   in its socket useEffect, so every prescription event fired two handlers:
//   one in the dashboard (which called fetchPrescriptions + highlighted) and
//   one in this component (which highlighted again independently).
//
// After:  This component is purely presentational. It receives:
//   - prescriptions          — from PatientDashboard state
//   - loading                — from PatientDashboard state
//   - onViewDetails          — callback to open detail modal
//   - highlightedPrescriptions (Set<id>) — managed entirely by PatientDashboard's
//                              socket handler; no local socket subscription needed.
//
// The `animatingPrescriptions` set is kept as local UI-only state derived from
// prop changes (via useEffect watching highlightedPrescriptions) so the mount
// animation still works without any socket dependency.

import React, { useState, useEffect, useRef } from 'react';
import { Pill, Eye, Package, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const PrescriptionsTab = ({
  prescriptions = [],
  loading = false,
  onViewDetails,
  highlightedPrescriptions: externalHighlights = new Set(),
}) => {
  // Local animation state: tracks which IDs are in the brief scale-up phase.
  // Driven by changes in the externally-managed highlight set.
  const [animatingPrescriptions, setAnimatingPrescriptions] = useState(new Set());
  const animTimeoutsRef = useRef({});

  // When the parent adds a new highlight (socket event), trigger a brief animation.
  useEffect(() => {
    const incoming = externalHighlights;
    if (!incoming || incoming.size === 0) return;

    incoming.forEach((id) => {
      // Don't restart the animation if already animating this id
      if (animTimeoutsRef.current[id]) return;

      setAnimatingPrescriptions((prev) => new Set([...prev, id]));

      animTimeoutsRef.current[id] = setTimeout(() => {
        setAnimatingPrescriptions((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        delete animTimeoutsRef.current[id];
      }, 1_000);
    });
  }, [externalHighlights]);

  // Cleanup animation timeouts on unmount
  useEffect(() => {
    const timeouts = animTimeoutsRef.current;
    return () => {
      Object.values(timeouts).forEach(clearTimeout);
    };
  }, []);

  const getStatusColor = (status) => {
    const colors = {
      new:                    'bg-blue-100 text-blue-800',
      pending_pharmacy:       'bg-yellow-100 text-yellow-800',
      availability_confirmed: 'bg-purple-100 text-purple-800',
      ready_for_pickup:       'bg-green-100 text-green-800',
      partial_ready:          'bg-orange-100 text-orange-800',
      dispensed:              'bg-gray-100 text-gray-800',
      cancelled:              'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading && prescriptions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4" />
        <p>Loading prescriptions...</p>
      </div>
    );
  }

  if (prescriptions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
        <Pill className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">No prescriptions yet</p>
        <p className="text-xs mt-1">Prescriptions will appear here after your doctor visit</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Prescriptions</h2>
        <p className="text-sm text-gray-500">Manage your medications and pharmacy pickups</p>
      </div>

      {/* Prescriptions List */}
      <div className="divide-y divide-gray-200">
        {prescriptions.map((rx) => {
          const isHighlighted = externalHighlights.has(rx._id);
          const isAnimating   = animatingPrescriptions.has(rx._id);

          return (
            <div
              key={rx._id}
              className={`p-6 transition-all duration-300 ${
                isHighlighted
                  ? 'bg-purple-50 ring-2 ring-purple-500 ring-inset shadow-md'
                  : 'hover:bg-gray-50'
              } ${isAnimating ? 'scale-[1.01]' : 'scale-100'}`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  {/* Title with Status */}
                  <div className="flex items-center space-x-3 flex-wrap">
                    {isHighlighted && (
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                    )}
                    <h3 className="font-medium text-gray-900">
                      Prescription #{rx.prescriptionNumber}
                    </h3>
                    <span
                      className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(rx.status)}`}
                    >
                      {rx.status.replace(/_/g, ' ')}
                    </span>
                    {rx.status === 'ready_for_pickup' && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full flex items-center space-x-1 animate-bounce">
                        <Package className="w-3 h-3" />
                        <span>Ready!</span>
                      </span>
                    )}
                  </div>

                  {/* Doctor and Date */}
                  <p className="text-sm text-gray-600">
                    Prescribed by Dr. {rx.doctor?.firstName} {rx.doctor?.lastName} on{' '}
                    {format(parseISO(rx.createdAt), 'MMM d, yyyy')}
                  </p>

                  {/* Medications List */}
                  <div className="mt-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Medications ({rx.medications?.length || 0}):
                    </p>
                    <div className="space-y-2">
                      {rx.medications && rx.medications.slice(0, 2).map((med, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start space-x-3 p-3 rounded-lg transition-all ${
                            isHighlighted ? 'bg-white border border-purple-200' : 'bg-gray-50'
                          }`}
                        >
                          <Pill className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {med.drugName}
                            </p>
                            <p className="text-xs text-gray-600">
                              {med.dosage} • {med.frequency} • {med.duration}
                            </p>
                            {med.availabilityStatus &&
                              med.availabilityStatus !== 'pending' && (
                                <span
                                  className={`inline-block mt-1.5 px-2 py-0.5 text-xs font-medium rounded ${
                                    med.availabilityStatus === 'available'
                                      ? 'bg-green-100 text-green-700'
                                      : med.availabilityStatus === 'substitution_offered'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-yellow-100 text-yellow-700'
                                  }`}
                                >
                                  {med.availabilityStatus.replace(/_/g, ' ')}
                                </span>
                              )}
                          </div>
                        </div>
                      ))}
                      {rx.medications && rx.medications.length > 2 && (
                        <p className="text-sm text-gray-500 pl-3 font-medium">
                          +{rx.medications.length - 2} more medication
                          {rx.medications.length - 2 > 1 ? 's' : ''}...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Ready for Pickup Alert */}
                  {rx.status === 'ready_for_pickup' && (
                    <div
                      className={`mt-3 p-3 rounded-lg border ${
                        isHighlighted
                          ? 'bg-teal-50 border-teal-300'
                          : 'bg-teal-50 border-teal-200'
                      }`}
                    >
                      <p className="text-sm font-medium text-teal-800">
                        ✓ Ready for pickup at the pharmacy
                      </p>
                      {rx.actualCost && (
                        <p className="text-sm text-teal-700 mt-1">
                          Total: KES {rx.actualCost?.toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Partial Ready Alert */}
                  {rx.status === 'partial_ready' && (
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-sm font-medium text-orange-800 flex items-center space-x-1">
                        <AlertCircle className="w-4 h-4" />
                        <span>Some medications are ready. Others arriving soon.</span>
                      </p>
                    </div>
                  )}

                  {/* Dispensed Info */}
                  {rx.dispensedAt && (
                    <div
                      className={`mt-3 p-3 rounded-lg border ${
                        isHighlighted
                          ? 'bg-gray-100 border-gray-300'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <p className="text-sm text-gray-700 font-medium">
                        Dispensed on {format(parseISO(rx.dispensedAt), 'MMM d, yyyy')}
                      </p>
                      {rx.pickedUpBy && (
                        <p className="text-xs text-gray-600 mt-1">
                          Picked up by: {rx.pickedUpBy}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Alternative Medication Alert */}
                  {rx.alternativeMedicationOffered && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-medium text-blue-800 flex items-center space-x-1">
                        <AlertCircle className="w-4 h-4" />
                        <span>Alternative medication offered by pharmacy</span>
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        {rx.alternativeMedicationReason}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col space-y-2 ml-4">
                  <button
                    onClick={() => onViewDetails(rx)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 active:bg-gray-100 flex items-center space-x-2 whitespace-nowrap transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View Details</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-once {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.7; }
        }
        .animate-pulse-once {
          animation: pulse-once 1s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default PrescriptionsTab;