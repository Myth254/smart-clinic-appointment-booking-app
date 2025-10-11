import express from 'express'
import {
  createUser
} from '../controllers/adminController.js'
import { protect, adminOnly } from '../middlewares/authMiddleware.js'

const router = express.Router()

// Only admin can manage users
router.use(protect, adminOnly)

router.route('/')
  //.get(getAllUsers)
  .post(createUser) // 👈 Admin creates doctors (or even other admins if needed)

// router.route('/:id')
//   .get(getUserById)
//   .put(updateUser)
//   .delete(deleteUser)

export default router