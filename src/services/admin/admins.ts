import { desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { adminAuditLog, users } from '../../db/schema.js';
import { BadRequestError, ErrorCodes } from '../../errors/index.js';
import type { UserRole } from '../../plugins/rbac.js';
import { decrypt } from '../crypto/index.js';
import { maskEmail, maskName } from './helpers.js';
import { logAdminAction } from './index.js';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  admin: {
    id: string;
    name: string;
    role: UserRole;
  };
  action: string;
  targetType: string | undefined;
  targetId: string | undefined;
  metadata: unknown | undefined;
  ipAddress: string | undefined;
  createdAt: string;
}

export interface AuditLogParams {
  page: number;
  limit: number;
}

export async function listAdmins(): Promise<AdminUser[]> {
  const admins = await db.query.users.findMany({
    where: ne(users.role, 'USER'),
  });

  return admins.map((admin) => ({
    id: admin.id,
    email: maskEmail(admin.emailEncrypted ? decrypt(admin.emailEncrypted) : ''),
    name: maskName(decrypt(admin.nameEncrypted)),
    role: admin.role as UserRole,
    createdAt: (admin.createdAt || new Date()).toISOString(),
  }));
}

export async function promoteToAdmin(
  userId: string,
  role: UserRole,
  adminId: string,
  ipAddress?: string
) {
  if (role === 'USER') {
    throw new BadRequestError(ErrorCodes.ADMIN_INVALID_ROLE, 'Cannot promote user to USER role');
  }

  await db.update(users).set({ role }).where(eq(users.id, userId));

  await logAdminAction({
    adminId,
    action: 'admin_created',
    targetType: 'user',
    targetId: userId,
    metadata: { role },
    ipAddress,
  });
}

export async function changeAdminRole(
  adminId: string,
  newRole: UserRole,
  superAdminId: string,
  ipAddress?: string
) {
  if (newRole === 'USER') {
    throw new BadRequestError(
      ErrorCodes.ADMIN_USE_REMOVE,
      'Use removeAdmin to demote admin to user'
    );
  }

  await db.update(users).set({ role: newRole }).where(eq(users.id, adminId));

  await logAdminAction({
    adminId: superAdminId,
    action: 'admin_role_changed',
    targetType: 'user',
    targetId: adminId,
    metadata: { newRole },
    ipAddress,
  });
}

export async function removeAdmin(adminId: string, superAdminId: string, ipAddress?: string) {
  await db.update(users).set({ role: 'USER' }).where(eq(users.id, adminId));

  await logAdminAction({
    adminId: superAdminId,
    action: 'admin_removed',
    targetType: 'user',
    targetId: adminId,
    ipAddress,
  });
}

export async function getAuditLog(params: AuditLogParams) {
  const { page, limit } = params;
  const offset = (page - 1) * limit;

  const logs = await db.query.adminAuditLog.findMany({
    with: { admin: true },
    orderBy: desc(adminAuditLog.createdAt),
    limit,
    offset,
  });

  const countResult = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(adminAuditLog);

  const count = countResult[0]?.count || 0;

  const formattedLogs: AuditLogEntry[] = logs.map((log) => ({
    id: log.id,
    admin: {
      id: log.admin.id,
      name: maskName(decrypt(log.admin.nameEncrypted)),
      role: log.admin.role as UserRole,
    },
    action: log.action,
    targetType: log.targetType || undefined,
    targetId: log.targetId || undefined,
    metadata: log.metadata ? JSON.parse(log.metadata) : undefined,
    ipAddress: log.ipAddress || undefined,
    createdAt: log.createdAt.toISOString(),
  }));

  return {
    logs: formattedLogs,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}
