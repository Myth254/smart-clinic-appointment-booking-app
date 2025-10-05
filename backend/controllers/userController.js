import User from '../models/User.js'

// @desc    Get all users (Admin only)
// @route   GET /api/v1/admin/users
// @access  Admin
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password') // don’t send password hashes

    res.json(
      users.map(user => ({
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        contactInfo: user.contactInfo,
        createdAt: user.createdAt,
      }))
    )
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
}

// @desc    Get user by ID (Admin only)
// @route   GET /api/v1/admin/users/:id
// @access  Admin
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      contactInfo: user.contactInfo,
      createdAt: user.createdAt,
    })
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
}

export { getAllUsers, getUserById }