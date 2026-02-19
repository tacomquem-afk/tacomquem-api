import { and, eq, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { friendships, loans } from '../../db/schema.js';
import { BadRequestError, ErrorCodes } from '../../errors/index.js';
import { decrypt } from '../crypto/index.js';

interface FriendshipExecutor {
  insert: typeof db.insert;
}

export interface FriendshipOperationResult {
  created: boolean;
}

export interface FriendWithMetrics {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  lentCount: number;
  borrowedCount: number;
}

export function getCanonicalPair(user1Id: string, user2Id: string): [string, string] {
  if (user1Id === user2Id) {
    throw new BadRequestError(
      ErrorCodes.VALIDATION_INVALID_REQUEST,
      'A friendship cannot be created with the same user'
    );
  }

  return user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
}

export async function createFriendshipIfNotExists(
  user1Id: string,
  user2Id: string,
  originLoanId?: string,
  executor: FriendshipExecutor = db
): Promise<FriendshipOperationResult> {
  const [userAId, userBId] = getCanonicalPair(user1Id, user2Id);

  const result = await executor
    .insert(friendships)
    .values({
      userAId,
      userBId,
      originLoanId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: friendships.id });

  if (result[0]) {
    console.info('[friendships] friendship created', {
      userAId,
      userBId,
      originLoanId,
    });

    return { created: true };
  }

  console.info('[friendships] friendship already exists', {
    userAId,
    userBId,
    originLoanId,
  });

  return { created: false };
}

export async function getFriendsByUser(userId: string): Promise<FriendWithMetrics[]> {
  const userFriendships = await db.query.friendships.findMany({
    where: or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
    with: {
      userA: true,
      userB: true,
    },
  });

  if (userFriendships.length === 0) {
    return [];
  }

  const friendsMap = new Map<string, FriendWithMetrics>();

  for (const friendship of userFriendships) {
    const friend = friendship.userAId === userId ? friendship.userB : friendship.userA;

    if (!friend) {
      continue;
    }

    friendsMap.set(friend.id, {
      id: friend.id,
      name: decrypt(friend.nameEncrypted),
      // biome-ignore lint/style/noNonNullAssertion: friendships are cascade-deleted when user is deleted
      email: decrypt(friend.emailEncrypted!),
      avatarUrl: friend.avatarUrl,
      lentCount: 0,
      borrowedCount: 0,
    });
  }

  const loansByUser = await db.query.loans.findMany({
    where: and(
      or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
      or(eq(loans.status, 'confirmed'), eq(loans.status, 'returned'))
    ),
    columns: {
      lenderId: true,
      borrowerId: true,
    },
  });

  for (const loan of loansByUser) {
    if (!loan.borrowerId) {
      continue;
    }

    if (loan.lenderId === userId) {
      const friend = friendsMap.get(loan.borrowerId);
      if (friend) {
        friend.lentCount += 1;
      }
      continue;
    }

    if (loan.borrowerId === userId) {
      const friend = friendsMap.get(loan.lenderId);
      if (friend) {
        friend.borrowedCount += 1;
      }
    }
  }

  return Array.from(friendsMap.values()).sort(
    (a, b) => b.lentCount + b.borrowedCount - (a.lentCount + a.borrowedCount)
  );
}
