import type { FastifyInstance } from 'fastify';
import { getPublicLoanInfo, confirmLoan } from '../../services/loans.js';

export async function linksRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>('/:token', async (request, reply) => {
    const info = await getPublicLoanInfo(request.params.token);

    if (!info) {
      return reply.status(404).send({ error: 'Link inválido ou expirado' });
    }

    return reply.send(info);
  });

  app.post<{ Params: { token: string } }>(
    '/:token/confirm',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const loan = await confirmLoan(request.params.token, request.user.userId);
        return reply.send({ loan, message: 'Empréstimo confirmado com sucesso!' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao confirmar empréstimo';
        return reply.status(400).send({ error: message });
      }
    }
  );
}
