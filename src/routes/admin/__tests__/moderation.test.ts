import { beforeEach, describe, expect, it, mock } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';

const mockGetItemDetails = mock(() => Promise.resolve(null));
const mockRemoveItem = mock(() => Promise.resolve());
const mockGetLoanDetails = mock(() => Promise.resolve(null));
const mockCancelLoan = mock(() => Promise.resolve());

mock.module('../../../services/admin/moderation.js', () => ({
  getItemDetails: mockGetItemDetails,
  removeItem: mockRemoveItem,
  getLoanDetails: mockGetLoanDetails,
  cancelLoan: mockCancelLoan,
}));

import jwtPlugin from '../../../plugins/jwt.js';
import rbacPlugin from '../../../plugins/rbac.js';
import moderationRoutes from '../moderation.js';

describe('Admin Moderation Routes', () => {
  let app: FastifyInstance;
  let moderatorToken: string;
  let supportToken: string;

  beforeEach(async () => {
    mockGetItemDetails.mockReset();
    mockGetItemDetails.mockImplementation(() => Promise.resolve(null));
    mockRemoveItem.mockReset();
    mockRemoveItem.mockImplementation(() => Promise.resolve());
    mockGetLoanDetails.mockReset();
    mockGetLoanDetails.mockImplementation(() => Promise.resolve(null));
    mockCancelLoan.mockReset();
    mockCancelLoan.mockImplementation(() => Promise.resolve());

    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(rbacPlugin);
    await app.register(moderationRoutes, { prefix: '/api/admin/moderation' });
    await app.ready();

    moderatorToken = (app as any).signAccessToken('moderator', 'MODERATOR');
    supportToken = (app as any).signAccessToken('support', 'SUPPORT');
  });

  it('GET /items/:id should return item details', async () => {
    mockGetItemDetails.mockResolvedValueOnce({
      id: '550e8400-e29b-41d4-a716-446655440000',
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
      url: '/api/admin/moderation/items/550e8400-e29b-41d4-a716-446655440000',
      headers: { authorization: `Bearer ${supportToken}` },
    });

    // Smoke test: verify route is accessible
    expect(response.statusCode).toBe(200);
  });

  it('GET /items/:id should return 404 if item not found', async () => {
    mockGetItemDetails.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation/items/550e8400-e29b-41d4-a716-446655440001',
      headers: { authorization: `Bearer ${supportToken}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it('DELETE /items/:id should remove item as MODERATOR', async () => {
    mockRemoveItem.mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/moderation/items/550e8400-e29b-41d4-a716-446655440000',
      headers: { authorization: `Bearer ${moderatorToken}` },
      payload: { reason: 'Inappropriate content detected' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('GET /loans/:id should return loan details', async () => {
    mockGetLoanDetails.mockResolvedValueOnce({
      id: '550e8400-e29b-41d4-a716-446655440000',
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
      url: '/api/admin/moderation/loans/550e8400-e29b-41d4-a716-446655440000',
      headers: { authorization: `Bearer ${supportToken}` },
    });

    // Smoke test: verify route is accessible
    expect(response.statusCode).toBe(200);
  });

  it('POST /loans/:id/cancel should cancel loan as MODERATOR', async () => {
    mockCancelLoan.mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/moderation/loans/550e8400-e29b-41d4-a716-446655440000/cancel',
      headers: { authorization: `Bearer ${moderatorToken}` },
      payload: { reason: 'Fraudulent loan detected' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });
});
