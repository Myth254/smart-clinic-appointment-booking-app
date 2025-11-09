import mongoose from 'mongoose'

const labPersonnelSchema = new mongoose.Schema({
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
  specialization: {
    type: String,
    required: [true, 'Lab specialization is required'],
    enum: [
      'Clinical Pathology',
      'Hematology',
      'Microbiology',
      'Biochemistry',
      'Immunology',
      'Molecular Biology',
      'Cytology',
      'Histopathology',
      'General Laboratory',
      'Other'
    ]
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
  assignedLabs: [{
    type: String // Lab sections they can work in
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

export const LabPersonnel = mongoose.model('LabPersonnel', labPersonnelSchema)