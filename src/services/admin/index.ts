import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  adminAuditLog,
  deletionTokens,
  friendships,
  items,
  loans,
  notifications,
  oauthAccounts,
  users,
  verificationTokens,
} from '../../db/schema.js';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import type { UserRole } from '../../plugins/rbac.js';
import { decrypt, encrypt, hash } from '../crypto/index.js';
import { resolveImageKeys } from '../storage/index.js';
import { maskEmail, maskName } from './helpers.js';

type AdminAction =
  | 'user_blocked'
  | 'user_unblocked'
  | 'user_deleted'
  | 'item_removed'
  | 'loan_cancelled'
  | 'admin_created'
  | 'admin_role_changed'
  | 'admin_removed'
  | 'content_flagged';

export interface ListUsersParams {
  page: number;
  limit: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  sortBy?: 'createdAt' | 'lastActivity';
  sortOrder?: 'asc' | 'desc';
}

export interface MaskedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  loansAsLender: number;
  loansAsBorrower: number;
  itemsCount: number;
  createdAt: string;
  lastActivityAt?: string;
}

export async function listUsers(params: ListUsersParams) {
  const { page, limit, search, role, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    const searchHash = hash(search.trim().toLowerCase());
    conditions.push(eq(users.emailHash, searchHash));
  }
  if (role) conditions.push(eq(users.role, role));
  if (isActive !== undefined) conditions.push(eq(users.isActive, isActive));

  const orderByColumn = sortBy === 'lastActivity' ? users.updatedAt : users.createdAt;

  const allUsers = await db.query.users.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      lentLoans: true,
      borrowedLoans: true,
      items: true,
    },
    limit,
    offset,
    orderBy: sortOrder === 'desc' ? [desc(orderByColumn)] : [asc(orderByColumn)],
  });

  const countResult = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(users)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const count = countResult[0]?.count || 0;

  const maskedUsers: MaskedUser[] = allUsers.map((user) => {
    const emailPlain = user.emailEncrypted ? decrypt(user.emailEncrypted) : '';
    const namePlain = decrypt(user.nameEncrypted);

    return {
      id: user.id,
      email: maskEmail(emailPlain),
      name: maskName(namePlain),
      role: user.role as UserRole,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      loansAsLender: user.lentLoans?.length || 0,
      loansAsBorrower: user.borrowedLoans?.length || 0,
      itemsCount: user.items?.length || 0,
      createdAt: (user.createdAt || new Date()).toISOString(),
      lastActivityAt: user.updatedAt?.toISOString(),
    };
  });

  return {
    users: maskedUsers,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}

export async function getUserDetails(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      lentLoans: {
        with: { item: true, borrower: true },
      },
      borrowedLoans: {
        with: { item: true, lender: true },
      },
      items: true,
    },
  });

  if (!user) return null;

  const emailPlain = user.emailEncrypted ? decrypt(user.emailEncrypted) : '';
  const namePlain = decrypt(user.nameEncrypted);

  const name = maskName(namePlain);

  return {
    id: user.id,
    email: maskEmail(emailPlain),
    name,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    blockedAt: user.blockedAt?.toISOString() || null,
    blockedReason: user.blockedReason,
    lentLoans: await Promise.all(
      (user.lentLoans || []).map(async (loan) => ({
        id: loan.id,
        item: {
          id: loan.item.id,
          name: loan.item.name,
          images: await resolveImageKeys(loan.item.images),
        },
        lender: {
          id: user.id,
          name,
        },
        borrower: loan.borrower
          ? {
              id: loan.borrower.id,
              name: maskName(decrypt(loan.borrower.nameEncrypted)),
            }
          : null,
        borrowerEmail: loan.borrowerEmail,
        status: loan.status,
        expectedReturnDate: loan.expectedReturnDate?.toISOString() || null,
        lenderNotes: loan.lenderNotes,
        borrowerNotes: loan.borrowerNotes,
        confirmedAt: loan.confirmedAt?.toISOString() || null,
        returnedAt: loan.returnedAt?.toISOString() || null,
        createdAt: (loan.createdAt || new Date()).toISOString(),
      }))
    ),
    borrowedLoans: await Promise.all(
      (user.borrowedLoans || []).map(async (loan) => ({
        id: loan.id,
        item: {
          id: loan.item.id,
          name: loan.item.name,
          images: await resolveImageKeys(loan.item.images),
        },
        lender: {
          id: loan.lender.id,
          name: maskName(decrypt(loan.lender.nameEncrypted)),
        },
        borrower: {
          id: user.id,
          name,
        },
        borrowerEmail: loan.borrowerEmail,
        status: loan.status,
        expectedReturnDate: loan.expectedReturnDate?.toISOString() || null,
        lenderNotes: loan.lenderNotes,
        borrowerNotes: loan.borrowerNotes,
        confirmedAt: loan.confirmedAt?.toISOString() || null,
        returnedAt: loan.returnedAt?.toISOString() || null,
        createdAt: (loan.createdAt || new Date()).toISOString(),
      }))
    ),
    items: await Promise.all(
      (user.items || []).map(async (item) => {
        const activeLoan = await db.query.loans.findFirst({
          where: eq(loans.itemId, item.id),
          with: { borrower: true },
        });
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          images: await resolveImageKeys(item.images),
          isActive: item.isActive,
          isLoaned: activeLoan?.status === 'confirmed',
          currentLoanId: activeLoan?.status === 'confirmed' ? activeLoan.id : null,
          borrowedTo:
            activeLoan?.status === 'confirmed' && activeLoan.borrower
              ? maskName(decrypt(activeLoan.borrower.nameEncrypted))
              : null,
          createdAt: (item.createdAt || new Date()).toISOString(),
          updatedAt: (item.updatedAt || new Date()).toISOString(),
        };
      })
    ),
    createdAt: (user.createdAt || new Date()).toISOString(),
    updatedAt: (user.updatedAt || new Date()).toISOString(),
  };
}

