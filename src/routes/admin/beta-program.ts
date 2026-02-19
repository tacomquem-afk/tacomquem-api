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
  email: z.string().email().describe('Email of the existing user to grant beta access'),
  reason: z.string().optional().describe('Optional reason recorded in the beta program audit log'),
});

const removeBetaUserBodySchema = z.object({
  reason: z.string().optional().describe('Optional reason recorded in the beta program audit log'),
});

const listBetaUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).describe('Page number (1-based)'),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe('Items per page (1-100, default 20)'),
  sortBy: z
    .enum(['betaAddedAt', 'createdAt'])
    .default('betaAddedAt')
    .describe('Sort by beta-added date or account creation date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
});

export default async function betaProgramRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      schema: {
        tags: ['Admin - Beta Program'],
        summary: 'List beta program users',
        description: `Returns a paginated list of users currently enrolled in the beta program.
      Results include masked name and email for privacy while still allowing admins to identify users.
      Use the pagination and sorting parameters to control the listing order and size.`,
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
        summary: 'Add user to beta program',
        description: `Adds an existing active user to the beta program using their email address.
      This updates the user's access tier to BETA, sets the beta-added timestamp, and writes an audit log entry.
      The response returns the updated user with masked fields suitable for admin views.`,
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
        summary: 'Remove user from beta program',
        description: `Removes a user from the beta program by user ID.
      This resets the access tier to PUBLIC, clears the beta-added timestamp, and writes an audit log entry.
      The response returns the updated user with masked fields suitable for admin views.`,
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
