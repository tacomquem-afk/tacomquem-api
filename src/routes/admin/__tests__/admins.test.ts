import { beforeEach, describe, expect, it, mock } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';

const mockListAdmins = mock(() => Promise.resolve([]));
const mockPromoteToAdmin = mock(() => Promise.resolve());
const mockChangeAdminRole = mock(() => Promise.resolve());
const mockRemoveAdmin = mock(() => Promise.resolve());
const mockGetAuditLog = mock(() =>
  Promise.resolve({ logs: [], pagination: { page: 1, limit: 50 } })
);

mock.module('../../../services/admin/admins.js', () => ({
  listAdmins: mockListAdmins,
  promoteToAdmin: mockPromoteToAdmin,
  changeAdminRole: mockChangeAdminRole,
  removeAdmin: mockRemoveAdmin,
  getAuditLog: mockGetAuditLog,
}));

import jwtPlugin from '../../../plugins/jwt.js';
import rbacPlugin from '../../../plugins/rbac.js';
import adminsRoutes from '../admins.js';

describe('Admin Management Routes', () => {
  let app: FastifyInstance;
  let superAdminToken: string;

  beforeEach(async () => {
    mockListAdmins.mockReset();
    mockListAdmins.mockImplementation(() => Promise.resolve([]));
    mockPromoteToAdmin.mockReset();
    mockPromoteToAdmin.mockImplementation(() => Promise.resolve());
    mockChangeAdminRole.mockReset();
    mockChangeAdminRole.mockImplementation(() => Promise.resolve());
    mockRemoveAdmin.mockReset();
    mockRemoveAdmin.mockImplementation(() => Promise.resolve());
    mockGetAuditLog.mockReset();
    mockGetAuditLog.mockImplementation(() =>
      Promise.resolve({ logs: [], pagination: { page: 1, limit: 50 } })
    );

    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(rbacPlugin);
    await app.register(adminsRoutes, { prefix: '/api/admin/admins' });
    await app.ready();

    superAdminToken = (app as any).signAccessToken('super-admin', 'SUPER_ADMIN');
  });

  it('GET / should list all admins', async () => {
    mockListAdmins.mockResolvedValueOnce([
      {
        id: 'admin-1',
        email: 'ad***@example.com',
        name: 'Admin U***',
        role: 'SUPER_ADMIN',
        isActive: true,
        createdAt: new Date(),
      },
    ] as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/admins',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('POST / should promote user to admin', async () => {
    mockPromoteToAdmin.mockResolvedValueOnce(undefined);

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
    mockChangeAdminRole.mockResolvedValueOnce(undefined);

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
    mockRemoveAdmin.mockResolvedValueOnce(undefined);

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
    mockGetAuditLog.mockResolvedValueOnce({
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
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/admins/audit-log',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(response.statusCode).toBe(200);
  });
});
