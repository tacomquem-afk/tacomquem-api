import { eq, and, or, desc, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { loans, items, users, notifications } from '../../db/schema.js';
import { decrypt } from '../crypto/index.js';

export interface DashboardStats {
  itemsCount: number;
  activeLentCount: number;
  activeBorrowedCount: number;
  pendingCount: number;
}

export interface RecentActivity {
  id: string;
  type: 'loan_created' | 'loan_confirmed' | 'loan_returned' | 'loan_reminder';
  message: string;
  createdAt: Date;
  read: boolean;
}

export interface DashboardData {
  stats: DashboardStats;
  recentActivity: RecentActivity[];
  pendingLoans: Array<{
    id: string;
    itemName: string;
    borrowerEmail: string;
    createdAt: Date;
  }>;
  activeLoans: Array<{
    id: string;
    itemName: string;
    itemImages: string[];
    otherParty: string;
    role: 'lender' | 'borrower';
    expectedReturnDate: Date | null;
    confirmedAt: Date;
  }>;
}

function parseImages(imagesJson: string): string[] {
  try {
    return JSON.parse(imagesJson);
  } catch {
    return [];
  }
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const [itemsCount] = await db
    .select({ count: count() })
    .from(items)
    .where(and(eq(items.ownerId, userId), eq(items.isActive, true)));

  const [activeLentCount] = await db
    .select({ count: count() })
    .from(loans)
    .where(and(eq(loans.lenderId, userId), eq(loans.status, 'confirmed')));

  const [activeBorrowedCount] = await db
    .select({ count: count() })
    .from(loans)
    .where(and(eq(loans.borrowerId, userId), eq(loans.status, 'confirmed')));

  const [pendingCount] = await db
    .select({ count: count() })
    .from(loans)
    .where(and(eq(loans.lenderId, userId), eq(loans.status, 'pending')));

  const recentNotifications = await db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: [desc(notifications.createdAt)],
    limit: 10,
  });

  const pendingLoans = await db.query.loans.findMany({
    where: and(eq(loans.lenderId, userId), eq(loans.status, 'pending')),
    with: { item: true },
    orderBy: [desc(loans.createdAt)],
    limit: 5,
  });

  const activeLoans = await db.query.loans.findMany({
    where: and(
      or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
      eq(loans.status, 'confirmed')
    ),
    with: {
      item: true,
      lender: true,
      borrower: true,
    },
    orderBy: [desc(loans.confirmedAt)],
    limit: 10,
  });

  return {
    stats: {
      itemsCount: itemsCount.count,
      activeLentCount: activeLentCount.count,
      activeBorrowedCount: activeBorrowedCount.count,
      pendingCount: pendingCount.count,
    },
    recentActivity: recentNotifications.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      createdAt: n.createdAt,
      read: n.read,
    })),
    pendingLoans: pendingLoans.map((l) => ({
      id: l.id,
      itemName: l.item.name,
      borrowerEmail: l.borrowerEmail || '',
      createdAt: l.createdAt,
    })),
    activeLoans: activeLoans.map((l) => {
      const isLender = l.lenderId === userId;
      const otherParty = isLender
        ? l.borrower
          ? decrypt(l.borrower.nameEncrypted)
          : 'Pendente'
        : decrypt(l.lender.nameEncrypted);

      return {
        id: l.id,
        itemName: l.item.name,
        itemImages: parseImages(l.item.images),
        otherParty,
        role: isLender ? 'lender' : 'borrower',
        expectedReturnDate: l.expectedReturnDate,
        confirmedAt: l.confirmedAt!,
      };
    }),
  };
}

export interface Friend {
  id: string;
  name: string;
  avatarUrl: string | null;
  lentCount: number;
  borrowedCount: number;
}

export async function getFriends(userId: string): Promise<Friend[]> {
  const lentLoans = await db.query.loans.findMany({
    where: and(eq(loans.lenderId, userId), eq(loans.status, 'confirmed')),
    with: { borrower: true },
  });

  const borrowedLoans = await db.query.loans.findMany({
    where: and(eq(loans.borrowerId, userId), eq(loans.status, 'confirmed')),
    with: { lender: true },
  });

  const friendsMap = new Map<string, Friend>();

  for (const loan of lentLoans) {
    if (!loan.borrower) continue;

    const existing = friendsMap.get(loan.borrower.id);
    if (existing) {
      existing.lentCount++;
    } else {
      friendsMap.set(loan.borrower.id, {
        id: loan.borrower.id,
        name: decrypt(loan.borrower.nameEncrypted),
        avatarUrl: loan.borrower.avatarUrl,
        lentCount: 1,
        borrowedCount: 0,
      });
    }
  }

  for (const loan of borrowedLoans) {
    const existing = friendsMap.get(loan.lender.id);
    if (existing) {
      existing.borrowedCount++;
    } else {
      friendsMap.set(loan.lender.id, {
        id: loan.lender.id,
        name: decrypt(loan.lender.nameEncrypted),
        avatarUrl: loan.lender.avatarUrl,
        lentCount: 0,
        borrowedCount: 1,
      });
    }
  }

  return Array.from(friendsMap.values()).sort(
    (a, b) => (b.lentCount + b.borrowedCount) - (a.lentCount + a.borrowedCount)
  );
}
