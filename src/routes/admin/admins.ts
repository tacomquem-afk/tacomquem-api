import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { auditLogQuerySchema, changeRoleSchema, promoteAdminSchema } from '../../schemas/admin.js';
import {
  adminUserSchema,
  auditLogResponseSchema,
  errorResponse400,
  errorResponse401,
  errorResponse403,
  successResponseSchema,
} from '../../schemas/responses.js';
import {
  changeAdminRole,
  getAuditLog,
  listAdmins,
  promoteToAdmin,
  removeAdmin,
} from '../../services/admin/admins.js';
import { getClientIp } from '../../services/admin/helpers.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function adminsRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: `**List all admin accounts**

Returns all users with a role higher than \`USER\` (\`ANALYST\`, \`SUPPORT\`, \`MODERATOR\`, \`SUPER_ADMIN\`).

**Required role:** \`SUPER_ADMIN\` only

**Available roles and their permissions:**
| Role | Permissions |
|------|-------------|
| \`ANALYST\` | Read analytics and user stats |
| \`SUPPORT\` | Read user/item/loan details, view access logs |
| \`MODERATOR\` | All SUPPORT permissions + remove items, cancel loans |
| \`SUPER_ADMIN\` | Full access including blocking users and managing admin roles |`,
        security: [{ BearerAuth: [] }],
        response: {
          200: z.array(adminUserSchema),
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async () => {
      return await listAdmins();
    }
  );

  typed.post(
    '/',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: `**Promote a user to an admin role**

Grants an existing user account an admin role. The action is logged in the audit trail.

**Required role:** \`SUPER_ADMIN\` only

**Request body:**
| Field | Required | Description |
|-------|----------|-------------|
| \`userId\` | Yes | UUID of the existing user to promote |
| \`role\` | Yes | Target role: \`ANALYST\`, \`SUPPORT\`, \`MODERATOR\`, or \`SUPER_ADMIN\` |

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`ADMIN_USER_ALREADY_ADMIN\` | User already has an admin role — use the change role endpoint instead |`,
        security: [{ BearerAuth: [] }],
        body: promoteAdminSchema,
        response: {
          200: successResponseSchema,
          400: errorResponse400,
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await promoteToAdmin(request.body.userId, request.body.role, adminId, ipAddress);

      return { success: true, message: 'User promoted to admin' };
    }
  );

  typed.patch(
    '/:id/role',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: `**Change an admin's role**

Updates the role of an existing admin account. The action is logged in the audit trail.

**Required role:** \`SUPER_ADMIN\` only

**Request body:**
| Field | Required | Description |
|-------|----------|-------------|
| \`role\` | Yes | New role: \`ANALYST\`, \`SUPPORT\`, \`MODERATOR\`, or \`SUPER_ADMIN\` |

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`ADMIN_SAME_ROLE\` | The user already has the specified role |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: changeRoleSchema,
        response: {
          200: successResponseSchema,
          400: errorResponse400,
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await changeAdminRole(request.params.id, request.body.role, adminId, ipAddress);

      return { success: true, message: 'Admin role changed' };
    }
  );

  typed.get(
    '/audit-log',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: `**Get admin action audit log**

Returns a paginated log of all administrative actions performed by admin users. Used for accountability and compliance auditing.

**Required role:** \`SUPER_ADMIN\` only

**Logged action types include:** user blocking/unblocking, item removal, loan cancellation, admin promotion/demotion, and role changes.

**Query parameters:** Use \`auditLogQuerySchema\` params to filter by admin ID, action type, date range, and paginate results.

**Each log entry includes:** the admin who performed the action, the action type, the target entity (user/item/loan), the IP address, and the timestamp.`,
        security: [{ BearerAuth: [] }],
        querystring: auditLogQuerySchema,
        response: {
          200: auditLogResponseSchema,
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      return await getAuditLog(request.query as Parameters<typeof getAuditLog>[0]);
    }
  );

  typed.delete(
    '/:id',
    {
      schema: {
        tags: ['Admin - Admins'],
        description: `**Revoke admin access**

Demotes an admin user back to the regular \`USER\` role, removing all elevated permissions. The action is logged in the audit trail.

**Required role:** \`SUPER_ADMIN\` only

**Note:** A \`SUPER_ADMIN\` cannot demote themselves — use another \`SUPER_ADMIN\` account to perform this operation.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`ADMIN_SELF_DEMOTION\` | Cannot remove your own admin role |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: successResponseSchema,
          400: errorResponse400,
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      await removeAdmin(request.params.id, adminId, ipAddress);

      return { success: true, message: 'Admin removed' };
    }
  );
}
