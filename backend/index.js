import http from 'http'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '.env') })

const { default: app } = await import('./app.js')
const { initializeSocket } = await import('./socket.js')

const PORT = process.env.PORT || 3000

// Create HTTP server
const server = http.createServer(app)

// Initialize Socket.IO
const io = initializeSocket(server)

// Make io available globally in app
app.set('io', io)

// Start server
server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   Healthcare Management System API          ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`🚀 Server running on port ${PORT}`)
  console.log('🔌 Socket.IO ready for real-time connections')
  console.log('📅 Background jobs scheduled')
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`⏰ Server started at: ${new Date().toLocaleString()}`)
  console.log('═══════════════════════════════════════════════')
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! Shutting down...')
  console.error(err.name, err.message)
  server.close(() => {
    process.exit(1)
  })
})

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM RECEIVED. Shutting down gracefully')
  server.close(() => {
    console.log('💥 Process terminated!')
  })
})

export { server, io }
