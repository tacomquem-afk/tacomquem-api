import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { accessLogs } from '../../db/schema.js';
import { UnauthorizedError } from '../../errors/index.js';
import {
  errorResponse400,
  errorResponse401,
  errorResponse404,
  messageResponseSchema,
} from '../../schemas/responses.js';
import {
  cancelDeletion,
  cancelDeletionWithToken,
  getDeletionStatus,
  scheduleDeletion,
} from '../../services/account-deletion/index.js';

async function usersRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/me/account/schedule-deletion',
    {
      schema: {
        description: 'Schedule account deletion (15-day grace period)',
        tags: ['Users'],
        security: [{ BearerAuth: [] }],
        body: z.object({
          reason: z.string().optional(),
          password: z.string().optional(),
        }),
        response: {
          200: z.object({
            status: z.literal('success'),
            message: z.string(),
            scheduledFor: z.coerce.date(),
            canCancelUntil: z.coerce.date(),
            cancelLink: z.string().url(),
          }),
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Must be authenticated to schedule deletion');
      }

      const result = await scheduleDeletion({
        userId: request.user.userId,
        reason: request.body.reason || undefined,
      });

      return reply.status(200).send(result);
    }
  );

  typed.get(
    '/me/account/deletion-status',
    {
      schema: {
        description: 'Check account deletion status',
        tags: ['Users'],
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({
            status: z.enum(['active', 'pending', 'scheduled', 'completed']),
            requestedAt: z.coerce.date().optional(),
            scheduledFor: z.coerce.date().optional(),
            cancelledAt: z.coerce.date().optional(),
            canCancel: z.boolean(),
          }),
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Must be authenticated');
      }

      const status = await getDeletionStatus(request.user.userId);
      return reply.status(200).send(status);
    }
  );

  typed.post(
    '/me/account/cancel-deletion',
    {
      schema: {
        description: 'Cancel scheduled account deletion',
        tags: ['Users'],
        security: [{ BearerAuth: [] }],
        body: z.object({}).optional(),
        response: {
          200: messageResponseSchema,
          401: errorResponse401,
          400: errorResponse400,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Must be authenticated');
      }

      const result = await cancelDeletion(request.user.userId);
      return reply.status(200).send(result);
    }
  );

  typed.get(
    '/account/cancel-deletion',
    {
      schema: {
        description: 'Cancel deletion via email token',
        tags: ['Users'],
        querystring: z.object({
          token: z.string(),
        }),
        response: {
          200: messageResponseSchema,
          400: errorResponse400,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const result = await cancelDeletionWithToken(request.query.token);
      return reply.status(200).send(result);
    }
  );

  typed.get(
    '/me/activity',
    {
      schema: {
        description: 'Get user activity logs (LGPD right to access)',
        tags: ['Users'],
        security: [{ BearerAuth: [] }],
        querystring: z.object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          limit: z.string().transform(Number).default('50'),
          offset: z.string().transform(Number).default('0'),
        }),
        response: {
          200: z.object({
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
            logs: z.array(
              z.object({
                timestamp: z.coerce.date(),
                httpMethod: z.string(),
                path: z.string(),
                statusCode: z.number().nullable(),
                responseTimeMs: z.number().nullable(),
                ipAddress: z.string().nullable(),
              })
            ),
          }),
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Must be authenticated');
      }

      const { from, to, limit, offset } = request.query;

      const conditions = [eq(accessLogs.userId, request.user.userId)];

      if (from) {
        conditions.push(gte(accessLogs.timestamp, new Date(from)));
      }

      if (to) {
        conditions.push(lte(accessLogs.timestamp, new Date(to)));
      }

      const logs = await db
        .select({
          timestamp: accessLogs.timestamp,
          httpMethod: accessLogs.httpMethod,
          path: accessLogs.path,
          statusCode: accessLogs.statusCode,
          responseTimeMs: accessLogs.responseTimeMs,
          ipAddress: accessLogs.ipAddress,
        })
        .from(accessLogs)
        .where(conditions.length > 1 ? eq(accessLogs.userId, request.user.userId) : undefined)
        .orderBy(desc(accessLogs.timestamp))
        .limit(limit)
        .offset(offset);

      // Get total count
      const totalResult = await db
        .select({ count: accessLogs.id })
        .from(accessLogs)
        .where(eq(accessLogs.userId, request.user.userId));

      return reply.status(200).send({
        total: totalResult.length,
        limit,
        offset,
        logs,
      });
    }
  );
}

export default usersRoutes;
