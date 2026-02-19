import { desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { accessLogs, users } from '../../db/schema.js';
import { ErrorCodes, UnauthorizedError } from '../../errors/index.js';
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
import { decrypt } from '../../services/crypto/index.js';

async function usersRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/me/account/schedule-deletion',
    {
      schema: {
        description: `**Schedule account deletion (15-day grace period)**

Initiates a soft account deletion with a 15-day grace period before permanent removal. During the grace period, the user can cancel via \`POST /api/me/account/cancel-deletion\` or the one-click link sent by email.

**Difference from immediate deletion (\`DELETE /api/auth/me\`):**
- The account remains active and accessible during the grace period
- After 15 days, a background job permanently anonymizes all personal data (LGPD Art. 17/18)
- A cancellation link is emailed immediately after scheduling

**Response fields:**
| Field | Description |
|-------|-------------|
| \`scheduledFor\` | ISO 8601 datetime when the account will be permanently deleted |
| \`canCancelUntil\` | Cancellation deadline (same as \`scheduledFor\`) |
| \`cancelLink\` | One-click cancellation URL that was also emailed to the user |`,
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
        throw new UnauthorizedError(
          ErrorCodes.AUTH_UNAUTHORIZED,
          'Must be authenticated to schedule deletion'
        );
      }

      const input: { userId: string; reason?: string } = {
        userId: request.user.userId,
      };
      if (request.body.reason) {
        input.reason = request.body.reason;
      }

      const result = await scheduleDeletion(input);

      return reply.status(200).send({
        ...result,
        status: 'success' as const,
      });
    }
  );

  typed.get(
    '/me/account/deletion-status',
    {
      schema: {
        description: `**Check account deletion status**

Returns the current deletion state of the authenticated user's account.

**Status values:**
| \`status\` | Meaning |
|-----------|---------|
| \`active\` | No deletion scheduled — account is in normal state |
| \`pending\` | Deletion requested but not yet scheduled (rare transitional state) |
| \`scheduled\` | Deletion is scheduled — \`scheduledFor\` field is populated |
| \`completed\` | Account has been permanently deleted (this state should not be reachable via authentication) |

Use \`canCancel: true\` to determine whether to show the "Cancel deletion" UI.`,
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
        throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Must be authenticated');
      }

      const status = await getDeletionStatus(request.user.userId);
      return reply.status(200).send(status);
    }
  );

  typed.post(
    '/me/account/cancel-deletion',
    {
      schema: {
        description: `**Cancel a scheduled account deletion**

Cancels a pending account deletion within the grace period, restoring the account to normal \`active\` status.

**Requirements:**
- The account must have a deletion scheduled (status \`scheduled\`)
- Must be called before the \`scheduledFor\` deadline

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`ACCOUNT_NO_DELETION_SCHEDULED\` | No deletion is currently scheduled for this account |`,
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
        throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Must be authenticated');
      }

      const result = await cancelDeletion(request.user.userId);
      return reply.status(200).send(result);
    }
  );

  typed.get(
    '/account/cancel-deletion',
    {
      schema: {
        description: `**Cancel deletion via email token (public)**

Cancels a scheduled account deletion using the one-click token sent by email when deletion was scheduled. This endpoint is **public** (no authentication required) — it is meant to be linked directly from the cancellation email.

**Token behavior:**
- Tokens expire when the scheduled deletion date is reached
- Each scheduled deletion generates a unique token

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`ACCOUNT_TOKEN_INVALID\` | Token is malformed or already used |
| \`404\` | \`ACCOUNT_NOT_FOUND\` | No account found matching this token |`,
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
    '/me/parental-consent',
    {
      schema: {
        description: `**Get parental consent status**

Returns the parental consent information for the authenticated user's account. Relevant for accounts where a date of birth was provided during registration (LGPD compliance for minors).

**Status values:**
| \`status\` | Meaning |
|-----------|---------|
| \`not_applicable\` | No date of birth was provided — user is treated as an adult |
| \`pending\` | Consent email sent to guardian but not yet confirmed |
| \`confirmed\` | Guardian has confirmed — account is fully active |

**Note:** A \`pending\` status means the user cannot log in. Show appropriate messaging and a resend option if needed.`,
        tags: ['Users'],
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({
            status: z.enum(['pending', 'confirmed', 'not_applicable']),
            confirmedAt: z.coerce.date().optional(),
            responsibleEmail: z.string().email().optional(),
            responsibleName: z.string().optional(),
          }),
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Must be authenticated');
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, request.user.userId),
      });

      if (!user) {
        throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'User not found');
      }

      return reply.status(200).send({
        status: user.parentalConsentStatus as 'pending' | 'confirmed' | 'not_applicable',
        confirmedAt: user.parentalConsentConfirmedAt || undefined,
        responsibleEmail: user.parentalEmail ? decrypt(user.parentalEmail) : undefined,
        responsibleName: user.parentalName || undefined,
      });
    }
  );

  typed.get(
    '/me/activity',
    {
      schema: {
        description: `**Get user activity logs (LGPD right of access)**

Returns the authenticated user's API access logs. This endpoint fulfills the LGPD right of access (Art. 18, III) — users can inspect what actions were performed under their account.

**Pagination:** Use \`limit\` and \`offset\` for cursor-based pagination through large log histories. Logs are ordered newest first.

**Date filtering:** Use \`from\` and \`to\` (ISO 8601 datetime strings) to scope the query to a specific time range.

**Query parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| \`from\` | ISO 8601 datetime | — | Start of the date range (inclusive) |
| \`to\` | ISO 8601 datetime | — | End of the date range (inclusive) |
| \`limit\` | integer | 50 | Maximum number of records to return |
| \`offset\` | integer | 0 | Number of records to skip (for pagination) |`,
        tags: ['Users'],
        security: [{ BearerAuth: [] }],
        querystring: z.object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          limit: z.string().transform(Number).default(50),
          offset: z.string().transform(Number).default(0),
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
        throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Must be authenticated');
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
