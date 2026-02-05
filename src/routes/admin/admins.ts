import type { FastifyInstance } from 'fastify';
import { auditLogQuerySchema, changeRoleSchema, promoteAdminSchema } from '../../schemas/admin.js';
import {
  changeAdminRole,
  getAuditLog,
  listAdmins,
  promoteToAdmin,
  removeAdmin,
} from '../../services/admin/admins.js';
import { getClientIp } from '../../services/admin/helpers.js';

export default async function adminsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: 'List all admin users (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'Admin users list',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                email: { type: 'string', format: 'email' },
                role: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Insufficient permissions' },
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async () => {
      return await listAdmins();
    }
  );

  fastify.post(
    '/',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: 'Promote a user to admin (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        body: {
          type: 'object',
          required: ['userId', 'role'],
          properties: {
            userId: { type: 'string', format: 'uuid', description: 'User ID to promote' },
            role: {
              type: 'string',
              enum: ['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'],
              description: 'Admin role',
            },
          },
        },
        response: {
          200: {
            description: 'User promoted successfully',
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
      const { userId, role } = promoteAdminSchema.parse(request.body);
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await promoteToAdmin(userId, role, adminId, ipAddress);

      return { success: true, message: 'User promoted to admin' };
    }
  );

  fastify.patch(
    '/:id/role',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: 'Change an admin role (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Admin user ID' },
          },
        },
        body: {
          type: 'object',
          required: ['role'],
          properties: {
            role: {
              type: 'string',
              enum: ['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'],
              description: 'New admin role',
            },
          },
        },
        response: {
          200: {
            description: 'Admin role changed successfully',
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
      const { role } = changeRoleSchema.parse(request.body);
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await changeAdminRole(id, role, adminId, ipAddress);

      return { success: true, message: 'Admin role changed' };
    }
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: 'Remove an admin (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Admin user ID' },
          },
        },
        response: {
          200: {
            description: 'Admin removed successfully',
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

      await removeAdmin(id, adminId, ipAddress);

      return { success: true, message: 'Admin removed' };
    }
  );

  fastify.get(
    '/audit-log',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: 'Get audit log (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1, description: 'Page number' },
            limit: { type: 'number', default: 50, description: 'Results per page (max 100)' },
            action: { type: 'string', description: 'Filter by action type' },
            adminId: { type: 'string', format: 'uuid', description: 'Filter by admin ID' },
          },
        },
        response: {
          200: {
            description: 'Audit log entries',
            type: 'object',
            properties: {
              logs: { type: 'array' },
              total: { type: 'number' },
              page: { type: 'number' },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Insufficient permissions' },
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const params = auditLogQuerySchema.parse(request.query) as Parameters<typeof getAuditLog>[0];
      return await getAuditLog(params);
    }
  );
}
