import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { adminAuditLog, users } from '../../db/schema.js';
import type { UserRole } from '../../plugins/rbac.js';
import { decrypt } from '../crypto/index.js';
import { maskEmail, maskName } from './helpers.js';

type AdminAction =
  | 'user_blocked'
  | 'user_unblocked'
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
  const { page, limit, role, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  const offset = (page - 1) * limit;

  const conditions = [];
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
    const emailPlain = decrypt(user.emailEncrypted);
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

  const emailPlain = decrypt(user.emailEncrypted);
  const namePlain = decrypt(user.nameEncrypted);

  return {
    id: user.id,
    email: maskEmail(emailPlain),
    name: maskName(namePlain),
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    blockedAt: user.blockedAt,
    blockedReason: user.blockedReason,
    lentLoans: user.lentLoans || [],
    borrowedLoans: user.borrowedLoans || [],
    items: user.items || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
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
