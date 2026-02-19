import { and, eq, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';
import { CURRENT_TERMS_VERSION } from '../../config/terms.js';
import { db } from '../../db/index.js';
import {
  friendships,
  items,
  loans,
  notifications,
  oauthAccounts,
  users,
  verificationTokens,
} from '../../db/schema.js';
import {
  BadRequestError,
  ConflictError,
  ErrorCodes,
  ForbiddenError,
  GoneError,
  UnauthorizedError,
} from '../../errors/index.js';
import type { UserRole } from '../../plugins/rbac.js';
import { decrypt, encrypt, hash } from '../crypto/index.js';
import {
  buildParentalConsentRequestEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  sendEmail,
} from '../email/index.js';
import {
  calculateAgeFromBirthDate,
  generateParentalConsentToken,
  getParentalTokenExpiryDate,
  isChildUnder12,
} from '../parental-consent/index.js';
import { hashPassword, verifyPassword } from '../password/index.js';

const TOKEN_EXPIRY_HOURS = 24;

export interface RegisterAdultInput {
  name: string;
  email: string;
  password: string;
}

export interface RegisterChildInput {
  name: string;
  email: string;
  password: string;
  dateOfBirth: Date;
  parentalEmail: string;
  parentalName: string;
}

export type CreateUserInput = RegisterAdultInput | RegisterChildInput;

export interface RegisterResponse {
  status: 'success' | 'pending_parental_consent';
  user?: UserResponse;
  accessToken?: string;
  refreshToken?: string;
  message?: string;
  emailSentTo?: string;
  canUseApp?: boolean;
  userId?: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  role: UserRole;
  termsAccepted: boolean;
}

export async function createUser(
  input: CreateUserInput,
  clientIp: string
): Promise<RegisterResponse> {
  const emailHash = hash(input.email);

  const existing = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (existing) {
    if (!existing.passwordHash) {
      throw new ConflictError(
        ErrorCodes.AUTH_SOCIAL_ACCOUNT,
        'This email is registered via social login. Please log in with your social account.'
      );
    }
    throw new ConflictError(ErrorCodes.AUTH_EMAIL_TAKEN, 'Email already registered');
  }

  const passwordHashed = await hashPassword(input.password);
  const emailEncrypted = encrypt(input.email);
  const nameEncrypted = encrypt(input.name);

  // Terms accepted at registration time (LGPD Art. 8: explicit, informed, documented consent)
  const termsData = {
    termsVersion: CURRENT_TERMS_VERSION,
    termsAcceptedAt: new Date(),
    termsAcceptedIp: clientIp,
  };

  // Check if this is a child registration
  const isChild = 'dateOfBirth' in input && isChildUnder12(input.dateOfBirth);

  if (isChild) {
    // Child registration - requires parental consent
    const token = generateParentalConsentToken();
    const tokenExpires = getParentalTokenExpiryDate();

    const [user] = await db
      .insert(users)
      .values({
        emailEncrypted,
        nameEncrypted,
        emailHash,
        passwordHash: passwordHashed,
        dateOfBirth: input.dateOfBirth.toISOString(),
        parentalConsentStatus: 'pending',
        parentalEmail: encrypt(input.parentalEmail),
        parentalName: input.parentalName,
        parentalConsentToken: token,
        parentalConsentTokenExpiresAt: tokenExpires,
        ...termsData,
      })
      .returning();

    if (!user) {
      throw new BadRequestError(ErrorCodes.AUTH_CREATE_FAILED, 'Failed to create user');
    }

    // Send email to parent
    await sendEmail({
      to: input.parentalEmail,
      subject: `${input.name} precisa da sua autorização para usar o TáComQuem`,
      html: buildParentalConsentRequestEmail(
        input.name,
        input.parentalName,
        `${env.FRONTEND_URL}/parental-consent?token=${token}`
      ),
    });

    return {
      status: 'pending_parental_consent',
      message: 'Conta criada. Um email de confirmação foi enviado para o responsável.',
      emailSentTo: input.parentalEmail,
      canUseApp: false,
      userId: user.id,
    };
  } else {
    // Adult registration
    const [user] = await db
      .insert(users)
      .values({
        emailEncrypted,
        nameEncrypted,
        emailHash,
        passwordHash: passwordHashed,
        ...termsData,
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
      status: 'success',
      user: {
        id: user.id,
        name: input.name,
        email: input.email,
        avatarUrl: user.avatarUrl ?? null,
        emailVerified: user.emailVerified,
        role: user.role,
        termsAccepted: true,
      },
      message: 'Conta criada com sucesso. Verifique seu email.',
      canUseApp: true,
    };
  }
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

  if (!user || user.deletedAt) {
    throw new UnauthorizedError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
  }

  if (!user.passwordHash) {
    throw new BadRequestError(ErrorCodes.AUTH_SOCIAL_ACCOUNT, 'Use social login for this account');
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
  }

  // Check parental consent if user is under 12
  if (user.dateOfBirth && user.parentalConsentStatus === 'pending') {
    const birthDate =
      typeof user.dateOfBirth === 'string' ? new Date(user.dateOfBirth) : user.dateOfBirth;
    const age = calculateAgeFromBirthDate(birthDate);
    if (age < 12) {
      throw new UnauthorizedError(
        ErrorCodes.AUTH_PARENTAL_CONSENT_REQUIRED,
        'Sua conta necessita da autorização do responsável. Por favor, entre em contato com seu pai/mãe para confirmar.'
      );
    }
  }

  if (env.BETA_MODE_ENABLED && user.role === 'USER' && user.accessTier !== 'BETA') {
    throw new ForbiddenError(ErrorCodes.AUTH_FORBIDDEN, 'Beta access not available');
  }

  return {
    id: user.id,
    name: decrypt(user.nameEncrypted),
    // biome-ignore lint/style/noNonNullAssertion: emailEncrypted is always set for non-deleted users
    email: decrypt(user.emailEncrypted!),
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerified,
    role: user.role,
    termsAccepted: user.termsVersion === CURRENT_TERMS_VERSION,
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

    if (env.BETA_MODE_ENABLED && user.role === 'USER' && user.accessTier !== 'BETA') {
      throw new ForbiddenError(ErrorCodes.AUTH_FORBIDDEN, 'Beta access not available');
    }

    return {
      id: user.id,
      name: decrypt(user.nameEncrypted),
      // biome-ignore lint/style/noNonNullAssertion: oauthAccounts are deleted when user is deleted, so user here is always active
      email: decrypt(user.emailEncrypted!),
      avatarUrl: user.avatarUrl ?? null,
      emailVerified: user.emailVerified,
      role: user.role,
      termsAccepted: user.termsVersion === CURRENT_TERMS_VERSION,
    };
  }

  const emailHash = hash(email);
  const existingUser = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (existingUser) {
    if (
      env.BETA_MODE_ENABLED &&
      existingUser.role === 'USER' &&
      existingUser.accessTier !== 'BETA'
    ) {
      throw new ForbiddenError(ErrorCodes.AUTH_FORBIDDEN, 'Beta access not available');
    }

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
      // biome-ignore lint/style/noNonNullAssertion: found by emailHash which is null for deleted users, so always active
      email: decrypt(existingUser.emailEncrypted!),
      avatarUrl: (avatarUrl || existingUser.avatarUrl) ?? null,
      emailVerified: true,
      role: existingUser.role,
      termsAccepted: existingUser.termsVersion === CURRENT_TERMS_VERSION,
    };
  }

  if (env.BETA_MODE_ENABLED) {
    throw new ForbiddenError(ErrorCodes.AUTH_FORBIDDEN, 'Beta access not available');
  }

  // New user via OAuth: account created but terms not yet accepted.
  // They will be prompted to accept on the frontend before using the app.
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
    termsAccepted: false,
  };
}

