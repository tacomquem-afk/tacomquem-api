import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import jwtPlugin from '../../../plugins/jwt.js';
import rbacPlugin from '../../../plugins/rbac.js';
import * as analyticsModule from '../../../services/admin/analytics.js';
import analyticsRoutes from '../analytics.js';

const mocks: Array<{ mockRestore: () => void }> = [];

describe('Analytics Routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    // Restore any previous mocks
    for (const mock of mocks) {
      try {
        mock.mockRestore();
      } catch (_e) {
        // Already restored
      }
    }
    mocks.length = 0;

    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(rbacPlugin);
    await app.register(analyticsRoutes, { prefix: '/api/admin/analytics' });
    await app.ready();

    token = (app as any).signAccessToken('admin-user', 'ANALYST');
  });

  afterEach(() => {
    for (const mock of mocks) {
      try {
        mock.mockRestore();
      } catch (_e) {
        // Already restored
      }
    }
    mocks.length = 0;
  });

  it('GET /dashboard should return dashboard stats', async () => {
    mocks.push(
      spyOn(analyticsModule, 'getDashboardStats').mockResolvedValueOnce({
        summary: {
          totalUsers: 100,
          activeUsers: 80,
          totalItems: 50,
          activeLoans: 10,
          totalLoans: 200,
        },
        trends: { newUsersLastWeek: 5, newLoansLastWeek: 15, returnRateLast30Days: 0.85 },
      } as any)
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/dashboard',
      headers: { authorization: `Bearer ${token}` },
    });

    // Smoke test: verify route is accessible
    expect(response.statusCode).toBe(200);
  });

  it('GET /users/stats should return user statistics', async () => {
    mocks.push(
      spyOn(analyticsModule, 'getUsersStats').mockResolvedValueOnce({
        byRole: { USER: 100, ANALYST: 5 },
        activeUsers: 80,
        blockedUsers: 5,
        emailVerifiedCount: 90,
      } as any)
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/users/stats',
      headers: { authorization: `Bearer ${token}` },
    });

    // Smoke test: verify route is accessible
    expect(response.statusCode).toBe(200);
  });

  it('GET /loans/stats should return loan statistics', async () => {
    mocks.push(
      spyOn(analyticsModule, 'getLoansStats').mockResolvedValueOnce({
        byStatus: { pending: 10, confirmed: 50, returned: 140 },
        averageLoanDuration: 14,
        onTimeReturnRate: 0.92,
      } as any)
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/loans/stats',
      headers: { authorization: `Bearer ${token}` },
    });

    // Smoke test: verify route is accessible
    expect(response.statusCode).toBe(200);
  });

  it('should reject USER role', async () => {
    const userToken = (app as any).signAccessToken('regular-user', 'USER');

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/dashboard',
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(response.statusCode).toBe(403);
  });
});
