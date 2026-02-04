import type { FastifyInstance } from 'fastify';
import { getDashboardStats, getLoansStats, getUsersStats } from '../../services/admin/analytics.js';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get('/dashboard', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const stats = await getDashboardStats();
    return stats;
  });

  fastify.get('/users/stats', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const stats = await getUsersStats();
    return stats;
  });

  fastify.get('/loans/stats', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const stats = await getLoansStats();
    return stats;
  });
}
