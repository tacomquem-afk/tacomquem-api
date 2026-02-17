import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { notifications } from '../../db/schema.js';

export interface NotificationNotFoundError {
  kind: 'not_found';
  message: string;
}

export interface NotificationAccessDeniedError {
  kind: 'access_denied';
  message: string;
}

export type NotificationError = NotificationNotFoundError | NotificationAccessDeniedError;

export interface GetNotificationsParams {
  userId: string;
  read?: boolean;
  page: number;
  limit: number;
}

export interface NotificationResponseData {
  id: string;
  loanId: string | null;
  type: 'loan_created' | 'loan_confirmed' | 'loan_reminder' | 'loan_returned';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  sentAt: string | null;
}

export interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NotificationsResult {
  notifications: NotificationResponseData[];
  pagination: PaginationData;
  unreadCount: number;
}

export async function getNotifications(
  params: GetNotificationsParams
): Promise<NotificationsResult> {
  const { userId, read, page, limit } = params;
  const offset = (page - 1) * limit;

  const readCondition = read === undefined ? undefined : eq(notifications.read, read);

  const whereClause = readCondition
    ? and(eq(notifications.userId, userId), readCondition)
    : eq(notifications.userId, userId);

  const rows = await db.query.notifications.findMany({
    where: whereClause,
    orderBy: [desc(notifications.createdAt)],
    limit,
    offset,
  });

  const countResult = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(notifications)
    .where(whereClause);

  const unreadCountResult = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));

  const total = countResult[0]?.count ?? 0;
  const unreadCount = unreadCountResult[0]?.count ?? 0;

  return {
    notifications: rows.map((n) => ({
      id: n.id,
      loanId: n.loanId ?? null,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      sentAt: n.sentAt?.toISOString() ?? null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    unreadCount,
  };
}

export interface MarkAsReadParams {
  userId: string;
  notificationId: string;
}

export interface MarkAsReadResult {
  id: string;
  read: boolean;
  updatedAt: string;
}

export async function markNotificationAsRead(
  params: MarkAsReadParams
): Promise<MarkAsReadResult | NotificationError> {
  const { userId, notificationId } = params;

  const notification = await db.query.notifications.findFirst({
    where: eq(notifications.id, notificationId),
  });

  if (!notification) {
    return {
      kind: 'not_found',
      message: 'Notification not found',
    };
  }

  if (notification.userId !== userId) {
    return {
      kind: 'access_denied',
      message: 'You do not have permission to access this notification',
    };
  }

  if (notification.read) {
    return {
      id: notification.id,
      read: true,
      updatedAt: notification.createdAt.toISOString(),
    };
  }

  await db.update(notifications).set({ read: true }).where(eq(notifications.id, notificationId));

  return {
    id: notificationId,
    read: true,
    updatedAt: new Date().toISOString(),
  };
}

export interface MarkAllAsReadParams {
  userId: string;
}

export interface MarkAllAsReadResult {
  markedCount: number;
}

export async function markAllNotificationsAsRead(
  params: MarkAllAsReadParams
): Promise<MarkAllAsReadResult> {
  const { userId } = params;

  const result = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    .returning({ id: notifications.id });

  return {
    markedCount: result.length,
  };
}

export interface DeleteNotificationParams {
  userId: string;
  notificationId: string;
}

export interface DeleteNotificationResult {
  id: string;
  deleted: boolean;
}

export async function deleteNotification(
  params: DeleteNotificationParams
): Promise<DeleteNotificationResult | NotificationError> {
  const { userId, notificationId } = params;

  const notification = await db.query.notifications.findFirst({
    where: eq(notifications.id, notificationId),
  });

  if (!notification) {
    return {
      kind: 'not_found',
      message: 'Notification not found',
    };
  }

  if (notification.userId !== userId) {
    return {
      kind: 'access_denied',
      message: 'You do not have permission to delete this notification',
    };
  }

  await db.delete(notifications).where(eq(notifications.id, notificationId));

  return {
    id: notificationId,
    deleted: true,
  };
}
