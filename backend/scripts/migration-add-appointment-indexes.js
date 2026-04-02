// migration-add-appointment-indexes.js
// Run this script to add new indexes to existing appointments collection

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env from backend root (one level up from scripts/)
dotenv.config({ path: path.resolve(__dirname, '../.env') })


const runMigration = async () => {
  try {
    console.log('🔄 Starting database migration...')

    const uri = process.env.MONGO_URI

    if (!uri) {
      throw new Error('❌ MONGO_URI is not defined. Check your .env file or environment variables.')
    }

    console.log('🔌 Connecting to MongoDB Atlas...')
    // Connect to MongoDB (no deprecated options)
    await mongoose.connect(uri)

    console.log('✅ Connected to database')

    const db = mongoose.connection.db
    const collection = db.collection('appointments')

    // Check for existing duplicate bookings
    console.log('\n📊 Checking for existing duplicate bookings...')

    const duplicates = await collection.aggregate([
      {
        $match: {
          status: { $in: ['pending', 'approved', 'completed', 'in_progress'] }
        }
      },
      {
        $group: {
          _id: {
            doctor: '$doctor',
            start: '$start',
            end: '$end'
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]).toArray()

    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} duplicate booking(s):`)
      duplicates.forEach((dup, index) => {
        console.log(`\n  Duplicate #${index + 1}:`)
        console.log(`    Doctor: ${dup._id.doctor}`)
        console.log(`    Start: ${dup._id.start}`)
        console.log(`    End: ${dup._id.end}`)
        console.log(`    Count: ${dup.count}`)
        console.log(`    IDs: ${dup.ids.join(', ')}`)
      })

      console.log('\n❌ Cannot create unique index with existing duplicates.')
      console.log('Please resolve these duplicates first by:')
      console.log('  1. Manually reviewing each duplicate')
      console.log('  2. Cancelling/deleting the incorrect appointments')
      console.log('  3. Re-running this migration script')

      await mongoose.connection.close()
      process.exit(1)
    }

    console.log('✅ No duplicate bookings found')

    // Get existing indexes
    console.log('\n📋 Current indexes:')
    const existingIndexes = await collection.indexes()
    existingIndexes.forEach(idx => {
      console.log(`  - ${idx.name}`)
    })

    // Add compound index for conflict checking
    console.log('\n🔧 Creating conflict_check_index...')
    try {
      await collection.createIndex(
        { doctor: 1, status: 1, start: 1, end: 1 },
        { name: 'conflict_check_index' }
      )
      console.log('✅ conflict_check_index created successfully')
    } catch (err) {
      if (err.code === 85) {
        console.log('ℹ️  conflict_check_index already exists, skipping...')
      } else {
        throw err
      }
    }

    // Add unique constraint index
    console.log('\n🔧 Creating unique_active_time_slot index...')
    try {
      await collection.createIndex(
        { doctor: 1, start: 1, end: 1 },
        {
          unique: true,
          partialFilterExpression: {
            status: { $in: ['pending', 'approved', 'completed', 'in_progress'] }
          },
          name: 'unique_active_time_slot'
        }
      )
      console.log('✅ unique_active_time_slot index created successfully')
    } catch (err) {
      if (err.code === 85) {
        console.log('ℹ️  unique_active_time_slot index already exists, skipping...')
      } else {
        throw err
      }
    }

    // Verify new indexes
    console.log('\n📋 Updated indexes:')
    const updatedIndexes = await collection.indexes()
    updatedIndexes.forEach(idx => {
      console.log(`  - ${idx.name}`)
    })

    // Test index performance
    console.log('\n🧪 Testing index performance...')
    const testStart = Date.now()
    const testDate = new Date()
    const testDoctorId = new mongoose.Types.ObjectId() // ✅ Use 'new' keyword
    await collection.find({
      doctor: testDoctorId,
      status: { $in: ['pending', 'approved', 'completed', 'in_progress'] },
      start: { $lt: testDate },
      end: { $gt: testDate }
    }).explain('executionStats')
    const testDuration = Date.now() - testStart
    console.log(`✅ Conflict check query executed in ${testDuration}ms`)

    console.log('\n✅ Migration completed successfully!')
    console.log('\n📊 Summary:')
    console.log(`  - Duplicate bookings found: ${duplicates.length}`)
    console.log('  - Indexes created: 2')
    console.log(`  - Total indexes: ${updatedIndexes.length}`)

    await mongoose.connection.close()
    console.log('\n✅ Database connection closed')
    process.exit(0)

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    console.error(error)

    try {
      await mongoose.connection.close()
    } catch (closeErr) {
      console.error('Error closing connection:', closeErr)
    }

    process.exit(1)
  }
}

// Run migration
console.log('╔══════════════════════════════════════════════╗')
console.log('║   Appointment Index Migration Script        ║')
console.log('╚══════════════════════════════════════════════╝\n')

runMigration()