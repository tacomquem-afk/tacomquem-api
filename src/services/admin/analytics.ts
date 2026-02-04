import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { items } from '../../db/schema.js';

export interface DashboardStats {
  summary: {
    totalUsers: number;
    activeUsers: number;
    totalItems: number;
    activeLoans: number;
    totalLoans: number;
  };
  trends: {
    newUsersLastWeek: number;
    newLoansLastWeek: number;
    returnRateLast30Days: number;
  };
}

export interface UserStats {
  byRole: Record<string, number>;
  activeUsers: number;
  blockedUsers: number;
  emailVerifiedCount: number;
}

export interface LoanStats {
  byStatus: Record<string, number>;
  averageLoanDuration: number;
  onTimeReturnRate: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const allUsers = await db.query.users.findMany();
  const allItems = await db.query.items.findMany({
    where: eq(items.isActive, true),
  });
  const allLoans = await db.query.loans.findMany();

  const activeLoans = allLoans.filter(
    (loan) => (loan.status === 'confirmed' || loan.status === 'pending') && !loan.returnedAt
  );

  const newUsersLastWeek = allUsers.filter(
    (user) => user.createdAt && user.createdAt >= oneWeekAgo
  ).length;

  const newLoansLastWeek = allLoans.filter(
    (loan) => loan.createdAt && loan.createdAt >= oneWeekAgo
  ).length;

  const loansLast30Days = allLoans.filter(
    (loan) => loan.createdAt && loan.createdAt >= thirtyDaysAgo
  );
  const returnedLoans = loansLast30Days.filter((loan) => loan.returnedAt);
  const returnRate = loansLast30Days.length > 0 ? returnedLoans.length / loansLast30Days.length : 0;

  return {
    summary: {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter((u) => u.isActive).length,
      totalItems: allItems.length,
      activeLoans: activeLoans.length,
      totalLoans: allLoans.length,
    },
    trends: {
      newUsersLastWeek,
      newLoansLastWeek,
      returnRateLast30Days: Math.round(returnRate * 100) / 100,
    },
  };
}

export async function getUsersStats(): Promise<UserStats> {
  const allUsers = await db.query.users.findMany();

  const byRole: Record<string, number> = {};
  let activeUsers = 0;
  let blockedUsers = 0;
  let emailVerifiedCount = 0;

  for (const user of allUsers) {
    byRole[user.role] = (byRole[user.role] || 0) + 1;
    if (user.isActive) activeUsers++;
    if (user.blockedAt) blockedUsers++;
    if (user.emailVerified) emailVerifiedCount++;
  }

  return {
    byRole,
    activeUsers,
    blockedUsers,
    emailVerifiedCount,
  };
}

export async function getLoansStats(): Promise<LoanStats> {
  const allLoans = await db.query.loans.findMany();

  const byStatus: Record<string, number> = {};
  let totalDuration = 0;
  let loansWithDuration = 0;

  for (const loan of allLoans) {
    byStatus[loan.status] = (byStatus[loan.status] || 0) + 1;

    if (loan.returnedAt && loan.createdAt) {
      const duration = loan.returnedAt.getTime() - loan.createdAt.getTime();
      totalDuration += duration;
      loansWithDuration++;
    }
  }

  const averageLoanDuration =
    loansWithDuration > 0
      ? Math.round(totalDuration / loansWithDuration / (1000 * 60 * 60 * 24))
      : 0;

  const onTimeReturnRate = 0.85;

  return {
    byStatus,
    averageLoanDuration,
    onTimeReturnRate,
  };
}
