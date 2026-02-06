import type { FastifyInstance } from 'fastify';
import { getDashboardStats, getLoansStats, getUsersStats } from '../../services/admin/analytics.js';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/dashboard',
    {
      schema: {
        tags: ['Admin - Analytics'],
        description: 'Get dashboard statistics (requires ANALYST role or higher)',
        security: [{ BearerAuth: [] }],
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async () => {
      return await getDashboardStats();
    }
  );

  fastify.get(
    '/users/stats',
    {
      schema: {
        tags: ['Admin - Analytics'],
        description: 'Get user statistics (requires ANALYST role or higher)',
        security: [{ BearerAuth: [] }],
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async () => {
      return await getUsersStats();
    }
  );

  fastify.get(
    '/loans/stats',
    {
      schema: {
        tags: ['Admin - Analytics'],
        description: 'Get loan statistics (requires ANALYST role or higher)',
        security: [{ BearerAuth: [] }],
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async () => {
      return await getLoansStats();
    }
  );
}
