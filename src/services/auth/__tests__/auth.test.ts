import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import {
  BadRequestError,
  ConflictError,
  ErrorCodes,
  ForbiddenError,
  GoneError,
  UnauthorizedError,
} from '../../../errors/index.js';
import * as cryptoService from '../../crypto/index.js';
import * as emailService from '../../email/index.js';
import * as passwordService from '../../password/index.js';
import {
  createUser,
  deleteAccount,
  findOrCreateGoogleUser,
  getUserById,
  login,
  requestPasswordReset,
  resetPassword,
  setPassword,
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
        status: 'success',
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
          avatarUrl: null,
          emailVerified: false,
          role: 'USER',
        },
        message: 'Conta criada com sucesso. Verifique seu email.',
        canUseApp: true,
      });
    });

    it('should throw AUTH_EMAIL_TAKEN if email already exists with password', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce({
        id: 'existing-user',
        emailHash: 'hash_test@example.com',
        passwordHash: 'hashed_somepassword',
      } as any);

      let errorThrown = false;
      try {
        await createUser({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
        });
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(ConflictError);
        expect((e as ConflictError).code).toBe(ErrorCodes.AUTH_EMAIL_TAKEN);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw AUTH_SOCIAL_ACCOUNT if email already exists as OAuth-only account', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce({
        id: 'existing-user',
        emailHash: 'hash_test@example.com',
        passwordHash: null,
      } as any);

      let errorThrown = false;
      try {
        await createUser({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
        });
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(ConflictError);
        expect((e as ConflictError).code).toBe(ErrorCodes.AUTH_SOCIAL_ACCOUNT);
      }
      expect(errorThrown).toBe(true);
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

      let errorThrown = false;
      try {
        await verifyEmail('invalid-token');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.AUTH_TOKEN_INVALID);
      }
      expect(errorThrown).toBe(true);
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

      let errorThrown = false;
      try {
        await verifyEmail('used-token');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.AUTH_TOKEN_USED);
      }
      expect(errorThrown).toBe(true);
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

      let errorThrown = false;
      try {
        await verifyEmail('expired-token');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(GoneError);
        expect((e as GoneError).code).toBe(ErrorCodes.AUTH_TOKEN_EXPIRED);
      }
      expect(errorThrown).toBe(true);
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

      let errorThrown = false;
      try {
        await verifyEmail('wrong-type-token');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.AUTH_TOKEN_TYPE_INVALID);
      }
      expect(errorThrown).toBe(true);
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
        accessTier: 'BETA' as const,
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

      let errorThrown = false;
      try {
        await login('nonexistent@example.com', 'password123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(UnauthorizedError);
        expect((e as UnauthorizedError).code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw error with incorrect password', async () => {
      const mockUser = {
        id: 'user-123',
        emailHash: 'hash_test@example.com',
        passwordHash: 'hashed_correctpassword',
        role: 'USER' as const,
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      let errorThrown = false;
      try {
        await login('test@example.com', 'wrongpassword');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(UnauthorizedError);
        expect((e as UnauthorizedError).code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw error when trying to login with password on OAuth account', async () => {
      const mockUser = {
        id: 'user-123',
        emailHash: 'hash_test@example.com',
        passwordHash: null,
        role: 'USER' as const,
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      let errorThrown = false;
      try {
        await login('test@example.com', 'password123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.AUTH_SOCIAL_ACCOUNT);
      }
      expect(errorThrown).toBe(true);
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

      let errorThrown = false;
      try {
        await resetPassword('invalid-token', 'newpassword123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.AUTH_TOKEN_INVALID);
      }
      expect(errorThrown).toBe(true);
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

      let errorThrown = false;
      try {
        await resetPassword('used-token', 'newpassword123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.AUTH_TOKEN_USED);
      }
      expect(errorThrown).toBe(true);
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

      let errorThrown = false;
      try {
        await resetPassword('expired-token', 'newpassword123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(GoneError);
        expect((e as GoneError).code).toBe(ErrorCodes.AUTH_TOKEN_EXPIRED);
      }
      expect(errorThrown).toBe(true);
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

      let errorThrown = false;
      try {
        await resetPassword('wrong-type-token', 'newpassword123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.AUTH_TOKEN_TYPE_INVALID);
      }
      expect(errorThrown).toBe(true);
    });
  });

  describe('setPassword', () => {
    it('should set password for OAuth-only account', async () => {
      const mockUser = {
        id: 'user-123',
        emailHash: 'hash_test@example.com',
        passwordHash: null,
        role: 'USER' as const,
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      await expect(setPassword('user-123', 'newpassword123')).resolves.toBeUndefined();
    });

    it('should throw AUTH_PASSWORD_ALREADY_SET if user already has a password', async () => {
      const mockUser = {
        id: 'user-123',
        emailHash: 'hash_test@example.com',
        passwordHash: 'hashed_existingpassword',
        role: 'USER' as const,
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      let errorThrown = false;
      try {
        await setPassword('user-123', 'newpassword123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.AUTH_PASSWORD_ALREADY_SET);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw AUTH_UNAUTHORIZED if user not found', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(undefined);

      let errorThrown = false;
      try {
        await setPassword('nonexistent-user', 'newpassword123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(UnauthorizedError);
        expect((e as UnauthorizedError).code).toBe(ErrorCodes.AUTH_UNAUTHORIZED);
      }
      expect(errorThrown).toBe(true);
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
          accessTier: 'BETA' as const,
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
        accessTier: 'BETA' as const,
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

    it('should block new user creation via OAuth in beta mode', async () => {
      spyOn(db.query.oauthAccounts, 'findFirst').mockResolvedValueOnce(undefined);
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(undefined);

      let errorThrown = false;
      try {
        await findOrCreateGoogleUser('google-new', 'new@example.com', 'New User');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(ForbiddenError);
        expect((e as ForbiddenError).code).toBe(ErrorCodes.AUTH_FORBIDDEN);
      }
      expect(errorThrown).toBe(true);
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
        deletedAt: null,
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

    it('should return null if user is deleted', async () => {
      const mockUser = {
        id: 'user-123',
        nameEncrypted: 'encrypted_Usuário Deletado',
        emailEncrypted: null,
        emailHash: null,
        avatarUrl: null,
        emailVerified: false,
        role: 'USER' as const,
        deletedAt: new Date(),
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      const result = await getUserById('user-123');

      expect(result).toBeNull();
    });
  });

  describe('deleteAccount', () => {
    const mockActiveUser = {
      id: 'user-123',
      emailEncrypted: 'encrypted_test@example.com',
      nameEncrypted: 'encrypted_Test User',
      emailHash: 'hash_test@example.com',
      passwordHash: 'hashed_password123',
      avatarUrl: null,
      emailVerified: true,
      role: 'USER' as const,
      isActive: true,
      deletedAt: null,
    };

    it('should delete account with valid password', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockActiveUser as any);
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce(undefined);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      const deleteWhereMock = mock(() => Promise.resolve());
      spyOn(db, 'delete').mockReturnValue({ where: deleteWhereMock } as any);

      await expect(deleteAccount('user-123', 'password123')).resolves.toBeUndefined();
    });

    it('should delete account without password for OAuth-only user', async () => {
      const oauthUser = { ...mockActiveUser, passwordHash: null };
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(oauthUser as any);
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce(undefined);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      const deleteWhereMock = mock(() => Promise.resolve());
      spyOn(db, 'delete').mockReturnValue({ where: deleteWhereMock } as any);

      await expect(deleteAccount('user-123')).resolves.toBeUndefined();
    });

    it('should throw AUTH_INVALID_CREDENTIALS if password required but not provided', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockActiveUser as any);

      let errorThrown = false;
      try {
        await deleteAccount('user-123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw AUTH_INVALID_CREDENTIALS if password is wrong', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockActiveUser as any);

      let errorThrown = false;
      try {
        await deleteAccount('user-123', 'wrongpassword');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(UnauthorizedError);
        expect((e as UnauthorizedError).code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw AUTH_HAS_ACTIVE_LOANS if user has active loans', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockActiveUser as any);
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce({
        id: 'loan-123',
        status: 'confirmed',
      } as any);

      let errorThrown = false;
      try {
        await deleteAccount('user-123', 'password123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(ConflictError);
        expect((e as ConflictError).code).toBe(ErrorCodes.AUTH_HAS_ACTIVE_LOANS);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw AUTH_UNAUTHORIZED if user not found', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(undefined);

      let errorThrown = false;
      try {
        await deleteAccount('nonexistent-user', 'password123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(UnauthorizedError);
        expect((e as UnauthorizedError).code).toBe(ErrorCodes.AUTH_UNAUTHORIZED);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw AUTH_UNAUTHORIZED if user is already deleted', async () => {
      const deletedUser = { ...mockActiveUser, deletedAt: new Date() };
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(deletedUser as any);

      let errorThrown = false;
      try {
        await deleteAccount('user-123', 'password123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(UnauthorizedError);
        expect((e as UnauthorizedError).code).toBe(ErrorCodes.AUTH_UNAUTHORIZED);
      }
      expect(errorThrown).toBe(true);
    });
  });
});
