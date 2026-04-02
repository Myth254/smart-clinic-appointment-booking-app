import mongoose from 'mongoose'

const maskMongoUri = (uri = '') =>
  uri.replace(
    /(mongodb(?:\+srv)?:\/\/)([^:@/]+)(?::([^@/]*))?@/,
    '$1***:***@'
  )

const summarizeMongoError = (error) => ({
  name: error?.name,
  message: error?.message,
  code: error?.code,
  cause: error?.cause?.message,
  reason: error?.reason?.message,
  topologyType: error?.reason?.topologyDescription?.type
})

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI

    if (!uri) {
      throw new Error('MONGO_URI is not set')
    }

    console.log('🔌 Attempting MongoDB connection...')
    console.log(`🔎 URI: ${maskMongoUri(uri)}`)

    const conn = await mongoose.connect(uri)

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`)
  } catch (error) {
    console.error(`❌ Error: ${error.message}`)
    console.error('🧭 MongoDB connection debug:', summarizeMongoError(error))
    process.exit(1) // Exit process with failure
  }
}

export default connectDB
