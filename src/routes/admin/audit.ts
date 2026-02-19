import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { accessLogs, users } from '../../db/schema.js';
import {
  errorResponse401,
  errorResponse403,
} from '../../schemas/responses.js';

export default async function auditRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/access-logs',
    {
      schema: {
        tags: ['Admin - Audit'],
        description: 'Get access logs (requires SUPPORT role or higher)',
        security: [{ BearerAuth: [] }],
        querystring: z.object({
          userId: z.string().uuid().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          method: z.string().optional(),
          limit: z.string().transform(Number).default('100'),
          offset: z.string().transform(Number).default('0'),
        }),
        response: {
          200: z.object({
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
            logs: z.array(
              z.object({
                id: z.string(),
                timestamp: z.coerce.date(),
                userId: z.string().uuid().nullable(),
                userEmail: z.string().email().nullable(),
                httpMethod: z.string(),
                path: z.string(),
                statusCode: z.number().nullable(),
                responseTimeMs: z.number().nullable(),
                ipAddress: z.string().nullable(),
              })
            ),
          }),
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request) => {
      const { userId, from, to, method, limit, offset } = request.query;

      const conditions = [];

      if (userId) {
        conditions.push(eq(accessLogs.userId, userId));
      }

      if (from) {
        conditions.push(gte(accessLogs.timestamp, new Date(from)));
      }

      if (to) {
        conditions.push(lte(accessLogs.timestamp, new Date(to)));
      }

      if (method) {
        conditions.push(eq(accessLogs.httpMethod, method));
      }

      const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

      const logs = await db
        .select({
          id: accessLogs.id,
          timestamp: accessLogs.timestamp,
          userId: accessLogs.userId,
          userEmail: users.emailEncrypted,
          httpMethod: accessLogs.httpMethod,
          path: accessLogs.path,
          statusCode: accessLogs.statusCode,
          responseTimeMs: accessLogs.responseTimeMs,
          ipAddress: accessLogs.ipAddress,
        })
        .from(accessLogs)
        .leftJoin(users, eq(accessLogs.userId, users.id))
        .where(whereCondition)
        .orderBy(desc(accessLogs.timestamp))
        .limit(limit)
        .offset(offset);

      // Get total count
      const totalResult = await db
        .select({ count: accessLogs.id })
        .from(accessLogs)
        .where(whereCondition);

      const total = totalResult.length;

      return {
        total,
        limit,
        offset,
        logs,
      };
    }
  );
}
