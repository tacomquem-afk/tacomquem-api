import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import { blockUserSchema, deleteUserSchema, listUsersSchema } from '../../schemas/admin.js';
import {
  adminListUsersResponseSchema,
  adminUserDetailsSchema,
  errorResponse401,
  errorResponse403,
  errorResponse404,
  successResponseSchema,
} from '../../schemas/responses.js';
import { getClientIp } from '../../services/admin/helpers.js';
import {
  blockUser,
  deleteUser,
  getUserDetails,
  listUsers,
  unblockUser,
} from '../../services/admin/index.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function userRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      schema: {
        tags: ['Admin - Users'],
        description: `**List all users**

Returns a paginated list of all registered users. User emails and names are masked for privacy — only enough data to identify users for support and moderation purposes is returned.

**Required role:** \`ANALYST\` or higher (\`SUPPORT\`, \`MODERATOR\`, \`SUPER_ADMIN\`)

**Query parameters:** Use the \`listUsersSchema\` query params for pagination, search, and filtering by status or role.

**Privacy note:** Fields like \`email\` and \`name\` are returned masked (e.g., \`j***e@example.com\`). Use \`GET /api/admin/users/:id\` with \`SUPPORT\` role to see fuller details.`,
        security: [{ BearerAuth: [] }],
        querystring: listUsersSchema,
        response: {
          200: adminListUsersResponseSchema,
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']),
      ],
    },
    async (request) => {
      return await listUsers(request.query as Parameters<typeof listUsers>[0]);
    }
  );

  typed.get(
    '/:id',
    {
      schema: {
        tags: ['Admin - Users'],
        description: `**Get detailed user profile**

Returns full details for a specific user including their loan history (as lender and borrower) and owned items. Used by support agents to investigate user reports or account issues.

**Required role:** \`SUPPORT\` or higher (\`MODERATOR\`, \`SUPER_ADMIN\`)

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`ADMIN_TARGET_NOT_FOUND\` | No user found with the given ID |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: adminUserDetailsSchema,
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
      const user = await getUserDetails((request.params as { id: string }).id);

      if (!user) {
        throw new NotFoundError(ErrorCodes.ADMIN_TARGET_NOT_FOUND, 'User not found');
      }

      return user;
    }
  );

  typed.post(
    '/:id/block',
    {
      schema: {
        tags: ['Admin - Users'],
        description: `**Block a user**

Blocks a user account, preventing them from logging in or using the application. The action is logged in the audit trail.

**Required role:** \`SUPER_ADMIN\` only

**Request body:** Must include a \`reason\` explaining why the user is being blocked — this is recorded in the audit log and can be viewed in the user's block history.

**Effect:** Blocked users receive a \`403 Forbidden\` response on all authenticated endpoints. Existing JWT tokens are invalidated on the next request.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`ADMIN_TARGET_NOT_FOUND\` | No user found with the given ID |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: blockUserSchema,
        response: {
          200: successResponseSchema,
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await blockUser(request.params.id, adminId, request.body.reason, ipAddress);

      return { success: true, message: 'User blocked successfully' };
    }
  );

  typed.post(
    '/:id/unblock',
    {
      schema: {
        tags: ['Admin - Users'],
        description: `**Unblock a user**

Restores access for a previously blocked user account. The action is logged in the audit trail.

**Required role:** \`SUPER_ADMIN\` only

**Effect:** The user can log in again immediately after being unblocked.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`ADMIN_TARGET_NOT_FOUND\` | No user found with the given ID |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: successResponseSchema,
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await unblockUser(request.params.id, adminId, ipAddress);

      return { success: true, message: 'User unblocked successfully' };
    }
  );

  typed.delete(
    '/:id',
    {
      schema: {
        tags: ['Admin - Users'],
        description: `**Delete a user (permanent)**

Permanently deletes a user account. This marks the user as deleted in the database (soft delete), setting \`deletedAt\`, \`deletionStatus\` to 'completed', and \`isActive\` to false. The action is logged in the audit trail.

**Required role:** \`SUPER_ADMIN\` only

**Request body:** Must include a \`reason\` explaining why the user is being deleted — this is recorded in the audit log and stored in the user record.

**Effect:** The deleted user will no longer be able to log in or access the application. All user data is preserved in the database for audit purposes (soft delete). This action cannot be reversed through the API.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`ADMIN_TARGET_NOT_FOUND\` | No user found with the given ID |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: deleteUserSchema,
        response: {
          200: successResponseSchema,
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await deleteUser(request.params.id, adminId, request.body.reason, ipAddress);

      return { success: true, message: 'User deleted successfully' };
    }
  );
}
