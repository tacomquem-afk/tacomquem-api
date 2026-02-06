import type { FastifyInstance } from 'fastify';
import { confirmLoan, getPublicLoanInfo } from '../../services/loans/index.js';

export async function linksRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>(
    '/:token',
    {
      schema: {
        tags: ['Links'],
        description: 'Get public loan information via token (no authentication required)',
        params: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string', description: 'Loan confirmation token' },
          },
        },
        response: {
          200: {
            description: 'Public loan information',
            type: 'object',
          },
          404: { description: 'Invalid or expired link' },
        },
      },
    },
    async (request, reply) => {
      const info = await getPublicLoanInfo(request.params.token);

      if (!info) {
        return reply.status(404).send({ error: 'Link inválido ou expirado' });
      }

      return reply.send(info);
    }
  );

  app.post<{ Params: { token: string } }>(
    '/:token/confirm',
    {
      schema: {
        tags: ['Links'],
        description: 'Confirm a loan by token (requires authentication)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string', description: 'Loan confirmation token' },
          },
        },
        response: {
          200: {
            description: 'Loan confirmed successfully',
            type: 'object',
            properties: {
              loan: { type: 'object' },
              message: { type: 'string' },
            },
          },
          400: { description: 'Error confirming loan' },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const loan = await confirmLoan(request.params.token, request.user.userId);
      return reply.send({ loan, message: 'Empréstimo confirmado com sucesso!' });
    }
  );
}
