import type { FastifyInstance } from 'fastify';
import { blockUserSchema, listUsersSchema } from '../../schemas/admin.js';
import { getClientIp } from '../../services/admin/helpers.js';
import { blockUser, getUserDetails, listUsers, unblockUser } from '../../services/admin/index.js';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/',
    {
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
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { reason } = blockUserSchema.parse(request.body);
      const adminId = request.user!.userId;
      const ipAddress = getClientIp(request);

      await blockUser(id, adminId, reason, ipAddress);

      return { success: true, message: 'User blocked successfully' };
    }
  );

  fastify.post(
    '/:id/unblock',
    {
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const adminId = request.user!.userId;
      const ipAddress = getClientIp(request);

      await unblockUser(id, adminId, ipAddress);

      return { success: true, message: 'User unblocked successfully' };
    }
  );
}
