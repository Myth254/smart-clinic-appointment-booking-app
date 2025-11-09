// controllers/specialtyController.js
import Specialty from '../models/Specialty.js'
import Doctor from '../models/Doctor.js'
import Availability from '../models/Availability.js'

// @desc    Get all specialties
// @route   GET /api/specialties
// @access  Public
export const getAllSpecialties = async (req, res) => {
  try {
    const { search, status = 'active', limit = 50, offset = 0 } = req.query

    // Build query
    const query = { status }

    // Search by name or description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    }

    // Get specialties
    const specialties = await Specialty.find(query)
      .sort({ name: 1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    // Get doctor count for each specialty
    const specialtiesWithDoctorCount = await Promise.all(
      specialties.map(async (specialty) => {
        const doctorCount = await Doctor.countDocuments({
          specialization: specialty.name,
          status: 'active'
        })

        return {
          ...specialty.toObject(),
          doctorCount
        }
      })
    )

    // Get total count
    const total = await Specialty.countDocuments(query)

    return res.json({
      specialties: specialtiesWithDoctorCount,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get all specialties error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get specialty by ID
// @route   GET /api/specialties/:id
// @access  Public
export const getSpecialtyById = async (req, res) => {
  try {
    const { id } = req.params

    const specialty = await Specialty.findById(id)

    if (!specialty) {
      return res.status(404).json({ message: 'Specialty not found' })
    }

    // Get doctor count
    const doctorCount = await Doctor.countDocuments({
      specialization: specialty.name,
      status: 'active'
    })

    return res.json({
      specialty,
      doctorCount
    })
  } catch (error) {
    console.error('Get specialty by ID error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get doctors by specialty
// @route   GET /api/specialties/:specialtyName/doctors
// @access  Public
export const getDoctorsBySpecialty = async (req, res) => {
  try {
    const { specialtyName } = req.params
    const {
      limit = 20,
      offset = 0,
      city,
      rating,
      availability,
      sortBy = 'rating',
      order = 'desc'
    } = req.query

    // Build query - search by specialization name (case-insensitive)
    const query = {
      specialization: { $regex: new RegExp(`^${specialtyName}$`, 'i') },
      status: 'active'
    }

    // Get doctors with populated user and clinic info
    let doctorsQuery = Doctor.find(query)
      .populate('userId', 'firstName lastName phoneNumber email status')
      .populate('clinic', 'name address phoneNumber')
      .limit(parseInt(limit))
      .skip(parseInt(offset))

    // Apply sorting
    const sortOrder = order === 'asc' ? 1 : -1
    if (sortBy === 'rating') {
      doctorsQuery = doctorsQuery.sort({ rating: sortOrder, totalReviews: -1 })
    } else if (sortBy === 'experience') {
      doctorsQuery = doctorsQuery.sort({ experience: sortOrder })
    } else if (sortBy === 'name') {
      doctorsQuery = doctorsQuery.sort({ 'userId.firstName': sortOrder })
    } else if (sortBy === 'fee') {
      doctorsQuery = doctorsQuery.sort({ consultationFee: sortOrder })
    }

    let doctors = await doctorsQuery

    // Filter by city if provided
    if (city) {
      doctors = doctors.filter(doctor =>
        doctor.clinic &&
        doctor.clinic.address &&
        doctor.clinic.address.city &&
        doctor.clinic.address.city.toLowerCase().includes(city.toLowerCase())
      )
    }

    // Filter by minimum rating if provided
    if (rating) {
      const minRating = parseFloat(rating)
      doctors = doctors.filter(doctor => doctor.rating >= minRating)
    }

    // ✅ Filter by availability (optional)
    if (availability) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(availability)) {
        return res.status(400).json({
          message: 'Invalid date format for availability filter (use YYYY-MM-DD)'
        })
      }

      const requestedDate = new Date(availability)
      const weekday = requestedDate.getDay()

      // Get all doctor IDs that have available slots on this date
      const availableDoctors = await Availability.find({
        isAvailable: true,
        $or: [
          { date: requestedDate },
          { isRecurring: true, weekday: weekday }
        ]
      }).distinct('doctor')

      // Filter doctor list to include only those with available slots
      doctors = doctors.filter(doc =>
        availableDoctors.some(availDocId =>
          availDocId.toString() === doc.userId._id.toString()
        )
      )
    }

    // Get total count for pagination (before filtering availability)
    const total = await Doctor.countDocuments(query)

    return res.json({
      specialtyName,
      doctors,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Get doctors by specialty error:', error)
    return res.status(500).json({ message: error.message })
  }
}


// @desc    Create specialty (Admin only)
// @route   POST /api/specialties
// @access  Private (Admin)
export const createSpecialty = async (req, res) => {
  try {
    const { name, description, icon } = req.body

    // Validate required fields
    if (!name || !description) {
      return res.status(400).json({
        message: 'Name and description are required'
      })
    }

    // Check if specialty already exists (case-insensitive)
    const existingSpecialty = await Specialty.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    })

    if (existingSpecialty) {
      return res.status(400).json({
        message: 'Specialty with this name already exists'
      })
    }

    // Create specialty
    const specialty = await Specialty.create({
      name,
      description,
      icon: icon || '',
      status: 'active'
    })

    return res.status(201).json({
      message: 'Specialty created successfully',
      specialty
    })
  } catch (error) {
    console.error('Create specialty error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Update specialty (Admin only)
// @route   PUT /api/specialties/:id
// @access  Private (Admin)
export const updateSpecialty = async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, icon, status } = req.body

    const specialty = await Specialty.findById(id)

    if (!specialty) {
      return res.status(404).json({ message: 'Specialty not found' })
    }

    // Check name uniqueness if being updated
    if (name && name !== specialty.name) {
      const nameExists = await Specialty.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') }
      })

      if (nameExists) {
        return res.status(400).json({
          message: 'Specialty with this name already exists'
        })
      }
    }

    // Update fields
    if (name) specialty.name = name
    if (description) specialty.description = description
    if (icon !== undefined) specialty.icon = icon
    if (status) specialty.status = status

    await specialty.save()

    return res.json({
      message: 'Specialty updated successfully',
      specialty
    })
  } catch (error) {
    console.error('Update specialty error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Delete specialty (Admin only)
// @route   DELETE /api/specialties/:id
// @access  Private (Admin)
export const deleteSpecialty = async (req, res) => {
  try {
    const { id } = req.params

    const specialty = await Specialty.findById(id)

    if (!specialty) {
      return res.status(404).json({ message: 'Specialty not found' })
    }

    // Check if specialty has associated doctors
    const doctorCount = await Doctor.countDocuments({
      specialization: specialty.name
    })

    if (doctorCount > 0) {
      return res.status(400).json({
        message: `Cannot delete specialty. ${doctorCount} doctor(s) are associated with this specialty.`
      })
    }

    await specialty.deleteOne()

    return res.json({
      message: 'Specialty deleted successfully',
      deletedSpecialty: {
        id: specialty._id,
        name: specialty.name
      }
    })
  } catch (error) {
    console.error('Delete specialty error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Update specialty status (Admin only)
// @route   PUT /api/specialties/:id/status
// @access  Private (Admin)
export const updateSpecialtyStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        message: 'Valid status is required (active or inactive)'
      })
    }

    const specialty = await Specialty.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    )

    if (!specialty) {
      return res.status(404).json({ message: 'Specialty not found' })
    }

    return res.json({
      message: 'Specialty status updated successfully',
      specialty
    })
  } catch (error) {
    console.error('Update specialty status error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get specialty statistics (Admin only)
// @route   GET /api/specialties/:id/stats
// @access  Private (Admin)
export const getSpecialtyStats = async (req, res) => {
  try {
    const { id } = req.params

    const specialty = await Specialty.findById(id)
    if (!specialty) {
      return res.status(404).json({ message: 'Specialty not found' })
    }

    // Get doctor counts by status
    const totalDoctors = await Doctor.countDocuments({
      specialization: specialty.name
    })

    const activeDoctors = await Doctor.countDocuments({
      specialization: specialty.name,
      status: 'active'
    })

    // Get average rating
    const ratingStats = await Doctor.aggregate([
      { $match: { specialization: specialty.name } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: '$totalReviews' },
          averageFee: { $avg: '$consultationFee' }
        }
      }
    ])

    const stats = ratingStats[0] || {
      averageRating: 0,
      totalReviews: 0,
      averageFee: 0
    }

    return res.json({
      specialty: {
        id: specialty._id,
        name: specialty.name
      },
      stats: {
        totalDoctors,
        activeDoctors,
        inactiveDoctors: totalDoctors - activeDoctors,
        averageRating: stats.averageRating ? stats.averageRating.toFixed(2) : 0,
        totalReviews: stats.totalReviews,
        averageConsultationFee: stats.averageFee ? stats.averageFee.toFixed(2) : 0
      }
    })
  } catch (error) {
    console.error('Get specialty stats error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get popular specialties
// @route   GET /api/specialties/popular
// @access  Public
export const getPopularSpecialties = async (req, res) => {
  try {
    const { limit = 10 } = req.query

    // Get specialties with most doctors
    const popularSpecialties = await Doctor.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$specialization',
          doctorCount: { $sum: 1 },
          averageRating: { $avg: '$rating' }
        }
      },
      { $sort: { doctorCount: -1 } },
      { $limit: parseInt(limit) }
    ])

    // Enrich with specialty details
    const enrichedSpecialties = await Promise.all(
      popularSpecialties.map(async (item) => {
        const specialty = await Specialty.findOne({
          name: { $regex: new RegExp(`^${item._id}$`, 'i') },
          status: 'active'
        })

        return {
          name: item._id,
          doctorCount: item.doctorCount,
          averageRating: item.averageRating ? item.averageRating.toFixed(2) : 0,
          description: specialty?.description || '',
          icon: specialty?.icon || ''
        }
      })
    )

    return res.json({
      popularSpecialties: enrichedSpecialties
    })
  } catch (error) {
    console.error('Get popular specialties error:', error)
    return res.status(500).json({ message: error.message })
  }
}