import type { FastifyInstance } from 'fastify';
import {
  adminDashboardStatsSchema,
  errorResponse401,
  errorResponse403,
  loanStatsSchema,
  userStatsSchema,
} from '../../schemas/responses.js';
import { getDashboardStats, getLoansStats, getUsersStats } from '../../services/admin/analytics.js';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/dashboard',
    {
      schema: {
        tags: ['Admin - Analytics'],
        description: 'Get dashboard statistics (requires ANALYST role or higher)',
        security: [{ BearerAuth: [] }],
        response: {
          200: adminDashboardStatsSchema,
          401: errorResponse401,
          403: errorResponse403,
        },
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
        response: {
          200: userStatsSchema,
          401: errorResponse401,
          403: errorResponse403,
        },
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
        response: {
          200: loanStatsSchema,
          401: errorResponse401,
          403: errorResponse403,
        },
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
