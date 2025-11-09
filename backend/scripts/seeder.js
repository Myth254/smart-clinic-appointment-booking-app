import dotenv from 'dotenv'
import User from './models/User.js'
import connectDB from './config/db.js'

dotenv.config()

await connectDB()

const seedAdmin = async () => {
  try {
    const adminEmail = 'b59448247@gmail.com'
    const existingAdmin = await User.findOne({ email: adminEmail })

    if (existingAdmin) {
      console.log('✅ Admin already exists:', existingAdmin.email)
      process.exit()
    }

    const admin = await User.create({
      firstName: 'System',
      lastName: 'Admin',
      email: adminEmail,
      phoneNumber: '+254771491866',
      password: 'Admin@12345', // You can later force password reset
      role: 'admin'
    })

    console.log('✅ Admin account created successfully!')
    console.log(`Email: ${admin.email}`)
    console.log('Password: Admin@12345')
    process.exit()
  } catch (error) {
    console.error('❌ Error seeding admin:', error.message)
    process.exit(1)
  }
}

seedAdmin()