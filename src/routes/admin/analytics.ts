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
        response: {
          200: {
            description: 'Dashboard statistics',
            type: 'object',
            properties: {
              totalUsers: { type: 'number' },
              activeLoans: { type: 'number' },
              totalLoans: { type: 'number' },
              averageLoanValue: { type: 'number' },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Insufficient permissions' },
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async () => {
      const stats = await getDashboardStats();
      return stats;
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
          200: {
            description: 'User statistics',
            type: 'object',
            properties: {
              totalUsers: { type: 'number' },
              newUsersThisMonth: { type: 'number' },
              activeUsers: { type: 'number' },
              blockedUsers: { type: 'number' },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Insufficient permissions' },
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async () => {
      const stats = await getUsersStats();
      return stats;
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
          200: {
            description: 'Loan statistics',
            type: 'object',
            properties: {
              totalLoans: { type: 'number' },
              activeLoans: { type: 'number' },
              returnedLoans: { type: 'number' },
              cancelledLoans: { type: 'number' },
              averageLoanDuration: { type: 'number' },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Insufficient permissions' },
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async () => {
      const stats = await getLoansStats();
      return stats;
    }
  );
}
