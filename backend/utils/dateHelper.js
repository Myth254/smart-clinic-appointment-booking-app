// utils/dateHelper.js
import {
  format,
  addDays,
  subDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  addMinutes,
  setHours,
  setMinutes
} from 'date-fns'

/**
 * Format date to readable string
 * @param {Date|String} date - Date to format
 * @param {String} formatStr - Format pattern (default: 'MMM d, yyyy')
 * @returns {String} Formatted date string
 */
export const formatDate = (date, formatStr = 'MMM d, yyyy') => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date
    return format(dateObj, formatStr)
  } catch (error) {
    console.error('Date formatting error:', error)
    return 'Invalid date'
  }
}

/**
 * Format time to readable string
 * @param {Date|String} date - Date to format
 * @param {String} formatStr - Format pattern (default: 'h:mm a')
 * @returns {String} Formatted time string
 */
export const formatTime = (date, formatStr = 'h:mm a') => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date
    return format(dateObj, formatStr)
  } catch (error) {
    console.error('Time formatting error:', error)
    return 'Invalid time'
  }
}

/**
 * Format datetime to readable string
 * @param {Date|String} date - Date to format
 * @returns {String} Formatted datetime string
 */
export const formatDateTime = (date) => {
  return formatDate(date, 'MMM d, yyyy h:mm a')
}

/**
 * Get start and end of today
 * @returns {Object} { start: Date, end: Date }
 */
export const getToday = () => {
  const now = new Date()
  return {
    start: startOfDay(now),
    end: endOfDay(now)
  }
}

/**
 * Get start and end of current week
 * @returns {Object} { start: Date, end: Date }
 */
export const getCurrentWeek = () => {
  const now = new Date()
  return {
    start: startOfWeek(now),
    end: endOfWeek(now)
  }
}

/**
 * Get start and end of current month
 * @returns {Object} { start: Date, end: Date }
 */
export const getCurrentMonth = () => {
  const now = new Date()
  return {
    start: startOfMonth(now),
    end: endOfMonth(now)
  }
}

/**
 * Add days to a date
 * @param {Date|String} date - Starting date
 * @param {Number} days - Number of days to add
 * @returns {Date} New date
 */
export const addDaysToDate = (date, days) => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return addDays(dateObj, days)
}

/**
 * Subtract days from a date
 * @param {Date|String} date - Starting date
 * @param {Number} days - Number of days to subtract
 * @returns {Date} New date
 */
export const subtractDaysFromDate = (date, days) => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return subDays(dateObj, days)
}

/**
 * Check if date is in the past
 * @param {Date|String} date - Date to check
 * @returns {Boolean}
 */
export const isDateInPast = (date) => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return isBefore(dateObj, new Date())
}

/**
 * Check if date is in the future
 * @param {Date|String} date - Date to check
 * @returns {Boolean}
 */
export const isDateInFuture = (date) => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return isAfter(dateObj, new Date())
}

/**
 * Check if date is today
 * @param {Date|String} date - Date to check
 * @returns {Boolean}
 */
export const isToday = (date) => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return isSameDay(dateObj, new Date())
}

/**
 * Get difference between two dates in minutes
 * @param {Date|String} dateLeft - Later date
 * @param {Date|String} dateRight - Earlier date
 * @returns {Number} Difference in minutes
 */
export const getMinutesDifference = (dateLeft, dateRight) => {
  const left = typeof dateLeft === 'string' ? parseISO(dateLeft) : dateLeft
  const right = typeof dateRight === 'string' ? parseISO(dateRight) : dateRight
  return differenceInMinutes(left, right)
}

/**
 * Get difference between two dates in hours
 * @param {Date|String} dateLeft - Later date
 * @param {Date|String} dateRight - Earlier date
 * @returns {Number} Difference in hours
 */
export const getHoursDifference = (dateLeft, dateRight) => {
  const left = typeof dateLeft === 'string' ? parseISO(dateLeft) : dateLeft
  const right = typeof dateRight === 'string' ? parseISO(dateRight) : dateRight
  return differenceInHours(left, right)
}

/**
 * Get difference between two dates in days
 * @param {Date|String} dateLeft - Later date
 * @param {Date|String} dateRight - Earlier date
 * @returns {Number} Difference in days
 */
export const getDaysDifference = (dateLeft, dateRight) => {
  const left = typeof dateLeft === 'string' ? parseISO(dateLeft) : dateLeft
  const right = typeof dateRight === 'string' ? parseISO(dateRight) : dateRight
  return differenceInDays(left, right)
}

