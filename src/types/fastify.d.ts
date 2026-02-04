import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '../plugins/rbac.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireRole(allowedRoles: UserRole | UserRole[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user?: {
      userId: string;
      role: UserRole;
    };
  }
}