export async function blockUser(
  userId: string,
  adminId: string,
  reason: string,
  ipAddress?: string
) {
  const now = new Date();

  await db
    .update(users)
    .set({
      isActive: false,
      blockedAt: now,
      blockedReason: reason,
    })
    .where(eq(users.id, userId));

  await logAdminAction({
    adminId,
    action: 'user_blocked',
    targetType: 'user',
    targetId: userId,
    metadata: { reason },
    ipAddress,
  });
}

export async function unblockUser(userId: string, adminId: string, ipAddress?: string) {
  await db
    .update(users)
    .set({
      isActive: true,
      blockedAt: null,
      blockedReason: null,
    })
    .where(eq(users.id, userId));

  await logAdminAction({
    adminId,
    action: 'user_unblocked',
    targetType: 'user',
    targetId: userId,
    ipAddress,
  });
}

export async function deleteUser(
  userId: string,
  adminId: string,
  reason: string,
  ipAddress?: string
) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new NotFoundError(ErrorCodes.ADMIN_TARGET_NOT_FOUND, 'User not found');
  }

  if (user.deletedAt) {
    throw new NotFoundError(ErrorCodes.ADMIN_TARGET_NOT_FOUND, 'User is already deleted');
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        emailEncrypted: null,
        emailHash: null,
        nameEncrypted: encrypt('Usuário Deletado'),
        avatarUrl: null,
        passwordHash: null,
        dateOfBirth: null,
        parentalEmail: null,
        parentalName: null,
        parentalConsentStatus: 'not_applicable',
        parentalConsentToken: null,
        parentalConsentTokenExpiresAt: null,
        parentalConsentConfirmedAt: null,
        parentalConsentIpAddress: null,
        parentalConsentUserAgent: null,
        deletedAt: now,
        deletionRequestedAt: now,
        deletionStatus: 'completed',
        deletionReason: reason,
        isActive: false,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    await tx.delete(oauthAccounts).where(eq(oauthAccounts.userId, userId));
    await tx.delete(verificationTokens).where(eq(verificationTokens.userId, userId));
    await tx.delete(deletionTokens).where(eq(deletionTokens.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx
      .delete(friendships)
      .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)));
    await tx
      .update(items)
      .set({ isActive: false, updatedAt: now })
      .where(and(eq(items.ownerId, userId), eq(items.isActive, true)));
  });

  await logAdminAction({
    adminId,
    action: 'user_deleted',
    targetType: 'user',
    targetId: userId,
    metadata: { reason },
    ipAddress,
  });
}

export async function logAdminAction(params: {
  adminId: string;
  action: AdminAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}) {
  await db.insert(adminAuditLog).values({
    adminId: params.adminId,
    action: params.action,
    targetType: params.targetType || undefined,
    targetId: params.targetId || undefined,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    ipAddress: params.ipAddress || undefined,
    userAgent: params.userAgent || undefined,
  });
}

export {
  type AccessTier,
  type AddBetaUserParams,
  addBetaUser,
  type BetaAuditAction,
  type BetaUser,
  isBetaUserAllowed,
  type ListBetaUsersParams,
  type ListWaitlistedUsersParams,
  listBetaUsers,
  listWaitlistedUsers,
  type RemoveBetaUserParams,
  removeBetaUser,
  type WaitlistedUser,
} from './beta-program.js';
