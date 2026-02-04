import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { createSuperAdmin, findUserByEmailHash } from '../create-admin.js';

describe('Create Admin Script', () => {
  const mockEmail = 'admin@test.com';
  const mockPassword = 'SecurePass123!';
  const mockName = 'Admin User';

  beforeEach(() => {
    // Reset mocks
  });

  it('should create new SUPER_ADMIN if user does not exist', async () => {
    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(null);

    const updateSpy = spyOn(db, 'update');
    const insertSpy = spyOn(db, 'insert').mockReturnValue({
      values: mock(() => ({
        returning: mock(() => Promise.resolve([{ id: 'new-user-id' }])),
      })),
    } as any);

    const result = await createSuperAdmin(mockEmail, mockPassword, mockName);

    expect(result.created).toBe(true);
    expect(result.userId).toBe('new-user-id');
    expect(insertSpy).toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('should promote existing user to SUPER_ADMIN', async () => {
    const existingUser = {
      id: 'existing-user-id',
      role: 'USER',
      emailHash: 'hash123',
    };

    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(existingUser as any);

    const updateSpy = spyOn(db, 'update').mockReturnValue({
      set: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    } as any);

    const result = await createSuperAdmin(mockEmail, mockPassword, mockName);

    expect(result.created).toBe(false);
    expect(result.userId).toBe('existing-user-id');
    expect(updateSpy).toHaveBeenCalled();
  });

  it('should validate email format', async () => {
    await expect(createSuperAdmin('invalid-email', mockPassword, mockName)).rejects.toThrow();
  });

  it('should validate password minimum length', async () => {
    await expect(createSuperAdmin(mockEmail, 'short', mockName)).rejects.toThrow();
  });

  it('should validate name minimum length', async () => {
    await expect(createSuperAdmin(mockEmail, mockPassword, 'ab')).rejects.toThrow();
  });
});
