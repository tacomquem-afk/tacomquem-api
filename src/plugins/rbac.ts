import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { ErrorCodes, ForbiddenError, UnauthorizedError } from '../errors/index.js';

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

    return async (request: FastifyRequest) => {
      const user = request.user;

      if (!user) {
        throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication required');
      }

      if (!hasRole(user.role, roles)) {
        throw new ForbiddenError(
          ErrorCodes.ADMIN_INSUFFICIENT_PERMISSIONS,
          'Insufficient permissions for this role'
        );
      }
    };
  });
}

export default fp(rbacPlugin, {
  name: 'rbac',
});
