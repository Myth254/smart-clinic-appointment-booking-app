// models/User.js
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['patient', 'doctor', 'lab_personnel', 'pharmacy_staff', 'admin'],
    default: 'patient'
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  // Additional fields for clinic staff
  clinicStaffType: {
    type: String,
    enum: ['doctor', 'lab_personnel', 'pharmacy_staff', null],
    default: null
  },
  // Clinic association for staff members
  assignedClinic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Clinic',
    default: null
  },
  // Department/Specialization for staff
  department: {
    type: String,
    default: null
  },
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpire: {
    type: Date,
    select: false
  },
  lastLogin: {
    type: Date
  },
  // Permissions array for granular access control
  permissions: [{
    type: String,
    enum: [
      // Patient permissions
      'view_own_appointments',
      'view_own_records',
      'make_payments',
      'view_lab_results',
      'pickup_prescriptions',

      // Doctor permissions
      'view_assigned_appointments',
      'modify_assigned_appointments',
      'create_session_records',
      'create_medical_records',
      'update_medical_records',
      'request_labs',
      'create_prescriptions',
      'view_patient_history',
      'add_attachments',
      'create_followups',

      // Lab Personnel permissions
      'view_lab_requests',
      'update_lab_status',
      'upload_lab_results',
      'add_lab_data',
      'comment_to_doctor',
      'mark_lab_billing',

      // Pharmacy Staff permissions
      'view_prescriptions',
      'confirm_medication_availability',
      'set_ready_for_pickup',
      'handle_prescription_payment',
      'mark_dispensed',

      // Admin permissions
      'manage_users',
      'assign_staff',
      'view_all_records',
      'view_payment_logs',
      'manage_system_settings',
      'view_reports',
      'audit_logs',
      'revoke_assign_roles'
    ]
  }]
}, {
  timestamps: true
})

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next()
  }

  try {
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Automatically set permissions based on role
userSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    this.permissions = getPermissionsByRole(this.role)

    // Set clinicStaffType for staff roles
    if (['doctor', 'lab_personnel', 'pharmacy_staff'].includes(this.role)) {
      this.clinicStaffType = this.role
    } else {
      this.clinicStaffType = null
    }
  }
  next()
})

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password)
  } catch (error) {
    throw new Error('Password comparison failed', error?.message || '')
  }
}

// Method to check if user has specific permission
userSchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission)
}

// Method to check if user has any of the specified permissions
userSchema.methods.hasAnyPermission = function(...permissions) {
  return permissions.some(permission => this.permissions.includes(permission))
}

// Method to check if user has all specified permissions
userSchema.methods.hasAllPermissions = function(...permissions) {
  return permissions.every(permission => this.permissions.includes(permission))
}

// Remove sensitive data from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject()
  delete obj.password
  delete obj.resetPasswordToken
  delete obj.resetPasswordExpire
  delete obj.__v
  return obj
}

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`
})

// Index for faster queries
userSchema.index({ role: 1, status: 1 })
userSchema.index({ email: 1 })
userSchema.index({ clinicStaffType: 1 })
userSchema.index({ assignedClinic: 1 })

// Helper function to get default permissions by role
function getPermissionsByRole(role) {
  const rolePermissions = {
    patient: [
      'view_own_appointments',
      'view_own_records',
      'make_payments',
      'view_lab_results',
      'pickup_prescriptions'
    ],
    doctor: [
      'view_assigned_appointments',
      'modify_assigned_appointments',
      'create_session_records',
      'create_medical_records',
      'update_medical_records',
      'request_labs',
      'create_prescriptions',
      'view_patient_history',
      'add_attachments',
      'create_followups'
    ],
    lab_personnel: [
      'view_lab_requests',
      'update_lab_status',
      'upload_lab_results',
      'add_lab_data',
      'comment_to_doctor',
      'mark_lab_billing'
    ],
    pharmacy_staff: [
      'view_prescriptions',
      'confirm_medication_availability',
      'set_ready_for_pickup',
      'handle_prescription_payment',
      'mark_dispensed'
    ],
    admin: [
      'manage_users',
      'assign_staff',
      'view_all_records',
      'view_payment_logs',
      'manage_system_settings',
      'view_reports',
      'audit_logs',
      'revoke_assign_roles',
      // Admin also has read access to most operations
      'view_assigned_appointments',
      'view_lab_requests',
      'view_prescriptions'
    ]
  }

  return rolePermissions[role] || []
}

export default mongoose.model('User', userSchema)