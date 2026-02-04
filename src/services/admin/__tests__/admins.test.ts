import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import * as cryptoModule from '../../crypto/index.js';
import {
  changeAdminRole,
  getAuditLog,
  listAdmins,
  promoteToAdmin,
  removeAdmin,
} from '../admins.js';

describe('Admin Management Service', () => {
  beforeEach(() => {
    // Reset mocks
  });

  describe('listAdmins', () => {
    it('should return all non-USER roles', async () => {
      const mockAdmins = [
        {
          id: '1',
          role: 'SUPER_ADMIN',
          emailEncrypted: 'enc',
          nameEncrypted: 'enc',
        },
        {
          id: '2',
          role: 'MODERATOR',
          emailEncrypted: 'enc',
          nameEncrypted: 'enc',
        },
      ];

      spyOn(cryptoModule, 'decrypt')
        .mockReturnValueOnce('admin1@example.com')
        .mockReturnValueOnce('Admin One')
        .mockReturnValueOnce('admin2@example.com')
        .mockReturnValueOnce('Admin Two');

      spyOn(db.query.users, 'findMany').mockResolvedValueOnce(mockAdmins as any);

      const admins = await listAdmins();

      expect(admins).toHaveLength(2);
      expect(admins[0]?.role).toBe('SUPER_ADMIN');
    });
  });

  describe('promoteToAdmin', () => {
    it('should update user role and log action', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) })),
      } as any);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);

      await promoteToAdmin('user-1', 'MODERATOR', 'admin-1', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
    });
  });

  describe('changeAdminRole', () => {
    it('should change admin role and log action', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) })),
      } as any);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);

      await changeAdminRole('admin-1', 'SUPPORT', 'super-admin-1', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
    });
  });

  describe('removeAdmin', () => {
    it('should remove admin role and log action', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) })),
      } as any);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);

      await removeAdmin('admin-1', 'super-admin-1', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
    });
  });

  describe('getAuditLog', () => {
    it('should return paginated audit log entries', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          adminId: 'admin-1',
          action: 'user_blocked',
          targetType: 'user',
          targetId: 'user-1',
          metadata: JSON.stringify({ reason: 'Spam' }),
          ipAddress: '192.168.1.1',
          createdAt: new Date(),
          admin: {
            id: 'admin-1',
            role: 'SUPER_ADMIN',
            emailEncrypted: 'enc',
            nameEncrypted: 'enc',
          },
        },
      ];

      spyOn(cryptoModule, 'decrypt').mockReturnValueOnce('Admin Name');

      spyOn(db.query.adminAuditLog, 'findMany').mockResolvedValueOnce(mockLogs as any);

      spyOn(db, 'select').mockReturnValue({
        from: () => Promise.resolve([{ count: 1 }]),
      } as any);

      const result = await getAuditLog({ page: 1, limit: 50 });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]?.action).toBe('user_blocked');
      expect(result.pagination.total).toBe(1);
    });
  });
});
