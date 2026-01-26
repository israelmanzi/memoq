import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { validateSession } from '../services/session.service.js';
import { isRedisEnabled } from '../services/redis.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; tokenId?: string };
    user: { userId: string; tokenId?: string };
  }
}

async function authPlugin(app: FastifyInstance) {
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();

      // If Redis is enabled and token has a tokenId, validate the session
      const { tokenId } = request.user;
      if (isRedisEnabled() && tokenId) {
        const sessionResult = await validateSession(tokenId);
        if (!sessionResult.valid) {
          return reply.status(401).send({ error: 'Session expired or invalidated' });
        }
      }
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['@fastify/jwt'],
});
