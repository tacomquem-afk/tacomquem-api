import type { FastifyInstance } from 'fastify';
import { type CreateLoanInput, createLoanSchema } from '../../schemas/loans.js';
import {
  cancelLoan,
  createLoan,
  getLoanById,
  getLoansByUser,
  markLoanAsReturned,
  sendReminder,
} from '../../services/loans/index.js';

export async function loansRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post<{ Body: CreateLoanInput }>(
    '/',
    {
      schema: {
        tags: ['Loans'],
        description: 'Create a new loan and generate a confirmation link',
        security: [{ BearerAuth: [] }],
        body: {
          type: 'object',
          required: ['itemId', 'borrowerEmail'],
          properties: {
            itemId: { type: 'string', format: 'uuid', description: 'Item ID' },
            borrowerEmail: {
              type: 'string',
              format: 'email',
              description: 'Borrower email address',
            },
            expectedReturnDate: {
              type: 'string',
              format: 'date-time',
              description: 'Expected return date (optional)',
            },
            lenderNotes: { type: 'string', description: 'Lender notes (optional)' },
          },
        },
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
          400: { description: 'Invalid input or error creating loan' },
        },
      },
    },
    async (request, reply) => {
      const result = createLoanSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      try {
        const { loan, confirmUrl } = await createLoan(request.user.userId, result.data);
        return reply.status(201).send({ loan, confirmUrl });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar empréstimo';
        return reply.status(400).send({ error: message });
      }
    }
  );

  app.get<{ Querystring: { filter?: 'lent' | 'borrowed' | 'pending' | 'confirmed' | 'returned' } }>(
    '/',
    {
      schema: {
        tags: ['Loans'],
        description: 'List all loans for the authenticated user',
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['lent', 'borrowed', 'pending', 'confirmed', 'returned'],
              description: 'Filter loans by status',
            },
          },
        },
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

  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        tags: ['Loans'],
        description: 'Get loan details',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Loan ID' },
          },
        },
        response: {
          200: {
            description: 'Loan details',
            type: 'object',
            properties: {
              loan: { type: 'object' },
            },
          },
          404: { description: 'Loan not found' },
        },
      },
    },
    async (request, reply) => {
      const loan = await getLoanById(request.params.id, request.user.userId);

      if (!loan) {
        return reply.status(404).send({ error: 'Empréstimo não encontrado' });
      }

      return reply.send({ loan });
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/:id/return',
    {
      schema: {
        tags: ['Loans'],
        description: 'Mark a loan as returned',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Loan ID' },
          },
        },
        response: {
          200: {
            description: 'Loan marked as returned',
            type: 'object',
            properties: {
              loan: { type: 'object' },
            },
          },
          404: { description: 'Loan not found' },
        },
      },
    },
    async (request, reply) => {
      try {
        const loan = await markLoanAsReturned(request.params.id, request.user.userId);

        if (!loan) {
          return reply.status(404).send({ error: 'Empréstimo não encontrado' });
        }

        return reply.send({ loan });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao marcar como devolvido';
        return reply.status(400).send({ error: message });
      }
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/:id/cancel',
    {
      schema: {
        tags: ['Loans'],
        description: 'Cancel a loan',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Loan ID' },
          },
        },
        response: {
          204: { description: 'Loan cancelled successfully' },
          404: { description: 'Loan not found' },
        },
      },
    },
    async (request, reply) => {
      try {
        const cancelled = await cancelLoan(request.params.id, request.user.userId);

        if (!cancelled) {
          return reply.status(404).send({ error: 'Empréstimo não encontrado' });
        }

        return reply.status(204).send();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao cancelar empréstimo';
        return reply.status(400).send({ error: message });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    '/:id/remind',
    {
      schema: {
        tags: ['Loans'],
        description: 'Send a reminder for a loan',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Loan ID' },
          },
        },
        response: {
          200: {
            description: 'Reminder sent successfully',
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          404: { description: 'Loan not found' },
        },
      },
    },
    async (request, reply) => {
      try {
        const sent = await sendReminder(request.params.id, request.user.userId);

        if (!sent) {
          return reply.status(404).send({ error: 'Empréstimo não encontrado' });
        }

        return reply.send({ message: 'Lembrete enviado com sucesso!' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao enviar lembrete';
        return reply.status(400).send({ error: message });
      }
    }
  );
}
