import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { db } from '../../db/index.js';
import { ForbiddenError } from '../../errors/index.js';
import jwtPlugin from '../jwt.js';

describe('JWT Plugin with Role', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(jwtPlugin);
  });

  it('should sign token with userId and role', () => {
    const token = (app as any).signAccessToken('user-123', 'SUPER_ADMIN');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded = app.jwt.verify(token) as any;
    expect(decoded.userId).toBe('user-123');
    expect(decoded.role).toBe('SUPER_ADMIN');
  });

  it('should default to USER role if not provided', () => {
    const token = (app as any).signAccessToken('user-456');
    const decoded = app.jwt.verify(token) as any;
    expect(decoded.role).toBe('USER');
  });

  it('should sign refresh token with role', () => {
    const token = (app as any).signRefreshToken('user-789', 'MODERATOR');
    const decoded = app.jwt.verify(token) as any;
    expect(decoded.userId).toBe('user-789');
    expect(decoded.role).toBe('MODERATOR');
  });
});

describe('JWT Plugin Beta Mode Verification (BETA_MODE_ENABLED=true)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(jwtPlugin);
  });

  it('should allow USER with BETA accessTier', async () => {
    const mockBetaUser = {
      id: 'beta-user-123',
      accessTier: 'BETA',
      role: 'USER',
      deletedAt: null,
    };

    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockBetaUser as any);

    const token = (app as any).signAccessToken('beta-user-123', 'USER');

    const request = {
      jwtVerify: async () => app.jwt.verify(token),
      user: undefined as unknown,
    } as any;

    const authenticate = (app as any).authenticate;
    await authenticate(request, {});

    expect(request.user).toBeDefined();
    expect(request.user.userId).toBe('beta-user-123');
    expect(request.user.role).toBe('USER');
  });

  it('should block USER with PUBLIC accessTier', async () => {
    const mockPublicUser = {
      id: 'public-user-123',
      accessTier: 'PUBLIC',
      role: 'USER',
      deletedAt: null,
    };

    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockPublicUser as any);

    const token = (app as any).signAccessToken('public-user-123', 'USER');

    const request = {
      jwtVerify: async () => app.jwt.verify(token),
      user: undefined as unknown,
    } as any;

    const authenticate = (app as any).authenticate;

    expect(async () => await authenticate(request, {})).toThrow(ForbiddenError);
  });

  it('should allow ADMIN role regardless of accessTier', async () => {
    const mockAdminUser = {
      id: 'admin-123',
      accessTier: 'PUBLIC',
      role: 'SUPER_ADMIN',
      deletedAt: null,
    };

    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockAdminUser as any);

    const token = (app as any).signAccessToken('admin-123', 'SUPER_ADMIN');

    const request = {
      jwtVerify: async () => app.jwt.verify(token),
      user: undefined as unknown,
    } as any;

    const authenticate = (app as any).authenticate;
    await authenticate(request, {});

    expect(request.user).toBeDefined();
    expect(request.user.userId).toBe('admin-123');
  });

  it('should block deleted user even with BETA accessTier', async () => {
    const mockDeletedUser = {
      id: 'deleted-user-123',
      accessTier: 'BETA',
      role: 'USER',
      deletedAt: new Date(),
    };

    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockDeletedUser as any);

    const token = (app as any).signAccessToken('deleted-user-123', 'USER');

    const request = {
      jwtVerify: async () => app.jwt.verify(token),
      user: undefined as unknown,
    } as any;

    const authenticate = (app as any).authenticate;

    expect(async () => await authenticate(request, {})).toThrow(ForbiddenError);
  });

  it('should block user not found in database', async () => {
    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(undefined);

    const token = (app as any).signAccessToken('missing-user-123', 'USER');

    const request = {
      jwtVerify: async () => app.jwt.verify(token),
      user: undefined as unknown,
    } as any;

    const authenticate = (app as any).authenticate;

    expect(async () => await authenticate(request, {})).toThrow(ForbiddenError);
  });
});
