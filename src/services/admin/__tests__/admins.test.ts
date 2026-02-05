import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { resetAllDbMocks } from '../../../__tests__/helpers/db-mock-reset.js';
import { db } from '../../../db/index.js';
import * as cryptoModule from '../../crypto/index.js';
import {
  changeAdminRole,
  getAuditLog,
  listAdmins,
  promoteToAdmin,
  removeAdmin,
} from '../admins.js';

const mocks: Array<{ mockRestore: () => void }> = [];

describe('Admin Management Service', () => {
  beforeEach(() => {
    // Reset all db mocks from other test files
    resetAllDbMocks();

    // Clean any leftover mocks from previous tests
    for (const mock of mocks) {
      try {
        mock.mockRestore();
      } catch (_e) {
        // Already restored
      }
    }
    mocks.length = 0;
  });

  afterEach(() => {
    for (const mock of mocks) {
      mock.mockRestore();
    }
    mocks.length = 0;
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

      mocks.push(
        spyOn(cryptoModule, 'decrypt')
          .mockReturnValueOnce('admin1@example.com')
          .mockReturnValueOnce('Admin One')
          .mockReturnValueOnce('admin2@example.com')
          .mockReturnValueOnce('Admin Two')
      );

      mocks.push(spyOn(db.query.users, 'findMany').mockResolvedValueOnce(mockAdmins as any));

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
      mocks.push(updateSpy);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);
      mocks.push(insertSpy);

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
      mocks.push(updateSpy);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);
      mocks.push(insertSpy);

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
      mocks.push(updateSpy);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);
      mocks.push(insertSpy);

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

      mocks.push(spyOn(cryptoModule, 'decrypt').mockReturnValueOnce('Admin Name'));

      mocks.push(spyOn(db.query.adminAuditLog, 'findMany').mockResolvedValueOnce(mockLogs as any));

      mocks.push(
        spyOn(db, 'select').mockReturnValue({
          from: () => Promise.resolve([{ count: 1 }]),
        } as any)
      );

      const result = await getAuditLog({ page: 1, limit: 50 });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]?.action).toBe('user_blocked');
      expect(result.pagination.total).toBe(1);
    });
  });
});
