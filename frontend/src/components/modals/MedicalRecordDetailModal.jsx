import React from 'react';
import { FileText, Eye, Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const MedicalRecordDetailModal = ({ records, loading, onViewRecord }) => {
  if (loading && records.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        Loading records...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">No medical records yet</p>
        <p className="text-xs mt-1">Records will appear here after completed appointments</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Medical Records</h2>
        <p className="text-sm text-gray-500">Your medical history and diagnoses</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {records.map((record) => (
          <div key={record._id} className="border border-gray-200 rounded-lg p-6 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="space-y-3 flex-1">
                {/* Header */}
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900">{record.diagnosis}</h3>
                    <p className="text-sm text-gray-500">
                      {format(parseISO(record.createdAt), 'MMMM d, yyyy')}
                    </p>
                  </div>
                </div>

                {/* Doctor Info */}
                <div className="pl-15">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Attending Doctor:</span>{' '}
                    Dr. {record.doctor?.userId?.firstName || record.doctor?.firstName}{' '}
                    {record.doctor?.userId?.lastName || record.doctor?.lastName}
                  </p>
                  {record.doctor?.specialization && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Specialty:</span> {record.doctor.specialization}
                    </p>
                  )}
                </div>

                {/* Chief Complaint */}
                {record.chiefComplaint && (
                  <div className="pl-15">
                    <p className="text-sm font-medium text-gray-700">Chief Complaint:</p>
                    <p className="text-sm text-gray-600">{record.chiefComplaint}</p>
                  </div>
                )}

                {/* Symptoms */}
                {record.symptoms && record.symptoms.length > 0 && (
                  <div className="pl-15">
                    <p className="text-sm font-medium text-gray-700">Symptoms:</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {record.symptoms.map((symptom, idx) => (
                        <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          {symptom}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vitals */}
                {record.vitals && Object.keys(record.vitals).length > 0 && (
                  <div className="pl-15">
                    <p className="text-sm font-medium text-gray-700 mb-2">Vital Signs:</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {record.vitals.bloodPressure && (
                        <div className="bg-blue-50 p-2 rounded">
                          <p className="text-xs text-blue-600">Blood Pressure</p>
                          <p className="text-sm font-medium text-blue-900">{record.vitals.bloodPressure}</p>
                        </div>
                      )}
                      {record.vitals.temperature && (
                        <div className="bg-red-50 p-2 rounded">
                          <p className="text-xs text-red-600">Temperature</p>
                          <p className="text-sm font-medium text-red-900">{record.vitals.temperature}°C</p>
                        </div>
                      )}
                      {record.vitals.heartRate && (
                        <div className="bg-purple-50 p-2 rounded">
                          <p className="text-xs text-purple-600">Heart Rate</p>
                          <p className="text-sm font-medium text-purple-900">{record.vitals.heartRate} bpm</p>
                        </div>
                      )}
                      {record.vitals.weight && (
                        <div className="bg-green-50 p-2 rounded">
                          <p className="text-xs text-green-600">Weight</p>
                          <p className="text-sm font-medium text-green-900">{record.vitals.weight} kg</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Diagnosis Details */}
                {record.diagnosisDetails && (
                  <div className="pl-15">
                    <p className="text-sm font-medium text-gray-700">Diagnosis Details:</p>
                    <p className="text-sm text-gray-600">{record.diagnosisDetails}</p>
                  </div>
                )}

                {/* Treatment Plan */}
                {record.treatmentPlan && (
                  <div className="pl-15">
                    <p className="text-sm font-medium text-gray-700">Treatment Plan:</p>
                    <p className="text-sm text-gray-600">{record.treatmentPlan}</p>
                  </div>
                )}

                {/* Prescriptions */}
                {record.prescription && record.prescription.length > 0 && (
                  <div className="pl-15">
                    <p className="text-sm font-medium text-gray-700 mb-2">Prescriptions:</p>
                    <div className="space-y-2">
                      {record.prescription.map((med, idx) => (
                        <div key={idx} className="flex items-start space-x-2 p-3 bg-purple-50 rounded-lg">
                          <div className="w-6 h-6 bg-purple-200 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-purple-700">{idx + 1}</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-purple-900">{med.medication}</p>
                            <p className="text-xs text-purple-700">
                              {med.dosage} • {med.frequency} • {med.duration}
                            </p>
                            {med.instructions && (
                              <p className="text-xs text-purple-600 mt-1 italic">{med.instructions}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lab Tests */}
                {record.labTests && record.labTests.length > 0 && (
                  <div className="pl-15">
                    <p className="text-sm font-medium text-gray-700 mb-2">Lab Tests Ordered:</p>
                    <div className="flex flex-wrap gap-2">
                      {record.labTests.map((test, idx) => (
                        <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full">
                          {test}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up */}
                {record.followUpDate && (
                  <div className="pl-15 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-sm font-medium text-yellow-900">Follow-up Scheduled:</p>
                    <p className="text-sm text-yellow-800">
                      {format(parseISO(record.followUpDate), 'MMMM d, yyyy')}
                    </p>
                    {record.followUpNotes && (
                      <p className="text-xs text-yellow-700 mt-1">{record.followUpNotes}</p>
                    )}
                  </div>
                )}

                {/* Doctor's Notes */}
                {record.notes && (
                  <div className="pl-15 p-3 bg-gray-50 border border-gray-200 rounded">
                    <p className="text-sm font-medium text-gray-700">Doctor's Notes:</p>
                    <p className="text-sm text-gray-600 mt-1">{record.notes}</p>
                  </div>
                )}

                {/* Attachments */}
                {record.attachments && record.attachments.length > 0 && (
                  <div className="pl-15">
                    <p className="text-sm font-medium text-gray-700 mb-2">Attachments:</p>
                    <div className="space-y-1">
                      {record.attachments.map((attachment, idx) => (
                        <a
                          key={idx}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800"
                        >
                          <Download className="w-4 h-4" />
                          <span>{attachment.name || `Attachment ${idx + 1}`}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col space-y-2 ml-6">
                <button
                  onClick={() => onViewRecord(record)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center space-x-2 whitespace-nowrap"
                >
                  <Eye className="w-4 h-4" />
                  <span>View Full</span>
                </button>
                <button
                  onClick={() => window.open(`/api/medical-records/${record._id}/pdf`, '_blank')}
                  className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800 flex items-center space-x-2 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MedicalRecordDetailModal;