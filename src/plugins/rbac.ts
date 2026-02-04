import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

export type UserRole = 'USER' | 'ANALYST' | 'SUPPORT' | 'MODERATOR' | 'SUPER_ADMIN';

const roleHierarchy: Record<UserRole, number> = {
  USER: 0,
  ANALYST: 1,
  SUPPORT: 2,
  MODERATOR: 3,
  SUPER_ADMIN: 4,
};

function hasRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  const userLevel = roleHierarchy[userRole];
  return requiredRoles.some((role) => userLevel >= roleHierarchy[role]);
}

async function rbacPlugin(fastify: FastifyInstance) {
  fastify.decorate('requireRole', (allowedRoles: UserRole | UserRole[]) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user;

      if (!user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      if (!hasRole(user.role, roles)) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Insufficient permissions',
        });
      }
    };
  });
}

export default fp(rbacPlugin, {
  name: 'rbac',
});
