import { addMinutes, format, isBefore, isAfter, isEqual } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

export const isSlotStillValid = (slotStartUTC, tz = TIMEZONE) => {
  const nowLocal = toZonedTime(new Date(), tz)
  const nowUTC = fromZonedTime(nowLocal, tz)

  return isAfter(slotStartUTC, nowUTC) || isEqual(slotStartUTC, nowUTC)
}

const TIMEZONE = 'Africa/Nairobi'

/**
 * Parse "HH:mm" into a Date object on a given date ('YYYY-MM-DD') in Nairobi timezone.
 * Converts it to UTC internally so comparisons are accurate.
 */
export const parseTimeOnDate = (dateISO /* 'YYYY-MM-DD' */, timeStr /* '09:00' */, tz = TIMEZONE) => {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number)
    const [year, month, day] = dateISO.split('-').map(Number)

    // Create a date string in ISO format for the local timezone
    const dateTimeStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`

    // Parse as a zoned time and convert to UTC
    const utcDate = fromZonedTime(dateTimeStr, tz)

    return utcDate
  } catch (error) {
    console.error('Error in parseTimeOnDate:', error, { dateISO, timeStr })
    throw error
  }
}

/**
 * Generate appointment slots between startTime and endTime (in HH:mm),
 * converted from Nairobi timezone to UTC.
 */
export const generateTimeSlots = (
  dateISO,
  startTime,
  endTime,
  slotDurationMinutes,
  tz = TIMEZONE
) => {
  try {
    const slots = []
    let start = parseTimeOnDate(dateISO, startTime, tz)
    const end = parseTimeOnDate(dateISO, endTime, tz)

    // Current time in UTC (from Nairobi local time)
    const nowLocal = toZonedTime(new Date(), tz)
    const nowUTC = fromZonedTime(nowLocal, tz)

    let safety = 0
    while ((isBefore(start, end) || isEqual(start, end)) && safety < 1000) {
      const slotEnd = addMinutes(start, slotDurationMinutes)

      if (isBefore(slotEnd, addMinutes(end, 1))) {
        // Only include slot if it is >= current time
        if (isAfter(start, nowUTC) || isEqual(start, nowUTC)) {
          const startLocal = toZonedTime(start, tz)
          const endLocal = toZonedTime(slotEnd, tz)

          slots.push({
            start,
            end: slotEnd,
            label: `${format(startLocal, 'HH:mm')} - ${format(endLocal, 'HH:mm')}`,
          })
        }
      }

      start = slotEnd
      safety++
    }

    return slots
  } catch (error) {
    console.error('Error in generateTimeSlots:', error)
    throw error
  }
}

/**
 * Check overlap between two time intervals
 * Returns true if overlap exists
 */
export const isOverlapping = (aStart, aEnd, bStart, bEnd) => {
  return aStart < bEnd && bStart < aEnd
}