import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import { confirmLoan, getPublicLoanInfo } from '../../services/loans/index.js';

const tokenParamSchema = z.object({ token: z.string().min(1) });

export async function linksRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/:token',
    {
      schema: {
        tags: ['Links'],
        description: 'Get public loan information via token (no authentication required)',
        params: tokenParamSchema,
        response: {
          200: {
            description: 'Public loan information',
            type: 'object',
          },
        },
      },
    },
    async (request, reply) => {
      const info = await getPublicLoanInfo(request.params.token);

      if (!info) {
        throw new NotFoundError(ErrorCodes.LINKS_INVALID_TOKEN, 'Invalid or expired link');
      }

      return reply.send(info);
    }
  );

  typed.post(
    '/:token/confirm',
    {
      schema: {
        tags: ['Links'],
        description: 'Confirm a loan by token (requires authentication)',
        security: [{ BearerAuth: [] }],
        params: tokenParamSchema,
        response: {
          200: {
            description: 'Loan confirmed successfully',
            type: 'object',
            properties: {
              loan: { type: 'object' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const loan = await confirmLoan(request.params.token, request.user.userId);
      return reply.send({ loan, message: 'Loan confirmed successfully!' });
    }
  );
}
