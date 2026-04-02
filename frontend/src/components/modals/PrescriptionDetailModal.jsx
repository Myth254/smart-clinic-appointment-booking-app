import React from 'react';
import { X, Pill, AlertTriangle, Info, Package, Calendar, User } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const PrescriptionDetailModal = ({ prescription, onClose }) => {
  if (!prescription) return null;

  const getStatusColor = (status) => {
    const colors = {
      new: 'bg-blue-100 text-blue-800',
      pending_pharmacy: 'bg-yellow-100 text-yellow-800',
      availability_confirmed: 'bg-purple-100 text-purple-800',
      ready_for_pickup: 'bg-green-100 text-green-800',
      partial_ready: 'bg-orange-100 text-orange-800',
      dispensed: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getMedicationStatusColor = (status) => {
    const colors = {
      available: 'bg-green-100 text-green-700',
      partial: 'bg-orange-100 text-orange-700',
      unavailable: 'bg-red-100 text-red-700',
      alternative_suggested: 'bg-yellow-100 text-yellow-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative inline-block w-full max-w-4xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h3 className="text-xl font-semibold">
                Prescription #{prescription.prescriptionNumber}
              </h3>
              <div className="flex items-center space-x-3 mt-2">
                <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(prescription.status)}`}>
                  {prescription.status.replace(/_/g, ' ')}
                </span>
                {prescription.status === 'ready_for_pickup' && (
                  <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 flex items-center space-x-1">
                    <Package className="w-3 h-3" />
                    <span>Ready for Pickup</span>
                  </span>
                )}
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {/* Prescription Info */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-3">Prescription Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-start space-x-2">
                  <User className="w-4 h-4 text-blue-700 mt-0.5" />
                  <div>
                    <p className="text-blue-700">Prescribed by:</p>
                    <p className="font-medium text-blue-900">
                      Dr. {prescription.doctor?.firstName} {prescription.doctor?.lastName}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Calendar className="w-4 h-4 text-blue-700 mt-0.5" />
                  <div>
                    <p className="text-blue-700">Date Prescribed:</p>
                    <p className="font-medium text-blue-900">
                      {format(parseISO(prescription.createdAt), 'MMMM d, yyyy')}
                    </p>
                  </div>
                </div>
                {prescription.validUntil && (
                  <div className="col-span-2 flex items-start space-x-2">
                    <Info className="w-4 h-4 text-blue-700 mt-0.5" />
                    <div>
                      <p className="text-blue-700">Valid Until:</p>
                      <p className="font-medium text-blue-900">
                        {format(parseISO(prescription.validUntil), 'MMMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Medications List */}
            <div className="mb-6">
              <h4 className="font-semibold text-lg mb-4">Medications ({prescription.medications.length})</h4>
              <div className="space-y-4">
                {prescription.medications.map((med, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start space-x-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Pill className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h5 className="font-medium text-lg">{med.drugName}</h5>
                          {med.genericName && (
                            <p className="text-sm text-gray-600">Generic: {med.genericName}</p>
                          )}
                        </div>
                      </div>
                      {med.availabilityStatus && (
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${getMedicationStatusColor(med.availabilityStatus)}`}>
                          {med.availabilityStatus.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                      <div>
                        <p className="text-gray-600">Dosage</p>
                        <p className="font-medium text-gray-900">{med.dosage}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Strength</p>
                        <p className="font-medium text-gray-900">{med.strength || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Frequency</p>
                        <p className="font-medium text-gray-900">{med.frequency}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Duration</p>
                        <p className="font-medium text-gray-900">{med.duration}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <p className="text-gray-600">Form</p>
                        <p className="font-medium text-gray-900 capitalize">{med.form}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Route</p>
                        <p className="font-medium text-gray-900 capitalize">{med.route}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Quantity</p>
                        <p className="font-medium text-gray-900">{med.quantity}</p>
                      </div>
                    </div>

                    {med.instructions && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-700">Instructions:</p>
                        <p className="text-sm text-gray-600 mt-1">{med.instructions}</p>
                      </div>
                    )}

                    {med.alternativeDrug && (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-sm font-medium text-yellow-900">Alternative Suggested:</p>
                        <p className="text-sm text-yellow-800 mt-1">{med.alternativeDrug}</p>
                        {med.alternativeReason && (
                          <p className="text-xs text-yellow-700 mt-1">Reason: {med.alternativeReason}</p>
                        )}
                      </div>
                    )}

                    {med.dispensedAt && (
                      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center space-x-2 text-sm text-gray-600">
                        <Package className="w-4 h-4" />
                        <span>
                          Dispensed: {med.dispensedQuantity} on {format(parseISO(med.dispensedAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* General Instructions */}
            {prescription.generalInstructions && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h5 className="font-medium text-blue-900 flex items-center space-x-2 mb-2">
                  <Info className="w-5 h-5" />
                  <span>General Instructions</span>
                </h5>
                <p className="text-sm text-blue-800">{prescription.generalInstructions}</p>
              </div>
            )}

            {/* Warnings */}
            {prescription.warnings && prescription.warnings.length > 0 && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h5 className="font-medium text-red-900 flex items-center space-x-2 mb-3">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Important Warnings</span>
                </h5>
                <ul className="space-y-2">
                  {prescription.warnings.map((warning, idx) => (
                    <li key={idx} className="text-sm text-red-800 flex items-start space-x-2">
                      <span className="font-bold mt-0.5">•</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Patient Allergies */}
            {prescription.allergies && prescription.allergies.length > 0 && (
              <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <h5 className="font-medium text-orange-900 mb-2">Known Allergies:</h5>
                <div className="flex flex-wrap gap-2">
                  {prescription.allergies.map((allergy, idx) => (
                    <span key={idx} className="px-3 py-1 bg-orange-100 text-orange-800 text-sm rounded-full">
                      {allergy}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Refills */}
            {prescription.refillsAllowed > 0 && (
              <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h5 className="font-medium text-purple-900 mb-2">Refills Information:</h5>
                <p className="text-sm text-purple-800">
                  {prescription.refillsRemaining} of {prescription.refillsAllowed} refills remaining
                </p>
              </div>
            )}

            {/* Pharmacy Notes */}
            {prescription.pharmacyNotes && (
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h5 className="font-medium text-gray-900 mb-2">Pharmacy Notes:</h5>
                <p className="text-sm text-gray-700">{prescription.pharmacyNotes}</p>
              </div>
            )}

            {/* Pickup Information */}
            {prescription.dispensedAt && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h5 className="font-medium text-green-900 mb-3">Pickup Information</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-green-700">Dispensed On:</p>
                    <p className="font-medium text-green-900">
                      {format(parseISO(prescription.dispensedAt), 'MMMM d, yyyy')}
                    </p>
                  </div>
                  {prescription.pickedUpBy && (
                    <div>
                      <p className="text-green-700">Picked Up By:</p>
                      <p className="font-medium text-green-900">{prescription.pickedUpBy}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cost Information */}
            {(prescription.estimatedCost || prescription.actualCost) && (
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h5 className="font-medium text-gray-900 mb-2">Cost Information:</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {prescription.estimatedCost && (
                    <div>
                      <p className="text-gray-600">Estimated Cost:</p>
                      <p className="text-lg font-bold text-gray-900">
                        KES {prescription.estimatedCost.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {prescription.actualCost && (
                    <div>
                      <p className="text-gray-600">Actual Cost:</p>
                      <p className="text-lg font-bold text-gray-900">
                        KES {prescription.actualCost.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                    prescription.paymentStatus === 'paid' 
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    Payment: {prescription.paymentStatus}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
            >
              Close
            </button>
            {prescription.status === 'ready_for_pickup' && (
              <button
                className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                onClick={() => {
                  alert('Visit the pharmacy to collect your medication');
                  onClose();
                }}
              >
                Directions to Pharmacy
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionDetailModal;