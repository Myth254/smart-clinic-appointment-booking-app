import User from '../models/User.js'
import sendEmail from '../utils/sendEmail.js'

// @desc    Admin create user (Doctor or Admin)
// @route   POST /api/v1/admin/users
// @access  Admin
export const createUser = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, password, role } = req.body

    if (!firstName || !lastName || !email || !password || !phoneNumber || !role) {
      return res.status(400).json({ message: 'All fields are required' })
    }

    if (!['doctor', 'admin', 'patient'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role specified' })
    }

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' })
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role
    })

    // 📨 Send welcome email for doctors
    if (role === 'doctor') {
      await sendEmail(
        user.email,
        'Your MediBook Doctor Account',
        `
          <h3>Hello Dr. ${user.lastName},</h3>
          <p>Your MediBook doctor account has been created successfully.</p>
          <p><strong>Login details:</strong></p>
          <ul>
            <li>Email: ${user.email}</li>
            <li>Password: ${password}</li>
          </ul>
          <p>You can log in at <a href="http://localhost:5173/login">MediBook Login</a>.</p>
          <p>Best regards,<br/>MediBook Team</p>
        `
      )
    }

    res.status(201).json({
      message: `User (${role}) created successfully`,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role
      }
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}