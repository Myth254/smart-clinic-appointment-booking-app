// controllers/clinicController.js
import Clinic from '../models/Clinic.js'
import Doctor from '../models/Doctor.js'

// @desc    Get all clinics
// @route   GET /api/clinics
// @access  Public
export const getAllClinics = async (req, res) => {
  try {
    const { search, city, status = 'active', limit = 20, offset = 0 } = req.query

    // Build query
    const query = { status }

    // Search by name
    if (search) {
      query.name = { $regex: search, $options: 'i' }
    }

    // Filter by city
    if (city) {
      query['address.city'] = { $regex: city, $options: 'i' }
    }

    // Get clinics with pagination
    const clinics = await Clinic.find(query)
      .sort({ name: 1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    // Get doctor count for each clinic
    const clinicsWithDoctorCount = await Promise.all(
      clinics.map(async (clinic) => {
        const doctorCount = await Doctor.countDocuments({
          clinic: clinic._id,
          status: 'active'
        })

        return {
          ...clinic.toObject(),
          doctorCount
        }
      })
    )

    // Get total count
    const total = await Clinic.countDocuments(query)

    return res.json({
      clinics: clinicsWithDoctorCount,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get all clinics error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get clinic by ID
// @route   GET /api/clinics/:id
// @access  Public
export const getClinicById = async (req, res) => {
  try {
    const { id } = req.params

    const clinic = await Clinic.findById(id)

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' })
    }

    // Get doctors at this clinic
    const doctors = await Doctor.find({
      clinic: clinic._id,
      status: 'active'
    })
      .populate('userId', 'firstName lastName phoneNumber email')
      .limit(10)

    // Get total doctor count
    const doctorCount = await Doctor.countDocuments({
      clinic: clinic._id,
      status: 'active'
    })

    return res.json({
      clinic,
      doctors,
      doctorCount
    })
  } catch (error) {
    console.error('Get clinic by ID error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get doctors by clinic
// @route   GET /api/clinics/:id/doctors
// @access  Public
export const getDoctorsByClinic = async (req, res) => {
  try {
    const { id } = req.params
    const { limit = 20, offset = 0, specialization } = req.query

    // Verify clinic exists
    const clinic = await Clinic.findById(id)
    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' })
    }

    // Build query
    const query = {
      clinic: id,
      status: 'active'
    }

    // Filter by specialization if provided
    if (specialization) {
      query.specialization = { $regex: specialization, $options: 'i' }
    }

    // Get doctors
    const doctors = await Doctor.find(query)
      .populate('userId', 'firstName lastName phoneNumber email')
      .sort({ 'userId.firstName': 1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    // Get total count
    const total = await Doctor.countDocuments(query)

    return res.json({
      clinic: {
        id: clinic._id,
        name: clinic.name,
        address: clinic.address
      },
      doctors,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get doctors by clinic error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Create clinic (Admin only)
// @route   POST /api/clinics
// @access  Private (Admin)
export const createClinic = async (req, res) => {
  try {
    const {
      name,
      address,
      phoneNumber,
      email,
      website,
      description,
      operatingHours,
      facilities,
      images
    } = req.body

    // Validate required fields
    if (!name || !address || !phoneNumber || !email) {
      return res.status(400).json({
        message: 'Name, address, phone number, and email are required'
      })
    }

    // Validate address structure
    if (!address.street || !address.city || !address.country) {
      return res.status(400).json({
        message: 'Address must include street, city, and country'
      })
    }

    // Check if clinic with same email already exists
    const existingClinic = await Clinic.findOne({ email })
    if (existingClinic) {
      return res.status(400).json({
        message: 'Clinic with this email already exists'
      })
    }

    // Create clinic
    const clinic = await Clinic.create({
      name,
      address,
      phoneNumber,
      email,
      website: website || '',
      description: description || '',
      operatingHours: operatingHours || [],
      facilities: facilities || [],
      images: images || [],
      status: 'active'
    })

    return res.status(201).json({
      message: 'Clinic created successfully',
      clinic
    })
  } catch (error) {
    console.error('Create clinic error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Update clinic (Admin only)
// @route   PUT /api/clinics/:id
// @access  Private (Admin)
export const updateClinic = async (req, res) => {
  try {
    const { id } = req.params
    const {
      name,
      address,
      phoneNumber,
      email,
      website,
      description,
      operatingHours,
      facilities,
      images,
      status
    } = req.body

    const clinic = await Clinic.findById(id)

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' })
    }

    // Check email uniqueness if being updated
    if (email && email !== clinic.email) {
      const emailExists = await Clinic.findOne({ email })
      if (emailExists) {
        return res.status(400).json({
          message: 'Clinic with this email already exists'
        })
      }
    }

    // Update fields
    if (name) clinic.name = name
    if (address) clinic.address = address
    if (phoneNumber) clinic.phoneNumber = phoneNumber
    if (email) clinic.email = email
    if (website !== undefined) clinic.website = website
    if (description !== undefined) clinic.description = description
    if (operatingHours) clinic.operatingHours = operatingHours
    if (facilities) clinic.facilities = facilities
    if (images) clinic.images = images
    if (status) clinic.status = status

    await clinic.save()

    return res.json({
      message: 'Clinic updated successfully',
      clinic
    })
  } catch (error) {
    console.error('Update clinic error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Delete clinic (Admin only)
// @route   DELETE /api/clinics/:id
// @access  Private (Admin)
export const deleteClinic = async (req, res) => {
  try {
    const { id } = req.params

    const clinic = await Clinic.findById(id)

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' })
    }

    // Check if clinic has associated doctors
    const doctorCount = await Doctor.countDocuments({ clinic: id })

    if (doctorCount > 0) {
      return res.status(400).json({
        message: `Cannot delete clinic. ${doctorCount} doctor(s) are associated with this clinic. Please reassign them first.`
      })
    }

    await clinic.deleteOne()

    return res.json({
      message: 'Clinic deleted successfully',
      deletedClinic: {
        id: clinic._id,
        name: clinic.name
      }
    })
  } catch (error) {
    console.error('Delete clinic error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Update clinic status (Admin only)
// @route   PUT /api/clinics/:id/status
// @access  Private (Admin)
export const updateClinicStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        message: 'Valid status is required (active or inactive)'
      })
    }

    const clinic = await Clinic.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    )

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' })
    }

    return res.json({
      message: 'Clinic status updated successfully',
      clinic
    })
  } catch (error) {
    console.error('Update clinic status error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get clinic statistics (Admin only)
// @route   GET /api/clinics/:id/stats
// @access  Private (Admin)
export const getClinicStats = async (req, res) => {
  try {
    const { id } = req.params

    const clinic = await Clinic.findById(id)
    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' })
    }

    // Get doctor count
    const totalDoctors = await Doctor.countDocuments({ clinic: id })
    const activeDoctors = await Doctor.countDocuments({
      clinic: id,
      status: 'active'
    })

    // Get doctors grouped by specialization
    const doctorsBySpecialization = await Doctor.aggregate([
      { $match: { clinic: clinic._id } },
      {
        $group: {
          _id: '$specialization',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ])

    return res.json({
      clinic: {
        id: clinic._id,
        name: clinic.name
      },
      stats: {
        totalDoctors,
        activeDoctors,
        inactiveDoctors: totalDoctors - activeDoctors,
        specializations: doctorsBySpecialization.map(spec => ({
          specialization: spec._id,
          doctorCount: spec.count
        }))
      }
    })
  } catch (error) {
    console.error('Get clinic stats error:', error)
    return res.status(500).json({ message: error.message })
  }
}