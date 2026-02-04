import { beforeAll, describe, expect, it, spyOn } from 'bun:test';

import { db } from '../../../db/index.js';
import * as cryptoService from '../../crypto/index.js';
import { getDashboardData, getFriends } from '../index.js';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

describe('dashboard service', () => {
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

      spyOn(db, 'select').mockImplementation(
        () =>
          ({
            from: () => ({
              where: () => [{ count: 1 }],
            }),
          }) as any
      );

      spyOn(db.query.notifications, 'findMany').mockResolvedValue([mockNotification]);

      spyOn(db.query.loans, 'findMany')
        .mockResolvedValueOnce(
          [mockActiveLoan] // pendingLoans query
        )
        .mockResolvedValueOnce([mockActiveLoan]); // activeLoans query

      spyOn(cryptoService, 'decrypt').mockImplementation((text) => {
        if (text === 'encrypted-name') return 'John Doe';
        if (text === 'encrypted-name2') return 'Jane Smith';
        return text;
      });

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

      expect(data.pendingLoans).toHaveLength(1);
      const pendingLoan = data.pendingLoans[0];
      if (pendingLoan) {
        expect(pendingLoan.itemName).toBe('Laptop');
      }

      expect(data.activeLoans).toHaveLength(1);
      const activeLoan = data.activeLoans[0];
      if (activeLoan) {
        expect(activeLoan.otherParty).toBe('Jane Smith');
        expect(activeLoan.role).toBe('lender');
      }
    });
  });

  describe('getFriends', () => {
    it('should return friends list with lent and borrowed counts', async () => {
      const userId = 'user-123';
      const friendId = 'user-456';
      const now = new Date();

      const mockFriend = {
        id: friendId,
        emailEncrypted: 'encrypted',
        nameEncrypted: 'encrypted',
        emailHash: 'hash2',
        passwordHash: 'hash2',
        avatarUrl: 'https://example.com/avatar.jpg',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };

      const mockLentLoan = {
        id: 'loan-1',
        itemId: 'item-1',
        lenderId: userId,
        borrowerId: friendId,
        borrowerEmail: 'friend@example.com',
        status: 'confirmed' as const,
        expectedReturnDate: null,
        lenderNotes: null,
        borrowerNotes: null,
        confirmedAt: now,
        returnedAt: null,
        createdAt: now,
        updatedAt: now,
        borrower: mockFriend,
      };

      const mockBorrowedLoan = {
        id: 'loan-2',
        itemId: 'item-2',
        lenderId: friendId,
        borrowerId: userId,
        borrowerEmail: 'user@example.com',
        status: 'confirmed' as const,
        expectedReturnDate: null,
        lenderNotes: null,
        borrowerNotes: null,
        confirmedAt: now,
        returnedAt: null,
        createdAt: now,
        updatedAt: now,
        lender: mockFriend,
      };

      spyOn(db.query.loans, 'findMany')
        .mockResolvedValueOnce([mockLentLoan]) // lentLoans
        .mockResolvedValueOnce([mockBorrowedLoan]); // borrowedLoans

      spyOn(cryptoService, 'decrypt').mockReturnValue('Friend Name');

      const friends = await getFriends(userId);

      expect(friends).toHaveLength(1);
      const friend = friends[0];
      if (friend) {
        expect(friend.id).toBe(friendId);
        expect(friend.name).toBe('Friend Name');
        expect(friend.lentCount).toBe(1);
        expect(friend.borrowedCount).toBe(1);
        expect(friend.avatarUrl).toBe('https://example.com/avatar.jpg');
      }
    });

    it('should return empty array when user has no friends', async () => {
      const userId = 'user-123';

      spyOn(db.query.loans, 'findMany')
        .mockResolvedValueOnce([]) // lentLoans
        .mockResolvedValueOnce([]); // borrowedLoans

      const friends = await getFriends(userId);

      expect(friends).toHaveLength(0);
    });

    it('should sort friends by total interaction count', async () => {
      const userId = 'user-123';
      const now = new Date();

      const friend1 = {
        id: 'friend-1',
        emailEncrypted: 'encrypted',
        nameEncrypted: 'encrypted',
        emailHash: 'hash1',
        passwordHash: 'hash1',
        avatarUrl: null,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };

      const friend2 = {
        id: 'friend-2',
        emailEncrypted: 'encrypted',
        nameEncrypted: 'encrypted',
        emailHash: 'hash2',
        passwordHash: 'hash2',
        avatarUrl: null,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };

      const mockLoan1 = {
        id: 'loan-1',
        itemId: 'item-1',
        lenderId: userId,
        borrowerId: 'friend-1',
        borrowerEmail: 'friend1@example.com',
        status: 'confirmed' as const,
        expectedReturnDate: null,
        lenderNotes: null,
        borrowerNotes: null,
        confirmedAt: now,
        returnedAt: null,
        createdAt: now,
        updatedAt: now,
        borrower: friend1,
      };

      const mockLoan2a = {
        id: 'loan-2a',
        itemId: 'item-2a',
        lenderId: userId,
        borrowerId: 'friend-2',
        borrowerEmail: 'friend2@example.com',
        status: 'confirmed' as const,
        expectedReturnDate: null,
        lenderNotes: null,
        borrowerNotes: null,
        confirmedAt: now,
        returnedAt: null,
        createdAt: now,
        updatedAt: now,
        borrower: friend2,
      };

      const mockLoan2b = {
        id: 'loan-2b',
        itemId: 'item-2b',
        lenderId: userId,
        borrowerId: 'friend-2',
        borrowerEmail: 'friend2@example.com',
        status: 'confirmed' as const,
        expectedReturnDate: null,
        lenderNotes: null,
        borrowerNotes: null,
        confirmedAt: now,
        returnedAt: null,
        createdAt: now,
        updatedAt: now,
        borrower: friend2,
      };

      spyOn(db.query.loans, 'findMany')
        .mockResolvedValueOnce([mockLoan1, mockLoan2a, mockLoan2b]) // lentLoans
        .mockResolvedValueOnce([]); // borrowedLoans

      spyOn(cryptoService, 'decrypt').mockReturnValue('Friend');

      const friends = await getFriends(userId);

      expect(friends).toHaveLength(2);
      const resultFriend1 = friends[0];
      const resultFriend2 = friends[1];
      if (resultFriend1 && resultFriend2) {
        expect(resultFriend1.id).toBe('friend-2'); // 2 loans
        expect(resultFriend2.id).toBe('friend-1'); // 1 loan
      }
    });
  });
});
