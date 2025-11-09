// utils/generateToken.js
import jwt from 'jsonwebtoken'

/**
 * Generate JWT access token
 * @param {String} userId - User ID
 * @param {String} role - User role (patient, doctor, admin)
 * @returns {String} JWT token
 */
const generateToken = (userId, role) => {
  return jwt.sign(
    {
      id: userId,
      role: role
    },
    process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    {
      expiresIn: process.env.JWT_EXPIRE || '30d'
    }
  )
}

/**
 * Generate JWT refresh token
 * @param {String} userId - User ID
 * @returns {String} JWT refresh token
 */
export const generateRefreshToken = (userId) => {
  return jwt.sign(
    {
      id: userId,
      type: 'refresh'
    },
    process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_key_here',
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '90d'
    }
  )
}

/**
 * Verify JWT token
 * @param {String} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here')
  } catch (error) {
    console.log(error.message)
    throw new Error('Invalid token')
  }
}

/**
 * Verify refresh token
 * @param {String} token - Refresh token to verify
 * @returns {Object} Decoded token payload
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_key_here')
  } catch (error) {
    console.log(error.message)
    throw new Error('Invalid refresh token')
  }
}

/**
 * Decode token without verification (for debugging)
 * @param {String} token - JWT token
 * @returns {Object} Decoded token payload
 */
export const decodeToken = (token) => {
  return jwt.decode(token)
}

export default generateToken