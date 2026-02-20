import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { resetAllDbMocks } from '../../../__tests__/helpers/db-mock-reset.js';
import { db } from '../../../db/index.js';
import { getDashboardStats, getLoansStats, getUsersStats } from '../analytics.js';

const mocks: Array<{ mockRestore: () => void }> = [];

describe('Analytics Service', () => {
  beforeEach(() => {
    resetAllDbMocks();
    for (const m of mocks) {
      try {
        m.mockRestore();
      } catch (_e) {}
    }
    mocks.length = 0;
  });

  afterEach(() => {
    for (const m of mocks) {
      m.mockRestore();
    }
    mocks.length = 0;
  });

  describe('getDashboardStats', () => {
    it('should return flat dashboard statistics with pending loans', async () => {
      mocks.push(
        spyOn(db, 'select')
          .mockReturnValueOnce({
            from: () => Promise.resolve([{ count: 100 }]),
          } as any)
          .mockReturnValueOnce({
            from: () => ({ where: () => Promise.resolve([{ count: 85 }]) }),
          } as any)
          .mockReturnValueOnce({
            from: () => ({ where: () => Promise.resolve([{ count: 50 }]) }),
          } as any)
          .mockReturnValueOnce({
            from: () => Promise.resolve([{ count: 200 }]),
          } as any)
          .mockReturnValueOnce({
            from: () => ({ where: () => Promise.resolve([{ count: 30 }]) }),
          } as any)
          .mockReturnValueOnce({
            from: () => ({ where: () => Promise.resolve([{ count: 15 }]) }),
          } as any)
      );

      const stats = await getDashboardStats();

      expect(stats.totalUsers).toBe(100);
      expect(stats.activeUsers).toBe(85);
      expect(stats.totalItems).toBe(50);
      expect(stats.totalLoans).toBe(200);
      expect(stats.activeLoans).toBe(30);
      expect(stats.pendingLoans).toBe(15);
    });

    it('should return zeros when no data exists', async () => {
      mocks.push(
        spyOn(db, 'select')
          .mockReturnValueOnce({
            from: () => Promise.resolve([{ count: 0 }]),
          } as any)
          .mockReturnValueOnce({
            from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
          } as any)
          .mockReturnValueOnce({
            from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
          } as any)
          .mockReturnValueOnce({
            from: () => Promise.resolve([{ count: 0 }]),
          } as any)
          .mockReturnValueOnce({
            from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
          } as any)
          .mockReturnValueOnce({
            from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
          } as any)
      );

      const stats = await getDashboardStats();

      expect(stats.totalUsers).toBe(0);
      expect(stats.activeUsers).toBe(0);
      expect(stats.totalItems).toBe(0);
      expect(stats.totalLoans).toBe(0);
      expect(stats.activeLoans).toBe(0);
      expect(stats.pendingLoans).toBe(0);
    });
  });

  describe('getUsersStats', () => {
    it('should return user growth statistics with growth rate', async () => {
      mocks.push(
        spyOn(db, 'select')
          .mockReturnValueOnce({ from: () => [{ count: 100 }] } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 5 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 20 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 40 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 30 }] }) } as any)
      );

      const stats = await getUsersStats();

      expect(stats.totalUsers).toBe(100);
      expect(stats.newUsersToday).toBe(5);
      expect(stats.newUsersThisWeek).toBe(20);
      expect(stats.newUsersThisMonth).toBe(40);
      expect(stats.growthRate).toBeCloseTo(33.33, 1);
    });

    it('should handle zero users last month (growth = 100 if new users exist)', async () => {
      mocks.push(
        spyOn(db, 'select')
          .mockReturnValueOnce({ from: () => [{ count: 10 }] } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 2 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 5 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 10 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
      );

      const stats = await getUsersStats();
      expect(stats.growthRate).toBe(100);
    });

    it('should return zero growth rate when no users', async () => {
      mocks.push(
        spyOn(db, 'select')
          .mockReturnValueOnce({ from: () => [{ count: 0 }] } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
      );

      const stats = await getUsersStats();
      expect(stats.growthRate).toBe(0);
    });
  });

  describe('getLoansStats', () => {
    it('should return loan time-range stats and computed return rate', async () => {
      mocks.push(
        spyOn(db, 'select')
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 3 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 15 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 40 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ avgDays: 12 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 80 }] }) } as any)
          .mockReturnValueOnce({ from: () => [{ count: 100 }] } as any)
      );

      const stats = await getLoansStats();

      expect(stats.loansToday).toBe(3);
      expect(stats.loansThisWeek).toBe(15);
      expect(stats.loansThisMonth).toBe(40);
      expect(stats.averageLoanDuration).toBe(12);
      expect(stats.returnRate).toBe(80);
    });

    it('should handle zero total loans gracefully', async () => {
      mocks.push(
        spyOn(db, 'select')
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ avgDays: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => [{ count: 0 }] } as any)
      );

      const stats = await getLoansStats();

      expect(stats.returnRate).toBe(0);
      expect(stats.averageLoanDuration).toBe(0);
    });

    it('should calculate return rate as percentage', async () => {
      mocks.push(
        spyOn(db, 'select')
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 0 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ avgDays: 5 }] }) } as any)
          .mockReturnValueOnce({ from: () => ({ where: () => [{ count: 85 }] }) } as any)
          .mockReturnValueOnce({ from: () => [{ count: 100 }] } as any)
      );

      const stats = await getLoansStats();

      expect(stats.returnRate).toBe(85);
    });
  });
});
