import type { FastifyInstance } from 'fastify';
import { createLoanSchema, type CreateLoanInput } from '../../schemas/loans.js';
import {
  createLoan,
  getLoansByUser,
  getLoanById,
  markLoanAsReturned,
  cancelLoan,
  sendReminder,
} from '../../services/loans.js';

export async function loansRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post<{ Body: CreateLoanInput }>('/', async (request, reply) => {
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
  });

  app.get<{ Querystring: { filter?: 'lent' | 'borrowed' | 'pending' | 'confirmed' | 'returned' } }>(
    '/',
    async (request, reply) => {
      const loans = await getLoansByUser(request.user.userId, request.query.filter);
      return reply.send({ loans });
    }
  );

  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const loan = await getLoanById(request.params.id, request.user.userId);

    if (!loan) {
      return reply.status(404).send({ error: 'Empréstimo não encontrado' });
    }

    return reply.send({ loan });
  });

  app.patch<{ Params: { id: string } }>('/:id/return', async (request, reply) => {
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
  });

  app.patch<{ Params: { id: string } }>('/:id/cancel', async (request, reply) => {
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
  });

  app.post<{ Params: { id: string } }>('/:id/remind', async (request, reply) => {
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
  });
}
