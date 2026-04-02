/**
 * Permission definitions for the medical system
 */
export const PERMISSIONS = {
  // Patient permissions
  VIEW_OWN_APPOINTMENTS: 'view_own_appointments',
  VIEW_OWN_RECORDS: 'view_own_records',
  MAKE_PAYMENTS: 'make_payments',
  VIEW_LAB_RESULTS: 'view_lab_results',
  PICKUP_PRESCRIPTIONS: 'pickup_prescriptions',
  VIEW_OWN_LAB_REQUESTS: 'view_own_lab_requests',

  // Doctor permissions
  VIEW_ASSIGNED_APPOINTMENTS: 'view_assigned_appointments',
  MODIFY_ASSIGNED_APPOINTMENTS: 'modify_assigned_appointments',
  CREATE_SESSION_RECORDS: 'create_session_records',
  CREATE_MEDICAL_RECORDS: 'create_medical_records',
  UPDATE_MEDICAL_RECORDS: 'update_medical_records',
  REQUEST_LABS: 'request_labs',
  CREATE_PRESCRIPTIONS: 'create_prescriptions',
  VIEW_PATIENT_HISTORY: 'view_patient_history',
  ADD_ATTACHMENTS: 'add_attachments',
  CREATE_FOLLOWUPS: 'create_followups',

  // Lab Personnel permissions
  VIEW_LAB_REQUESTS: 'view_lab_requests',
  UPDATE_LAB_STATUS: 'update_lab_status',
  UPLOAD_LAB_RESULTS: 'upload_lab_results',
  ADD_LAB_DATA: 'add_lab_data',
  COMMENT_TO_DOCTOR: 'comment_to_doctor',
  MARK_LAB_BILLING: 'mark_lab_billing',

  // Pharmacy Staff permissions
  VIEW_PRESCRIPTIONS: 'view_prescriptions',
  CONFIRM_MEDICATION_AVAILABILITY: 'confirm_medication_availability',
  SET_READY_FOR_PICKUP: 'set_ready_for_pickup',
  HANDLE_PRESCRIPTION_PAYMENT: 'handle_prescription_payment',
  MARK_DISPENSED: 'mark_dispensed',

  // Admin permissions
  MANAGE_USERS: 'manage_users',
  ASSIGN_STAFF: 'assign_staff',
  VIEW_ALL_RECORDS: 'view_all_records',
  VIEW_PAYMENT_LOGS: 'view_payment_logs',
  MANAGE_SYSTEM_SETTINGS: 'manage_system_settings',
  VIEW_REPORTS: 'view_reports',
  AUDIT_LOGS: 'audit_logs',
  REVOKE_ASSIGN_ROLES: 'revoke_assign_roles'
}

/**
 * Role-based permission mapping
 * Defines what each role can do by default
 */
const ROLE_PERMISSIONS = {
  patient: [
    PERMISSIONS.VIEW_OWN_APPOINTMENTS,
    PERMISSIONS.VIEW_OWN_RECORDS,
    PERMISSIONS.MAKE_PAYMENTS,
    PERMISSIONS.VIEW_LAB_RESULTS,
    PERMISSIONS.VIEW_OWN_LAB_REQUESTS,
    PERMISSIONS.PICKUP_PRESCRIPTIONS,
  ],
  doctor: [
    PERMISSIONS.VIEW_ASSIGNED_APPOINTMENTS,
    PERMISSIONS.MODIFY_ASSIGNED_APPOINTMENTS,
    PERMISSIONS.CREATE_SESSION_RECORDS,
    PERMISSIONS.CREATE_MEDICAL_RECORDS,
    PERMISSIONS.UPDATE_MEDICAL_RECORDS,
    PERMISSIONS.REQUEST_LABS,
    PERMISSIONS.CREATE_PRESCRIPTIONS,
    PERMISSIONS.VIEW_PATIENT_HISTORY,
    PERMISSIONS.ADD_ATTACHMENTS,
    PERMISSIONS.CREATE_FOLLOWUPS,
  ],
  lab_personnel: [
    PERMISSIONS.VIEW_LAB_REQUESTS,
    PERMISSIONS.UPDATE_LAB_STATUS,
    PERMISSIONS.UPLOAD_LAB_RESULTS,
    PERMISSIONS.ADD_LAB_DATA,
    PERMISSIONS.COMMENT_TO_DOCTOR,
    PERMISSIONS.MARK_LAB_BILLING,
  ],
  pharmacy_staff: [
    PERMISSIONS.VIEW_PRESCRIPTIONS,
    PERMISSIONS.CONFIRM_MEDICATION_AVAILABILITY,
    PERMISSIONS.SET_READY_FOR_PICKUP,
    PERMISSIONS.HANDLE_PRESCRIPTION_PAYMENT,
    PERMISSIONS.MARK_DISPENSED,
  ],
  admin: Object.values(PERMISSIONS) // Admin has ALL permissions
}

