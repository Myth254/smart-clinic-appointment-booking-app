import express from 'express'
import dotenv from 'dotenv'
import connectDB from './config/db.js'
import authRoutes from './routes/authRoutes.js'
import userRoutes from './routes/userRoutes.js'

dotenv.config()

if (process.env.NODE_ENV !== 'test') {
  connectDB()
}

const app = express()

app.use(express.json())

// Routes
app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/admin/users', userRoutes)

// Default route for testing
app.get('/', (req, res) => {
  res.json({ message: 'API is running...' })
})

// Catch-all handler for invalid routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

export default app