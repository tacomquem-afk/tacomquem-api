import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import { BadRequestError, ErrorCodes } from '../../../errors/index.js';
import * as cryptoService from '../../crypto/index.js';
import { createFriendshipIfNotExists, getCanonicalPair, getFriendsByUser } from '../index.js';

const mocks: Array<{ mockRestore: () => void }> = [];

describe('friendships service', () => {
  beforeEach(() => {
    for (const mock of mocks) {
      mock.mockRestore();
    }
    mocks.length = 0;
  });

  describe('getCanonicalPair', () => {
    it('should keep canonical order', () => {
      const [userA, userB] = getCanonicalPair('b-user', 'a-user');

      expect(userA).toBe('a-user');
      expect(userB).toBe('b-user');
    });

    it('should block self friendship', () => {
      let errorThrown = false;

      try {
        getCanonicalPair('same-user', 'same-user');
      } catch (error) {
        errorThrown = true;
        expect(error).toBeInstanceOf(BadRequestError);
        expect((error as BadRequestError).code).toBe(ErrorCodes.VALIDATION_INVALID_REQUEST);
      }

      expect(errorThrown).toBe(true);
    });
  });

  describe('createFriendshipIfNotExists', () => {
    it('should create only once and be idempotent for same pair', async () => {
      const insertCalls: Array<unknown> = [];
      const fakeExecutor = {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: async () => {
                insertCalls.push(null);
                return insertCalls.length === 1 ? [{ id: 'friendship-1' }] : [];
              },
            }),
          }),
        }),
      };

      const created = await createFriendshipIfNotExists(
        'user-b',
        'user-a',
        'loan-1',
        fakeExecutor as any
      );

      expect(created.created).toBe(true);

      const existing = await createFriendshipIfNotExists(
        'user-a',
        'user-b',
        'loan-1',
        fakeExecutor as any
      );

      expect(existing.created).toBe(false);
    });

    it('should throw on self friendship', async () => {
      let errorThrown = false;

      try {
        await createFriendshipIfNotExists('same-user', 'same-user');
      } catch (error) {
        errorThrown = true;
        expect(error).toBeInstanceOf(BadRequestError);
        expect((error as BadRequestError).code).toBe(ErrorCodes.VALIDATION_INVALID_REQUEST);
      }

      expect(errorThrown).toBe(true);
    });
  });

  describe('getFriendsByUser', () => {
    it('should return friends with lending/borrowing metrics', async () => {
      const now = new Date('2026-02-13T10:00:00.000Z');
      const userId = 'user-1';

      mocks.push(
        spyOn(db.query.friendships, 'findMany').mockResolvedValueOnce([
          {
            id: 'friendship-1',
            userAId: userId,
            userBId: 'friend-1',
            originLoanId: 'loan-1',
            createdAt: now,
            updatedAt: now,
            userA: {
              id: userId,
              nameEncrypted: 'encrypted-user-1-name',
              emailEncrypted: 'encrypted-user-1-email',
              avatarUrl: null,
            },
            userB: {
              id: 'friend-1',
              nameEncrypted: 'encrypted-friend-name',
              emailEncrypted: 'encrypted-friend-email',
              avatarUrl: 'https://example.com/avatar.jpg',
            },
          },
        ] as any)
      );

      mocks.push(
        spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
          { lenderId: userId, borrowerId: 'friend-1' },
          { lenderId: 'friend-1', borrowerId: userId },
        ] as any)
      );

      mocks.push(
        spyOn(cryptoService, 'decrypt').mockImplementation((value: string) => {
          if (value === 'encrypted-friend-name') return 'Friend Name';
          if (value === 'encrypted-friend-email') return 'friend@example.com';
          return value;
        })
      );

      const friends = await getFriendsByUser(userId);

      expect(friends).toHaveLength(1);
      const friend = friends[0];
      if (friend) {
        expect(friend.id).toBe('friend-1');
        expect(friend.name).toBe('Friend Name');
        expect(friend.email).toBe('friend@example.com');
        expect(friend.avatarUrl).toBe('https://example.com/avatar.jpg');
        expect(friend.lentCount).toBe(1);
        expect(friend.borrowedCount).toBe(1);
      }
    });

    it('should return empty list when there are no friendships', async () => {
      mocks.push(spyOn(db.query.friendships, 'findMany').mockResolvedValueOnce([]));

      const friends = await getFriendsByUser('user-1');

      expect(friends).toHaveLength(0);
    });
  });
});
