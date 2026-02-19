import jwt from '@fastify/jwt';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { ErrorCodes, ForbiddenError, UnauthorizedError } from '../errors/index.js';
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

  fastify.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      const decoded = await request.jwtVerify<TokenPayload>();

      if (env.BETA_MODE_ENABLED && decoded.role === 'USER') {
        const user = await db.query.users.findFirst({
          where: eq(users.id, decoded.userId),
        });

        if (!user || user.deletedAt || user.accessTier !== 'BETA') {
          throw new ForbiddenError(ErrorCodes.AUTH_FORBIDDEN, 'Beta access not available');
        }
      }

      request.user = {
        userId: decoded.userId,
        role: decoded.role || 'USER',
      };
    } catch (_err) {
      if (_err instanceof ForbiddenError) {
        throw _err;
      }
      throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Invalid or expired token');
    }
  });
}

export default fp(jwtPlugin, { name: 'jwt' });
