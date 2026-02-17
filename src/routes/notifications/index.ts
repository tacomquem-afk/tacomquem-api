import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  errorResponse401,
  errorResponse403,
  errorResponse404,
  errorResponse422,
  notificationsListResponseSchema,
} from '../../schemas/responses.js';
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../../services/notifications/index.js';

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

  typed.patch(
    '/:id/read',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Mark notification as read',
        description: `Marks a single notification as read for the authenticated user.
This operation is idempotent - calling it on an already-read notification will succeed
without changes. Users can only mark their own notifications as read.`,
        security: [{ BearerAuth: [] }],
        params: z
          .object({
            id: z.string().uuid().describe('Notification ID'),
          })
          .describe('Notification identifier'),
        response: {
          200: z
            .object({
              id: z.string().uuid(),
              read: z.boolean(),
              updatedAt: z.string().datetime(),
            })
            .describe('Notification marked as read'),
          403: errorResponse403,
          404: errorResponse404,
          401: errorResponse401,
          422: errorResponse422,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const result = await markNotificationAsRead({
        userId: request.user.userId,
        notificationId: id,
      });

      if ('kind' in result) {
        if (result.kind === 'not_found') {
          return reply.status(404).send({
            type: 'notification_not_found',
            title: 'Notification not found',
            status: 404,
            detail: result.message,
            errorCode: 'NOTIFICATION_NOT_FOUND',
            instance: request.url,
          });
        }
        if (result.kind === 'access_denied') {
          return reply.status(403).send({
            type: 'access_denied',
            title: 'Access denied',
            status: 403,
            detail: result.message,
            errorCode: 'ACCESS_DENIED',
            instance: request.url,
          });
        }
      }

      return reply.send(result);
    }
  );

  typed.patch(
    '/read-all',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        description: `Marks all unread notifications for the authenticated user as read in a single operation.
Useful for "Mark all as read" functionality in notification centers. Returns the count
of notifications that were actually marked as read.`,
        security: [{ BearerAuth: [] }],
        response: {
          200: z
            .object({
              markedCount: z.number().describe('Number of notifications marked as read'),
            })
            .describe('All notifications marked as read'),
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      const result = await markAllNotificationsAsRead({
        userId: request.user.userId,
      });
      return reply.send(result);
    }
  );

  typed.delete(
    '/:id',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Delete notification',
        description: `Permanently deletes a notification for the authenticated user.
Users can only delete their own notifications. This operation cannot be undone.`,
        security: [{ BearerAuth: [] }],
        params: z
          .object({
            id: z.string().uuid().describe('Notification ID'),
          })
          .describe('Notification identifier'),
        response: {
          200: z
            .object({
              id: z.string().uuid(),
              deleted: z.boolean(),
            })
            .describe('Notification deleted successfully'),
          403: errorResponse403,
          404: errorResponse404,
          401: errorResponse401,
          422: errorResponse422,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const result = await deleteNotification({
        userId: request.user.userId,
        notificationId: id,
      });

      if ('kind' in result) {
        if (result.kind === 'not_found') {
          return reply.status(404).send({
            type: 'notification_not_found',
            title: 'Notification not found',
            status: 404,
            detail: result.message,
            errorCode: 'NOTIFICATION_NOT_FOUND',
            instance: request.url,
          });
        }
        if (result.kind === 'access_denied') {
          return reply.status(403).send({
            type: 'access_denied',
            title: 'Access denied',
            status: 403,
            detail: result.message,
            errorCode: 'ACCESS_DENIED',
            instance: request.url,
          });
        }
      }

      return reply.send(result);
    }
  );
}
