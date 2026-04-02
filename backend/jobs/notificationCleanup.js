import cron from 'node-cron'
import Notification from '../models/Notification.js'

// Run weekly on Sunday at 2:00 AM to clean up old notifications
cron.schedule('0 2 * * 0', async () => {
  console.log('🔔 Running notification cleanup...')

  try {
    // Delete read notifications older than 90 days
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const result = await Notification.deleteMany({
      read: true,
      createdAt: { $lt: ninetyDaysAgo }
    })

    console.log(`✅ Cleaned up ${result.deletedCount} old notifications`)

    // Also clean up failed delivery notifications older than 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const failedResult = await Notification.deleteMany({
      deliveryStatus: 'failed',
      createdAt: { $lt: thirtyDaysAgo }
    })

    console.log(`✅ Cleaned up ${failedResult.deletedCount} failed notifications`)
  } catch (error) {
    console.error('❌ Notification cleanup error:', error)
  }
})

console.log('📅 Notification cleanup scheduled (weekly on Sunday at 2:00 AM)')