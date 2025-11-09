import mongoose from 'mongoose'

const patientSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  address: {
    residentialAddress: String,
    city: String,
    region: String,
    country: {
      default: 'Kenya',
      type: String
    }
  },
  emergencyContact: {
    name: {
      type: String,
      required: [true, 'Emergency contact name is required']
    },
    relationship: String,
    phoneNumber: {
      type: String,
      required: [true, 'Emergency contact phone is required']
    }
  },
  medicalHistory: [{
    condition: String,
    diagnosedDate: Date,
    status: {
      type: String,
      enum: ['active', 'resolved', 'chronic'],
      default: 'active'
    },
    notes: String
  }],
  allergies: [String],
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  insurance: {
    provider: String,
    policyNumber: String,
    groupNumber: String
  }
}, {
  timestamps: true
})

const Patient = mongoose.model('Patient', patientSchema)

export default Patient