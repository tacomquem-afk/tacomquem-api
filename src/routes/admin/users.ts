import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import { blockUserSchema, listUsersSchema } from '../../schemas/admin.js';
import {
  adminListUsersResponseSchema,
  adminUserDetailsSchema,
  errorResponse401,
  errorResponse403,
  errorResponse404,
  successResponseSchema,
} from '../../schemas/responses.js';
import { getClientIp } from '../../services/admin/helpers.js';
import { blockUser, getUserDetails, listUsers, unblockUser } from '../../services/admin/index.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function userRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      schema: {
        tags: ['Admin - Users'],
        description: 'List all users (requires ANALYST role or higher)',
        security: [{ BearerAuth: [] }],
        querystring: listUsersSchema,
        response: {
          200: adminListUsersResponseSchema,
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request) => {
      return await listUsers(request.query as Parameters<typeof listUsers>[0]);
    }
  );

  typed.get(
    '/:id',
    {
      schema: {
        tags: ['Admin - Users'],
        description: 'Get user details (requires SUPPORT role or higher)',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: adminUserDetailsSchema,
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request) => {
      const user = await getUserDetails((request.params as { id: string }).id);

      if (!user) {
        throw new NotFoundError(ErrorCodes.ADMIN_TARGET_NOT_FOUND, 'User not found');
      }

      return user;
    }
  );

  typed.post(
    '/:id/block',
    {
      schema: {
        tags: ['Admin - Users'],
        description: 'Block a user (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: blockUserSchema,
        response: {
          200: successResponseSchema,
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

      await blockUser(request.params.id, adminId, request.body.reason, ipAddress);

      return { success: true, message: 'User blocked successfully' };
    }
  );

  typed.post(
    '/:id/unblock',
    {
      schema: {
        tags: ['Admin - Users'],
        description: 'Unblock a user (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: successResponseSchema,
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

      await unblockUser(request.params.id, adminId, ipAddress);

      return { success: true, message: 'User unblocked successfully' };
    }
  );
}
