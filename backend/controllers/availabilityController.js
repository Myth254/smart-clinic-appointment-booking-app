/* eslint-disable no-unused-vars */
import Availability from '../models/Availability.js'
import AvailabilityRule from '../models/AvailabilityRule.js'
import AvailabilityException from '../models/AvailabilityException.js'
import Doctor from '../models/Doctor.js'
import Appointment from '../models/Appointment.js'
import mongoose from 'mongoose'
import { parseTimeOnDate, generateTimeSlots, isOverlapping } from '../utils/availability.js'

// Helper function to parse time string to minutes
const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + minutes
}

// Helper function to check if two time ranges overlap
const isTimeOverlappingSimple = (start1, end1, start2, end2) => {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  return s1 < e2 && s2 < e1
}

// @desc    Get available slots for a doctor on a specific date
// @route   GET /api/availability/slots/:doctorId/:date
// @access  Private (authenticated users)
export const getAvailableSlots = async (req, res) => {
  try {
    const { doctorId, date } = req.params

    console.log('🔍 getAvailableSlots called with:', { doctorId, date })

    // Validate doctorId
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      console.log('❌ Invalid doctor ID:', doctorId)
      return res.status(400).json({ success: false, message: 'Invalid doctor ID' })
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      console.log('❌ Invalid date format:', date)
      return res.status(400).json({
        success: false,
        message: 'Date must be in YYYY-MM-DD format'
      })
    }

    // Parse and validate date
    const requestedDate = new Date(date)
    if (isNaN(requestedDate.getTime())) {
      console.log('❌ Invalid date:', date)
      return res.status(400).json({ success: false, message: 'Invalid date' })
    }

    // Check if date is in the past
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    requestedDate.setHours(0, 0, 0, 0)

    if (requestedDate < today) {
      console.log('❌ Date is in the past:', date)
      return res.status(400).json({
        success: false,
        message: 'Cannot fetch slots for past dates'
      })
    }

    const weekday = requestedDate.getDay()
    console.log('📅 Weekday:', weekday, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday])

    // Check for exceptions first
    const exception = await AvailabilityException.findOne({
      doctor: doctorId,
      date
    })

    console.log('🔍 Exception found:', exception ? 'Yes' : 'No')

    // If exception exists and marks day as unavailable
    if (exception && !exception.isAvailable) {
      console.log('⚠️ Doctor not available (exception)')
      return res.status(200).json({
        success: true,
        message: 'Doctor is not available on this date',
        data: { date, slots: [] }
      })
    }

    // Get availability rules for this weekday
    let availabilityRules = await AvailabilityRule.find({
      doctor: doctorId,
      weekday
    })

    console.log('📋 Availability rules found:', availabilityRules.length)

    // If exception has custom slots, use those instead
    if (exception && exception.isAvailable && exception.slots && exception.slots.length > 0) {
      console.log('✨ Using exception slots')
      availabilityRules = exception.slots.map(slot => ({
        startTime: slot.startTime,
        endTime: slot.endTime,
        slotDurationMinutes: 30
      }))
    }

    if (availabilityRules.length === 0) {
      console.log('⚠️ No availability rules for this weekday')
      return res.status(200).json({
        success: true,
        message: 'No availability found for this date',
        data: { date, slots: [] }
      })
    }

    console.log('📋 Rules:', availabilityRules.map(r => `${r.startTime}-${r.endTime}`))

    // Get existing appointments for this date
    let startOfDay, endOfDay
    try {
      startOfDay = parseTimeOnDate(date, '00:00')
      endOfDay = parseTimeOnDate(date, '23:59')
      console.log('🕐 Time range:', { startOfDay, endOfDay })
    } catch (error) {
      console.error('❌ Error parsing dates:', error)
      return res.status(500).json({
        success: false,
        message: 'Error parsing date/time',
        error: error.message
      })
    }

    const appointments = await Appointment.find({
      doctor: doctorId,
      start: { $gte: startOfDay, $lt: endOfDay },
      status: { $nin: ['cancelled'] }
    })

    console.log('📅 Existing appointments:', appointments.length)

    // Generate all possible slots
    let allSlots = []

    try {
      for (const rule of availabilityRules) {
        console.log(`🔄 Generating slots for ${rule.startTime} - ${rule.endTime}`)
        const slots = generateTimeSlots(
          date,
          rule.startTime,
          rule.endTime,
          rule.slotDurationMinutes || 30
        )
        console.log(`  ✅ Generated ${slots.length} slots`)
        allSlots = allSlots.concat(slots)
      }
    } catch (error) {
      console.error('❌ Error generating slots:', error)
      return res.status(500).json({
        success: false,
        message: 'Error generating time slots',
        error: error.message
      })
    }

    console.log('📊 Total slots generated:', allSlots.length)

    // Filter out booked slots
    const availableSlots = allSlots.filter(slot => {
      return !appointments.some(appt => {
        return isOverlapping(slot.start, slot.end, appt.start, appt.end)
      })
    })

    console.log('✅ Available slots:', availableSlots.length)

    // Format response
    const formattedSlots = availableSlots.map(slot => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      label: slot.label
    }))

    res.status(200).json({
      success: true,
      data: {
        date,
        doctorId,
        totalSlots: formattedSlots.length,
        slots: formattedSlots
      }
    })
  } catch (error) {
    console.error('💥 Error in getAvailableSlots:', error)
    console.error('Stack:', error.stack)
    res.status(500).json({
      success: false,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

// @desc    Get doctor availability rules
// @route   GET /api/availability/rules/:doctorId
// @access  Private (Doctor/Admin)
export const getAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params
    const { type } = req.query // 'rules' or 'exceptions'

    // Validate doctorId
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, message: 'Invalid doctor ID' })
    }

    // Check authorization - doctor can only view their own, admin can view all
    if (req.user.role === 'doctor' && req.user._id.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' })
    }

    let data

    if (type === 'exceptions' || req.path.includes('/exceptions/')) {
      // Get exceptions
      data = await AvailabilityException.find({ doctor: doctorId })
        .sort({ date: 1 })
    } else {
      // Get rules
      data = await AvailabilityRule.find({ doctor: doctorId })
        .sort({ weekday: 1, startTime: 1 })
    }

    res.status(200).json({
      success: true,
      count: data.length,
      data
    })
  } catch (error) {
    console.error('Error in getAvailability:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Set doctor availability (create rule)
// @route   POST /api/availability/rules
// @access  Private (Doctor/Admin)
export const setAvailability = async (req, res) => {
  try {
    const doctorId = req.user._id
    const { weekday, startTime, endTime, slotDurationMinutes } = req.body

    // Validate required fields
    if (weekday === undefined || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'weekday, startTime, and endTime are required'
      })
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        message: 'Time must be in HH:MM format'
      })
    }

    // Validate start time is before end time
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time'
      })
    }

    // Validate weekday
    if (weekday < 0 || weekday > 6) {
      return res.status(400).json({
        success: false,
        message: 'Weekday must be between 0 (Sunday) and 6 (Saturday)'
      })
    }

    // Check for overlapping rules
    const existingRules = await AvailabilityRule.find({
      doctor: doctorId,
      weekday
    })

    for (const rule of existingRules) {
      if (isTimeOverlappingSimple(startTime, endTime, rule.startTime, rule.endTime)) {
        return res.status(400).json({
          success: false,
          message: `Time slot overlaps with existing rule: ${rule.startTime} - ${rule.endTime}`
        })
      }
    }

    // Create availability rule
    const rule = await AvailabilityRule.create({
      doctor: doctorId,
      weekday,
      startTime,
      endTime,
      slotDurationMinutes: slotDurationMinutes || 30
    })

    res.status(201).json({
      success: true,
      message: 'Availability rule created successfully',
      data: rule
    })
  } catch (error) {
    console.error('Error in setAvailability:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Update doctor availability
// @route   PUT /api/availability/rules/:availabilityId
// @access  Private (Doctor/Admin)
export const updateAvailability = async (req, res) => {
  try {
    const doctorId = req.user._id
    const { availabilityId } = req.params
    const { startTime, endTime, slotDurationMinutes, date, isAvailable, reason } = req.body

    // Validate availabilityId
    if (!mongoose.Types.ObjectId.isValid(availabilityId)) {
      return res.status(400).json({ success: false, message: 'Invalid availability ID' })
    }

    // Determine if it's a rule or exception based on request path
    const isException = req.path.includes('/exceptions/')

    let record
    if (isException) {
      record = await AvailabilityException.findById(availabilityId)
    } else {
      record = await AvailabilityRule.findById(availabilityId)
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'Availability record not found' })
    }

    // Verify doctor owns this record
    if (record.doctor.toString() !== doctorId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' })
    }

    // Build updates
    const updates = {}

    if (isException) {
      if (date) updates.date = date
      if (isAvailable !== undefined) updates.isAvailable = isAvailable
      if (reason) updates.reason = reason
    } else {
      if (startTime) {
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
        if (!timeRegex.test(startTime)) {
          return res.status(400).json({ success: false, message: 'Invalid start time format' })
        }
        updates.startTime = startTime
      }
      if (endTime) {
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
        if (!timeRegex.test(endTime)) {
          return res.status(400).json({ success: false, message: 'Invalid end time format' })
        }
        updates.endTime = endTime
      }
      if (slotDurationMinutes) updates.slotDurationMinutes = slotDurationMinutes
    }

    const Model = isException ? AvailabilityException : AvailabilityRule
    const updated = await Model.findByIdAndUpdate(
      availabilityId,
      updates,
      { new: true, runValidators: true }
    )

    res.status(200).json({
      success: true,
      message: 'Availability updated successfully',
      data: updated
    })
  } catch (error) {
    console.error('Error in updateAvailability:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Delete doctor availability
// @route   DELETE /api/availability/rules/:availabilityId or /exceptions/:availabilityId
// @access  Private (Doctor/Admin)
export const deleteAvailability = async (req, res) => {
  try {
    const doctorId = req.user._id
    const { availabilityId } = req.params

    // Validate availabilityId
    if (!mongoose.Types.ObjectId.isValid(availabilityId)) {
      return res.status(400).json({ success: false, message: 'Invalid availability ID' })
    }

    // Determine if it's a rule or exception
    const isException = req.path.includes('/exceptions/')

    const Model = isException ? AvailabilityException : AvailabilityRule
    const record = await Model.findById(availabilityId)

    if (!record) {
      return res.status(404).json({ success: false, message: 'Availability record not found' })
    }

    // Verify doctor owns this record
    if (record.doctor.toString() !== doctorId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' })
    }

    await Model.findByIdAndDelete(availabilityId)

    res.status(200).json({
      success: true,
      message: 'Availability deleted successfully'
    })
  } catch (error) {
    console.error('Error in deleteAvailability:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Block specific date/time (create exception)
// @route   POST /api/availability/exceptions or /block
// @access  Private (Doctor/Admin)
export const blockAvailability = async (req, res) => {
  try {
    const doctorId = req.user._id
    const { date, reason, isAvailable, slots } = req.body

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' })
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Date must be in YYYY-MM-DD format'
      })
    }

    // Check if exception already exists for this date
    const existing = await AvailabilityException.findOne({
      doctor: doctorId,
      date
    })

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Exception already exists for this date. Use PUT to update.'
      })
    }

    // Create exception
    const exception = await AvailabilityException.create({
      doctor: doctorId,
      date,
      isAvailable: isAvailable !== undefined ? isAvailable : false,
      slots: slots || []
    })

    res.status(201).json({
      success: true,
      message: `Date ${isAvailable ? 'marked available' : 'blocked'} successfully`,
      data: exception
    })
  } catch (error) {
    console.error('Error in blockAvailability:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Check if a specific slot is available
// @route   POST /api/availability/check-slot
// @access  Private
export const checkSlotAvailability = async (req, res) => {
  try {
    const { doctorId, date, startTime, endTime } = req.body

    // Validate inputs
    if (!doctorId || !date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'doctorId, date, startTime, and endTime are required'
      })
    }

    // Validate doctorId
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, message: 'Invalid doctor ID' })
    }

    // Validate formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/

    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Date must be in YYYY-MM-DD format'
      })
    }

    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        message: 'Time must be in HH:MM format'
      })
    }

    const requestedDate = new Date(date)
    const weekday = requestedDate.getDay()

    // Check for exception
    const exception = await AvailabilityException.findOne({
      doctor: doctorId,
      date
    })

    if (exception && !exception.isAvailable) {
      return res.status(200).json({
        success: true,
        available: false,
        message: 'Doctor is not available on this date'
      })
    }

    // Check availability rules
    const rules = await AvailabilityRule.find({
      doctor: doctorId,
      weekday
    })

    if (rules.length === 0 && !exception) {
      return res.status(200).json({
        success: true,
        available: false,
        message: 'Doctor has no availability set for this day'
      })
    }

    // Check if requested time falls within any rule
    const reqStart = timeToMinutes(startTime)
    const reqEnd = timeToMinutes(endTime)

    const withinRules = rules.some(rule => {
      const ruleStart = timeToMinutes(rule.startTime)
      const ruleEnd = timeToMinutes(rule.endTime)
      return reqStart >= ruleStart && reqEnd <= ruleEnd
    })

    if (!withinRules && !exception) {
      return res.status(200).json({
        success: true,
        available: false,
        message: 'Requested time is outside doctor\'s availability window'
      })
    }

    // Parse requested times
    const requestedStart = parseTimeOnDate(date, startTime)
    const requestedEnd = parseTimeOnDate(date, endTime)

    // Check for conflicts with existing appointments
    const appointments = await Appointment.find({
      doctor: doctorId,
      status: { $nin: ['cancelled'] },
      start: { $gte: parseTimeOnDate(date, '00:00') },
      end: { $lte: parseTimeOnDate(date, '23:59') }
    })

    const hasConflict = appointments.some(appt => {
      return isOverlapping(requestedStart, requestedEnd, appt.start, appt.end)
    })

    if (hasConflict) {
      return res.status(200).json({
        success: true,
        available: false,
        message: 'This time slot is already booked'
      })
    }

    res.status(200).json({
      success: true,
      available: true,
      message: 'Time slot is available',
      data: {
        start: requestedStart.toISOString(),
        end: requestedEnd.toISOString(),
        label: `${startTime} - ${endTime}`
      }
    })
  } catch (error) {
    console.error('Error in checkSlotAvailability:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// @desc    Debug doctor availability setup
// @route   GET /api/availability/debug/:doctorId/:date
// @access  Private
export const debugAvailability = async (req, res) => {
  try {
    const { doctorId, date } = req.params

    const dateObj = new Date(date)
    const weekday = dateObj.getUTCDay()

    // Get rules
    const rules = await AvailabilityRule.find({ doctor: doctorId })
    const todayRules = await AvailabilityRule.find({
      doctor: doctorId,
      weekday
    })

    // Get exceptions
    const exceptions = await AvailabilityException.find({
      doctor: doctorId,
      date
    })

    // Get appointments
    const appointments = await Appointment.find({
      doctor: doctorId,
      start: {
        $gte: new Date(date + 'T00:00:00Z'),
        $lt: new Date(date + 'T23:59:59Z')
      },
      status: { $nin: ['cancelled'] }
    })

    return res.json({
      success: true,
      debug: {
        requestedDate: date,
        weekday,
        weekdayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday],
        totalRules: rules.length,
        rulesForToday: todayRules.length,
        rules: todayRules,
        exceptions: exceptions.length > 0 ? exceptions : 'None',
        bookedSlots: appointments.length,
        appointments: appointments.map(a => ({
          start: a.start,
          end: a.end,
          status: a.status
        }))
      }
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}