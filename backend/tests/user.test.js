import request from 'supertest'
import { connectTestDB, clearTestDB, closeTestDB } from './setup.js'
import { beforeAll, afterAll, beforeEach, it, describe, expect } from '@jest/globals'
import app from '../app.js'
import mongoose from 'mongoose'

let adminToken
let patientToken
let doctorId

beforeAll(async () => {
  await connectTestDB()
})

beforeEach(async () => {
  await clearTestDB()

  // Create Admin
  const adminRes = await request(app).post('/api/v1/auth/register').send({
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@example.com',
    password: 'AdminPass123',
    role: 'admin',
  })
  adminToken = adminRes.body.token

  // Create Patient
  const patientRes = await request(app).post('/api/v1/auth/register').send({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    password: 'PatientPass123',
    role: 'patient',
  })
  patientToken = patientRes.body.token

  // Create Doctor
  const doctorRes = await request(app).post('/api/v1/auth/register').send({
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    password: 'DoctorPass123',
    role: 'doctor',
  })
  doctorId = doctorRes.body.user.id
})

afterAll(async () => {
  await closeTestDB()
})

describe('Admin User Management API', () => {
  it('should allow admin to get all users', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.length).toBe(3)
    expect(res.body[0]).toHaveProperty('email')
  })

  it('should allow admin to get user by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/users/${doctorId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.firstName).toBe('Jane')
    expect(res.body.role).toBe('doctor')
  })

  it('should deny access to non-admin users for GET /admin/users', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${patientToken}`)

    expect(res.statusCode).toBe(403)
    expect(res.body.message).toBe('Admin access only')
  })

  it('should return 404 when user not found', async () => {
    const fakeId = new mongoose.Types.ObjectId()
    const res = await request(app)
      .get(`/api/v1/admin/users/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe('User not found')
  })

  it('should deny access when no token provided', async () => {
    const res = await request(app).get('/api/v1/admin/users')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Not authorized, no token provided')
  })
})
