// utils/appointmentTransitions.js

/**
 * Valid appointment status transitions
 * Must match backend state machine in appointmentController.js
 */
export const validTransitions = {
  pending: ['approved'],  // Doctors can only approve (not cancel)
  pending_confirmation: ['approved'],
  approved: ['completed', 'no-show'],
  completed: [],  // Final state
  cancelled: [],  // Final state
  'no-show': []   // Final state
};

/**
 * Check if a status transition is valid
 * @param {string} currentStatus - Current appointment status
 * @param {string} targetStatus - Desired status
 * @returns {boolean} - True if transition is allowed
 */
export const canTransitionTo = (currentStatus, targetStatus) => {
  return validTransitions[currentStatus]?.includes(targetStatus) || false;
};

/**
 * Get all allowed transitions from current status
 * @param {string} currentStatus - Current appointment status
 * @returns {string[]} - Array of allowed status values
 */
export const getAllowedTransitions = (currentStatus) => {
  return validTransitions[currentStatus] || [];
};

/**
 * Check if a status is a final state (no further transitions)
 * @param {string} status - Appointment status
 * @returns {boolean} - True if status is final
 */
export const isFinalState = (status) => {
  return validTransitions[status]?.length === 0;
};

/**
 * Get human-readable status label
 * @param {string} status - Appointment status
 * @returns {string} - Formatted status label
 */
export const getStatusLabel = (status) => {
  const labels = {
    pending: 'Pending Approval',
    pending_confirmation: 'Pending Confirmation',
    approved: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    'no-show': 'No-Show',
    'in_progress': 'In Progress'
  };
  
  return labels[status] || status;
};

/**
 * Get status color class for badges
 * @param {string} status - Appointment status
 * @returns {string} - Tailwind CSS classes
 */
export const getStatusColorClass = (status) => {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    pending_confirmation: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    completed: 'bg-blue-100 text-blue-800',
    cancelled: 'bg-red-100 text-red-800',
    'no-show': 'bg-gray-100 text-gray-800',
    'in_progress': 'bg-purple-100 text-purple-800'
  };
  
  return colors[status] || 'bg-gray-100 text-gray-800';
};

/**
 * Validate if user role can perform status transition
 * @param {string} userRole - User's role (doctor, patient, admin)
 * @param {string} currentStatus - Current appointment status
 * @param {string} targetStatus - Desired status
 * @returns {boolean} - True if user can perform this transition
 */
export const canUserTransition = (userRole, currentStatus, targetStatus) => {
  // Check if transition is valid first
  if (!canTransitionTo(currentStatus, targetStatus)) {
    return false;
  }
  
  // Role-specific rules
  if (userRole === 'admin') {
    return true; // Admin can do anything
  }
  
  if (userRole === 'doctor') {
    // Doctors cannot cancel appointments
    if (targetStatus === 'cancelled') {
      return false;
    }
    // Doctors can approve, complete, mark no-show
    return ['approved', 'completed', 'no-show'].includes(targetStatus);
  }
  
  if (userRole === 'patient') {
    // Patients can only cancel pending or approved appointments
    return targetStatus === 'cancelled' && ['pending', 'pending_confirmation', 'approved'].includes(currentStatus);
  }
  
  return false;
};

/**
 * Get error message for invalid transition
 * @param {string} currentStatus - Current status
 * @param {string} targetStatus - Attempted target status
 * @returns {string} - Error message
 */
export const getTransitionError = (currentStatus, targetStatus) => {
  if (isFinalState(currentStatus)) {
    return `Cannot modify ${currentStatus} appointments. This is a final state.`;
  }
  
  const allowed = getAllowedTransitions(currentStatus);
  if (allowed.length === 0) {
    return `No transitions available from ${currentStatus}.`;
  }
  
  return `Cannot change from ${currentStatus} to ${targetStatus}. Valid transitions: ${allowed.join(', ')}`;
};

export default {
  validTransitions,
  canTransitionTo,
  getAllowedTransitions,
  isFinalState,
  getStatusLabel,
  getStatusColorClass,
  canUserTransition,
  getTransitionError
};