/**
 * Check if user has specific permission
 * ✅ FIXED: Properly handles empty permissions array and always checks role-based permissions
 */
export const hasPermission = (user, permission) => {
  if (!user) return false
  if (user.role === 'admin') return true

  // ✅ Check role-based permissions FIRST (more reliable)
  const rolePermissions = ROLE_PERMISSIONS[user.role] || []
  if (rolePermissions.includes(permission)) {
    return true
  }

  // ✅ Then check explicit permissions as an override/addition
  if (user.permissions?.includes(permission)) {
    return true
  }

  return false
}

/**
 * Check if user has any of the specified permissions
 */
export const hasAnyPermission = (user, ...permissions) => {
  if (!user) return false
  if (user.role === 'admin') return true
  return permissions.some(permission => hasPermission(user, permission))
}

/**
 * Check if user has all specified permissions
 */
export const hasAllPermissions = (user, ...permissions) => {
  if (!user) return false
  if (user.role === 'admin') return true
  return permissions.every(permission => hasPermission(user, permission))
}

/**
 * Check if user owns the resource
 */
export const isResourceOwner = (user, resourceUserId) => {
  if (!user || !resourceUserId) return false
  if (user.role === 'admin') return true

  // Convert both to strings for comparison
  const userId = (user.id || user._id)?.toString()
  const resourceId = (resourceUserId || resourceUserId?._id)?.toString()

  return userId === resourceId
}

/**
 * Check if doctor is assigned to resource
 */
export const isDoctorAssigned = (user, resource) => {
  if (!user || !resource) return false
  if (user.role === 'admin') return true
  if (user.role !== 'doctor') return false

  const doctorId = resource.doctor || resource.assignedDoctor || resource.doctorId
  const userId = (user.id || user._id)?.toString()
  const resourceDoctorId = (doctorId || doctorId?._id)?.toString()

  return resourceDoctorId === userId
}

/**
 * Role checking utilities
 */
export const isPatient = (user) => user?.role === 'patient'
export const isDoctor = (user) => user?.role === 'doctor'
export const isLabPersonnel = (user) => user?.role === 'lab_personnel'
export const isPharmacyStaff = (user) => user?.role === 'pharmacy_staff'
export const isAdmin = (user) => user?.role === 'admin'
export const isClinicStaff = (user) => ['doctor', 'lab_personnel', 'pharmacy_staff'].includes(user?.role)

/**
 * Get user's role display name
 */
export const getRoleDisplayName = (role) => {
  const roleNames = {
    patient: 'Patient',
    doctor: 'Doctor',
    lab_personnel: 'Lab Personnel',
    pharmacy_staff: 'Pharmacy Staff',
    admin: 'Administrator'
  }
  return roleNames[role] || role
}

/**
 * Get dashboard path for user role
 */
export const getDashboardPath = (user) => {
  if (!user) return '/login'

  const dashboardPaths = {
    patient: '/patient/dashboard',
    doctor: '/doctor/dashboard',
    lab_personnel: '/lab/dashboard',
    pharmacy_staff: '/pharmacy/dashboard',
    admin: '/admin/dashboard'
  }

  return dashboardPaths[user.role] || '/login'
}

