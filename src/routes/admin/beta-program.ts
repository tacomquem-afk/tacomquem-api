import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  addBetaUserSchema,
  betaUserListResponseSchema,
  errorResponse400,
  errorResponse401,
  errorResponse403,
  errorResponse404,
} from '../../schemas/responses.js';
import { getClientIp } from '../../services/admin/helpers.js';
import { addBetaUser, listBetaUsers, removeBetaUser } from '../../services/admin/index.js';

const idParamSchema = z.object({ id: z.string().uuid() });

const addBetaUserBodySchema = z.object({
  email: z.string().email(),
  reason: z.string().optional(),
});

const removeBetaUserBodySchema = z.object({
  reason: z.string().optional(),
});

const listBetaUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['betaAddedAt', 'createdAt']).default('betaAddedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export default async function betaProgramRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      schema: {
        tags: ['Admin - Beta Program'],
        description: 'List all beta program users (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        querystring: listBetaUsersQuerySchema,
        response: {
          200: betaUserListResponseSchema,
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      return await listBetaUsers(request.query as Parameters<typeof listBetaUsers>[0]);
    }
  );

  typed.post(
    '/add-user',
    {
      schema: {
        tags: ['Admin - Beta Program'],
        description: 'Add a user to the beta program (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        body: addBetaUserBodySchema,
        response: {
          200: addBetaUserSchema,
          400: errorResponse400,
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);
      const params = {
        email: request.body.email,
        adminId,
        ipAddress,
      } as { email: string; adminId: string; ipAddress?: string; reason?: string };

      if (request.body.reason) {
        params.reason = request.body.reason;
      }

      const user = await addBetaUser(params);

      return {
        success: true,
        message: 'User added to beta program successfully',
        user,
      };
    }
  );

  typed.post(
    '/:id/remove-user',
    {
      schema: {
        tags: ['Admin - Beta Program'],
        description: 'Remove a user from the beta program (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: removeBetaUserBodySchema,
        response: {
          200: addBetaUserSchema,
          400: errorResponse400,
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);
      const userId = (request.params as { id: string }).id;
      const params = {
        userId,
        adminId,
        ipAddress,
      } as { userId: string; adminId: string; ipAddress?: string; reason?: string };

      if (request.body.reason) {
        params.reason = request.body.reason;
      }

      const user = await removeBetaUser(params);

      return {
        success: true,
        message: 'User removed from beta program successfully',
        user,
      };
    }
  );
}
