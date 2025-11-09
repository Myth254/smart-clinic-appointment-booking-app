import mongoose from 'mongoose'

const specialtySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Specialty name is required'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required']
  },
  icon: String,
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
})

const Specialty = mongoose.model('Specialty', specialtySchema)

export default Specialty