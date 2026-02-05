import type { FastifyInstance } from 'fastify';
import { blockUserSchema, listUsersSchema } from '../../schemas/admin.js';
import { getClientIp } from '../../services/admin/helpers.js';
import { blockUser, getUserDetails, listUsers, unblockUser } from '../../services/admin/index.js';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Admin - Users'],
        description: 'List all users (requires ANALYST role or higher)',
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1, description: 'Page number' },
            limit: { type: 'number', default: 50, description: 'Results per page (max 100)' },
            search: { type: 'string', description: 'Search by name or email' },
            role: { type: 'string', description: 'Filter by role' },
            isActive: { type: 'boolean', description: 'Filter by active status' },
            sortBy: { type: 'string', enum: ['createdAt', 'lastActivity'], default: 'createdAt' },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        },
        response: {
          200: {
            description: 'Users list',
            type: 'object',
            properties: {
              users: { type: 'array' },
              total: { type: 'number' },
              page: { type: 'number' },
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
    async (request) => {
      const params = listUsersSchema.parse(request.query) as Parameters<typeof listUsers>[0];
      return await listUsers(params);
    }
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Admin - Users'],
        description: 'Get user details (requires SUPPORT role or higher)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'User ID' },
          },
        },
        response: {
          200: {
            description: 'User details',
            type: 'object',
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Insufficient permissions' },
          404: { description: 'User not found' },
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await getUserDetails(id);

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return user;
    }
  );

  fastify.post(
    '/:id/block',
    {
      schema: {
        tags: ['Admin - Users'],
        description: 'Block a user (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'User ID' },
          },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: {
              type: 'string',
              minLength: 10,
              description: 'Block reason (minimum 10 characters)',
            },
          },
        },
        response: {
          200: {
            description: 'User blocked successfully',
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
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { reason } = blockUserSchema.parse(request.body);
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await blockUser(id, adminId, reason, ipAddress);

      return { success: true, message: 'User blocked successfully' };
    }
  );

  fastify.post(
    '/:id/unblock',
    {
      schema: {
        tags: ['Admin - Users'],
        description: 'Unblock a user (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'User ID' },
          },
        },
        response: {
          200: {
            description: 'User unblocked successfully',
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
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await unblockUser(id, adminId, ipAddress);

      return { success: true, message: 'User unblocked successfully' };
    }
  );
}
