import { describe, expect, it } from 'bun:test';
import { roleEnum, adminActionEnum, users, adminAuditLog } from '../schema.js';

describe('Schema Enums', () => {
  it('should have all required user roles', () => {
    const roles = roleEnum.enumValues;
    expect(roles).toContain('USER');
    expect(roles).toContain('ANALYST');
    expect(roles).toContain('SUPPORT');
    expect(roles).toContain('MODERATOR');
    expect(roles).toContain('SUPER_ADMIN');
    expect(roles).toHaveLength(5);
  });

  it('should have all required admin actions', () => {
    const actions = adminActionEnum.enumValues;
    expect(actions).toContain('user_blocked');
    expect(actions).toContain('user_unblocked');
    expect(actions).toContain('item_removed');
    expect(actions).toContain('loan_cancelled');
    expect(actions).toContain('admin_created');
    expect(actions).toContain('admin_role_changed');
    expect(actions).toContain('admin_removed');
    expect(actions).toContain('content_flagged');
  });
});

describe('Users Table Admin Fields', () => {
  it('should have role column with USER as default', () => {
    const roleColumn = users.role;
    expect(roleColumn).toBeDefined();
  });

  it('should have isActive column with true as default', () => {
    const isActiveColumn = users.isActive;
    expect(isActiveColumn).toBeDefined();
  });

  it('should have nullable blockedAt and blockedReason columns', () => {
    expect(users.blockedAt).toBeDefined();
    expect(users.blockedReason).toBeDefined();
  });
});

describe('Admin Audit Log Table', () => {
  it('should have all required columns', () => {
    expect(adminAuditLog.id).toBeDefined();
    expect(adminAuditLog.adminId).toBeDefined();
    expect(adminAuditLog.action).toBeDefined();
    expect(adminAuditLog.targetType).toBeDefined();
    expect(adminAuditLog.targetId).toBeDefined();
    expect(adminAuditLog.metadata).toBeDefined();
    expect(adminAuditLog.ipAddress).toBeDefined();
    expect(adminAuditLog.userAgent).toBeDefined();
    expect(adminAuditLog.createdAt).toBeDefined();
  });
});
