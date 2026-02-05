import type { FastifyInstance } from 'fastify';
import { removeContentSchema } from '../../schemas/admin.js';
import { getClientIp } from '../../services/admin/helpers.js';
import {
  cancelLoan,
  getItemDetails,
  getLoanDetails,
  removeItem,
} from '../../services/admin/moderation.js';

export default async function moderationRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/items/:id',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: 'Get item details for moderation (requires SUPPORT role or higher)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Item ID' },
          },
        },
        response: {
          200: {
            description: 'Item details',
            type: 'object',
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Insufficient permissions' },
          404: { description: 'Item not found' },
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = await getItemDetails(id);

      if (!item) {
        return reply.code(404).send({ error: 'Item not found' });
      }

      return item;
    }
  );

  fastify.delete(
    '/items/:id',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: 'Remove an item (requires MODERATOR role or higher)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Item ID' },
          },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: {
              type: 'string',
              minLength: 10,
              description: 'Removal reason (minimum 10 characters)',
            },
          },
        },
        response: {
          200: {
            description: 'Item removed successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Insufficient permissions' },
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole(['MODERATOR', 'SUPER_ADMIN'])],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { reason } = removeContentSchema.parse(request.body);
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await removeItem(id, adminId, reason, ipAddress);

      return { success: true, message: 'Item removed successfully' };
    }
  );

  fastify.get(
    '/loans/:id',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: 'Get loan details for moderation (requires SUPPORT role or higher)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Loan ID' },
          },
        },
        response: {
          200: {
            description: 'Loan details',
            type: 'object',
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Insufficient permissions' },
          404: { description: 'Loan not found' },
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const loan = await getLoanDetails(id);

      if (!loan) {
        return reply.code(404).send({ error: 'Loan not found' });
      }

      return loan;
    }
  );

  fastify.post(
    '/loans/:id/cancel',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: 'Cancel a loan for moderation (requires MODERATOR role or higher)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Loan ID' },
          },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: {
              type: 'string',
              minLength: 10,
              description: 'Cancellation reason (minimum 10 characters)',
            },
          },
        },
        response: {
          200: {
            description: 'Loan cancelled successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Insufficient permissions' },
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole(['MODERATOR', 'SUPER_ADMIN'])],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { reason } = removeContentSchema.parse(request.body);
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await cancelLoan(id, adminId, reason, ipAddress);

      return { success: true, message: 'Loan cancelled successfully' };
    }
  );
}
