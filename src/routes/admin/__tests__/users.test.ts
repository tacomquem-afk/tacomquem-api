import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import jwtPlugin from '../../../plugins/jwt.js';
import rbacPlugin from '../../../plugins/rbac.js';
import * as adminService from '../../../services/admin/index.js';
import userRoutes from '../users.js';

describe('Admin User Routes', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let analystToken: string;
  let supportToken: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(rbacPlugin);
    await app.register(userRoutes, { prefix: '/api/admin/users' });
    await app.ready();

    superAdminToken = (app as any).signAccessToken('super-admin', 'SUPER_ADMIN');
    analystToken = (app as any).signAccessToken('analyst', 'ANALYST');
    supportToken = (app as any).signAccessToken('support', 'SUPPORT');
  });

  it('GET / should list users', async () => {
    spyOn(adminService, 'listUsers').mockResolvedValueOnce({
      users: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${analystToken}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('GET / should support pagination', async () => {
    spyOn(adminService, 'listUsers').mockResolvedValueOnce({
      users: [],
      pagination: { page: 2, limit: 25, total: 100, totalPages: 4 },
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users?page=2&limit=25',
      headers: { authorization: `Bearer ${analystToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.pagination.page).toBe(2);
  });

  it('GET /:id should get user details', async () => {
    spyOn(adminService, 'getUserDetails').mockResolvedValueOnce({
      id: 'user-123',
      email: 'jo***@example.com',
      name: 'John D***',
      role: 'USER',
      isActive: true,
      emailVerified: true,
      blockedAt: null,
      blockedReason: null,
      lentLoans: [],
      borrowedLoans: [],
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users/user-123',
      headers: { authorization: `Bearer ${supportToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.email).toContain('***');
  });

  it('GET /:id should return 404 if user not found', async () => {
    spyOn(adminService, 'getUserDetails').mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users/nonexistent',
      headers: { authorization: `Bearer ${supportToken}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it('POST /:id/block should require SUPER_ADMIN', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/user-123/block',
      headers: { authorization: `Bearer ${analystToken}` },
      payload: { reason: 'Test reason for blocking' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('POST /:id/block should block user as SUPER_ADMIN', async () => {
    spyOn(adminService, 'blockUser').mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/user-123/block',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { reason: 'Valid reason for blocking user' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('POST /:id/unblock should unblock user', async () => {
    spyOn(adminService, 'unblockUser').mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/user-123/unblock',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });
});
