import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  getUserWithOrgs,
  emailExists,
} from '../services/auth.service.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // Register
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password, name } = parsed.data;

    // Check if email already exists
    if (await emailExists(email)) {
      return reply.status(409).send({
        error: 'Email already registered',
      });
    }

    try {
      const user = await createUser({ email, password, name });
      const authUser = await getUserWithOrgs(user.id);

      const token = app.jwt.sign({ userId: user.id });

      return reply.status(201).send({
        user: authUser,
        token,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create user');
      return reply.status(500).send({ error: 'Failed to create user' });
    }
  });

  // Login
  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parsed.data;

    const user = await findUserByEmail(email);

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const validPassword = await verifyPassword(user.passwordHash, password);

    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const authUser = await getUserWithOrgs(user.id);
    const token = app.jwt.sign({ userId: user.id });

    return reply.send({
      user: authUser,
      token,
    });
  });

  // Get current user
  app.get('/me', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const user = await getUserWithOrgs(userId);

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(user);
  });
}
