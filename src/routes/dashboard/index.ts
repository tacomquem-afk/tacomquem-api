import type { FastifyInstance } from 'fastify';

import { getDashboardData, getFriends } from '../../services/dashboard/index.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request, reply) => {
    const data = await getDashboardData(request.user.userId);
    return reply.send(data);
  });

  app.get('/friends', async (request, reply) => {
    const friends = await getFriends(request.user.userId);
    return reply.send({ friends });
  });
}
