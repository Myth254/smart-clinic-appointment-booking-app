import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import Appointment from '../models/Appointment.js'
import Bill from '../models/Bill.js'
import Prescription from '../models/Prescription.js'
import Session from '../models/Session.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const ensureIndex = async (collection, keys, options) => {
  try {
    await collection.createIndex(keys, options)
    console.log(`created: ${options.name}`)
  } catch (error) {
    if (error.code === 85 || /already exists/i.test(error.message)) {
      console.log(`exists: ${options.name}`)
      return
    }

    throw error
  }
}

const runMigration = async () => {
  const uri = process.env.MONGO_URI

  if (!uri) {
    throw new Error('MONGO_URI is not defined')
  }

  await mongoose.connect(uri)
  console.log('connected to MongoDB')

  await ensureIndex(
    Appointment.collection,
    { patient: 1, status: 1, start: 1 },
    { name: 'patient_status_start_idx', background: true }
  )

  await ensureIndex(
    Appointment.collection,
    { doctor: 1, status: 1, start: 1 },
    { name: 'doctor_status_start_idx', background: true }
  )

  await ensureIndex(
    Prescription.collection,
    { patient: 1, status: 1 },
    { name: 'prescription_patient_status_idx', background: true }
  )

  await ensureIndex(
    Bill.collection,
    { status: 1, updatedAt: 1 },
    { name: 'bill_status_updated_idx', background: true }
  )

  await ensureIndex(
    Session.collection,
    { status: 1 },
    { name: 'session_status_idx', background: true }
  )

  console.log('Bill { status, patient } index already exists in Bill.js')
}

runMigration()
  .then(async () => {
    await mongoose.connection.close()
    console.log('migration complete')
    process.exit(0)
  })
  .catch(async (error) => {
    console.error('migration failed:', error)

    try {
      await mongoose.connection.close()
    } catch {
      // Ignore close errors on failure.
    }

    process.exit(1)
  })
