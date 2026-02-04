import { beforeEach, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
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
