import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import connectDB from './config/db.js'

// Import routes
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
<<<<<<< Updated upstream
// import userRoutes from './routes/userRoutes.js'
import appointmentRoutes from './routes/appointmentRoutes.js'
import availabilityRoutes from './routes/availabilityRoutes.js'
import patientRoutes from './routes/patientRoutes.js'
import doctorRoutes from './routes/doctorRoutes.js'
import medicalRecordRoutes from './routes/medicalRecordRoutes.js'
import notificationRoutes from './routes/notificationRoutes.js'
import clinicRoutes from './routes/clinicRoutes.js'
import specialtyRoutes from './routes/specialtyRoutes.js'
import { errorHandler, notFound } from './middlewares/errorHandler.js'
import { apiLimiter } from './middlewares/rateLimiter.js'


// Apply to all routes
=======
import appointmentRoutes from './routes/appointmentRoutes.js'
import availabilityRoutes from './routes/availabilityRoutes.js'
>>>>>>> Stashed changes

dotenv.config()

// Connect to database (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  connectDB()
}

// Start cron jobs
import './services/reminderService.js'

const app = express()

<<<<<<< Updated upstream
// Middleware
=======
>>>>>>> Stashed changes
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api', apiLimiter)

// API Routes
app.use('/api/v1/auth', authRoutes)
<<<<<<< Updated upstream
app.use('/api/v1/admin', adminRoutes)
app.use('/api/v1/appointments', appointmentRoutes)
app.use('/api/v1/availability', availabilityRoutes)
app.use('/api/v1/patients', patientRoutes)
app.use('/api/v1/doctors', doctorRoutes)
app.use('/api/v1/medical-records', medicalRecordRoutes)
app.use('/api/v1/notifications', notificationRoutes)
app.use('/api/v1/clinics', clinicRoutes)
app.use('/api/v1/specialties', specialtyRoutes)
=======
app.use('/api/v1/admin/users', adminRoutes)
app.use('/api/v1/appointments', appointmentRoutes)
app.use('/api/v1/availability', availabilityRoutes)
>>>>>>> Stashed changes

// Health check / Default route
app.get('/', (req, res) => {
  res.json({
    message: 'Healthcare Management API',
    version: '1.0.0',
    status: 'running'
  })
})

// API documentation route (optional)
app.get('/api/v1', (req, res) => {
  res.json({
    message: 'Healthcare Management API v1',
    endpoints: {
      auth: '/api/v1/auth',
      admin: '/api/v1/admin',
      users: '/api/v1/users',
      appointments: '/api/v1/appointments',
      availability: '/api/v1/availability',
      patients: '/api/v1/patients',
      doctors: '/api/v1/doctors',
      medicalRecords: '/api/v1/medical-records',
      notifications: '/api/v1/notifications',
      clinics: '/api/v1/clinics'
    }
  })
})

app.use(notFound)

// Catch-all handler for invalid routes (404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    requestedUrl: req.originalUrl
  })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err)

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
  next()
})

// Global error handler (must be last)
app.use(errorHandler)

export default app