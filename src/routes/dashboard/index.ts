import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  dashboardDataSchema,
  errorResponse401,
  friendResponseSchema,
} from '../../schemas/responses.js';
import { getDashboardData, getFriends } from '../../services/dashboard/index.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/',
    {
      schema: {
        tags: ['Dashboard'],
        description: 'Get dashboard data for the authenticated user',
        security: [{ BearerAuth: [] }],
        response: {
          200: dashboardDataSchema,
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      const data = await getDashboardData(request.user.userId);
      return reply.send(data);
    }
  );

  app.get(
    '/friends',
    {
      schema: {
        tags: ['Dashboard'],
        description: 'Get list of friends for the authenticated user',
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({ friends: z.array(friendResponseSchema) }),
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      const friends = await getFriends(request.user.userId);
      return reply.send({ friends });
    }
  );
}
