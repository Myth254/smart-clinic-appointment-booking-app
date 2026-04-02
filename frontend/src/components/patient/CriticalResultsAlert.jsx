import React, { useState, useEffect } from 'react';
import { AlertTriangle, Phone, X, FileText, MapPin } from 'lucide-react';
import { useConsultation } from '../../context/ConsultationContext';

const CriticalResultsAlert = () => {
  const { activeConsultations, checkCriticalResults } = useConsultation();
  const [criticalResults, setCriticalResults] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    const critical = checkCriticalResults();
    setCriticalResults(critical.filter(c => !dismissed.has(c.appointment._id)));
  }, [activeConsultations, dismissed, checkCriticalResults]);

  const handleDismiss = (appointmentId) => {
    setDismissed(prev => new Set([...prev, appointmentId]));
  };

  const handleCallDoctor = (consultation) => {
    const phone = consultation.appointment.doctor?.phoneNumber || 
                  consultation.appointment.doctor?.userId?.phoneNumber;
    if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      alert('Doctor phone number not available. Please visit the emergency department.');
    }
  };

  const handleViewResults = () => {
    // Navigate to lab results tab
    window.location.href = '#lab-results';
  };

  if (criticalResults.length === 0) return null;

  return (
    <>
      {criticalResults.map((consultation) => {
        const { appointment, labRequests } = consultation;
        const criticalTests = labRequests.filter(lab => 
          lab.results?.some(r => r.flag === 'critical')
        );

        return (
          <div 
            key={appointment._id}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleDismiss(appointment._id);
              }
            }}
          >
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full animate-bounce-once">
              {/* Header */}
              <div className="bg-red-600 text-white p-6 rounded-t-lg">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center animate-pulse">
                      <AlertTriangle className="w-10 h-10" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">CRITICAL RESULTS</h2>
                      <p className="text-red-100 text-sm mt-1">
                        Immediate Medical Attention Required
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDismiss(appointment._id)}
                    className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="mb-6">
                  <p className="text-gray-800 font-medium mb-2">
                    Your recent lab results show critical values that require immediate attention.
                  </p>
                  <p className="text-gray-600 text-sm">
                    {criticalTests.length} test{criticalTests.length > 1 ? 's' : ''} with critical findings
                  </p>
                </div>

                {/* Critical Tests List */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <p className="font-semibold text-red-900 mb-3">Critical Tests:</p>
                  <div className="space-y-2">
                    {criticalTests.map((lab) => {
                      const criticalResults = lab.results.filter(r => r.flag === 'critical');
                      return (
                        <div key={lab._id} className="text-sm">
                          {criticalResults.map((result, idx) => (
                            <div key={idx} className="flex items-start space-x-2 mb-2">
                              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="font-medium text-red-900">{result.testName}</p>
                                <p className="text-red-700">
                                  Value: <strong>{result.result} {result.unit}</strong> 
                                  {' '}(Normal: {result.normalRange})
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Warning Message */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-yellow-900 font-medium mb-2">
                    ⚠️ What to do:
                  </p>
                  <ul className="text-sm text-yellow-800 space-y-1">
                    <li>• Contact your doctor immediately</li>
                    <li>• If experiencing severe symptoms, visit the emergency department</li>
                    <li>• Do not ignore these results</li>
                  </ul>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={() => handleCallDoctor(consultation)}
                    className="w-full flex items-center justify-center space-x-2 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    <Phone className="w-5 h-5" />
                    <span>Call Doctor Now</span>
                  </button>

                  <button
                    onClick={() => handleViewResults(consultation)}
                    className="w-full flex items-center justify-center space-x-2 border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                  >
                    <FileText className="w-5 h-5" />
                    <span>View Full Results</span>
                  </button>

                  <button
                    onClick={() => {
                      alert('Emergency services: 999\n\nNearest Hospital:\n[Your Hospital Name]\n[Address]');
                    }}
                    className="w-full flex items-center justify-center space-x-2 border-2 border-red-600 text-red-600 py-3 rounded-lg font-semibold hover:bg-red-50 transition-colors"
                  >
                    <MapPin className="w-5 h-5" />
                    <span>Find Emergency Care</span>
                  </button>
                </div>

                {/* Dismiss Link */}
                <div className="mt-4 text-center">
                  <button
                    onClick={() => handleDismiss(appointment._id)}
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    I understand, dismiss this alert
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes bounce-once {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        .animate-bounce-once {
          animation: bounce-once 0.5s ease-in-out;
        }
      `}</style>
    </>
  );
};

export default CriticalResultsAlert;