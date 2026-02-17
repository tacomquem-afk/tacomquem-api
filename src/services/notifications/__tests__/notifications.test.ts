import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../index.js';

const mockNotifications = [
  {
    id: 'notif-uuid-1',
    userId: 'user-uuid-1',
    loanId: 'loan-uuid-1',
    type: 'loan_confirmed' as const,
    title: 'Empréstimo confirmado',
    message: 'João confirmou o empréstimo de "Livro".',
    read: false,
    sentAt: new Date('2026-02-17T10:00:00Z'),
    createdAt: new Date('2026-02-17T10:00:00Z'),
  },
  {
    id: 'notif-uuid-2',
    userId: 'user-uuid-1',
    loanId: 'loan-uuid-2',
    type: 'loan_reminder' as const,
    title: 'Lembrete de devolução',
    message: 'Não se esqueça de devolver "Pen drive".',
    read: false,
    sentAt: new Date('2026-02-16T14:30:00Z'),
    createdAt: new Date('2026-02-16T14:30:00Z'),
  },
  {
    id: 'notif-uuid-3',
    userId: 'user-uuid-1',
    loanId: 'loan-uuid-3',
    type: 'loan_returned' as const,
    title: 'Item devolvido',
    message: 'Maria devolveu "Mouse".',
    read: true,
    sentAt: new Date('2026-02-15T09:15:00Z'),
    createdAt: new Date('2026-02-15T09:15:00Z'),
  },
  {
    id: 'notif-uuid-4',
    userId: 'user-uuid-1',
    loanId: null,
    type: 'loan_created' as const,
    title: 'Empréstimo criado',
    message: 'Você criou um novo empréstimo.',
    read: true,
    sentAt: null,
    createdAt: new Date('2026-02-14T16:45:00Z'),
  },
];

const mocks: Array<ReturnType<typeof spyOn>> = [];

beforeEach(() => {
  mocks.length = 0;
});

afterEach(() => {
  mocks.forEach((m) => {
    m.mockClear();
  });
  mocks.length = 0;
});

