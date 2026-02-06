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
              stats: {
                type: 'object',
                properties: {
                  itemsCount: { type: 'integer' },
                  activeLentCount: { type: 'integer' },
                  activeBorrowedCount: { type: 'integer' },
                  pendingCount: { type: 'integer' },
                },
              },
              recentActivity: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    type: { type: 'string' },
                    message: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    read: { type: 'boolean' },
                  },
                },
              },
              pendingLoans: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    itemName: { type: 'string' },
                    borrowerEmail: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              activeLoans: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    itemName: { type: 'string' },
                    itemImages: { type: 'array', items: { type: 'string' } },
                    otherParty: { type: 'string' },
                    role: { type: 'string', enum: ['lender', 'borrower'] },
                    expectedReturnDate: { type: 'string', format: 'date-time', nullable: true },
                    confirmedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
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
