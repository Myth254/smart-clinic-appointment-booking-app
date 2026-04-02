import cron from 'node-cron'
import LabRequest from '../models/LabRequest.js'
import NotificationService from '../utils/notificationService.js'

// Run daily at 10:00 AM to check for pending lab result reviews
cron.schedule('0 10 * * *', async () => {
  console.log('🔔 Running lab result follow-up checker...')

  try {
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    // Find lab requests with results uploaded but not reviewed by doctor
    const pendingReviews = await LabRequest.find({
      status: 'results_uploaded',
      resultsUploadedAt: { $lte: twoDaysAgo }
    })
      .populate('doctor', 'firstName lastName email')
      .populate('patient', 'firstName lastName')

    console.log(`📋 Found ${pendingReviews.length} lab results needing review`)

    const notifications = pendingReviews.map(labRequest =>
      NotificationService.send({
        userId: labRequest.doctor._id,
        type: 'lab',
        title: 'Lab Results Awaiting Review',
        message: `Lab results for ${labRequest.patient.firstName} ${labRequest.patient.lastName} (Request #${labRequest.requestNumber}) have been pending review for 2+ days.`,
        data: {
          labRequestId: labRequest._id,
          requestNumber: labRequest.requestNumber,
          patientName: `${labRequest.patient.firstName} ${labRequest.patient.lastName}`,
          uploadedAt: labRequest.resultsUploadedAt
        },
        priority: 'high',
        channels: ['in_app', 'email'],
        relatedId: labRequest._id,
        relatedModel: 'LabRequest',
        actionUrl: `/doctor/lab-requests/${labRequest._id}`,
        actionLabel: 'Review Results'
      })
    )

    const results = await Promise.allSettled(notifications)
    const successful = results.filter(r => r.status === 'fulfilled').length

    console.log(`✅ Sent ${successful} follow-up reminders`)
  } catch (error) {
    console.error('❌ Lab result follow-up error:', error)
  }
})

console.log('📅 Lab result follow-up checker scheduled (daily at 10:00 AM)')