describe('notifications service', () => {
  describe('getNotifications', () => {
    it('returns paginated notifications for the user (no filter)', async () => {
      const findManySpy = spyOn(db.query.notifications, 'findMany').mockResolvedValue(
        mockNotifications.slice(0, 2)
      );
      mocks.push(findManySpy);

      spyOn(db, 'select')
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 4 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 2 }]),
          }),
        } as any);

      const result = await getNotifications({
        userId: 'user-uuid-1',
        page: 1,
        limit: 2,
      });

      expect(result.notifications).toHaveLength(2);
      expect(result.notifications[0]?.id).toBe('notif-uuid-1');
      expect(result.notifications[1]?.id).toBe('notif-uuid-2');
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.total).toBe(4);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.unreadCount).toBe(2);
    });

    it('filters notifications by read=true', async () => {
      const readNotifications = mockNotifications.filter((n) => n.read);
      spyOn(db.query.notifications, 'findMany').mockResolvedValue(readNotifications);
      mocks.push(spyOn(db.query.notifications, 'findMany'));

      spyOn(db, 'select')
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 2 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 2 }]),
          }),
        } as any);

      const result = await getNotifications({
        userId: 'user-uuid-1',
        read: true,
        page: 1,
        limit: 20,
      });

      expect(result.notifications).toHaveLength(2);
      expect(result.notifications.every((n) => n.read)).toBe(true);
      expect(result.pagination.total).toBe(2);
    });

    it('filters notifications by read=false (unread only)', async () => {
      const unreadNotifications = mockNotifications.filter((n) => !n.read);
      spyOn(db.query.notifications, 'findMany').mockResolvedValue(unreadNotifications);
      mocks.push(spyOn(db.query.notifications, 'findMany'));

      spyOn(db, 'select')
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 2 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 2 }]),
          }),
        } as any);

      const result = await getNotifications({
        userId: 'user-uuid-1',
        read: false,
        page: 1,
        limit: 20,
      });

      expect(result.notifications).toHaveLength(2);
      expect(result.notifications.every((n) => !n.read)).toBe(true);
      expect(result.unreadCount).toBe(2);
    });

    it('returns correct pagination metadata for page 2', async () => {
      spyOn(db.query.notifications, 'findMany').mockResolvedValue(mockNotifications.slice(2, 4));
      mocks.push(spyOn(db.query.notifications, 'findMany'));

      spyOn(db, 'select')
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 4 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 2 }]),
          }),
        } as any);

      const result = await getNotifications({
        userId: 'user-uuid-1',
        page: 2,
        limit: 2,
      });

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.total).toBe(4);
      expect(result.pagination.totalPages).toBe(2);
    });

    it('enforces limit and computes totalPages correctly', async () => {
      spyOn(db.query.notifications, 'findMany').mockResolvedValue(mockNotifications.slice(0, 20));
      mocks.push(spyOn(db.query.notifications, 'findMany'));

      spyOn(db, 'select')
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 47 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 10 }]),
          }),
        } as any);

      const result = await getNotifications({
        userId: 'user-uuid-1',
        page: 1,
        limit: 20,
      });

      expect(result.pagination.total).toBe(47);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('returns empty notifications array when user has none', async () => {
      spyOn(db.query.notifications, 'findMany').mockResolvedValue([]);
      mocks.push(spyOn(db.query.notifications, 'findMany'));

      spyOn(db, 'select')
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 0 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 0 }]),
          }),
        } as any);

      const result = await getNotifications({
        userId: 'user-uuid-1',
        page: 1,
        limit: 20,
      });

      expect(result.notifications).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.unreadCount).toBe(0);
    });

    it('unreadCount always reflects total unread, ignoring read filter', async () => {
      spyOn(db.query.notifications, 'findMany').mockResolvedValue(
        mockNotifications.filter((n) => n.read)
      );
      mocks.push(spyOn(db.query.notifications, 'findMany'));

      spyOn(db, 'select')
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 2 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 2 }]),
          }),
        } as any);

      const result = await getNotifications({
        userId: 'user-uuid-1',
        read: true,
        page: 1,
        limit: 20,
      });

      expect(result.notifications.every((n) => n.read)).toBe(true);
      expect(result.unreadCount).toBe(2);
    });

    it('unreadCount is 0 when all notifications are read', async () => {
      spyOn(db.query.notifications, 'findMany').mockResolvedValue(mockNotifications);
      mocks.push(spyOn(db.query.notifications, 'findMany'));

      spyOn(db, 'select')
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 4 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 0 }]),
          }),
        } as any);

      const result = await getNotifications({
        userId: 'user-uuid-1',
        page: 1,
        limit: 20,
      });

      expect(result.unreadCount).toBe(0);
    });

    it('maps sentAt to null when not set in DB', async () => {
      const notificationWithoutSentAt = {
        id: 'notif-uuid-4',
        userId: 'user-uuid-1',
        loanId: null,
        type: 'loan_created' as const,
        title: 'Empréstimo criado',
        message: 'Você criou um novo empréstimo.',
        read: true,
        sentAt: null,
        createdAt: new Date('2026-02-14T16:45:00Z'),
      };
      spyOn(db.query.notifications, 'findMany').mockResolvedValue([notificationWithoutSentAt]);
      mocks.push(spyOn(db.query.notifications, 'findMany'));

      spyOn(db, 'select')
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 1 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 1 }]),
          }),
        } as any);

      const result = await getNotifications({
        userId: 'user-uuid-1',
        page: 1,
        limit: 20,
      });

      expect(result.notifications[0]?.sentAt).toBeNull();
    });

    it('maps loanId to null when not associated to a loan', async () => {
      const notificationWithoutLoan = {
        id: 'notif-uuid-4',
        userId: 'user-uuid-1',
        loanId: null,
        type: 'loan_created' as const,
        title: 'Empréstimo criado',
        message: 'Você criou um novo empréstimo.',
        read: true,
        sentAt: null,
        createdAt: new Date('2026-02-14T16:45:00Z'),
      };
      spyOn(db.query.notifications, 'findMany').mockResolvedValue([notificationWithoutLoan]);
      mocks.push(spyOn(db.query.notifications, 'findMany'));

      spyOn(db, 'select')
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 1 }]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ count: 1 }]),
          }),
        } as any);

      const result = await getNotifications({
        userId: 'user-uuid-1',
        page: 1,
        limit: 20,
      });

      expect(result.notifications[0]?.loanId).toBeNull();
    });
  });

  describe('markNotificationAsRead', () => {
    it('marks a notification as read successfully', async () => {
      const notification = {
        id: 'notif-uuid-1',
        userId: 'user-uuid-1',
        loanId: 'loan-uuid-1',
        type: 'loan_confirmed' as const,
        title: 'Empréstimo confirmado',
        message: 'João confirmou o empréstimo de "Livro".',
        read: false,
        sentAt: new Date('2026-02-17T10:00:00Z'),
        createdAt: new Date('2026-02-17T10:00:00Z'),
      };

      spyOn(db.query.notifications, 'findFirst').mockResolvedValue(notification);
      spyOn(db, 'update').mockReturnValue({
        set: () => ({
          where: () => Promise.resolve([]),
        }),
      } as any);

      const result = await markNotificationAsRead({
        userId: 'user-uuid-1',
        notificationId: 'notif-uuid-1',
      });

      expect(result).toEqual({
        id: 'notif-uuid-1',
        read: true,
        updatedAt: expect.any(String),
      });
    });

    it('returns not_found error when notification does not exist', async () => {
      spyOn(db.query.notifications, 'findFirst').mockResolvedValue(null as any);

      const result = await markNotificationAsRead({
        userId: 'user-uuid-1',
        notificationId: 'nonexistent-id',
      });

      expect(result).toEqual({
        kind: 'not_found',
        message: 'Notification not found',
      });
    });

    it('returns access_denied when user tries to mark another users notification', async () => {
      const notification = {
        id: 'notif-uuid-1',
        userId: 'different-user-id',
        loanId: 'loan-uuid-1',
        type: 'loan_confirmed' as const,
        title: 'Empréstimo confirmado',
        message: 'João confirmou o empréstimo de "Livro".',
        read: false,
        sentAt: new Date('2026-02-17T10:00:00Z'),
        createdAt: new Date('2026-02-17T10:00:00Z'),
      };

      spyOn(db.query.notifications, 'findFirst').mockResolvedValue(notification);

      const result = await markNotificationAsRead({
        userId: 'user-uuid-1',
        notificationId: 'notif-uuid-1',
      });

      expect(result).toEqual({
        kind: 'access_denied',
        message: 'You do not have permission to access this notification',
      });
    });

    it('is idempotent - returns success if already read', async () => {
      const notification = {
        id: 'notif-uuid-1',
        userId: 'user-uuid-1',
        loanId: 'loan-uuid-1',
        type: 'loan_confirmed' as const,
        title: 'Empréstimo confirmado',
        message: 'João confirmou o empréstimo de "Livro".',
        read: true,
        sentAt: new Date('2026-02-17T10:00:00Z'),
        createdAt: new Date('2026-02-17T10:00:00Z'),
      };

      spyOn(db.query.notifications, 'findFirst').mockResolvedValue(notification);

      const result = await markNotificationAsRead({
        userId: 'user-uuid-1',
        notificationId: 'notif-uuid-1',
      });

      expect(result).toEqual({
        id: 'notif-uuid-1',
        read: true,
        updatedAt: notification.createdAt.toISOString(),
      });
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('marks all unread notifications as read', async () => {
      spyOn(db, 'update').mockReturnValue({
        set: () => ({
          where: () => ({
            returning: () =>
              Promise.resolve([{ id: 'notif-1' }, { id: 'notif-2' }, { id: 'notif-3' }]),
          }),
        }),
      } as any);

      const result = await markAllNotificationsAsRead({
        userId: 'user-uuid-1',
      });

      expect(result).toEqual({
        markedCount: 3,
      });
    });

    it('returns zero when no unread notifications exist', async () => {
      spyOn(db, 'update').mockReturnValue({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      } as any);

      const result = await markAllNotificationsAsRead({
        userId: 'user-uuid-1',
      });

      expect(result).toEqual({
        markedCount: 0,
      });
    });
  });

  describe('deleteNotification', () => {
    it('deletes a notification successfully', async () => {
      const notification = {
        id: 'notif-uuid-1',
        userId: 'user-uuid-1',
        loanId: 'loan-uuid-1',
        type: 'loan_confirmed' as const,
        title: 'Empréstimo confirmado',
        message: 'João confirmou o empréstimo de "Livro".',
        read: false,
        sentAt: new Date('2026-02-17T10:00:00Z'),
        createdAt: new Date('2026-02-17T10:00:00Z'),
      };

      spyOn(db.query.notifications, 'findFirst').mockResolvedValue(notification);
      spyOn(db, 'delete').mockReturnValue({
        where: () => Promise.resolve(undefined),
      } as any);

      const result = await deleteNotification({
        userId: 'user-uuid-1',
        notificationId: 'notif-uuid-1',
      });

      expect(result).toEqual({
        id: 'notif-uuid-1',
        deleted: true,
      });
    });

    it('returns not_found error when notification does not exist', async () => {
      spyOn(db.query.notifications, 'findFirst').mockResolvedValue(null as any);

      const result = await deleteNotification({
        userId: 'user-uuid-1',
        notificationId: 'nonexistent-id',
      });

      expect(result).toEqual({
        kind: 'not_found',
        message: 'Notification not found',
      });
    });

    it('returns access_denied when user tries to delete another users notification', async () => {
      const notification = {
        id: 'notif-uuid-1',
        userId: 'different-user-id',
        loanId: 'loan-uuid-1',
        type: 'loan_confirmed' as const,
        title: 'Empréstimo confirmado',
        message: 'João confirmou o empréstimo de "Livro".',
        read: false,
        sentAt: new Date('2026-02-17T10:00:00Z'),
        createdAt: new Date('2026-02-17T10:00:00Z'),
      };

      spyOn(db.query.notifications, 'findFirst').mockResolvedValue(notification);

      const result = await deleteNotification({
        userId: 'user-uuid-1',
        notificationId: 'notif-uuid-1',
      });

      expect(result).toEqual({
        kind: 'access_denied',
        message: 'You do not have permission to delete this notification',
      });
    });
  });
});
