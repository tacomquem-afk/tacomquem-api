import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import type { UserRole } from './rbac.js';

interface TokenPayload {
  userId: string;
  role: UserRole;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: { userId: string; role: UserRole };
  }
}

async function jwtPlugin(fastify: FastifyInstance) {
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
  });

  fastify.decorate('signAccessToken', (userId: string, role: UserRole = 'USER'): string => {
    return fastify.jwt.sign({ userId, role } as TokenPayload, {
      expiresIn: env.JWT_EXPIRES_IN,
    });
  });

  fastify.decorate('signRefreshToken', (userId: string, role: UserRole = 'USER'): string => {
    return fastify.jwt.sign({ userId, role } as TokenPayload, {
      expiresIn: '30d',
    });
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const decoded = await request.jwtVerify<TokenPayload>();
      request.user = {
        userId: decoded.userId,
        role: decoded.role || 'USER',
      };
    } catch (_err) {
      reply.code(401);
      throw new Error('Unauthorized');
    }
  });
}

export default fp(jwtPlugin, { name: 'jwt' });
