import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { oauthAccounts, users, verificationTokens } from '../../db/schema.js';
import {
  BadRequestError,
  ConflictError,
  ErrorCodes,
  GoneError,
  UnauthorizedError,
} from '../../errors/index.js';
import type { UserRole } from '../../plugins/rbac.js';
import { decrypt, encrypt, hash } from '../crypto/index.js';
import { buildPasswordResetEmail, buildVerificationEmail, sendEmail } from '../email/index.js';
import { hashPassword, verifyPassword } from '../password/index.js';

const TOKEN_EXPIRY_HOURS = 24;

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  role: UserRole;
}

export async function createUser(input: CreateUserInput): Promise<UserResponse> {
  const emailHash = hash(input.email);

  const existing = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (existing) {
    throw new ConflictError(ErrorCodes.AUTH_EMAIL_TAKEN, 'Email already registered');
  }

  const passwordHashed = await hashPassword(input.password);
  const emailEncrypted = encrypt(input.email);
  const nameEncrypted = encrypt(input.name);

  const [user] = await db
    .insert(users)
    .values({
      emailEncrypted,
      nameEncrypted,
      emailHash,
      passwordHash: passwordHashed,
    })
    .returning();

  if (!user) {
    throw new BadRequestError(ErrorCodes.AUTH_CREATE_FAILED, 'Failed to create user');
  }

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.insert(verificationTokens).values({
    userId: user.id,
    token,
    type: 'email_verification',
    expiresAt,
  });

  const verificationUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: input.email,
    subject: 'Verifique seu email - TáComQuem',
    html: buildVerificationEmail(input.name, verificationUrl),
  });

  return {
    id: user.id,
    name: input.name,
    email: input.email,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerified,
    role: user.role,
  };
}

export async function verifyEmail(token: string): Promise<boolean> {
  const verification = await db.query.verificationTokens.findFirst({
    where: eq(verificationTokens.token, token),
    with: { user: true },
  });

  if (!verification) {
    throw new BadRequestError(ErrorCodes.AUTH_TOKEN_INVALID, 'Invalid token');
  }

  if (verification.usedAt) {
    throw new BadRequestError(ErrorCodes.AUTH_TOKEN_USED, 'Token already used');
  }

  if (verification.expiresAt < new Date()) {
    throw new GoneError(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Token has expired');
  }

  if (verification.type !== 'email_verification') {
    throw new BadRequestError(ErrorCodes.AUTH_TOKEN_TYPE_INVALID, 'Invalid token type');
  }

  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, verification.userId));

  await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(verificationTokens.id, verification.id));

  return true;
}

export async function login(email: string, password: string): Promise<UserResponse> {
  const emailHash = hash(email);

  const user = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (!user) {
    throw new UnauthorizedError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
  }

  if (!user.passwordHash) {
    throw new BadRequestError(ErrorCodes.AUTH_SOCIAL_ACCOUNT, 'Use social login for this account');
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
  }

  return {
    id: user.id,
    name: decrypt(user.nameEncrypted),
    email: decrypt(user.emailEncrypted),
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerified,
    role: user.role,
  };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const emailHash = hash(email);

  const user = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (!user) {
    return;
  }

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.insert(verificationTokens).values({
    userId: user.id,
    token,
    type: 'password_reset',
    expiresAt,
  });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  const name = decrypt(user.nameEncrypted);

  await sendEmail({
    to: email,
    subject: 'Recuperação de Senha - TáComQuem',
    html: buildPasswordResetEmail(name, resetUrl),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const verification = await db.query.verificationTokens.findFirst({
    where: eq(verificationTokens.token, token),
  });

  if (!verification) {
    throw new BadRequestError(ErrorCodes.AUTH_TOKEN_INVALID, 'Invalid token');
  }

  if (verification.usedAt) {
    throw new BadRequestError(ErrorCodes.AUTH_TOKEN_USED, 'Token already used');
  }

  if (verification.expiresAt < new Date()) {
    throw new GoneError(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Token has expired');
  }

  if (verification.type !== 'password_reset') {
    throw new BadRequestError(ErrorCodes.AUTH_TOKEN_TYPE_INVALID, 'Invalid token type');
  }

  const passwordHashed = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ passwordHash: passwordHashed, updatedAt: new Date() })
    .where(eq(users.id, verification.userId));

  await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(verificationTokens.id, verification.id));

  return true;
}

export async function findOrCreateGoogleUser(
  googleId: string,
  email: string,
  name: string,
  avatarUrl?: string
): Promise<UserResponse> {
  const existingOauth = await db.query.oauthAccounts.findFirst({
    where: eq(oauthAccounts.providerAccountId, googleId),
    with: { user: true },
  });

  if (existingOauth?.user) {
    const user = existingOauth.user;
    return {
      id: user.id,
      name: decrypt(user.nameEncrypted),
      email: decrypt(user.emailEncrypted),
      avatarUrl: user.avatarUrl ?? null,
      emailVerified: user.emailVerified,
      role: user.role,
    };
  }

  const emailHash = hash(email);
  const existingUser = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (existingUser) {
    await db.insert(oauthAccounts).values({
      userId: existingUser.id,
      provider: 'google',
      providerAccountId: googleId,
    });

    await db
      .update(users)
      .set({
        emailVerified: true,
        avatarUrl: avatarUrl || existingUser.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));

    return {
      id: existingUser.id,
      name: decrypt(existingUser.nameEncrypted),
      email: decrypt(existingUser.emailEncrypted),
      avatarUrl: (avatarUrl || existingUser.avatarUrl) ?? null,
      emailVerified: true,
      role: existingUser.role,
    };
  }

  const [user] = await db
    .insert(users)
    .values({
      emailEncrypted: encrypt(email),
      nameEncrypted: encrypt(name),
      emailHash,
      avatarUrl,
      emailVerified: true,
    })
    .returning();

  if (!user) {
    throw new BadRequestError(ErrorCodes.AUTH_CREATE_FAILED, 'Failed to create user');
  }

  await db.insert(oauthAccounts).values({
    userId: user.id,
    provider: 'google',
    providerAccountId: googleId,
  });

  return {
    id: user.id,
    name,
    email,
    avatarUrl: avatarUrl ?? null,
    emailVerified: true,
    role: user.role,
  };
}

export async function getUserById(userId: string): Promise<UserResponse | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: decrypt(user.nameEncrypted),
    email: decrypt(user.emailEncrypted),
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerified,
    role: user.role,
  };
}
