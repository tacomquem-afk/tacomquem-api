import { describe, expect, it } from 'bun:test';
import { roleEnum, adminActionEnum } from '../schema.js';

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
