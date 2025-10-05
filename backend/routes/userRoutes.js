import express from 'express'
import { getAllUsers, getUserById } from '../controllers/userController.js'
import { protect, adminOnly } from '../middlewares/authMiddleware.js'

const router = express.Router()

// GET /api/v1/admin/users
router.get('/', protect, adminOnly, getAllUsers)

// GET /api/v1/admin/users/:id
router.get('/:id', protect, adminOnly, getUserById)

export default router