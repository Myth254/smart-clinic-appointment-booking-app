// Export all API modules
export { default as authAPI } from './auth'
export { default as adminAPI } from './admin'
export { default as appointmentsAPI } from './appointments'
export { default as availabilityAPI } from './availability'
export { default as clinicAPI } from './clinic'
export { default as doctorAPI } from './doctor'
export { default as medicalRecordsAPI } from './medicalRecords'
export { default as notificationsAPI } from './notifications'
export { default as patientAPI } from './patient'
export { default as specialtyAPI } from './specialty'

// Export axios client for direct use if needed
export { default as axiosClient } from './axiosClient' 