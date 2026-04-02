/* eslint-disable no-trailing-spaces */
// scripts/createTestNotifications.js
// Run this script to create test notifications for debugging
// Usage: node scripts/createTestNotifications.js <userId>

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Notification from '../models/Notification.js'
import User from '../models/User.js'

dotenv.config()

const createTestNotifications = async (userId) => {
  try {
    console.log('🔄 Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB\n')

    // Verify user exists
    const user = await User.findById(userId)
    if (!user) {
      console.error('❌ User not found with ID:', userId)
      console.log('\n💡 To find a user ID:')
      console.log('   const users = await User.find();')
      console.log('   console.log(users);')
      process.exit(1)
    }

    console.log('✅ User found:', user.email, '\n')

    // Check existing notifications
    const existingCount = await Notification.countDocuments({ user: userId })
    console.log(`📊 Existing notifications for this user: ${existingCount}\n`)

    // Create test notifications
    console.log('🔨 Creating test notifications...\n')

    const testNotifications = [
      {
        user: userId,
        type: 'appointment',
        title: 'Upcoming Appointment Reminder',
        message: 'You have an appointment with Dr. Smith tomorrow at 10:00 AM. Please arrive 15 minutes early.',
        priority: 'high',
        read: false,
        channels: [{ type: 'in_app', status: 'delivered', deliveredAt: new Date() }],
        actionUrl: '/appointments',
        actionLabel: 'View Appointment',
        metadata: {
          appointmentId: 'test-appointment-123',
          doctorName: 'Dr. Smith',
          time: '10:00 AM'
        }
      },
      {
        user: userId,
        type: 'lab',
        title: 'Lab Results Available',
        message: 'Your recent blood test results are now available for review.',
        priority: 'normal',
        read: false,
        channels: [{ type: 'in_app', status: 'delivered', deliveredAt: new Date() }],
        actionUrl: '/lab-results',
        actionLabel: 'View Results',
        metadata: {
          labRequestId: 'test-lab-456'
        }
      },
      {
        user: userId,
        type: 'prescription',
        title: 'Prescription Ready for Pickup',
        message: 'Your prescription #RX789 is ready for pickup at the pharmacy.',
        priority: 'normal',
        read: false,
        channels: [{ type: 'in_app', status: 'delivered', deliveredAt: new Date() }],
        actionUrl: '/prescriptions',
        actionLabel: 'View Prescription',
        metadata: {
          prescriptionNumber: 'RX789'
        }
      },
      {
        user: userId,
        type: 'payment',
        title: 'Payment Confirmation',
        message: 'Your payment of KES 5,000 has been received successfully.',
        priority: 'low',
        read: true,
        readAt: new Date(Date.now() - 3600000), // 1 hour ago
        channels: [{ type: 'in_app', status: 'delivered', deliveredAt: new Date() }],
        actionUrl: '/payments',
        actionLabel: 'View Receipt',
        metadata: {
          amount: 5000,
          transactionId: 'TXN-12345'
        }
      },
      {
        user: userId,
        type: 'system',
        title: 'Welcome to MediBook!',
        message: 'Thank you for joining MediBook. Complete your profile to get started.',
        priority: 'normal',
        read: false,
        channels: [{ type: 'in_app', status: 'delivered', deliveredAt: new Date() }],
        actionUrl: '/profile',
        actionLabel: 'Complete Profile'
      },
      {
        user: userId,
        type: 'reminder',
        title: 'Medication Reminder',
        message: 'Time to take your medication: Amoxicillin 500mg',
        priority: 'high',
        read: false,
        channels: [{ type: 'in_app', status: 'delivered', deliveredAt: new Date() }],
        metadata: {
          medicationName: 'Amoxicillin',
          dosage: '500mg'
        }
      },
      {
        user: userId,
        type: 'alert',
        title: 'Critical Lab Result',
        message: 'URGENT: Your recent test shows critical values. Please contact your doctor immediately.',
        priority: 'urgent',
        read: false,
        channels: [{ type: 'in_app', status: 'delivered', deliveredAt: new Date() }],
        actionUrl: '/lab-results',
        actionLabel: 'View Results',
        metadata: {
          critical: true,
          testName: 'Blood Glucose'
        }
      }
    ]

    // Insert notifications
    const created = await Notification.insertMany(testNotifications)

    console.log(`✅ Created ${created.length} test notifications!\n`)

    // Display summary
    console.log('📋 Notification Summary:')
    console.log('   Total created:', created.length)
    console.log('   Unread:', created.filter(n => !n.read).length)
    console.log('   Read:', created.filter(n => n.read).length)
    console.log('   By Priority:')
    console.log('     - Urgent:', created.filter(n => n.priority === 'urgent').length)
    console.log('     - High:', created.filter(n => n.priority === 'high').length)
    console.log('     - Normal:', created.filter(n => n.priority === 'normal').length)
    console.log('     - Low:', created.filter(n => n.priority === 'low').length)
    console.log('   By Type:')
    const types = [...new Set(created.map(n => n.type))]
    types.forEach(type => {
      const count = created.filter(n => n.type === type).length
      console.log(`     - ${type}:`, count)
    })

    console.log('\n✅ Test notifications created successfully!')
    console.log('\n💡 Next steps:')
    console.log('   1. Open your frontend application')
    console.log('   2. Login as this user:', user.email)
    console.log('   3. Look for the notification bell icon')
    console.log('   4. You should see', created.filter(n => !n.read).length, 'unread notifications')

    process.exit(0)

  } catch (error) {
    console.error('❌ Error creating test notifications:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
  }
}

// Get user ID from command line arguments
const userId = process.argv[2]

if (!userId) {
  console.error('❌ Please provide a user ID')
  console.log('\nUsage: node scripts/createTestNotifications.js <userId>\n')
  console.log('Example: node scripts/createTestNotifications.js 507f1f77bcf86cd799439011\n')
  console.log('💡 To find a user ID, you can:')
  console.log('   1. Check your database')
  console.log('   2. Login to frontend and check browser console:')
  console.log('      localStorage.getItem("user")')
  console.log('   3. Or run this in MongoDB:')
  console.log('      db.users.find().pretty()')
  process.exit(1)
}

// Validate user ID format
if (!mongoose.Types.ObjectId.isValid(userId)) {
  console.error('❌ Invalid user ID format')
  console.log('User ID must be a valid MongoDB ObjectId (24 hex characters)')
  process.exit(1)
}

createTestNotifications(userId)


// ===== ALTERNATIVE: Find Users and Create Notifications =====
// If you don't know the user ID, use this script instead:

/*
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

dotenv.config();

const createTestNotificationsForAllUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all active users
    const users = await User.find({ status: 'active' }).limit(5);
    
    console.log(`📋 Found ${users.length} active users:\n`);
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (${user.role}) - ID: ${user._id}`);
    });

    console.log('\n❓ Would you like to create test notifications for these users?');
    console.log('Run with specific user ID: node scripts/createTestNotifications.js <userId>');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

// Uncomment to run:
// createTestNotificationsForAllUsers();
*/