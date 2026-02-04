import type { FastifyInstance } from 'fastify';
import { removeContentSchema } from '../../schemas/admin.js';
import { cancelLoan, getItemDetails, getLoanDetails, removeItem } from '../../services/admin/moderation.js';
import { getClientIp } from '../../services/admin/helpers.js';

export default async function moderationRoutes(fastify: FastifyInstance) {
  fastify.get('/items/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getItemDetails(id);

    if (!item) {
      return reply.code(404).send({ error: 'Item not found' });
    }

    return item;
  });

  fastify.delete('/items/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = removeContentSchema.parse(request.body);
    const adminId = request.user!.userId;
    const ipAddress = getClientIp(request);

    await removeItem(id, adminId, reason, ipAddress);

    return { success: true, message: 'Item removed successfully' };
  });

  fastify.get('/loans/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const loan = await getLoanDetails(id);

    if (!loan) {
      return reply.code(404).send({ error: 'Loan not found' });
    }

    return loan;
  });

  fastify.post('/loans/:id/cancel', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = removeContentSchema.parse(request.body);
    const adminId = request.user!.userId;
    const ipAddress = getClientIp(request);

    await cancelLoan(id, adminId, reason, ipAddress);

    return { success: true, message: 'Loan cancelled successfully' };
  });
}
