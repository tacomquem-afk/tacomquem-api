import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { items, loans, notifications } from '../../db/schema.js';
import { decrypt } from '../crypto/index.js';
import { getFriendsByUser } from '../friendships/index.js';
import { resolveImageKeys } from '../storage/index.js';

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
  createdAt: string;
  read: boolean;
}

export interface DashboardLoan {
  id: string;
  itemName: string;
  itemImages: string[];
  status: 'pending' | 'confirmed';
  otherParty: string | null;
  role: 'lender' | 'borrower';
  expectedReturnDate: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface DashboardData {
  stats: DashboardStats;
  recentActivity: RecentActivity[];
  loans: DashboardLoan[];
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const itemsCountResult = await db
    .select({ count: count() })
    .from(items)
    .where(and(eq(items.ownerId, userId), eq(items.isActive, true)));

  const activeLentCountResult = await db
    .select({ count: count() })
    .from(loans)
    .where(and(eq(loans.lenderId, userId), eq(loans.status, 'confirmed')));

  const activeBorrowedCountResult = await db
    .select({ count: count() })
    .from(loans)
    .where(and(eq(loans.borrowerId, userId), eq(loans.status, 'confirmed')));

  const pendingCountResult = await db
    .select({ count: count() })
    .from(loans)
    .where(and(eq(loans.lenderId, userId), eq(loans.status, 'pending')));

  const recentNotifications = await db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: [desc(notifications.createdAt)],
    limit: 10,
  });

  const allLoans = await db.query.loans.findMany({
    where: and(
      or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
      or(eq(loans.status, 'pending'), eq(loans.status, 'confirmed'))
    ),
    with: {
      item: true,
      lender: true,
      borrower: true,
    },
    orderBy: [desc(loans.createdAt)],
  });

  return {
    stats: {
      itemsCount: itemsCountResult[0]?.count || 0,
      activeLentCount: activeLentCountResult[0]?.count || 0,
      activeBorrowedCount: activeBorrowedCountResult[0]?.count || 0,
      pendingCount: pendingCountResult[0]?.count || 0,
    },
    recentActivity: recentNotifications.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      createdAt: n.createdAt.toISOString(),
      read: n.read,
    })),
    loans: await Promise.all(
      allLoans
        .filter((l) => l.item && (l.lenderId === userId || l.borrowerId === userId))
        .map(async (l) => {
          const isLender = l.lenderId === userId;
          const otherParty = isLender
            ? l.borrower
              ? decrypt(l.borrower.nameEncrypted)
              : (l.borrowerEmail ?? 'Pendente')
            : decrypt(l.lender.nameEncrypted);

          return {
            id: l.id,
            itemName: l.item.name,
            itemImages: await resolveImageKeys(l.item.images),
            status: l.status as 'pending' | 'confirmed',
            otherParty,
            role: isLender ? ('lender' as const) : ('borrower' as const),
            expectedReturnDate: l.expectedReturnDate?.toISOString() ?? null,
            createdAt: l.createdAt.toISOString(),
            confirmedAt: l.confirmedAt?.toISOString() ?? null,
          };
        })
    ),
  };
}

export interface Friend {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  lentCount: number;
  borrowedCount: number;
}

export async function getFriends(userId: string): Promise<Friend[]> {
  return getFriendsByUser(userId);
}

export interface DashboardSearchItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface DashboardSearchResult {
  query: string;
  items: DashboardSearchItem[];
  friends: Friend[];
  meta: {
    itemCount: number;
    friendCount: number;
    limit: number;
  };
}

export async function searchDashboard(
  userId: string,
  query: string,
  limit: number
): Promise<DashboardSearchResult> {
  const normalizedQuery = query.trim().toLowerCase();
  const likeQuery = `%${normalizedQuery}%`;

  const [matchedItems, friends] = await Promise.all([
    db.query.items.findMany({
      where: and(
        eq(items.ownerId, userId),
        eq(items.isActive, true),
        or(ilike(items.name, likeQuery), ilike(items.description, likeQuery))
      ),
      orderBy: [desc(items.updatedAt)],
      limit,
    }),
    getFriendsByUser(userId),
  ]);

  const matchedFriends = friends
    .filter((friend) => {
      const name = friend.name.toLowerCase();
      const email = friend.email.toLowerCase();
      return name.includes(normalizedQuery) || email.includes(normalizedQuery);
    })
    .slice(0, limit);

  const itemResults = await Promise.all(
    matchedItems.map(async (item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: (await resolveImageKeys(item.images))[0] ?? null,
    }))
  );

  return {
    query: query.trim(),
    items: itemResults,
    friends: matchedFriends,
    meta: {
      itemCount: itemResults.length,
      friendCount: matchedFriends.length,
      limit,
    },
  };
}
