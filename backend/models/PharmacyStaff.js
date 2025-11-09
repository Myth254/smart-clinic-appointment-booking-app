import mongoose from 'mongoose'

const pharmacyStaffSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  clinic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Clinic',
    required: true
  },
  licenseNumber: {
    type: String,
    required: [true, 'Pharmacy license number is required'],
    unique: true
  },
  licenseExpiry: {
    type: Date,
    required: true
  },
  role: {
    type: String,
    enum: ['Pharmacist', 'Pharmacy Technician', 'Pharmacy Assistant'],
    required: true
  },
  certifications: [{
    name: String,
    issuedBy: String,
    issuedDate: Date,
    expiryDate: Date,
    certificateNumber: String
  }],
  qualifications: [{
    degree: String,
    institution: String,
    year: Number
  }],
  experience: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'on-leave'],
    default: 'active'
  },
  specializations: [{
    type: String,
    enum: [
      'Clinical Pharmacy',
      'Hospital Pharmacy',
      'Community Pharmacy',
      'Pharmaceutical Care',
      'Drug Information',
      'Oncology Pharmacy',
      'Pediatric Pharmacy',
      'Geriatric Pharmacy',
      'Other'
    ]
  }],
  workSchedule: [{
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    },
    startTime: String,
    endTime: String
  }]
}, {
  timestamps: true
})

export const PharmacyStaff = mongoose.model('PharmacyStaff', pharmacyStaffSchema)