import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import rbacPlugin from '../rbac.js';

describe('RBAC Plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();

    // Register mock JWT plugin with proper name
    await app.register(
      async (fastify: FastifyInstance) => {
        fastify.decorate('authenticate', async (_request: FastifyRequest, _reply: FastifyReply) => {
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
    const mockReply = {
      code: mock((_code: number) => mockReply),
    } as any;

    let error: Error | null = null;
    try {
      await handler(mockRequest, mockReply);
    } catch (e) {
      error = e as Error;
    }

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(error?.message).toBe('Authentication required');
  });

  it('should return 403 if user role is insufficient', async () => {
    const handler = (app as any).requireRole('SUPER_ADMIN');
    const mockRequest = { user: { userId: 'test', role: 'USER' } } as any;
    const mockReply = {
      code: mock((_code: number) => mockReply),
    } as any;

    let error: Error | null = null;
    try {
      await handler(mockRequest, mockReply);
    } catch (e) {
      error = e as Error;
    }

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(error?.message).toBe('Insufficient permissions');
  });

  it('should allow access if user has exact role', async () => {
    const handler = (app as any).requireRole('MODERATOR');
    const mockRequest = { user: { userId: 'test', role: 'MODERATOR' } } as any;
    const mockReply = {
      code: mock(),
      send: mock(),
    } as any;

    await handler(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should allow access if user has higher role in hierarchy', async () => {
    const handler = (app as any).requireRole('ANALYST');
    const mockRequest = { user: { userId: 'test', role: 'SUPER_ADMIN' } } as any;
    const mockReply = {
      code: mock(),
      send: mock(),
    } as any;

    await handler(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
  });

  it('should accept array of roles', async () => {
    const handler = (app as any).requireRole(['ANALYST', 'SUPPORT']);
    const mockRequest = { user: { userId: 'test', role: 'SUPPORT' } } as any;
    const mockReply = {
      code: mock(),
      send: mock(),
    } as any;

    await handler(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
  });
});
