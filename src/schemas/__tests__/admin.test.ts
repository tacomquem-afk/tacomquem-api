import { describe, expect, it } from 'bun:test';
import {
  listUsersSchema,
  blockUserSchema,
  promoteAdminSchema,
  changeRoleSchema,
  removeContentSchema,
  auditLogQuerySchema
} from '../admin.js';

describe('Admin Schemas', () => {
  describe('listUsersSchema', () => {
    it('should parse valid query params', () => {
      const result = listUsersSchema.parse({
        page: '1',
        limit: '50',
        role: 'MODERATOR'
      });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.role).toBe('MODERATOR');
    });

    it('should use defaults for missing params', () => {
      const result = listUsersSchema.parse({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.sortBy).toBe('createdAt');
      expect(result.sortOrder).toBe('desc');
    });

    it('should enforce max limit of 100', () => {
      expect(() => listUsersSchema.parse({ limit: '200' })).toThrow();
      const result = listUsersSchema.parse({ limit: '100' });
      expect(result.limit).toBe(100);
    });

    it('should accept isActive as boolean', () => {
      const result = listUsersSchema.parse({ isActive: 'true' });
      expect(result.isActive).toBe(true);
    });
  });

  describe('blockUserSchema', () => {
    it('should require reason with min 10 chars', () => {
      expect(() => blockUserSchema.parse({ reason: 'short' })).toThrow();
      expect(() => blockUserSchema.parse({ reason: 'This is a valid reason' })).not.toThrow();
    });
  });

  describe('removeContentSchema', () => {
    it('should validate remove reason', () => {
      expect(() => removeContentSchema.parse({ reason: 'short' })).toThrow();
      expect(() => removeContentSchema.parse({ reason: 'Inappropriate content found' })).not.toThrow();
    });
  });

  describe('promoteAdminSchema', () => {
    it('should validate userId as UUID', () => {
      expect(() => promoteAdminSchema.parse({ userId: 'not-uuid', role: 'MODERATOR' })).toThrow();
    });

    it('should accept valid UUID and role', () => {
      const result = promoteAdminSchema.parse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'MODERATOR'
      });
      expect(result.userId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.role).toBe('MODERATOR');
    });

    it('should reject USER role', () => {
      expect(() => promoteAdminSchema.parse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'USER'
      })).toThrow();
    });
  });

  describe('changeRoleSchema', () => {
    it('should accept valid admin roles', () => {
      const result = changeRoleSchema.parse({ role: 'SUPER_ADMIN' });
      expect(result.role).toBe('SUPER_ADMIN');
    });

    it('should reject USER role', () => {
      expect(() => changeRoleSchema.parse({ role: 'USER' })).toThrow();
    });
  });

  describe('auditLogQuerySchema', () => {
    it('should parse pagination params', () => {
      const result = auditLogQuerySchema.parse({ page: '1', limit: '50' });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should use defaults', () => {
      const result = auditLogQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });
  });
});
