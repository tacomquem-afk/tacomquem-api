import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import {
  errorResponse400,
  errorResponse401,
  errorResponse404,
  errorResponse410,
  loanResponseSchema,
  publicLoanInfoSchema,
} from '../../schemas/responses.js';
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
          200: publicLoanInfoSchema,
          404: errorResponse404,
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
          200: z.object({
            loan: loanResponseSchema,
            message: z.string(),
          }),
          401: errorResponse401,
          404: errorResponse404,
          410: errorResponse410,
          400: errorResponse400,
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
