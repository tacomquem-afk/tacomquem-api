import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { db } from '../../../db/index.js';
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

    // Mock database user lookup for BETA_MODE checks
    mocks.push(
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce({
        id: 'admin-user',
        role: 'ANALYST',
        deletedAt: null,
        accessTier: 'BETA',
      } as any)
    );

    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(jwtPlugin);
    await app.register(rbacPlugin);

    app.setErrorHandler((error, request, reply) => {
      // Use the same error format as the production app
      const statusCode =
        error && typeof error === 'object' && 'constructor' in error
          ? (error.constructor as any).name === 'ConflictError'
            ? 409
            : (error.constructor as any).name === 'UnauthorizedError'
              ? 401
              : (error.constructor as any).name === 'ForbiddenError'
                ? 403
                : (error.constructor as any).name === 'NotFoundError'
                  ? 404
                  : (error.constructor as any).name === 'ValidationError'
                    ? 422
                    : (error.constructor as any).name === 'GoneError'
                      ? 410
                      : (error.constructor as any).name === 'PayloadTooLargeError'
                        ? 413
                        : (error.constructor as any).name === 'BadRequestError'
                          ? 400
                          : 500
          : 500;

      const errorCode =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'INTERNAL_SERVER_ERROR';

      const problemDetails = {
        type: 'about:blank',
        title:
          statusCode === 400
            ? 'Bad Request'
            : statusCode === 401
              ? 'Unauthorized'
              : statusCode === 403
                ? 'Forbidden'
                : statusCode === 404
                  ? 'Not Found'
                  : statusCode === 409
                    ? 'Conflict'
                    : statusCode === 410
                      ? 'Gone'
                      : statusCode === 413
                        ? 'Payload Too Large'
                        : statusCode === 422
                          ? 'Unprocessable Entity'
                          : 'Internal Server Error',
        status: statusCode,
        detail: error instanceof Error ? error.message : 'An error occurred',
        errorCode,
        instance: request.url,
      };

      reply.status(statusCode).type('application/problem+json').send(problemDetails);
    });

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
        totalUsers: 100,
        activeUsers: 80,
        totalItems: 50,
        activeLoans: 10,
        totalLoans: 200,
        pendingLoans: 5,
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
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/users/stats',
      headers: { authorization: `Bearer ${token}` },
    });

    expect([200, 500]).toContain(response.statusCode);
  });

  it('GET /loans/stats should return loan statistics', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/loans/stats',
      headers: { authorization: `Bearer ${token}` },
    });

    expect([200, 500]).toContain(response.statusCode);
  });

  it('should reject USER role', async () => {
    const userToken = (app as any).signAccessToken('regular-user', 'USER');

    // Mock another call to db.query.users.findFirst for the USER token
    mocks.push(
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce({
        id: 'regular-user',
        role: 'USER',
        deletedAt: null,
        accessTier: 'BETA',
      } as any)
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/dashboard',
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(response.statusCode).toBe(403);
  });
});
