import { addMinutes, format, isBefore, isEqual } from 'date-fns'
<<<<<<< Updated upstream
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

=======
import * as dateFnsTz from 'date-fns-tz'

const { zonedTimeToUtc, utcToZonedTime } = dateFnsTz
>>>>>>> Stashed changes
const TIMEZONE = 'Africa/Nairobi'

/**
 * Parse "HH:mm" into a Date object on a given date ('YYYY-MM-DD') in Nairobi timezone.
 * Converts it to UTC internally so comparisons are accurate.
 */
export const parseTimeOnDate = (dateISO /* 'YYYY-MM-DD' */, timeStr /* '09:00' */, tz = TIMEZONE) => {
<<<<<<< Updated upstream
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
=======
  const [hours, minutes] = timeStr.split(':').map(Number)
  const [year, month, day] = dateISO.split('-').map(Number)

  const localDate = new Date(year, month - 1, day, hours, minutes)
  const utcDate = zonedTimeToUtc(localDate, tz)
  return utcDate
>>>>>>> Stashed changes
}

/**
 * Generate appointment slots between startTime and endTime (in HH:mm),
 * converted from Nairobi timezone to UTC.
 */
export const generateTimeSlots = (dateISO, startTime, endTime, slotDurationMinutes, tz = TIMEZONE) => {
<<<<<<< Updated upstream
  try {
    const slots = []
    let start = parseTimeOnDate(dateISO, startTime, tz)
    const end = parseTimeOnDate(dateISO, endTime, tz)

    let safety = 0 // prevent infinite loops on bad input
    while ((isBefore(start, end) || isEqual(start, end)) && safety < 1000) {
      const slotEnd = addMinutes(start, slotDurationMinutes)

      if (isBefore(slotEnd, addMinutes(end, 1))) {
        // Convert UTC times back to Nairobi for display
        const startLocal = toZonedTime(start, tz)
        const endLocal = toZonedTime(slotEnd, tz)

        slots.push({
          start, // stored in UTC
          end: slotEnd, // stored in UTC
          label: `${format(startLocal, 'HH:mm')} - ${format(endLocal, 'HH:mm')}`, // readable in Nairobi time
        })
      }

      start = slotEnd
      safety++
    }

    return slots
  } catch (error) {
    console.error('Error in generateTimeSlots:', error, { dateISO, startTime, endTime, slotDurationMinutes })
    throw error
  }
=======
  const slots = []
  let start = parseTimeOnDate(dateISO, startTime, tz)
  const end = parseTimeOnDate(dateISO, endTime, tz)

  while (isBefore(start, end) || isEqual(start, end)) {
    const slotEnd = addMinutes(start, slotDurationMinutes)
    if (isBefore(slotEnd, addMinutes(end, 1))) {
      const startLocal = utcToZonedTime(start, tz)
      const endLocal = utcToZonedTime(slotEnd, tz)

      slots.push({
        start, // stored in UTC
        end: slotEnd, // stored in UTC
        label: `${format(startLocal, 'HH:mm')} - ${format(endLocal, 'HH:mm')}`, // display in Nairobi time
      })
    }
    start = slotEnd
  }
  return slots
>>>>>>> Stashed changes
}

/**
 * Check overlap between two time intervals
<<<<<<< Updated upstream
 * Returns true if overlap exists
=======
>>>>>>> Stashed changes
 */
export const isOverlapping = (aStart, aEnd, bStart, bEnd) => {
  return aStart < bEnd && bStart < aEnd
}