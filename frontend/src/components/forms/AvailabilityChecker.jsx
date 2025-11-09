import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { availabilityAPI } from '../../api';

const AvailabilityChecker = ({ doctorId }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAvailability();
  }, [doctorId]);

  const checkAvailability = async () => {
    try {
      const response = await availabilityAPI.getDoctorRules(doctorId);
      const rules = response.data || [];
      
      setStatus({
        configured: rules.length > 0,
        ruleCount: rules.length,
        days: [...new Set(rules.map(r => r.weekday))].sort()
      });
    } catch (error) {
      console.error('Availability check failed:', error);
      setStatus({ configured: false, ruleCount: 0, days: [] });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  if (!status.configured) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-yellow-800">
            Availability Not Configured
          </p>
          <p className="text-sm text-yellow-700 mt-1">
            This doctor hasn't set up their availability schedule yet. 
            You may not see any available time slots.
          </p>
        </div>
      </div>
    );
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const availableDays = status.days.map(d => dayNames[d]).join(', ');

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex items-start gap-3">
      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-green-800">
          Available on: {availableDays}
        </p>
        <p className="text-sm text-green-700 mt-1">
          {status.ruleCount} time slot{status.ruleCount !== 1 ? 's' : ''} configured
        </p>
      </div>
    </div>
  );
};

export default AvailabilityChecker;