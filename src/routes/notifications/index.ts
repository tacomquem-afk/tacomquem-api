import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  errorResponse401,
  errorResponse422,
  notificationsListResponseSchema,
} from '../../schemas/responses.js';
import { getNotifications } from '../../services/notifications/index.js';

const notificationsQuerySchema = z.object({
  read: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined))
    .describe('Filter by read status. Omit to return all notifications'),
  page: z.coerce.number().int().min(1).default(1).describe('Page number (1-based)'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Items per page (1–50, default 20)'),
});

export async function notificationsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', app.authenticate);

  typed.get(
    '/',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'List user notifications',
        description: `Returns a paginated list of notifications for the authenticated user.
Use the \`read\` filter to show only unread (\`false\`) or already-read (\`true\`) notifications.
The \`unreadCount\` field always reflects the total number of unread notifications regardless
of the current filter — use it to display the notification badge count in the UI.`,
        security: [{ BearerAuth: [] }],
        querystring: notificationsQuerySchema.describe(
          'Notification filter and pagination options'
        ),
        response: {
          200: notificationsListResponseSchema.describe(
            'Paginated list of notifications with unread count'
          ),
          401: errorResponse401,
          422: errorResponse422,
        },
      },
    },
    async (request, reply) => {
      const { read, page, limit } = request.query;
      const result = await getNotifications({
        userId: request.user.userId,
        ...(read !== undefined && { read }),
        page,
        limit,
      });
      return reply.send(result);
    }
  );
}
