// jobs/index.js - Central job scheduler
import './prescriptionExpiryChecker.js'
import './appointmentReminders.js'
import './labResultFollowups.js'
import './notificationCleanup.js'
import './appointmentCleanup.js'

console.log('✅ All scheduled jobs initialized')