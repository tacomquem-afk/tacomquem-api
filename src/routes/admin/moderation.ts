import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import { removeContentSchema } from '../../schemas/admin.js';
import { getClientIp } from '../../services/admin/helpers.js';
import {
  cancelLoan,
  getItemDetails,
  getLoanDetails,
  removeItem,
} from '../../services/admin/moderation.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function moderationRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/items/:id',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: 'Get item details for moderation (requires SUPPORT role or higher)',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,},
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request) => {
      const item = await getItemDetails(request.params.id);

      if (!item) {
        throw new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
      }

      return item;
    }
  );

  typed.delete(
    '/items/:id',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: 'Remove an item (requires MODERATOR role or higher)',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: removeContentSchema,
      },
      preHandler: [fastify.authenticate, fastify.requireRole(['MODERATOR', 'SUPER_ADMIN'])],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await removeItem(request.params.id, adminId, request.body.reason, ipAddress);

      return { success: true, message: 'Item removed successfully' };
    }
  );

  typed.get(
    '/loans/:id',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: 'Get loan details for moderation (requires SUPPORT role or higher)',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,},
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request) => {
      const loan = await getLoanDetails(request.params.id);

      if (!loan) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return loan;
    }
  );

  typed.post(
    '/loans/:id/cancel',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: 'Cancel a loan for moderation (requires MODERATOR role or higher)',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: removeContentSchema,
      },
      preHandler: [fastify.authenticate, fastify.requireRole(['MODERATOR', 'SUPER_ADMIN'])],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await cancelLoan(request.params.id, adminId, request.body.reason, ipAddress);

      return { success: true, message: 'Loan cancelled successfully' };
    }
  );
}
