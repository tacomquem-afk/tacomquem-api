import { describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';

describe('Beta Program Service', () => {
  describe('listBetaUsers', () => {
    it('should list beta users with pagination', async () => {
      const { listBetaUsers } = await import('../beta-program.js');

      const mockUsers = [
        {
          id: '1',
          emailEncrypted: 'iv:auth:encrypted@email.com',
          nameEncrypted: 'iv:auth:encrypted name',
          accessTier: 'BETA',
          betaAddedAt: new Date('2024-01-01'),
          emailVerified: true,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: '2',
          emailEncrypted: 'iv:auth:encrypted2@email.com',
          nameEncrypted: 'iv:auth:encrypted name 2',
          accessTier: 'BETA',
          betaAddedAt: new Date('2024-01-02'),
          emailVerified: false,
          createdAt: new Date('2024-01-02'),
        },
      ];

      const mockCount = [{ count: 2 }];

      spyOn(db.query.users, 'findMany').mockResolvedValue(mockUsers as any);
      spyOn(db, 'select').mockReturnValue({
        from: mock(() => ({ where: mock(() => mockResolve(mockCount)) })),
      } as any);

      const result = await listBetaUsers({ page: 1, limit: 10 });

      expect(result.users).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });

    it('should return empty list when no beta users exist', async () => {
      const { listBetaUsers } = await import('../beta-program.js');

      spyOn(db.query.users, 'findMany').mockResolvedValue([]);
      spyOn(db, 'select').mockReturnValue({
        from: mock(() => ({ where: mock(() => mockResolve([{ count: 0 }])) })),
      } as any);

      const result = await listBetaUsers({ page: 1, limit: 10 });

      expect(result.users).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('addBetaUser', () => {
    it('should add user to beta program', async () => {
      const { addBetaUser } = await import('../beta-program.js');

      const mockUser = {
        id: 'user-1',
        emailEncrypted: 'iv:auth:encrypted@email.com',
        nameEncrypted: 'iv:auth:encrypted name',
        accessTier: 'PUBLIC',
        isActive: true,
        betaAddedAt: null,
        emailVerified: true,
        createdAt: new Date('2024-01-01'),
      };

      const updatedUser = {
        ...mockUser,
        accessTier: 'BETA',
        betaAddedAt: new Date('2024-01-15'),
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);
      spyOn(db, 'insert').mockReturnValue({
        values: mock(() => mockResolve(undefined)),
      } as any);
      spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() => mockResolve([updatedUser])),
          })),
        })),
      } as any);

      const result = await addBetaUser({
        email: 'test@example.com',
        adminId: 'admin-1',
        reason: 'Early tester',
      });

      expect(result.accessTier).toBe('BETA');
      expect(result.betaAddedAt).toBeTruthy();
    });

    it('should throw error when user not found', async () => {
      const { addBetaUser } = await import('../beta-program.js');

      spyOn(db.query.users, 'findFirst').mockResolvedValue(undefined);

      await expect(
        addBetaUser({
          email: 'nonexistent@example.com',
          adminId: 'admin-1',
        })
      ).rejects.toThrow('User not found');
    });

    it('should throw error when user is blocked', async () => {
      const { addBetaUser } = await import('../beta-program.js');

      const mockUser = {
        id: 'user-1',
        emailEncrypted: 'iv:auth:encrypted@email.com',
        nameEncrypted: 'iv:auth:encrypted name',
        accessTier: 'PUBLIC',
        isActive: false,
        betaAddedAt: null,
        emailVerified: true,
        createdAt: new Date('2024-01-01'),
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValue(mockUser as any);

      await expect(
        addBetaUser({
          email: 'test@example.com',
          adminId: 'admin-1',
        })
      ).rejects.toThrow('Cannot add blocked user to beta program');
    });

    it('should throw error when user is already in beta', async () => {
      const { addBetaUser } = await import('../beta-program.js');

      const mockUser = {
        id: 'user-1',
        emailEncrypted: 'iv:auth:encrypted@email.com',
        nameEncrypted: 'iv:auth:encrypted name',
        accessTier: 'BETA',
        isActive: true,
        betaAddedAt: new Date('2024-01-01'),
        emailVerified: true,
        createdAt: new Date('2024-01-01'),
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValue(mockUser as any);

      await expect(
        addBetaUser({
          email: 'test@example.com',
          adminId: 'admin-1',
        })
      ).rejects.toThrow('User is already in beta program');
    });
  });

  describe('removeBetaUser', () => {
    it('should remove user from beta program', async () => {
      const { removeBetaUser } = await import('../beta-program.js');

      const mockUser = {
        id: 'user-1',
        emailEncrypted: 'iv:auth:encrypted@email.com',
        nameEncrypted: 'iv:auth:encrypted name',
        accessTier: 'BETA',
        isActive: true,
        betaAddedAt: new Date('2024-01-01'),
        emailVerified: true,
        createdAt: new Date('2024-01-01'),
      };

      const updatedUser = {
        ...mockUser,
        accessTier: 'PUBLIC',
        betaAddedAt: null,
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);
      spyOn(db, 'insert').mockReturnValue({
        values: mock(() => mockResolve(undefined)),
      } as any);
      spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() => mockResolve([updatedUser])),
          })),
        })),
      } as any);

      const result = await removeBetaUser({
        userId: 'user-1',
        adminId: 'admin-1',
        reason: 'Removed from program',
      });

      expect(result.accessTier).toBe('PUBLIC');
      expect(result.betaAddedAt).toBeNull();
    });

    it('should throw error when user not found', async () => {
      const { removeBetaUser } = await import('../beta-program.js');

      spyOn(db.query.users, 'findFirst').mockResolvedValue(undefined);

      await expect(
        removeBetaUser({
          userId: 'nonexistent-user',
          adminId: 'admin-1',
        })
      ).rejects.toThrow('User not found');
    });

    it('should throw error when user is not in beta program', async () => {
      const { removeBetaUser } = await import('../beta-program.js');

      const mockUser = {
        id: 'user-1',
        emailEncrypted: 'iv:auth:encrypted@email.com',
        nameEncrypted: 'iv:auth:encrypted name',
        accessTier: 'PUBLIC',
        isActive: true,
        betaAddedAt: null,
        emailVerified: true,
        createdAt: new Date('2024-01-01'),
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValue(mockUser as any);

      await expect(
        removeBetaUser({
          userId: 'user-1',
          adminId: 'admin-1',
        })
      ).rejects.toThrow('User is not in beta program');
    });
  });
});

function mockResolve<T>(value: T) {
  return Promise.resolve(value);
}
