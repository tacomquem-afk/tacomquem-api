import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import { createLoanSchema } from '../../schemas/loans.js';
import {
  errorResponse400,
  errorResponse401,
  errorResponse404,
  errorResponse422,
  historyResponseSchema,
  loanResponseSchema,
  messageResponseSchema,
} from '../../schemas/responses.js';
import {
  cancelLoan,
  createLoan,
  getLoanById,
  getLoansByUser,
  getLoansHistory,
  type HistoryDirection,
  markLoanAsReturned,
  sendReminder,
} from '../../services/loans/index.js';

const idParamSchema = z.object({ id: z.string().uuid() });

const loanFilterSchema = z.object({
  filter: z.enum(['lent', 'borrowed', 'pending', 'confirmed', 'returned']).optional(),
});

const historyFilterSchema = z.object({
  direction: z.enum(['all', 'lent', 'borrowed']).optional().default('all'),
});

export async function loansRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', app.authenticate);

  typed.post(
    '/',
    {
      schema: {
        tags: ['Loans'],
        description: 'Create a new loan and generate a confirmation link',
        security: [{ BearerAuth: [] }],
        body: createLoanSchema,
        response: {
          201: z.object({
            loan: loanResponseSchema,
            confirmUrl: z.string().url(),
          }),
          401: errorResponse401,
          404: errorResponse404,
          422: errorResponse422,
        },
      },
    },
    async (request, reply) => {
      const { loan, confirmUrl } = await createLoan(request.user.userId, request.body);
      return reply.status(201).send({ loan, confirmUrl });
    }
  );

  typed.get(
    '/',
    {
      schema: {
        tags: ['Loans'],
        description: 'List all loans for the authenticated user',
        security: [{ BearerAuth: [] }],
        querystring: loanFilterSchema,
        response: {
          200: z.object({ loans: z.array(loanResponseSchema) }),
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      const loans = await getLoansByUser(request.user.userId, request.query.filter);
      return reply.send({ loans });
    }
  );

  typed.get(
    '/history',
    {
      schema: {
        tags: ['Loans'],
        description:
          'List completed loans (returned/cancelled) with direction filter and tab counts',
        security: [{ BearerAuth: [] }],
        querystring: historyFilterSchema,
        response: {
          200: historyResponseSchema,
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      const direction = request.query.direction as HistoryDirection;
      const result = await getLoansHistory(request.user.userId, direction);
      return reply.send(result);
    }
  );

  typed.get(
    '/:id',
    {
      schema: {
        tags: ['Loans'],
        description: 'Get loan details',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: z.object({ loan: loanResponseSchema }),
          401: errorResponse401,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const loan = await getLoanById(request.params.id, request.user.userId);

      if (!loan) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return reply.send({ loan });
    }
  );

  typed.patch(
    '/:id/return',
    {
      schema: {
        tags: ['Loans'],
        description: 'Mark a loan as returned',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: z.object({ loan: loanResponseSchema }),
          400: errorResponse400,
          401: errorResponse401,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const loan = await markLoanAsReturned(request.params.id, request.user.userId);

      if (!loan) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return reply.send({ loan });
    }
  );

  typed.patch(
    '/:id/cancel',
    {
      schema: {
        tags: ['Loans'],
        description: 'Cancel a loan',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          204: z.null(),
          401: errorResponse401,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const cancelled = await cancelLoan(request.params.id, request.user.userId);

      if (!cancelled) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return reply.status(204).send(null);
    }
  );

  typed.post(
    '/:id/remind',
    {
      schema: {
        tags: ['Loans'],
        description: 'Send a reminder for a loan',
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: messageResponseSchema,
          400: errorResponse400,
          401: errorResponse401,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const sent = await sendReminder(request.params.id, request.user.userId);

      if (!sent) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return reply.send({ message: 'Reminder sent successfully!' });
    }
  );
}
