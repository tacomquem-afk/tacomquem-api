import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import { createLoanSchema } from '../../schemas/loans.js';
import {
  cancelLoan,
  createLoan,
  getLoanById,
  getLoansByUser,
  markLoanAsReturned,
  sendReminder,
} from '../../services/loans/index.js';

const idParamSchema = z.object({ id: z.string().uuid() });

const loanFilterSchema = z.object({
  filter: z.enum(['lent', 'borrowed', 'pending', 'confirmed', 'returned']).optional(),
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
          201: {
            description: 'Loan created successfully',
            type: 'object',
            properties: {
              loan: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  itemId: { type: 'string', format: 'uuid' },
                  lenderId: { type: 'string', format: 'uuid' },
                  borrowerId: { type: 'string', format: 'uuid' },
                  status: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
              confirmUrl: { type: 'string', description: 'Public confirmation link' },
            },
          },
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
          200: {
            description: 'List of loans',
            type: 'object',
            properties: {
              loans: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    itemId: { type: 'string', format: 'uuid' },
                    status: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const loans = await getLoansByUser(request.user.userId, request.query.filter);
      return reply.send({ loans });
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
          200: {
            description: 'Loan details',
            type: 'object',
            properties: {
              loan: { type: 'object' },
            },
          },
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
          200: {
            description: 'Loan marked as returned',
            type: 'object',
            properties: {
              loan: { type: 'object' },
            },
          },
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
          204: { description: 'Loan cancelled successfully' },
        },
      },
    },
    async (request, reply) => {
      const cancelled = await cancelLoan(request.params.id, request.user.userId);

      if (!cancelled) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return reply.status(204).send();
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
          200: {
            description: 'Reminder sent successfully',
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
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
