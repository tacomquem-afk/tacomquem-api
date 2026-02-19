import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { items, loans, users } from '../../db/schema.js';

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalItems: number;
  totalLoans: number;
  activeLoans: number;
  pendingLoans: number;
}

export interface UserStats {
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  totalUsers: number;
  growthRate: number;
}

export interface LoanStats {
  loansToday: number;
  loansThisWeek: number;
  loansThisMonth: number;
  averageLoanDuration: number;
  returnRate: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    totalUsersResult,
    activeUsersResult,
    totalItemsResult,
    totalLoansResult,
    activeLoansResult,
    pendingLoansResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(users).where(eq(users.isActive, true)),
    db.select({ count: count() }).from(items).where(eq(items.isActive, true)),
    db.select({ count: count() }).from(loans),
    db.select({ count: count() }).from(loans).where(eq(loans.status, 'confirmed')),
    db.select({ count: count() }).from(loans).where(eq(loans.status, 'pending')),
  ]);

  return {
    totalUsers: totalUsersResult[0]?.count || 0,
    activeUsers: activeUsersResult[0]?.count || 0,
    totalItems: totalItemsResult[0]?.count || 0,
    totalLoans: totalLoansResult[0]?.count || 0,
    activeLoans: activeLoansResult[0]?.count || 0,
    pendingLoans: pendingLoansResult[0]?.count || 0,
  };
}

export async function getUsersStats(): Promise<UserStats> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [totalResult, todayResult, weekResult, monthResult, lastMonthResult] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(users).where(gte(users.createdAt, startOfToday)),
    db.select({ count: count() }).from(users).where(gte(users.createdAt, startOfWeek)),
    db.select({ count: count() }).from(users).where(gte(users.createdAt, startOfMonth)),
    db
      .select({ count: count() })
      .from(users)
      .where(
        and(gte(users.createdAt, startOfLastMonth), sql`${users.createdAt} < ${startOfMonth}`)
      ),
  ]);

  const totalUsers = totalResult[0]?.count || 0;
  const newUsersThisMonth = monthResult[0]?.count || 0;
  const newUsersLastMonth = lastMonthResult[0]?.count || 0;

  const growthRate =
    newUsersLastMonth > 0
      ? Math.round(((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100 * 100) / 100
      : newUsersThisMonth > 0
        ? 100
        : 0;

  return {
    newUsersToday: todayResult[0]?.count || 0,
    newUsersThisWeek: weekResult[0]?.count || 0,
    newUsersThisMonth,
    totalUsers,
    growthRate,
  };
}

export async function getLoansStats(): Promise<LoanStats> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayResult, weekResult, monthResult, durationResult, returnedResult, totalResult] =
    await Promise.all([
      db.select({ count: count() }).from(loans).where(gte(loans.createdAt, startOfToday)),
      db.select({ count: count() }).from(loans).where(gte(loans.createdAt, startOfWeek)),
      db.select({ count: count() }).from(loans).where(gte(loans.createdAt, startOfMonth)),
      db
        .select({
          avgDays: sql<number>`coalesce(cast(avg(extract(epoch from (${loans.returnedAt} - ${loans.createdAt})) / 86400) as int), 0)`,
        })
        .from(loans)
        .where(sql`${loans.returnedAt} is not null`),
      db.select({ count: count() }).from(loans).where(eq(loans.status, 'returned')),
      db.select({ count: count() }).from(loans),
    ]);

  const totalLoans = totalResult[0]?.count || 0;
  const returnedLoans = returnedResult[0]?.count || 0;
  const returnRate =
    totalLoans > 0 ? Math.round((returnedLoans / totalLoans) * 100 * 100) / 100 : 0;

  return {
    loansToday: todayResult[0]?.count || 0,
    loansThisWeek: weekResult[0]?.count || 0,
    loansThisMonth: monthResult[0]?.count || 0,
    averageLoanDuration: durationResult[0]?.avgDays || 0,
    returnRate,
  };
}
