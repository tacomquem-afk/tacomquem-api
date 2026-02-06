import { beforeEach, describe, expect, it } from 'bun:test';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import Fastify from 'fastify';

import { ErrorCodes, ForbiddenError, UnauthorizedError } from '../../errors/index.js';
import rbacPlugin from '../rbac.js';

describe('RBAC Plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();

    // Register mock JWT plugin with proper name
    await app.register(
      async (fastify: FastifyInstance) => {
        fastify.decorate('authenticate', async (_request: FastifyRequest) => {
          // Mock authenticate - does nothing in tests
        });
      },
      { name: 'jwt' }
    );

    await app.register(rbacPlugin);
  });

  it('should register requireRole decorator', () => {
    expect((app as any).requireRole).toBeDefined();
    expect(typeof (app as any).requireRole).toBe('function');
  });

  it('should return 401 if user is not authenticated', async () => {
    const handler = (app as any).requireRole('SUPER_ADMIN');
    const mockRequest = { user: null } as any;

    let error: Error | null = null;
    try {
      await handler(mockRequest);
    } catch (_error) {
      error = _error as Error;
    }

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as any)?.code).toBe(ErrorCodes.AUTH_UNAUTHORIZED);
    expect(error?.message).toBe('Authentication required');
  });

  it('should return 403 if user role is insufficient', async () => {
    const handler = (app as any).requireRole('SUPER_ADMIN');
    const mockRequest = { user: { userId: 'test', role: 'USER' } } as any;

    let error: Error | null = null;
    try {
      await handler(mockRequest);
    } catch (_error) {
      error = _error as Error;
    }

    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as any)?.code).toBe(ErrorCodes.ADMIN_INSUFFICIENT_PERMISSIONS);
    expect(error?.message).toBe('Insufficient permissions for this role');
  });

  it('should allow access if user has exact role', async () => {
    const handler = (app as any).requireRole('MODERATOR');
    const mockRequest = { user: { userId: 'test', role: 'MODERATOR' } } as any;

    let error: Error | null = null;
    try {
      await handler(mockRequest);
    } catch (_error) {
      error = _error as Error;
    }

    expect(error).toBeNull();
  });

  it('should allow access if user has higher role in hierarchy', async () => {
    const handler = (app as any).requireRole('ANALYST');
    const mockRequest = { user: { userId: 'test', role: 'SUPER_ADMIN' } } as any;

    let error: Error | null = null;
    try {
      await handler(mockRequest);
    } catch (_error) {
      error = _error as Error;
    }

    expect(error).toBeNull();
  });

  it('should accept array of roles', async () => {
    const handler = (app as any).requireRole(['ANALYST', 'SUPPORT']);
    const mockRequest = { user: { userId: 'test', role: 'SUPPORT' } } as any;

    let error: Error | null = null;
    try {
      await handler(mockRequest);
    } catch (_error) {
      error = _error as Error;
    }

    expect(error).toBeNull();
  });
});
