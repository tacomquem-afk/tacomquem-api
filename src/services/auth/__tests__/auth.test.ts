import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import * as cryptoService from '../../crypto/index.js';
import * as emailService from '../../email/index.js';
import * as passwordService from '../../password/index.js';
import {
  createUser,
  findOrCreateGoogleUser,
  getUserById,
  login,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '../index.js';

beforeEach(() => {
  spyOn(cryptoService, 'encrypt').mockImplementation((text: string) => `encrypted_${text}`);
  spyOn(cryptoService, 'decrypt').mockImplementation((text: string) =>
    text.replace('encrypted_', '')
  );
  spyOn(cryptoService, 'hash').mockImplementation((text: string) => `hash_${text.toLowerCase()}`);

  spyOn(passwordService, 'hashPassword').mockImplementation((password: string) =>
    Promise.resolve(`hashed_${password}`)
  );
  spyOn(passwordService, 'verifyPassword').mockImplementation((password: string, hash: string) =>
    Promise.resolve(hash === `hashed_${password}`)
  );

  spyOn(emailService, 'sendEmail').mockImplementation(() => Promise.resolve(true));
  spyOn(emailService, 'buildVerificationEmail').mockImplementation(
    (name: string, url: string) => `<html>Verify ${name}: ${url}</html>`
  );
  spyOn(emailService, 'buildPasswordResetEmail').mockImplementation(
    (name: string, url: string) => `<html>Reset ${name}: ${url}</html>`
  );
});

describe('auth service', () => {
  describe('createUser', () => {
    it('should create user successfully', async () => {
      const mockUser = {
        id: 'user-123',
        emailEncrypted: 'encrypted_test@example.com',
        nameEncrypted: 'encrypted_Test User',
        emailHash: 'hash_test@example.com',
        passwordHash: 'hashed_password123',
        avatarUrl: null,
        emailVerified: false,
        role: 'USER' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(undefined);

      const returningMockUser = mock(() => Promise.resolve([mockUser]));
      const valuesMockUser = mock(() => ({ returning: returningMockUser }));

      const returningMockToken = mock(() => Promise.resolve([{ id: 'token-123' }]));
      const valuesMockToken = mock(() => ({ returning: returningMockToken }));

      spyOn(db, 'insert')
        .mockReturnValueOnce({ values: valuesMockUser } as any)
        .mockReturnValueOnce({ values: valuesMockToken } as any);

      const result = await createUser({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        avatarUrl: null,
        emailVerified: false,
        role: 'USER',
      });
    });

    it('should throw error if email already exists', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce({
        id: 'existing-user',
        emailHash: 'hash_test@example.com',
      } as any);

      await expect(
        createUser({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
        })
      ).rejects.toThrow('Email já cadastrado');
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', async () => {
      const mockVerification = {
        id: 'token-123',
        userId: 'user-123',
        token: 'valid-token',
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: null,
        user: {
          id: 'user-123',
          emailVerified: false,
        },
      };

      spyOn(db.query.verificationTokens, 'findFirst').mockResolvedValueOnce(
        mockVerification as any
      );

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      const result = await verifyEmail('valid-token');

      expect(result).toBe(true);
    });

    it('should throw error with invalid token', async () => {
      spyOn(db.query.verificationTokens, 'findFirst').mockResolvedValueOnce(undefined);

      await expect(verifyEmail('invalid-token')).rejects.toThrow('Token inválido');
    });

    it('should throw error if token already used', async () => {
      const mockVerification = {
        id: 'token-123',
        userId: 'user-123',
        token: 'used-token',
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: new Date(),
      };

      spyOn(db.query.verificationTokens, 'findFirst').mockResolvedValueOnce(
        mockVerification as any
      );

      await expect(verifyEmail('used-token')).rejects.toThrow('Token já utilizado');
    });

    it('should throw error if token expired', async () => {
      const mockVerification = {
        id: 'token-123',
        userId: 'user-123',
        token: 'expired-token',
        type: 'email_verification',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      };

      spyOn(db.query.verificationTokens, 'findFirst').mockResolvedValueOnce(
        mockVerification as any
      );

      await expect(verifyEmail('expired-token')).rejects.toThrow('Token expirado');
    });

    it('should throw error if token type is invalid', async () => {
      const mockVerification = {
        id: 'token-123',
        userId: 'user-123',
        token: 'wrong-type-token',
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: null,
      };

      spyOn(db.query.verificationTokens, 'findFirst').mockResolvedValueOnce(
        mockVerification as any
      );

      await expect(verifyEmail('wrong-type-token')).rejects.toThrow('Tipo de token inválido');
    });
  });

  describe('login', () => {
    it('should login successfully with correct credentials', async () => {
      const mockUser = {
        id: 'user-123',
        emailEncrypted: 'encrypted_test@example.com',
        nameEncrypted: 'encrypted_Test User',
        emailHash: 'hash_test@example.com',
        passwordHash: 'hashed_password123',
        avatarUrl: 'https://avatar.url',
        emailVerified: true,
        role: 'USER' as const,
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      const result = await login('test@example.com', 'password123');

      expect(result).toEqual({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://avatar.url',
        emailVerified: true,
        role: 'USER',
      });
    });

    it('should throw error with non-existent email', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(undefined);

      await expect(login('nonexistent@example.com', 'password123')).rejects.toThrow(
        'Email ou senha inválidos'
      );
    });

    it('should throw error with incorrect password', async () => {
      const mockUser = {
        id: 'user-123',
        emailHash: 'hash_test@example.com',
        passwordHash: 'hashed_correctpassword',
        role: 'USER' as const,
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      await expect(login('test@example.com', 'wrongpassword')).rejects.toThrow(
        'Email ou senha inválidos'
      );
    });

    it('should throw error when trying to login with password on OAuth account', async () => {
      const mockUser = {
        id: 'user-123',
        emailHash: 'hash_test@example.com',
        passwordHash: null,
        role: 'USER' as const,
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      await expect(login('test@example.com', 'password123')).rejects.toThrow(
        'Use o login social para esta conta'
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('should send reset email for existing user', async () => {
      const mockUser = {
        id: 'user-123',
        emailHash: 'hash_test@example.com',
        nameEncrypted: 'encrypted_Test User',
        role: 'USER' as const,
      };

      const findFirstSpy = spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(
        mockUser as any
      );

      const returningMock = mock(() => Promise.resolve([{}]));
      const valuesMock = mock(() => ({ returning: returningMock }));
      spyOn(db, 'insert').mockReturnValueOnce({ values: valuesMock } as any);

      await requestPasswordReset('test@example.com');

      expect(findFirstSpy).toHaveBeenCalled();
    });

    it('should not throw error for non-existent email', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(undefined);

      await expect(requestPasswordReset('nonexistent@example.com')).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('should reset password with valid token', async () => {
      const mockVerification = {
        id: 'token-123',
        userId: 'user-123',
        token: 'valid-token',
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: null,
      };

      spyOn(db.query.verificationTokens, 'findFirst').mockResolvedValueOnce(
        mockVerification as any
      );

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      const result = await resetPassword('valid-token', 'newpassword123');

      expect(result).toBe(true);
    });

    it('should throw error with invalid token', async () => {
      spyOn(db.query.verificationTokens, 'findFirst').mockResolvedValueOnce(undefined);

      await expect(resetPassword('invalid-token', 'newpassword123')).rejects.toThrow(
        'Token inválido'
      );
    });

    it('should throw error if token already used', async () => {
      const mockVerification = {
        id: 'token-123',
        userId: 'user-123',
        token: 'used-token',
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: new Date(),
      };

      spyOn(db.query.verificationTokens, 'findFirst').mockResolvedValueOnce(
        mockVerification as any
      );

      await expect(resetPassword('used-token', 'newpassword123')).rejects.toThrow(
        'Token já utilizado'
      );
    });

    it('should throw error if token expired', async () => {
      const mockVerification = {
        id: 'token-123',
        userId: 'user-123',
        token: 'expired-token',
        type: 'password_reset',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      };

      spyOn(db.query.verificationTokens, 'findFirst').mockResolvedValueOnce(
        mockVerification as any
      );

      await expect(resetPassword('expired-token', 'newpassword123')).rejects.toThrow(
        'Token expirado'
      );
    });

    it('should throw error if token type is invalid', async () => {
      const mockVerification = {
        id: 'token-123',
        userId: 'user-123',
        token: 'wrong-type-token',
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: null,
      };

      spyOn(db.query.verificationTokens, 'findFirst').mockResolvedValueOnce(
        mockVerification as any
      );

      await expect(resetPassword('wrong-type-token', 'newpassword123')).rejects.toThrow(
        'Tipo de token inválido'
      );
    });
  });

  describe('findOrCreateGoogleUser', () => {
    it('should return existing user with OAuth account', async () => {
      const mockOauth = {
        user: {
          id: 'user-123',
          emailEncrypted: 'encrypted_test@example.com',
          nameEncrypted: 'encrypted_Test User',
          avatarUrl: 'https://avatar.url',
          emailVerified: true,
          role: 'USER' as const,
        },
      };

      spyOn(db.query.oauthAccounts, 'findFirst').mockResolvedValueOnce(mockOauth as any);

      const result = await findOrCreateGoogleUser(
        'google-123',
        'test@example.com',
        'Test User',
        'https://avatar.url'
      );

      expect(result).toEqual({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://avatar.url',
        emailVerified: true,
        role: 'USER',
      });
    });

    it('should link OAuth to existing user by email', async () => {
      const mockUser = {
        id: 'user-123',
        emailEncrypted: 'encrypted_test@example.com',
        nameEncrypted: 'encrypted_Test User',
        emailHash: 'hash_test@example.com',
        avatarUrl: null,
        emailVerified: false,
        role: 'USER' as const,
      };

      spyOn(db.query.oauthAccounts, 'findFirst').mockResolvedValueOnce(undefined);
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      const returningMock = mock(() => Promise.resolve([{}]));
      const valuesMock = mock(() => ({ returning: returningMock }));
      spyOn(db, 'insert').mockReturnValueOnce({ values: valuesMock } as any);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      const result = await findOrCreateGoogleUser(
        'google-123',
        'test@example.com',
        'Test User',
        'https://avatar.url'
      );

      expect(result.id).toBe('user-123');
      expect(result.emailVerified).toBe(true);
    });

    it('should create new user if not exists', async () => {
      const mockUser = {
        id: 'user-new',
        emailEncrypted: 'encrypted_new@example.com',
        nameEncrypted: 'encrypted_New User',
        emailHash: 'hash_new@example.com',
        avatarUrl: 'https://avatar.url',
        emailVerified: true,
        role: 'USER' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      spyOn(db.query.oauthAccounts, 'findFirst').mockResolvedValueOnce(undefined);
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(undefined);

      const returningMock = mock(() => Promise.resolve([mockUser]));
      const valuesMock = mock(() => ({ returning: returningMock }));
      spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);

      const result = await findOrCreateGoogleUser(
        'google-new',
        'new@example.com',
        'New User',
        'https://avatar.url'
      );

      expect(result).toEqual({
        id: 'user-new',
        name: 'New User',
        email: 'new@example.com',
        avatarUrl: 'https://avatar.url',
        emailVerified: true,
        role: 'USER',
      });
    });
  });

  describe('getUserById', () => {
    it('should return user if exists', async () => {
      const mockUser = {
        id: 'user-123',
        emailEncrypted: 'encrypted_test@example.com',
        nameEncrypted: 'encrypted_Test User',
        avatarUrl: 'https://avatar.url',
        emailVerified: true,
        role: 'USER' as const,
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      const result = await getUserById('user-123');

      expect(result).toEqual({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://avatar.url',
        emailVerified: true,
        role: 'USER',
      });
    });

    it('should return null if user does not exist', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(undefined);

      const result = await getUserById('nonexistent-user');

      expect(result).toBeNull();
    });
  });
});
