import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import { removeContentSchema } from '../../schemas/admin.js';
import {
  adminItemDetailsSchema,
  adminLoanDetailsSchema,
  errorResponse401,
  errorResponse403,
  errorResponse404,
  successResponseSchema,
} from '../../schemas/responses.js';
import { getClientIp } from '../../services/admin/helpers.js';
import {
  cancelLoan,
  getItemDetails,
  getLoanDetails,
  removeItem,
} from '../../services/admin/moderation.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function moderationRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/items/:id',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: `**Get item details for moderation review**

Returns full item details including owner information and active loan count. Used by support and moderation agents to review reported content.

**Required role:** \`SUPPORT\` or higher (\`MODERATOR\`, \`SUPER_ADMIN\`)

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`ITEMS_NOT_FOUND\` | No item found with the given ID |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: adminItemDetailsSchema,
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request) => {
      const item = await getItemDetails((request.params as { id: string }).id);

      if (!item) {
        throw new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
      }

      return item;
    }
  );

  typed.delete(
    '/items/:id',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: `**Remove an item (moderation action)**

Soft-deletes an item on behalf of the platform. Used to remove content that violates community guidelines. The action and reason are recorded in the audit log.

**Required role:** \`MODERATOR\` or higher (\`SUPER_ADMIN\`)

**Request body:** Must include a \`reason\` explaining the moderation action — this is stored in the audit trail.

**Effect:** The item is soft-deleted (\`isActive: false\`). The owner's loan history for this item is preserved.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`ITEMS_NOT_FOUND\` | No item found with the given ID |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: removeContentSchema,
        response: {
          200: successResponseSchema,
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole(['MODERATOR', 'SUPER_ADMIN'])],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await removeItem(request.params.id, adminId, request.body.reason, ipAddress);

      return { success: true, message: 'Item removed successfully' };
    }
  );

  typed.get(
    '/loans/:id',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: `**Get loan details for moderation review**

Returns full loan details including lender, borrower, and item information. Used by support and moderation agents to review reported loans.

**Required role:** \`SUPPORT\` or higher (\`MODERATOR\`, \`SUPER_ADMIN\`)

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`LOANS_NOT_FOUND\` | No loan found with the given ID |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: adminLoanDetailsSchema,
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request) => {
      const loan = await getLoanDetails((request.params as { id: string }).id);

      if (!loan) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return loan;
    }
  );

  typed.post(
    '/loans/:id/cancel',
    {
      schema: {
        tags: ['Admin - Moderation'],
        description: `**Cancel a loan (moderation action)**

Forcibly cancels a loan on behalf of the platform. Used to resolve disputes or remove content that violates community guidelines. The action and reason are recorded in the audit log.

**Required role:** \`MODERATOR\` or higher (\`SUPER_ADMIN\`)

**Request body:** Must include a \`reason\` explaining the moderation action — this is stored in the audit trail and may be visible to the affected users.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`LOANS_NOT_FOUND\` | No loan found with the given ID |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: removeContentSchema,
        response: {
          200: successResponseSchema,
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole(['MODERATOR', 'SUPER_ADMIN'])],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await cancelLoan(request.params.id, adminId, request.body.reason, ipAddress);

      return { success: true, message: 'Loan cancelled successfully' };
    }
  );
}