export async function setPassword(userId: string, password: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'User not found');
  }

  if (user.passwordHash) {
    throw new BadRequestError(
      ErrorCodes.AUTH_PASSWORD_ALREADY_SET,
      'Password already set. Use password reset to change it.'
    );
  }

  const passwordHashed = await hashPassword(password);

  await db
    .update(users)
    .set({ passwordHash: passwordHashed, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function getUserById(userId: string): Promise<UserResponse | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user || user.deletedAt) {
    return null;
  }

  return {
    id: user.id,
    name: decrypt(user.nameEncrypted),
    // biome-ignore lint/style/noNonNullAssertion: emailEncrypted is always set for non-deleted users
    email: decrypt(user.emailEncrypted!),
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerified,
    role: user.role,
    termsAccepted: user.termsVersion === CURRENT_TERMS_VERSION,
  };
}

export async function acceptTerms(userId: string, clientIp: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user || user.deletedAt) {
    throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'User not found');
  }

  await db
    .update(users)
    .set({
      termsVersion: CURRENT_TERMS_VERSION,
      termsAcceptedAt: new Date(),
      termsAcceptedIp: clientIp,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function deleteAccount(userId: string, password?: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user || user.deletedAt) {
    throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'User not found');
  }

  if (user.passwordHash) {
    if (!password) {
      throw new BadRequestError(
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
        'Password is required to delete account'
      );
    }
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid password');
    }
  }

  const activeLoan = await db.query.loans.findFirst({
    where: and(
      or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
      or(eq(loans.status, 'pending'), eq(loans.status, 'confirmed'))
    ),
  });

  if (activeLoan) {
    throw new ConflictError(
      ErrorCodes.AUTH_HAS_ACTIVE_LOANS,
      'Cannot delete account with active loans. Please resolve all active loans first.'
    );
  }

  await db
    .update(users)
    .set({
      emailEncrypted: null,
      emailHash: null,
      nameEncrypted: encrypt('Usuário Deletado'),
      avatarUrl: null,
      passwordHash: null,
      isActive: false,
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await db.delete(oauthAccounts).where(eq(oauthAccounts.userId, userId));
  await db.delete(verificationTokens).where(eq(verificationTokens.userId, userId));
  await db.delete(notifications).where(eq(notifications.userId, userId));
  await db
    .delete(friendships)
    .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)));
  await db
    .update(items)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(items.ownerId, userId), eq(items.isActive, true)));
}
