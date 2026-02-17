import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { resetAllDbMocks } from '../../../__tests__/helpers/db-mock-reset.js';
import { db } from '../../../db/index.js';
import * as cryptoService from '../../crypto/index.js';
import * as friendshipsService from '../../friendships/index.js';
import { getDashboardData, getFriends, searchDashboard } from '../index.js';

const mocks: Array<{ mockRestore: () => void }> = [];

beforeAll(() => {
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

describe('dashboard service', () => {
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
  describe('getDashboardData', () => {
    it('should return dashboard data with stats and loans', async () => {
      const userId = 'user-123';
      const now = new Date();

      const mockItem = {
        id: 'item-1',
        name: 'Laptop',
        description: 'My laptop',
        images: '[]',
        isActive: true,
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
      };

      const mockLender = {
        id: userId,
        emailEncrypted: 'encrypted-email',
        nameEncrypted: 'encrypted-name',
        emailHash: 'hash',
        passwordHash: 'hash',
        avatarUrl: null,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };

      const mockBorrower = {
        id: 'user-456',
        emailEncrypted: 'encrypted-email2',
        nameEncrypted: 'encrypted-name2',
        emailHash: 'hash2',
        passwordHash: 'hash2',
        avatarUrl: 'https://example.com/avatar.jpg',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };

      const mockActiveLoan = {
        id: 'loan-1',
        itemId: 'item-1',
        lenderId: userId,
        borrowerId: 'user-456',
        borrowerEmail: 'borrower@example.com',
        status: 'confirmed' as const,
        expectedReturnDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        lenderNotes: 'Notes',
        borrowerNotes: null,
        confirmedAt: now,
        returnedAt: null,
        createdAt: now,
        updatedAt: now,
        item: mockItem,
        lender: mockLender,
        borrower: mockBorrower,
      };

      const mockNotification = {
        id: 'notif-1',
        userId,
        loanId: 'loan-1',
        type: 'loan_created' as const,
        title: 'Loan created',
        message: 'You created a loan',
        read: false,
        sentAt: now,
        createdAt: now,
      };

      mocks.push(
        spyOn(db, 'select').mockImplementation(
          () =>
            ({
              from: () => ({
                where: () => [{ count: 1 }],
              }),
            }) as any
        )
      );

      mocks.push(spyOn(db.query.notifications, 'findMany').mockResolvedValue([mockNotification]));

      mocks.push(
        spyOn(db.query.loans, 'findMany')
          .mockResolvedValueOnce(
            [mockActiveLoan] // pendingLoans query
          )
          .mockResolvedValueOnce([mockActiveLoan])
      ); // activeLoans query

      mocks.push(
        spyOn(cryptoService, 'decrypt').mockImplementation((text) => {
          if (text === 'encrypted-name') return 'John Doe';
          if (text === 'encrypted-name2') return 'Jane Smith';
          return text;
        })
      );

      const data = await getDashboardData(userId);

      expect(data.stats.itemsCount).toBe(1);
      expect(data.stats.activeLentCount).toBe(1);
      expect(data.stats.activeBorrowedCount).toBe(1);
      expect(data.stats.pendingCount).toBe(1);

      expect(data.recentActivity).toHaveLength(1);
      const activity = data.recentActivity[0];
      if (activity) {
        expect(activity.type).toBe('loan_created');
      }

      expect(data.loans).toHaveLength(1);
      const activeLoan = data.loans[0];
      if (activeLoan) {
        expect(activeLoan.otherParty).toBe('Jane Smith');
        expect(activeLoan.role).toBe('lender');
      }
    });

    it('should not include returned loans in activeLoans', async () => {
      const userId = 'user-123';
      const now = new Date();

      const mockItem = {
        id: 'item-1',
        name: 'Laptop',
        description: 'My laptop',
        images: '[]',
        isActive: true,
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
      };

      const mockLender = {
        id: userId,
        emailEncrypted: 'encrypted-email',
        nameEncrypted: 'encrypted-name',
        emailHash: 'hash',
        passwordHash: 'hash',
        avatarUrl: null,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };

      const mockBorrower = {
        id: 'user-456',
        emailEncrypted: 'encrypted-email2',
        nameEncrypted: 'encrypted-name2',
        emailHash: 'hash2',
        passwordHash: 'hash2',
        avatarUrl: null,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };

      const mockConfirmedLoan = {
        id: 'loan-confirmed',
        itemId: 'item-1',
        lenderId: userId,
        borrowerId: 'user-456',
        borrowerEmail: 'borrower@example.com',
        status: 'confirmed' as const,
        expectedReturnDate: null,
        lenderNotes: null,
        borrowerNotes: null,
        confirmedAt: now,
        returnedAt: null,
        createdAt: now,
        updatedAt: now,
        item: mockItem,
        lender: mockLender,
        borrower: mockBorrower,
      };

      mocks.push(
        spyOn(db, 'select').mockImplementation(
          () =>
            ({
              from: () => ({
                where: () => [{ count: 1 }],
              }),
            }) as any
        )
      );

      mocks.push(spyOn(db.query.notifications, 'findMany').mockResolvedValue([]));
      mocks.push(
        spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([mockConfirmedLoan] as any)
      );
      mocks.push(spyOn(cryptoService, 'decrypt').mockReturnValue('Nome'));

      const data = await getDashboardData(userId);

      expect(data.loans).toHaveLength(1);
      expect(data.loans[0]?.id).toBe('loan-confirmed');
    });
  });

  describe('getFriends', () => {
    it('should return friends list from friendships service', async () => {
      const userId = 'user-123';
      const expected = [
        {
          id: 'friend-1',
          name: 'Friend Name',
          email: 'friend@example.com',
          avatarUrl: 'https://example.com/avatar.jpg',
          lentCount: 2,
          borrowedCount: 1,
        },
      ];

      mocks.push(spyOn(friendshipsService, 'getFriendsByUser').mockResolvedValueOnce(expected));

      const friends = await getFriends(userId);

      expect(friends).toEqual(expected);
    });

    it('should return empty array when user has no friends', async () => {
      mocks.push(spyOn(friendshipsService, 'getFriendsByUser').mockResolvedValueOnce([]));

      const friends = await getFriends('user-123');

      expect(friends).toHaveLength(0);
    });
  });

  describe('searchDashboard', () => {
    it('should return matched items and friends respecting limit', async () => {
      const userId = 'user-123';
      const now = new Date();

      mocks.push(
        spyOn(db.query.items, 'findMany').mockResolvedValueOnce([
          {
            id: 'item-1',
            ownerId: userId,
            name: 'Camera Sony',
            description: 'Camera principal',
            images: '[]',
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        ] as any)
      );

      mocks.push(
        spyOn(friendshipsService, 'getFriendsByUser').mockResolvedValueOnce([
          {
            id: 'friend-1',
            name: 'Ana Souza',
            email: 'ana@example.com',
            avatarUrl: null,
            lentCount: 1,
            borrowedCount: 0,
          },
          {
            id: 'friend-2',
            name: 'Bruno Lima',
            email: 'bruno@example.com',
            avatarUrl: null,
            lentCount: 0,
            borrowedCount: 1,
          },
        ])
      );

      const result = await searchDashboard(userId, 'ana', 1);

      expect(result.query).toBe('ana');
      expect(result.items).toHaveLength(1);
      expect(result.friends).toHaveLength(1);
      expect(result.friends[0]?.id).toBe('friend-1');
      expect(result.meta.itemCount).toBe(1);
      expect(result.meta.friendCount).toBe(1);
      expect(result.meta.limit).toBe(1);
    });

    it('should trim query before searching friends', async () => {
      const userId = 'user-123';

      mocks.push(spyOn(db.query.items, 'findMany').mockResolvedValueOnce([] as any));

      mocks.push(
        spyOn(friendshipsService, 'getFriendsByUser').mockResolvedValueOnce([
          {
            id: 'friend-1',
            name: 'Carlos Silva',
            email: 'carlos@example.com',
            avatarUrl: null,
            lentCount: 0,
            borrowedCount: 0,
          },
        ])
      );

      const result = await searchDashboard(userId, '  carlos  ', 10);

      expect(result.query).toBe('carlos');
      expect(result.items).toHaveLength(0);
      expect(result.friends).toHaveLength(1);
      expect(result.friends[0]?.email).toBe('carlos@example.com');
    });
  });
});
