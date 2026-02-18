import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { betaProgramAudit, users } from '../../db/schema.js';
import { decrypt, hash } from '../crypto/index.js';
import { maskEmail, maskName } from './helpers.js';

export type AccessTier = 'PUBLIC' | 'BETA' | 'ARCHIVED';
export type BetaAuditAction = 'added' | 'removed';

export interface BetaUser {
  id: string;
  email: string;
  name: string;
  accessTier: AccessTier;
  betaAddedAt: string | null;
  emailVerified: boolean;
  createdAt: string;
}

export interface ListBetaUsersParams {
  page: number;
  limit: number;
  sortBy?: 'betaAddedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface AddBetaUserParams {
  email: string;
  adminId: string;
  reason?: string;
  ipAddress?: string;
}

export interface RemoveBetaUserParams {
  userId: string;
  adminId: string;
  reason?: string;
  ipAddress?: string;
}

export async function listBetaUsers(params: ListBetaUsersParams) {
  const { page, limit, sortBy = 'betaAddedAt', sortOrder = 'desc' } = params;
  const offset = (page - 1) * limit;

  const allUsers = await db.query.users.findMany({
    where: eq(users.accessTier, 'BETA'),
    limit,
    offset,
    orderBy: sortOrder === 'desc' ? [desc(users[sortBy])] : [asc(users[sortBy])],
  });

  const countResult = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(users)
    .where(eq(users.accessTier, 'BETA'));

  const count = countResult[0]?.count || 0;

  const betaUsers: BetaUser[] = allUsers.map((user) => {
    const emailPlain = decrypt(user.emailEncrypted);
    const namePlain = decrypt(user.nameEncrypted);

    return {
      id: user.id,
      email: maskEmail(emailPlain),
      name: maskName(namePlain),
      accessTier: user.accessTier as AccessTier,
      betaAddedAt: user.betaAddedAt?.toISOString() || null,
      emailVerified: user.emailVerified,
      createdAt: (user.createdAt || new Date()).toISOString(),
    };
  });

  return {
    users: betaUsers,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}

export async function addBetaUser(params: AddBetaUserParams): Promise<BetaUser> {
  const { email, adminId, reason, ipAddress } = params;

  const emailHash = hash(email);
  const user = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.isActive) {
    throw new Error('Cannot add blocked user to beta program');
  }

  if (user.accessTier === 'BETA') {
    throw new Error('User is already in beta program');
  }

  const now = new Date();

  const [updated] = await db
    .update(users)
    .set({
      accessTier: 'BETA',
      betaAddedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, user.id))
    .returning();

  if (!updated) {
    throw new Error('Failed to update user');
  }

  await db.insert(betaProgramAudit).values({
    adminId,
    userId: user.id,
    action: 'added',
    reason: reason || null,
    ipAddress: ipAddress || null,
  });

  const emailPlain = decrypt(updated.emailEncrypted);
  const namePlain = decrypt(updated.nameEncrypted);

  return {
    id: updated.id,
    email: maskEmail(emailPlain),
    name: maskName(namePlain),
    accessTier: updated.accessTier as AccessTier,
    betaAddedAt: updated.betaAddedAt?.toISOString() || null,
    emailVerified: updated.emailVerified,
    createdAt: (updated.createdAt || new Date()).toISOString(),
  };
}

export async function removeBetaUser(params: RemoveBetaUserParams): Promise<BetaUser> {
  const { userId, adminId, reason, ipAddress } = params;

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.accessTier !== 'BETA') {
    throw new Error('User is not in beta program');
  }

  const now = new Date();

  const [updated] = await db
    .update(users)
    .set({
      accessTier: 'PUBLIC',
      betaAddedAt: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw new Error('Failed to update user');
  }

  await db.insert(betaProgramAudit).values({
    adminId,
    userId: userId,
    action: 'removed',
    reason: reason || null,
    ipAddress: ipAddress || null,
  });

  const emailPlain = decrypt(updated.emailEncrypted);
  const namePlain = decrypt(updated.nameEncrypted);

  return {
    id: updated.id,
    email: maskEmail(emailPlain),
    name: maskName(namePlain),
    accessTier: updated.accessTier as AccessTier,
    betaAddedAt: updated.betaAddedAt?.toISOString() || null,
    emailVerified: updated.emailVerified,
    createdAt: (updated.createdAt || new Date()).toISOString(),
  };
}

export async function isBetaUserAllowed(emailHash: string): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (!user) {
    return false;
  }

  return user.accessTier === 'BETA';
}
