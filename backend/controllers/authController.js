import User from '../models/User.js'
import generateToken from '../utils/generateToken.js'

// @desc    Register new user
// @route   POST /api/v1/auth/register
// @access  Public

const registerUser = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, password, role } = req.body

    // Check if user exists
    const userExists = await User.findOne({ email })
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' })
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role: role || 'patient',
    })

    if (user) {
      return res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role
        },
        token: generateToken(user._id, user.role),
      })
    } else {
      return res.status(400).json({ message: 'Invalid user data' })
    }
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email })
    if(user && (await user.matchPassword(password))) {
      return res.json({
        message: 'Login successful',
        token: generateToken(user._id, user.role),
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role
        },
      })
    } else {
      return res.status(401).json({ message: 'Invalid email or password' })
    }
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get current user profile
// @route   GET /api/v1/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    res.json({
      id: req.user._id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      email: req.user.email,
      phoneNumber: req.user.phoneNumber,
      role: req.user.role
    })
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
}

export { registerUser, loginUser, getMe }