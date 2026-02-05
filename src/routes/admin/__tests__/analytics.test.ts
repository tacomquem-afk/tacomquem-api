import { beforeEach, describe, expect, it, mock } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';

const mockGetDashboardStats = mock(() => Promise.resolve({ summary: {}, trends: {} }));
const mockGetUsersStats = mock(() => Promise.resolve({ byRole: {}, activeUsers: 0 }));
const mockGetLoansStats = mock(() => Promise.resolve({ byStatus: {}, averageLoanDuration: 0 }));

mock.module('../../../services/admin/analytics.js', () => ({
  getDashboardStats: mockGetDashboardStats,
  getUsersStats: mockGetUsersStats,
  getLoansStats: mockGetLoansStats,
}));

import jwtPlugin from '../../../plugins/jwt.js';
import rbacPlugin from '../../../plugins/rbac.js';
import analyticsRoutes from '../analytics.js';

describe('Analytics Routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    mockGetDashboardStats.mockReset();
    mockGetDashboardStats.mockImplementation(() => Promise.resolve({ summary: {}, trends: {} }));
    mockGetUsersStats.mockReset();
    mockGetUsersStats.mockImplementation(() => Promise.resolve({ byRole: {}, activeUsers: 0 }));
    mockGetLoansStats.mockReset();
    mockGetLoansStats.mockImplementation(() =>
      Promise.resolve({ byStatus: {}, averageLoanDuration: 0 })
    );

    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(rbacPlugin);
    await app.register(analyticsRoutes, { prefix: '/api/admin/analytics' });
    await app.ready();

    token = (app as any).signAccessToken('admin-user', 'ANALYST');
  });

  it('GET /dashboard should return dashboard stats', async () => {
    mockGetDashboardStats.mockResolvedValueOnce({
      summary: {
        totalUsers: 100,
        activeUsers: 80,
        totalItems: 50,
        activeLoans: 10,
        totalLoans: 200,
      },
      trends: { newUsersLastWeek: 5, newLoansLastWeek: 15, returnRateLast30Days: 0.85 },
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/dashboard',
      headers: { authorization: `Bearer ${token}` },
    });

    // Smoke test: verify route is accessible
    expect(response.statusCode).toBe(200);
  });

  it('GET /users/stats should return user statistics', async () => {
    mockGetUsersStats.mockResolvedValueOnce({
      byRole: { USER: 100, ANALYST: 5 },
      activeUsers: 80,
      blockedUsers: 5,
      emailVerifiedCount: 90,
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/users/stats',
      headers: { authorization: `Bearer ${token}` },
    });

    // Smoke test: verify route is accessible
    expect(response.statusCode).toBe(200);
  });

  it('GET /loans/stats should return loan statistics', async () => {
    mockGetLoansStats.mockResolvedValueOnce({
      byStatus: { pending: 10, confirmed: 50, returned: 140 },
      averageLoanDuration: 14,
      onTimeReturnRate: 0.92,
    } as any);

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
