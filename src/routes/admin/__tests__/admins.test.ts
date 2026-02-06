import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { validatorCompiler } from 'fastify-type-provider-zod';

import jwtPlugin from '../../../plugins/jwt.js';
import rbacPlugin from '../../../plugins/rbac.js';
import * as adminsModule from '../../../services/admin/admins.js';
import adminsRoutes from '../admins.js';

const mocks: Array<{ mockRestore: () => void }> = [];

describe('Admin Management Routes', () => {
  let app: FastifyInstance;
  let superAdminToken: string;

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
    app.setValidatorCompiler(validatorCompiler);
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

    await app.register(adminsRoutes, { prefix: '/api/admin/admins' });
    await app.ready();

    superAdminToken = (app as any).signAccessToken('super-admin', 'SUPER_ADMIN');
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

  it('GET / should list all admins', async () => {
    mocks.push(
      spyOn(adminsModule, 'listAdmins').mockResolvedValueOnce([
        {
          id: 'admin-1',
          email: 'ad***@example.com',
          name: 'Admin U***',
          role: 'SUPER_ADMIN',
          isActive: true,
          createdAt: new Date(),
        },
      ] as any)
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/admins',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('POST / should promote user to admin', async () => {
    mocks.push(spyOn(adminsModule, 'promoteToAdmin').mockResolvedValueOnce(undefined));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/admins',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'MODERATOR',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('PATCH /:id/role should change admin role', async () => {
    mocks.push(spyOn(adminsModule, 'changeAdminRole').mockResolvedValueOnce(undefined));

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/admins/550e8400-e29b-41d4-a716-446655440000/role',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { role: 'ANALYST' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('DELETE /:id should remove admin', async () => {
    mocks.push(spyOn(adminsModule, 'removeAdmin').mockResolvedValueOnce(undefined));

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/admins/550e8400-e29b-41d4-a716-446655440000',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('GET /audit-log should return audit log', async () => {
    mocks.push(
      spyOn(adminsModule, 'getAuditLog').mockResolvedValueOnce({
        logs: [
          {
            id: 'log-1',
            action: 'user_blocked',
            admin: {
              id: 'admin-1',
              email: 'ad***@example.com',
              name: 'Admin U***',
              role: 'SUPER_ADMIN',
            },
            targetType: 'user',
            targetId: 'user-1',
            metadata: { reason: 'Spam' },
            ipAddress: '192.168.1.1',
            createdAt: new Date(),
          },
        ],
        pagination: { page: 1, limit: 50 },
      } as any)
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/admins/audit-log',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(response.statusCode).toBe(200);
  });
});
