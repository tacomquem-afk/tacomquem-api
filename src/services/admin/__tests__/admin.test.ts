import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import { adminAuditLog } from '../../../db/schema.js';
import * as cryptoModule from '../../crypto/index.js';
import { blockUser, getUserDetails, listUsers, logAdminAction, unblockUser } from '../index.js';

describe('Admin User Management Service', () => {
  beforeEach(() => {
    // Reset mocks
  });

  describe('listUsers', () => {
    it('should return paginated users with masked data', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          emailEncrypted: 'encrypted-email',
          nameEncrypted: 'encrypted-name',
          role: 'USER',
          isActive: true,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lentLoans: [],
          borrowedLoans: [],
          items: [],
        },
      ];

      spyOn(cryptoModule, 'decrypt')
        .mockReturnValueOnce('john@example.com')
        .mockReturnValueOnce('John Doe');

      spyOn(db.query.users, 'findMany').mockResolvedValueOnce(mockUsers as any);
      spyOn(db, 'select').mockReturnValue({
        from: mock(() => ({
          where: mock(() => Promise.resolve([{ count: 1 }])),
        })),
      } as any);

      const result = await listUsers({ page: 1, limit: 50 });

      expect(result.users).toHaveLength(1);
      expect(result.users[0]?.email).toContain('***');
      expect(result.users[0]?.name).toContain('***');
      expect(result.pagination.total).toBe(1);
    });

    it('should filter by role', async () => {
      spyOn(db.query.users, 'findMany').mockResolvedValueOnce([]);
      spyOn(db, 'select').mockReturnValue({
        from: mock(() => ({
          where: mock(() => Promise.resolve([{ count: 0 }])),
        })),
      } as any);

      const result = await listUsers({ page: 1, limit: 50, role: 'MODERATOR' as any });

      expect(result.users).toHaveLength(0);
    });
  });

  describe('getUserDetails', () => {
    it('should return user details with masked PII', async () => {
      const mockUser = {
        id: 'user-1',
        emailEncrypted: 'encrypted',
        nameEncrypted: 'encrypted',
        role: 'USER',
        isActive: true,
        blockedAt: null,
        blockedReason: null,
        lentLoans: [],
        borrowedLoans: [],
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      spyOn(cryptoModule, 'decrypt')
        .mockReturnValueOnce('john@example.com')
        .mockReturnValueOnce('John Doe');

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      const result = await getUserDetails('user-1');

      expect(result).toBeDefined();
      expect(result?.email).toContain('***');
      expect(result?.name).toContain('***');
    });

    it('should return null if user not found', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(null as any);

      const result = await getUserDetails('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('blockUser', () => {
    it('should block user and create audit log', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) })),
      } as any);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);

      await blockUser('user-1', 'admin-1', 'Spam behavior', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalledWith(adminAuditLog);
    });
  });

  describe('unblockUser', () => {
    it('should unblock user and create audit log', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) })),
      } as any);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);

      await unblockUser('user-1', 'admin-1', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalledWith(adminAuditLog);
    });
  });

  describe('logAdminAction', () => {
    it('should create audit log entry', async () => {
      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);

      await logAdminAction({
        adminId: 'admin-1',
        action: 'user_blocked',
        targetType: 'user',
        targetId: 'user-1',
        metadata: { reason: 'Test' },
        ipAddress: '192.168.1.1',
      });

      expect(insertSpy).toHaveBeenCalledWith(adminAuditLog);
    });
  });
});
