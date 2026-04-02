import cron from 'node-cron'
import NotificationService from '../services/notificationService.js'

// Run daily at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  console.log('🔔 Running prescription expiry checker...')

  try {
    const results = await NotificationService.checkAndNotifyExpiringPrescriptions()
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    console.log(`✅ Prescription expiry check complete: ${successful} sent, ${failed} failed`)
  } catch (error) {
    console.error('❌ Prescription expiry checker error:', error)
  }
})

console.log('📅 Prescription expiry checker scheduled (daily at 9:00 AM)')