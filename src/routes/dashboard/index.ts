import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  dashboardDataSchema,
  dashboardSearchResponseSchema,
  errorResponse401,
  errorResponse422,
  friendResponseSchema,
} from '../../schemas/responses.js';
import { getDashboardData, getFriends, searchDashboard } from '../../services/dashboard/index.js';

const dashboardSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).describe('Search term for items and friends'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe('Maximum number of results per group (items and friends), between 1 and 20'),
});

export async function dashboardRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
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

  typed.get(
    '/search',
    {
      schema: {
        tags: ['Dashboard'],
        summary: 'Search items and friends',
        description:
          'Performs a scoped search for the authenticated user across active owned items and known friends.',
        security: [{ BearerAuth: [] }],
        querystring: dashboardSearchQuerySchema,
        response: {
          200: dashboardSearchResponseSchema,
          401: errorResponse401,
          422: errorResponse422,
        },
      },
    },
    async (request, reply) => {
      const result = await searchDashboard(
        request.user.userId,
        request.query.q,
        request.query.limit
      );
      return reply.send(result);
    }
  );
}
