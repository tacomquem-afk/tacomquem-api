import { describe, it, expect, mock, spyOn } from 'bun:test';
import * as accountDeletion from '../index';
import { db } from '../../../db';
import * as crypto from '../../crypto/index';
import * as email from '../../email/index';

describe('Account Deletion Service', () => {
  const testUserId = 'test-user-id';
  const mockUser = {
    id: testUserId,
    emailEncrypted: 'user@example.com',
    nameEncrypted: 'Test User',
    emailHash: 'hash123',
    deletionStatus: 'active' as const,
    deletionRequestedAt: null,
    deletionScheduledFor: null,
    deletionCancelledAt: null,
  };

  it('should schedule deletion and send email', async () => {
    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser);
    spyOn(crypto, 'generateToken').mockResolvedValueOnce('token123');
    spyOn(db, 'insert').mockReturnValueOnce({
      values: mock(() => Promise.resolve()),
    });
    spyOn(db, 'update').mockReturnValueOnce({
      set: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    });
    spyOn(email, 'sendEmail').mockResolvedValueOnce(undefined);

    const result = await accountDeletion.scheduleDeletion({
      userId: testUserId,
      reason: 'Not using anymore',
    });

    expect(result.status).toBe('success');
    expect(result.message).toContain('15 dias');
  });

  it('should prevent scheduling deletion twice', async () => {
    const userWithPendingDeletion = {
      ...mockUser,
      deletionStatus: 'pending' as const,
    };

    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(userWithPendingDeletion);

    try {
      await accountDeletion.scheduleDeletion({ userId: testUserId });
      expect.unreachable('Should have thrown error');
    } catch (error) {
      expect(error instanceof Error && error.message).toContain('already scheduled');
    }
  });

  it('should cancel deletion with valid token', async () => {
    const mockToken = {
      id: 'token-id',
      userId: testUserId,
      token: 'valid-token',
      type: 'cancel',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      usedAt: null,
    };

    spyOn(db.query.deletionTokens, 'findFirst').mockResolvedValueOnce(mockToken);
    spyOn(db, 'update').mockReturnValueOnce({
      set: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    });

    const result = await accountDeletion.cancelDeletionWithToken('valid-token');

    expect(result.status).toBe('success');
    expect(result.message).toContain('Exclusão cancelada');
  });

  it('should reject expired cancellation token', async () => {
    const expiredToken = {
      id: 'token-id',
      userId: testUserId,
      token: 'expired-token',
      type: 'cancel',
      expiresAt: new Date(Date.now() - 1000), // expired
      usedAt: null,
    };

    spyOn(db.query.deletionTokens, 'findFirst').mockResolvedValueOnce(expiredToken);

    try {
      await accountDeletion.cancelDeletionWithToken('expired-token');
      expect.unreachable('Should have thrown error');
    } catch (error) {
      expect(error instanceof Error && error.message).toContain('expired');
    }
  });

  it('should get deletion status correctly', async () => {
    const userWithPendingDeletion = {
      ...mockUser,
      deletionStatus: 'pending' as const,
      deletionRequestedAt: new Date(),
      deletionScheduledFor: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    };

    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(userWithPendingDeletion);

    const status = await accountDeletion.getDeletionStatus(testUserId);

    expect(status.status).toBe('pending');
    expect(status.canCancel).toBe(true);
    expect(status.scheduledFor).toBeDefined();
  });

  it('should process pending deletions', async () => {
    const userForDeletion = {
      ...mockUser,
      id: 'delete-user-id',
      deletionStatus: 'pending' as const,
      deletionScheduledFor: new Date(Date.now() - 1000), // past due
    };

    spyOn(db.query.users, 'findMany').mockResolvedValueOnce([userForDeletion]);
    spyOn(db, 'update').mockReturnValue({
      set: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    });
    spyOn(db, 'delete').mockReturnValue({
      where: mock(() => Promise.resolve()),
    });

    const results = await accountDeletion.processPendingDeletions();

    expect(results).toBeArray();
    expect(results[0].status).toBe('success');
  });

  it('should cancel deletion for authenticated user', async () => {
    const userWithPendingDeletion = {
      ...mockUser,
      deletionStatus: 'pending' as const,
    };

    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(userWithPendingDeletion);
    spyOn(db, 'update').mockReturnValueOnce({
      set: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    });

    const result = await accountDeletion.cancelDeletion(testUserId);

    expect(result.status).toBe('success');
  });

  it('should prevent cancelling if no deletion scheduled', async () => {
    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser);

    try {
      await accountDeletion.cancelDeletion(testUserId);
      expect.unreachable('Should have thrown error');
    } catch (error) {
      expect(error instanceof Error && error.message).toContain('No active');
    }
  });

  it('should force delete user immediately', async () => {
    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser);
    spyOn(db, 'update').mockReturnValue({
      set: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    });
    spyOn(db, 'delete').mockReturnValue({
      where: mock(() => Promise.resolve()),
    });

    const result = await accountDeletion.forceDeleteUser(testUserId);

    expect(result.status).toBe('success');
    expect(result.userId).toBe(testUserId);
  });
});
