import type { FastifyInstance } from 'fastify';

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
          200: {
            description: 'Dashboard data',
            type: 'object',
            properties: {
              stats: { type: 'object' },
              recentLoans: { type: 'array' },
            },
          },
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
          200: {
            description: 'Friends list',
            type: 'object',
            properties: {
              friends: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const friends = await getFriends(request.user.userId);
      return reply.send({ friends });
    }
  );
}
