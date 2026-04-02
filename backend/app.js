// app.js
import express from 'express'
import cors from 'cors'
import connectDB from './config/db.js'

// Import routes
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import appointmentRoutes from './routes/appointmentRoutes.js'
import availabilityRoutes from './routes/availabilityRoutes.js'
import patientRoutes from './routes/patientRoutes.js'
import doctorRoutes from './routes/doctorRoutes.js'
import medicalRecordRoutes from './routes/medicalRecordRoutes.js'
import notificationRoutes from './routes/notificationRoutes.js'
import clinicRoutes from './routes/clinicRoutes.js'
import specialtyRoutes from './routes/specialtyRoutes.js'
import labRoutes from './routes/labRoutes.js'
import pharmacyRoutes from './routes/pharmacyRoutes.js'
import sessionRoutes from './routes/sessionRoutes.js'
import paymentRoutes from './routes/paymentRoutes.js'
import billingRoutes from './routes/billingRoutes.js'             // ✅ NEW
import { errorHandler, notFound } from './middlewares/errorHandler.js'
import notificationDebugRoutes from './routes/notificationDebugRoutes.js'

// Import background jobs
import './jobs/prescriptionExpiryChecker.js'
import './jobs/appointmentCleanup.js'

// Connect to database (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  connectDB()
}

const app = express()

// Middleware
app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.originalUrl}`)
  next()
})

// ONLY in development — registered after app is initialized
if (process.env.NODE_ENV === 'development') {
  app.use('/api/v1/notifications', notificationDebugRoutes)
  console.log('🔧 Debug routes enabled at /api/v1/notifications/debug/*')
}

// API Routes
app.use('/api/v1/auth',           authRoutes)
app.use('/api/v1/admin',          adminRoutes)
app.use('/api/v1/appointments',   appointmentRoutes)
app.use('/api/v1/availability',   availabilityRoutes)
app.use('/api/v1/patients',       patientRoutes)
app.use('/api/v1/doctors',        doctorRoutes)
app.use('/api/v1/medical-records', medicalRecordRoutes)
app.use('/api/v1/notifications',  notificationRoutes)
app.use('/api/v1/clinics',        clinicRoutes)
app.use('/api/v1/specialties',    specialtyRoutes)
app.use('/api/v1/lab',            labRoutes)
app.use('/api/v1/pharmacy',       pharmacyRoutes)
app.use('/api/v1/sessions',       sessionRoutes)
app.use('/api/v1/payments',       paymentRoutes)
app.use('/api/v1/billing',        billingRoutes)                  // ✅ NEW

// Health check / Default route
app.get('/', (req, res) => {
  res.json({
    message: 'Healthcare Management API',
    version: '1.0.0',
    status: 'running',
    features: {
      realTimeUpdates: true,
      sessionManagement: true,
      paymentIntegration: true,
      billingSystem: true                                         // ✅ NEW
    }
  })
})

// API documentation route
app.get('/api/v1', (req, res) => {
  res.json({
    message: 'Healthcare Management API v1',
    endpoints: {
      auth:           '/api/v1/auth',
      admin:          '/api/v1/admin',
      appointments:   '/api/v1/appointments',
      availability:   '/api/v1/availability',
      patients:       '/api/v1/patients',
      doctors:        '/api/v1/doctors',
      medicalRecords: '/api/v1/medical-records',
      notifications:  '/api/v1/notifications',
      clinics:        '/api/v1/clinics',
      specialties:    '/api/v1/specialties',
      lab:            '/api/v1/lab',
      pharmacy:       '/api/v1/pharmacy',
      sessions:       '/api/v1/sessions',
      payments:       '/api/v1/payments',
      billing:        '/api/v1/billing'                          // ✅ NEW
    }
  })
})

// Not found handler
app.use(notFound)

// Global error handler (must be last)
app.use(errorHandler)

export default app
