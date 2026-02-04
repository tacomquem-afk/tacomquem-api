import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import jwtPlugin from '../../../plugins/jwt.js';
import rbacPlugin from '../../../plugins/rbac.js';
import analyticsRoutes from '../analytics.js';
import * as analyticsService from '../../../services/admin/analytics.js';

describe('Analytics Routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(rbacPlugin);
    await app.register(analyticsRoutes, { prefix: '/api/admin/analytics' });
    await app.ready();

    token = (app as any).signAccessToken('admin-user', 'ANALYST');
  });

  it('GET /dashboard should return dashboard stats', async () => {
    spyOn(analyticsService, 'getDashboardStats').mockResolvedValueOnce({
      summary: { totalUsers: 100, activeUsers: 80, totalItems: 50, activeLoans: 10, totalLoans: 200 },
      trends: { newUsersLastWeek: 5, newLoansLastWeek: 15, returnRateLast30Days: 0.85 }
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/dashboard',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.summary.totalUsers).toBe(100);
  });

  it('GET /users/stats should return user statistics', async () => {
    spyOn(analyticsService, 'getUsersStats').mockResolvedValueOnce({
      byRole: { USER: 100, ANALYST: 5 },
      activeUsers: 80,
      blockedUsers: 5,
      emailVerifiedCount: 90
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/users/stats',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.byRole.USER).toBe(100);
  });

  it('GET /loans/stats should return loan statistics', async () => {
    spyOn(analyticsService, 'getLoansStats').mockResolvedValueOnce({
      byStatus: { pending: 10, confirmed: 50, returned: 140 },
      averageLoanDuration: 14,
      onTimeReturnRate: 0.92
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/loans/stats',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.byStatus.confirmed).toBe(50);
  });

  it('should reject USER role', async () => {
    const userToken = (app as any).signAccessToken('regular-user', 'USER');

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/dashboard',
      headers: { authorization: `Bearer ${userToken}` }
    });

    expect(response.statusCode).toBe(403);
  });
});
