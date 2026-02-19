import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  adminDashboardStatsSchema,
  errorResponse401,
  errorResponse403,
  loanStatsSchema,
  userStatsSchema,
} from '../../schemas/responses.js';
import { getDashboardStats, getLoansStats, getUsersStats } from '../../services/admin/analytics.js';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/dashboard',
    {
      schema: {
        tags: ['Admin - Analytics'],
        description: `**Get admin dashboard statistics**

Returns a high-level overview of platform activity for the admin dashboard. Includes total counts for users, items, and loans.

**Required role:** \`ANALYST\` or higher (\`SUPPORT\`, \`MODERATOR\`, \`SUPER_ADMIN\`)

**Response fields:**
| Field | Description |
|-------|-------------|
| \`totalUsers\` | Total registered user accounts |
| \`activeUsers\` | Users who are not blocked |
| \`totalItems\` | Total items created across all users |
| \`totalLoans\` | All loans ever created |
| \`activeLoans\` | Loans in \`confirmed\` status |
| \`pendingLoans\` | Loans in \`pending\` status (awaiting borrower confirmation) |`,
        security: [{ BearerAuth: [] }],
        response: {
          200: adminDashboardStatsSchema,
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async () => {
      return await getDashboardStats();
    }
  );

  typed.get(
    '/users/stats',
    {
      schema: {
        tags: ['Admin - Analytics'],
        description: `**Get user growth statistics**

Returns user registration metrics broken down by time period.

**Required role:** \`ANALYST\` or higher (\`SUPPORT\`, \`MODERATOR\`, \`SUPER_ADMIN\`)

**Response fields:**
| Field | Description |
|-------|-------------|
| \`newUsersToday\` | Users registered in the last 24 hours |
| \`newUsersThisWeek\` | Users registered in the last 7 days |
| \`newUsersThisMonth\` | Users registered in the last 30 days |
| \`totalUsers\` | All-time total user count |
| \`growthRate\` | Week-over-week growth rate (percentage as decimal, e.g. \`0.12\` = 12%) |`,
        security: [{ BearerAuth: [] }],
        response: {
          200: userStatsSchema,
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async () => {
      return await getUsersStats();
    }
  );

  typed.get(
    '/loans/stats',
    {
      schema: {
        tags: ['Admin - Analytics'],
        description: `**Get loan activity statistics**

Returns loan activity metrics broken down by time period.

**Required role:** \`ANALYST\` or higher (\`SUPPORT\`, \`MODERATOR\`, \`SUPER_ADMIN\`)

**Response fields:**
| Field | Description |
|-------|-------------|
| \`loansToday\` | Loans created in the last 24 hours |
| \`loansThisWeek\` | Loans created in the last 7 days |
| \`loansThisMonth\` | Loans created in the last 30 days |
| \`averageLoanDuration\` | Average number of days between loan creation and return |
| \`returnRate\` | Ratio of returned loans to total completed loans (0–1) |`,
        security: [{ BearerAuth: [] }],
        response: {
          200: loanStatsSchema,
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async () => {
      return await getLoansStats();
    }
  );
}
