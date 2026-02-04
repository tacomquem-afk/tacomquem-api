import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import jwtPlugin from '../../../plugins/jwt.js';
import rbacPlugin from '../../../plugins/rbac.js';
import * as moderationService from '../../../services/admin/moderation.js';
import moderationRoutes from '../moderation.js';

describe('Admin Moderation Routes', () => {
  let app: FastifyInstance;
  let moderatorToken: string;
  let supportToken: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(rbacPlugin);
    await app.register(moderationRoutes, { prefix: '/api/admin/moderation' });
    await app.ready();

    moderatorToken = (app as any).signAccessToken('moderator', 'MODERATOR');
    supportToken = (app as any).signAccessToken('support', 'SUPPORT');
  });

  it('GET /items/:id should return item details', async () => {
    spyOn(moderationService, 'getItemDetails').mockResolvedValueOnce({
      id: 'item-123',
      name: 'Test Item',
      description: 'Test Description',
      isActive: true,
      owner: {
        id: 'user-123',
        email: 'jo***@example.com',
        name: 'John D***',
      },
      loans: [],
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation/items/item-123',
      headers: { authorization: `Bearer ${supportToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Test Item');
  });

  it('GET /items/:id should return 404 if item not found', async () => {
    spyOn(moderationService, 'getItemDetails').mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation/items/nonexistent',
      headers: { authorization: `Bearer ${supportToken}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it('DELETE /items/:id should remove item as MODERATOR', async () => {
    spyOn(moderationService, 'removeItem').mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/moderation/items/item-123',
      headers: { authorization: `Bearer ${moderatorToken}` },
      payload: { reason: 'Inappropriate content detected' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('GET /loans/:id should return loan details', async () => {
    spyOn(moderationService, 'getLoanDetails').mockResolvedValueOnce({
      id: 'loan-123',
      status: 'confirmed',
      item: { name: 'Test Item' },
      lender: {
        id: 'user-1',
        email: 'jo***@example.com',
        name: 'John D***',
      },
      borrower: {
        id: 'user-2',
        email: 'ma***@example.com',
        name: 'Maria S***',
      },
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation/loans/loan-123',
      headers: { authorization: `Bearer ${supportToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('confirmed');
  });

  it('POST /loans/:id/cancel should cancel loan as MODERATOR', async () => {
    spyOn(moderationService, 'cancelLoan').mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/moderation/loans/loan-123/cancel',
      headers: { authorization: `Bearer ${moderatorToken}` },
      payload: { reason: 'Fraudulent loan detected' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });
});