/**
 * Validate medical record access
 * Returns true if user can access the medical record
 */
export const canAccessMedicalRecord = (user, record) => {
  if (!user || !record) return false

  // Admin can access all records
  if (user.role === 'admin') return true

  // Patient can only access their own records
  if (user.role === 'patient') {
    return isResourceOwner(user, record.patient || record.patientId)
  }

  // Doctor can access records they created or are assigned to
  if (user.role === 'doctor') {
    return isDoctorAssigned(user, record)
  }

  return false
}

/**
 * Validate lab request access
 * ✅ SIMPLIFIED: Role-based checks
 */
export const canAccessLabRequest = (user, labRequest) => {
  if (!user || !labRequest) return false

  // Admin can access all
  if (user.role === 'admin') return true

  // Doctor can access their requests
  if (user.role === 'doctor') {
    return isDoctorAssigned(user, labRequest)
  }

  // Lab personnel can access assigned requests or pending ones
  if (user.role === 'lab_personnel') {
    const userId = (user.id || user._id)?.toString()
    const assignedToId = labRequest.assignedTo?.toString()
    return assignedToId === userId || labRequest.status === 'pending'
  }

  // ✅ Patient can view their own lab results (FIXED)
  if (user.role === 'patient') {
    return isResourceOwner(user, labRequest.patient || labRequest.patientId)
  }

  return false
}

/**
 * Validate prescription access
 * ✅ SIMPLIFIED: Role-based checks
 */
export const canAccessPrescription = (user, prescription) => {
  if (!user || !prescription) return false

  // Admin can access all
  if (user.role === 'admin') return true

  // Doctor can access prescriptions they created
  if (user.role === 'doctor') {
    return isDoctorAssigned(user, prescription)
  }

  // Pharmacy staff can access all prescriptions
  if (user.role === 'pharmacy_staff') {
    return true
  }

  // ✅ Patient can view their own prescriptions (FIXED)
  if (user.role === 'patient') {
    return isResourceOwner(user, prescription.patient || prescription.patientId)
  }

  return false
}

/**
 * Check if user can modify resource
 */
export const canModifyResource = (user, resource, resourceType) => {
  if (!user || !resource) return false

  // Admin can modify with caution (audit only for clinical content)
  if (user.role === 'admin') {
    // Admin should not modify clinical content directly
    if (resourceType === 'medical_record' || resourceType === 'diagnosis') {
      return false
    }
    return true
  }

  switch (resourceType) {
  case 'medical_record':
    // Only assigned doctor can modify
    return user.role === 'doctor' && isDoctorAssigned(user, resource)

  case 'lab_request':
    // Lab personnel can update status and add results
    if (user.role === 'lab_personnel') {
      const userId = (user.id || user._id)?.toString()
      const assignedToId = resource.assignedTo?.toString()
      return assignedToId === userId
    }
    // Doctor can only modify their own requests
    return user.role === 'doctor' && isDoctorAssigned(user, resource)
  case 'prescription':
    // Only creating doctor or pharmacy staff can modify
    if (user.role === 'pharmacy_staff') {
      return true // Can update status
    }
    return user.role === 'doctor' && isDoctorAssigned(user, resource)

  case 'appointment':
  // Patient can modify their own appointments
    if (user.role === 'patient') {
      return isResourceOwner(user, resource.patient || resource.patientId)
    }
    // Doctor can modify assigned appointments
    return user.role === 'doctor' && isDoctorAssigned(user, resource)
  default:
    return false
  }
}

export default {
  PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isResourceOwner,
  isDoctorAssigned,
  isPatient,
  isDoctor,
  isLabPersonnel,
  isPharmacyStaff,
  isAdmin,
  isClinicStaff,
  getRoleDisplayName,
  getDashboardPath,
  canAccessMedicalRecord,
  canAccessLabRequest,
  canAccessPrescription,
  canModifyResource
}