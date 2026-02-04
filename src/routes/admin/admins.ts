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
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async () => {
      return await listAdmins();
    }
  );

  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const { userId, role } = promoteAdminSchema.parse(request.body);
      const adminId = request.user!.userId;
      const ipAddress = getClientIp(request);

      await promoteToAdmin(userId, role, adminId, ipAddress);

      return { success: true, message: 'User promoted to admin' };
    }
  );

  fastify.patch(
    '/:id/role',
    {
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { role } = changeRoleSchema.parse(request.body);
      const adminId = request.user!.userId;
      const ipAddress = getClientIp(request);

      await changeAdminRole(id, role, adminId, ipAddress);

      return { success: true, message: 'Admin role changed' };
    }
  );

  fastify.delete(
    '/:id',
    {
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const adminId = request.user!.userId;
      const ipAddress = getClientIp(request);

      await removeAdmin(id, adminId, ipAddress);

      return { success: true, message: 'Admin removed' };
    }
  );

  fastify.get(
    '/audit-log',
    {
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const params = auditLogQuerySchema.parse(request.query) as Parameters<typeof getAuditLog>[0];
      return await getAuditLog(params);
    }
  );
}
