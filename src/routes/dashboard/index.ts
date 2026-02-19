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
        description: `**Get dashboard data**

Returns a consolidated summary for the authenticated user's home screen. This single endpoint provides everything needed to render the main dashboard view without additional requests.

**Response includes:**
- \`stats\`: High-level counters (total items, active lent loans, active borrowed loans, pending confirmations)
- \`recentActivity\`: Latest notification events (loan created, confirmed, returned, reminder sent)
- \`loans\`: Active loans (status \`pending\` or \`confirmed\`) for both lender and borrower roles`,
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
        description: `**Get friends list**

Returns a list of users the authenticated user has had loan activity with (either as lender or borrower). "Friends" are inferred from loan history — there is no explicit friend management.

**Each friend entry includes:**
- Basic profile info (id, name, email, avatarUrl)
- \`lentCount\`: number of items lent to this person
- \`borrowedCount\`: number of items borrowed from this person`,
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
        description: `**Search items and friends**

Performs a keyword search across the authenticated user's active owned items and their known friends (derived from loan history). Results are returned grouped by type.

**Search scope:**
- **Items:** Only active items owned by the user (\`isActive: true\`)
- **Friends:** Only users the authenticated user has had loan activity with

**Query parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| \`q\` | Yes | Search keyword (min 1, max 100 characters) |
| \`limit\` | No | Max results per group — items and friends each (1–20, default 10) |

**Response meta:**
The \`meta\` object contains the actual count of results returned for each group and the applied limit — use it to show a "See all" link if results were truncated.`,
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