/**
 * Add minutes to a date
 * @param {Date|String} date - Starting date
 * @param {Number} minutes - Number of minutes to add
 * @returns {Date} New date
 */
export const addMinutesToDate = (date, minutes) => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return addMinutes(dateObj, minutes)
}

/**
 * Create date from time string (HH:mm)
 * @param {String} timeString - Time in HH:mm format
 * @param {Date} baseDate - Base date (default: today)
 * @returns {Date} Date with specified time
 */
export const createDateFromTime = (timeString, baseDate = new Date()) => {
  const [hours, minutes] = timeString.split(':').map(Number)
  let date = setHours(baseDate, hours)
  date = setMinutes(date, minutes)
  return date
}

/**
 * Get date range for filtering
 * @param {String} period - 'today', 'week', 'month', 'year'
 * @returns {Object} { start: Date, end: Date }
 */
export const getDateRange = (period) => {
  const now = new Date()

  switch (period) {
  case 'today':
    return {
      start: startOfDay(now),
      end: endOfDay(now)
    }

  case 'week':
    return {
      start: startOfWeek(now),
      end: endOfWeek(now)
    }

  case 'month':
    return {
      start: startOfMonth(now),
      end: endOfMonth(now)
    }

  case 'last7days':
    return {
      start: subDays(startOfDay(now), 7),
      end: endOfDay(now)
    }

  case 'last30days':
    return {
      start: subDays(startOfDay(now), 30),
      end: endOfDay(now)
    }

  case 'last90days':
    return {
      start: subDays(startOfDay(now), 90),
      end: endOfDay(now)
    }

  default:
    return {
      start: startOfDay(now),
      end: endOfDay(now)
    }
  }
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 * @param {Date|String} date - Date to compare
 * @returns {String} Relative time string
 */
export const getRelativeTime = (date) => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  const now = new Date()
  const diffMinutes = differenceInMinutes(now, dateObj)

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`

  const diffHours = differenceInHours(now, dateObj)
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`

  const diffDays = differenceInDays(now, dateObj)
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months > 1 ? 's' : ''} ago`
  }

  const years = Math.floor(diffDays / 365)
  return `${years} year${years > 1 ? 's' : ''} ago`
}

/**
 * Validate date string format
 * @param {String} dateString - Date string to validate
 * @returns {Boolean} True if valid
 */
export const isValidDate = (dateString) => {
  try {
    const date = parseISO(dateString)
    return date instanceof Date && !isNaN(date)
  } catch {
    return false
  }
}

/**
 * Get age from date of birth
 * @param {Date|String} dateOfBirth - Date of birth
 * @returns {Number} Age in years
 */
export const calculateAge = (dateOfBirth) => {
  const dob = typeof dateOfBirth === 'string' ? parseISO(dateOfBirth) : dateOfBirth
  const years = differenceInDays(new Date(), dob) / 365.25
  return Math.floor(years)
}

/**
 * Get weekday name from date
 * @param {Date|String} date - Date
 * @returns {String} Weekday name
 */
export const getWeekdayName = (date) => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, 'EEEE')
}

/**
 * Check if date is a weekend
 * @param {Date|String} date - Date to check
 * @returns {Boolean} True if weekend (Saturday or Sunday)
 */
export const isWeekend = (date) => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  const day = dateObj.getDay()
  return day === 0 || day === 6
}

/**
 * Get business days between two dates (excluding weekends)
 * @param {Date|String} startDate - Start date
 * @param {Date|String} endDate - End date
 * @returns {Number} Number of business days
 */
export const getBusinessDays = (startDate, endDate) => {
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate
  const end = typeof endDate === 'string' ? parseISO(endDate) : endDate

  let count = 0
  let current = new Date(start)

  while (current <= end) {
    if (!isWeekend(current)) {
      count++
    }
    current = addDays(current, 1)
  }

  return count
}

export default {
  formatDate,
  formatTime,
  formatDateTime,
  getToday,
  getCurrentWeek,
  getCurrentMonth,
  addDaysToDate,
  subtractDaysFromDate,
  isDateInPast,
  isDateInFuture,
  isToday,
  getMinutesDifference,
  getHoursDifference,
  getDaysDifference,
  addMinutesToDate,
  createDateFromTime,
  getDateRange,
  getRelativeTime,
  isValidDate,
  calculateAge,
  getWeekdayName,
  isWeekend,
  getBusinessDays
}