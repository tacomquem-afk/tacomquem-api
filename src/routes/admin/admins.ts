import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { auditLogQuerySchema, changeRoleSchema, promoteAdminSchema } from '../../schemas/admin.js';
import {
  changeAdminRole,
  getAuditLog,
  listAdmins,
  promoteToAdmin,
  removeAdmin,
} from '../../services/admin/admins.js';
import { getClientIp } from '../../services/admin/helpers.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function adminsRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

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
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async () => {
      return await listAdmins();
    }
  );

  typed.post(
    '/',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: 'Promote a user to admin (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        body: promoteAdminSchema,
        response: {
          200: {
            description: 'User promoted successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await promoteToAdmin(request.body.userId, request.body.role, adminId, ipAddress);

      return { success: true, message: 'User promoted to admin' };
    }
  );

  typed.patch(
    '/:id/role',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: 'Change an admin role (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: changeRoleSchema,
        response: {
          200: {
            description: 'Admin role changed successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await changeAdminRole(request.params.id, request.body.role, adminId, ipAddress);

      return { success: true, message: 'Admin role changed' };
    }
  );

  typed.delete(
    '/:id',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: 'Remove an admin (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: {
            description: 'Admin removed successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await removeAdmin(request.params.id, adminId, ipAddress);

      return { success: true, message: 'Admin removed' };
    }
  );

  typed.get(
    '/audit-log',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: 'Get audit log (requires SUPER_ADMIN role)',
        security: [{ BearerAuth: [] }],
        querystring: auditLogQuerySchema,
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
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      return await getAuditLog(request.query as Parameters<typeof getAuditLog>[0]);
    }
  );
}
