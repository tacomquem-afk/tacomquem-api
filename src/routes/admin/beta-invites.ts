import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  errorResponse400,
  errorResponse401,
  errorResponse403,
  errorResponse404,
  errorResponse409,
} from '../../schemas/responses.js';
import {
  type AddBetaInviteParams,
  addBetaInvite,
  listBetaInvites,
  removeBetaInvite,
} from '../../services/admin/beta-invites.js';
import { getClientIp } from '../../services/admin/helpers.js';

const addInviteSchema = z.object({
  email: z.string().email().describe('Email to whitelist for beta access'),
  reason: z.string().optional().describe('Optional reason for the invite'),
});

const emailParamSchema = z.object({
  email: z.string().email(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const betaInviteResponseSchema = z.object({
  email: z.string().email(),
  addedAt: z.date(),
  usedAt: z.date().nullable(),
  reason: z.string().nullable(),
  addedBy: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
});

export default async function betaInvitesRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      schema: {
        tags: ['Admin - Beta Invites'],
        summary: 'List all beta invite emails',
        description: `Returns a paginated list of emails whitelisted for beta access.
        Includes metadata about who added them, when, and whether they've been used during registration.
        The \`usedAt\` timestamp indicates when the email was first used to register an account.`,
        security: [{ BearerAuth: [] }],
        querystring: listQuerySchema,
        response: {
          200: z.object({
            total: z.number().describe('Total count of invites in the whitelist'),
            limit: z.number().describe('Items returned per page'),
            offset: z.number().describe('Records skipped'),
            invites: z.array(betaInviteResponseSchema),
          }),
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const { limit, offset } = request.query;
      const result = await listBetaInvites(limit, offset);
      return {
        total: result.total,
        limit,
        offset,
        invites: result.invites,
      };
    }
  );

  typed.post(
    '/',
    {
      schema: {
        tags: ['Admin - Beta Invites'],
        summary: 'Add email to beta invites whitelist',
        description: `Adds an email to the beta invites whitelist.
        Future registrations with this email will automatically have their \\\`accessTier\\\` set to \\\`BETA\\\` and \\\`betaAddedAt\\\` populated.
        The action is logged with the admin's IP address for audit purposes.

**Validation:**
- On success: returns 201 status
- If email already whitelisted: returns 409 CONFLICT
- If email format invalid: returns 400 BAD REQUEST`,
        security: [{ BearerAuth: [] }],
        body: addInviteSchema,
        response: {
          201: z.object({
            success: z.boolean(),
            message: z.string(),
            invite: betaInviteResponseSchema,
          }),
          400: errorResponse400,
          401: errorResponse401,
          403: errorResponse403,
          409: errorResponse409,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request, reply) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      if (!adminId) {
        return reply.status(401).send({
          type: 'about:blank',
          title: 'Unauthorized',
          status: 401,
          detail: 'Admin ID not found in request',
          errorCode: 'AUTH_REQUIRED',
          instance: request.url,
        });
      }

      const params: AddBetaInviteParams = {
        email: request.body.email,
        adminId,
        reason: request.body.reason,
        ipAddress,
      };

      const invite = await addBetaInvite(params);

      return reply.status(201).send({
        success: true,
        message: `Email ${request.body.email} added to beta whitelist`,
        invite,
      });
    }
  );

  typed.delete(
    '/:email',
    {
      schema: {
        tags: ['Admin - Beta Invites'],
        summary: 'Remove email from beta invites whitelist',
        description: `Removes an email from the beta invites whitelist.
        Note: Already-registered users with \`accessTier: BETA\` from this invite remain unaffected.
        Removal is logged in the admin action audit trail.`,
        security: [{ BearerAuth: [] }],
        params: emailParamSchema,
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request, reply) => {
      const adminId = request.user?.userId;
      const { email } = request.params as { email: string };

      if (!adminId) {
        return reply.status(401).send({
          type: 'about:blank',
          title: 'Unauthorized',
          status: 401,
          detail: 'Admin ID not found in request',
          errorCode: 'AUTH_REQUIRED',
          instance: request.url,
        });
      }

      await removeBetaInvite({
        email,
        adminId,
      });

      return {
        success: true,
        message: `Email ${email} removed from beta whitelist`,
      };
    }
  );
}
