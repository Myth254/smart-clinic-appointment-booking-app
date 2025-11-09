import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';

const PatientRecordsTab = ({ 
  patientRecords, 
  onViewRecords, 
  loading 
}) => {
  const [activeSubTab, setActiveSubTab] = useState('recent');

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold mb-1">Patient Records</h2>
          <p className="text-sm text-gray-500">
            Quick access to patient history and notes
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="border-b border-gray-200">
          <div className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveSubTab('recent')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeSubTab === 'recent'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Recent Patients
            </button>
            <button
              onClick={() => setActiveSubTab('all')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeSubTab === 'all'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              All Patients
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patient Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Visit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Visits
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Conditions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && patientRecords.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    Loading patient records...
                  </td>
                </tr>
              ) : patientRecords.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    No patient records yet
                  </td>
                </tr>
              ) : (
                patientRecords
                  .slice(0, activeSubTab === 'recent' ? 10 : undefined)
                  .map((record, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                            <span className="text-xs font-medium">
                              {record.patient?.firstName?.[0]}
                              {record.patient?.lastName?.[0]}
                            </span>
                          </div>
                          <span className="text-sm font-medium">
                            {record.patient?.firstName}{' '}
                            {record.patient?.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {format(parseISO(record.lastVisit), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {record.totalVisits}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {record.conditions.length > 0 ? (
                          record.conditions.map((condition, i) => (
                            <span
                              key={i}
                              className="inline-block px-2 py-1 text-xs bg-gray-100 rounded-full mr-1"
                            >
                              {condition}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                        {record.notes || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => onViewRecords(record)}
                          className="text-black hover:underline"
                        >
                          View Records
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PatientRecordsTab;