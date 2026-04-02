import React from 'react';
import { X, Download, FileCheck, AlertTriangle, CheckCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const LabResultsDetailModal = ({ labRequest, onClose }) => {
  if (!labRequest) return null;

  const getResultFlagIcon = (flag) => {
    const icons = {
      normal: <CheckCircle className="w-4 h-4 text-green-600" />,
      high: <TrendingUp className="w-4 h-4 text-orange-600" />,
      low: <TrendingDown className="w-4 h-4 text-orange-600" />,
      critical: <AlertTriangle className="w-4 h-4 text-red-600" />,
      abnormal: <AlertTriangle className="w-4 h-4 text-yellow-600" />
    };
    return icons[flag] || icons.normal;
  };

  const getResultFlagColor = (flag) => {
    const colors = {
      normal: 'bg-green-50 border-green-200',
      high: 'bg-orange-50 border-orange-200',
      low: 'bg-orange-50 border-orange-200',
      critical: 'bg-red-50 border-red-200',
      abnormal: 'bg-yellow-50 border-yellow-200'
    };
    return colors[flag] || colors.normal;
  };

  const getResultFlagTextColor = (flag) => {
    const colors = {
      normal: 'text-green-800',
      high: 'text-orange-800',
      low: 'text-orange-800',
      critical: 'text-red-800',
      abnormal: 'text-yellow-800'
    };
    return colors[flag] || colors.normal;
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
              <h3 className="text-xl font-semibold">Lab Results - #{labRequest.requestNumber}</h3>
              <p className="text-sm text-gray-500 mt-1">
                Requested on {format(parseISO(labRequest.requestedAt), 'MMMM d, yyyy')}
              </p>
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
            {/* Request Information */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Request Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-blue-700">Requested by:</p>
                  <p className="font-medium text-blue-900">
                    Dr. {labRequest.doctor?.firstName} {labRequest.doctor?.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-blue-700">Priority:</p>
                  <p className="font-medium text-blue-900 capitalize">{labRequest.priority}</p>
                </div>
                {labRequest.clinicalNotes && (
                  <div className="col-span-2">
                    <p className="text-blue-700">Clinical Notes:</p>
                    <p className="font-medium text-blue-900">{labRequest.clinicalNotes}</p>
                  </div>
                )}
                {labRequest.provisionalDiagnosis && (
                  <div className="col-span-2">
                    <p className="text-blue-700">Provisional Diagnosis:</p>
                    <p className="font-medium text-blue-900">{labRequest.provisionalDiagnosis}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Test Results */}
            {labRequest.results && labRequest.results.length > 0 ? (
              <div className="space-y-4">
                <h4 className="font-semibold text-lg">Test Results</h4>
                {labRequest.results.map((result, idx) => (
                  <div 
                    key={idx} 
                    className={`p-4 border rounded-lg ${getResultFlagColor(result.flag)}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h5 className="font-medium text-lg">{result.testName}</h5>
                        {result.testCode && (
                          <p className="text-sm text-gray-600">Code: {result.testCode}</p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {getResultFlagIcon(result.flag)}
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                          result.flag === 'normal' 
                            ? 'bg-green-100 text-green-800'
                            : result.flag === 'critical'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {result.flag.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-sm text-gray-600">Result</p>
                        <p className={`text-lg font-bold ${getResultFlagTextColor(result.flag)}`}>
                          {result.result} {result.unit}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Normal Range</p>
                        <p className="text-lg font-medium text-gray-800">
                          {result.normalRange} {result.unit}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Performed On</p>
                        <p className="text-lg font-medium text-gray-800">
                          {result.performedAt 
                            ? format(parseISO(result.performedAt), 'MMM d, yyyy')
                            : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {result.notes && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-700">Notes:</p>
                        <p className="text-sm text-gray-600 mt-1 italic">{result.notes}</p>
                      </div>
                    )}

                    {result.verifiedBy && (
                      <div className="mt-2 text-xs text-gray-500">
                        Verified on {format(parseISO(result.verifiedAt), 'MMM d, yyyy')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No detailed results available yet</p>
              </div>
            )}

            {/* Critical Values Warning */}
            {labRequest.results?.some(r => r.flag === 'critical') && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h5 className="font-medium text-red-900">Critical Results Detected</h5>
                    <p className="text-sm text-red-700 mt-1">
                      Some of your results show critical values. Please contact your doctor immediately 
                      or visit the emergency department if you experience any severe symptoms.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Attachments */}
            {labRequest.attachments && labRequest.attachments.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold text-lg mb-3">Attachments & Reports</h4>
                <div className="space-y-2">
                  {labRequest.attachments.map((attachment, idx) => (
                    <a
                      key={idx}
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center space-x-3">
                        <FileCheck className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                        <div>
                          <p className="text-sm font-medium">{attachment.fileName}</p>
                          {attachment.description && (
                            <p className="text-xs text-gray-500">{attachment.description}</p>
                          )}
                        </div>
                      </div>
                      <Download className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Comments */}
            {labRequest.comments && labRequest.comments.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold text-lg mb-3">Lab Notes & Comments</h4>
                <div className="space-y-3">
                  {labRequest.comments.map((comment, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900">
                          {comment.type === 'note' ? 'Lab Note' : 'Query'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {format(parseISO(comment.timestamp), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      <p className="text-sm text-gray-700">{comment.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600">
              Report generated on {format(new Date(), 'MMMM d, yyyy')}
            </p>
            <div className="flex items-center space-x-3">
              {labRequest.attachments && labRequest.attachments.length > 0 && (
                <button
                  onClick={() => window.open(labRequest.attachments[0].fileUrl, '_blank')}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LabResultsDetailModal;