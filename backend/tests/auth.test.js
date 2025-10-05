import request from 'supertest'
import { connectTestDB, clearTestDB, closeTestDB } from './setup.js'
import { beforeAll, afterAll, afterEach, it, describe, expect } from '@jest/globals'
import app from '../app.js'
import User from '../models/User.js'


beforeAll(async () => {
  await connectTestDB()
})

afterEach(async () => {
  await clearTestDB()
})

afterAll(async () => {
  await closeTestDB()
})

describe('Auth API', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Password123',
        role: 'patient',
      })

    expect(res.statusCode).toBe(201)
    expect(res.body.user).toHaveProperty('id')
    expect(res.body.user.firstName).toBe('John')
    expect(res.body).toHaveProperty('token')
  })

  it('should not register user with duplicate email', async () => {
    await User.create({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      password: 'Password123',
      role: 'doctor',
    })

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        password: 'Password123',
        role: 'doctor',
      })

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('User already exists')
  })

  it('should login an existing user', async () => {
    // Register user first
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Alice',
        lastName: 'Wonder',
        email: 'alice@example.com',
        password: 'Password123',
        role: 'patient',
      })

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'Password123',
      })

    expect(res.statusCode).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.firstName).toBe('Alice')
  })

  it('should not login with wrong password', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Bob',
        lastName: 'Builder',
        email: 'bob@example.com',
        password: 'Password123',
        role: 'patient',
      })

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'bob@example.com',
        password: 'WrongPassword',
      })

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Invalid email or password')
  })

  it('should get profile of logged-in user', async () => {
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Charlie',
        lastName: 'Brown',
        email: 'charlie@example.com',
        password: 'Password123',
        role: 'patient',
      })

    const token = registerRes.body.token

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.firstName).toBe('Charlie')
    expect(res.body).toHaveProperty('email')
  })
})
