import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { db } from '../../db/index.js';
import { findAdminByEmail, parseEmails, processEmailBatch } from '../bulk-add-beta-users.js';

describe('bulk-add-beta-users script helpers', () => {
  beforeEach(() => {
    // no-op (spies are restored in afterEach)
  });

  afterEach(async () => {
    // Best-effort restore for spies created on the beta-program module during tests
    try {
      const mod = await import('../../services/admin/beta-program.js');
      if ((mod as any).addBetaUser && typeof (mod as any).addBetaUser.mockRestore === 'function') {
        (mod as any).addBetaUser.mockRestore();
      }
    } catch (_e) {
      // ignore
    }
  });

  it('parseEmails should parse CSV, ignore comments/header and dedupe', () => {
    const raw = `email,name\n# comment line\nuser1@example.com,User One\nuser2@example.com,User Two\nuser1@example.com,User One Duplicate`;
    const emails = parseEmails(raw);
    expect(emails).toEqual(['user1@example.com', 'user2@example.com']);
  });

  it('processEmailBatch should call addBetaUser for each email and return results', async () => {
    const spy = spyOn(
      await import('../../services/admin/beta-program.js'),
      'addBetaUser'
    ).mockResolvedValue({
      accessTier: 'BETA',
    } as any);

    const results = await processEmailBatch('admin-1', ['a@x.com', 'b@y.com']);

    expect(results).toHaveLength(2);
    expect(results.every((r: any) => r.status === 'added')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('processEmailBatch should capture failures and continue', async () => {
    const mod = await import('../../services/admin/beta-program.js');
    const spy = spyOn(mod, 'addBetaUser')
      .mockResolvedValueOnce({ accessTier: 'BETA' } as any)
      .mockRejectedValueOnce(new Error('User not found'));

    const results = await processEmailBatch('admin-1', ['ok@x.com', 'fail@y.com']);

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe('added');
    expect(results[1]?.status).toBe('failed');
    expect(results[1]?.reason).toContain('User not found');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('findAdminByEmail should query users by emailHash', async () => {
    const fakeAdmin = { id: 'admin-1', role: 'SUPER_ADMIN' } as any;
    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(fakeAdmin);

    const admin = await findAdminByEmail('admin@example.com');
    expect(admin).toBe(fakeAdmin);
    expect(db.query.users.findFirst).toHaveBeenCalled();
  });
});
