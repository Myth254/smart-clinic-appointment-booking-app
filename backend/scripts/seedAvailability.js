import mongoose from 'mongoose'
import AvailabilityRule from '../models/AvailabilityRule.js'

const seedAvailability = async () => {
  const doctorId = process.argv[2]

  if (!doctorId) {
    console.error('Usage: node seedAvailability.js DOCTOR_ID')
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGO_URI)

  // Create Monday-Friday 9am-5pm availability
  const rules = []
  for (let day = 1; day <= 5; day++) {
    rules.push({
      doctor: doctorId,
      weekday: day,
      startTime: '09:00',
      endTime: '17:00',
      slotDurationMinutes: 30
    })
  }

  await AvailabilityRule.deleteMany({ doctor: doctorId })
  await AvailabilityRule.insertMany(rules)

  console.log(`Created ${rules.length} availability rules for doctor ${doctorId}`)
  process.exit(0)
}

seedAvailability()