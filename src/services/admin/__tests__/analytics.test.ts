import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { resetAllDbMocks } from '../../../__tests__/helpers/db-mock-reset.js';
import { db } from '../../../db/index.js';
import { getDashboardStats, getLoansStats, getUsersStats } from '../analytics.js';

const mocks: Array<{ mockRestore: () => void }> = [];

describe('Analytics Service', () => {
  beforeEach(() => {
    // Reset all db mocks from other test files
    resetAllDbMocks();

    // Clean any leftover mocks from previous tests
    for (const mock of mocks) {
      try {
        mock.mockRestore();
      } catch (_e) {
        // Already restored
      }
    }
    mocks.length = 0;
  });

  afterEach(() => {
    for (const mock of mocks) {
      mock.mockRestore();
    }
    mocks.length = 0;
  });

  describe('getDashboardStats', () => {
    it('should return complete dashboard statistics', async () => {
      mocks.push(
        spyOn(db.query.users, 'findMany').mockResolvedValueOnce([
          { id: '1', createdAt: new Date('2026-01-01'), isActive: true },
          { id: '2', createdAt: new Date('2026-02-01'), isActive: true },
        ] as any)
      );

      mocks.push(
        spyOn(db.query.items, 'findMany').mockResolvedValueOnce([
          { id: '1', isActive: true },
        ] as any)
      );

      mocks.push(
        spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
          {
            id: '1',
            status: 'confirmed',
            createdAt: new Date('2026-01-28'),
            returnedAt: null,
          },
        ] as any)
      );

      const stats = await getDashboardStats();

      expect(stats.summary.totalUsers).toBe(2);
      expect(stats.summary.activeUsers).toBe(2);
      expect(stats.summary.totalItems).toBe(1);
      expect(stats.summary.activeLoans).toBe(1);
      expect(stats.summary.totalLoans).toBe(1);
      expect(stats.trends.newUsersLastWeek).toBeGreaterThanOrEqual(0);
      expect(stats.trends.returnRateLast30Days).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getUsersStats', () => {
    it('should return user statistics grouped by role', async () => {
      mocks.push(
        spyOn(db.query.users, 'findMany').mockResolvedValueOnce([
          { id: '1', role: 'USER', isActive: true, blockedAt: null, emailVerified: true },
          { id: '2', role: 'USER', isActive: false, blockedAt: null, emailVerified: true },
          { id: '3', role: 'MODERATOR', isActive: true, blockedAt: null, emailVerified: true },
        ] as any)
      );

      const stats = await getUsersStats();

      expect(stats.byRole.USER).toBe(2);
      expect(stats.byRole.MODERATOR).toBe(1);
      expect(stats.activeUsers).toBe(2);
      expect(stats.emailVerifiedCount).toBe(3);
    });
  });

  describe('getLoansStats', () => {
    it('should return loan statistics by status', async () => {
      const returnedDate = new Date('2026-01-20');
      const createdDate = new Date('2026-01-10');

      mocks.push(
        spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
          { id: '1', status: 'pending', returnedAt: null, createdAt: createdDate },
          { id: '2', status: 'confirmed', returnedAt: null, createdAt: createdDate },
          { id: '3', status: 'returned', returnedAt: returnedDate, createdAt: createdDate },
        ] as any)
      );

      const stats = await getLoansStats();

      expect(stats.byStatus.pending).toBe(1);
      expect(stats.byStatus.confirmed).toBe(1);
      expect(stats.byStatus.returned).toBe(1);
      expect(stats.averageLoanDuration).toBeGreaterThanOrEqual(0);
    });
  });
});
