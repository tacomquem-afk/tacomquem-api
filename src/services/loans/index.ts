import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { betaInvites, items, loans, loanTokens, notifications, users } from '../../db/schema.js';
import { BadRequestError, ErrorCodes, GoneError, NotFoundError } from '../../errors/index.js';
import type { CreateLoanInput } from '../../schemas/loans.js';
import { decryptSafe, hash } from '../crypto/index.js';
import {
  buildLoanConfirmationRequestEmail,
  buildLoanReminderEmail,
  sendEmail,
} from '../email/index.js';
import { createFriendshipIfNotExists } from '../friendships/index.js';
import { resolveImageKeys } from '../storage/index.js';

const TOKEN_EXPIRY_DAYS = 7;

export interface LoanResponse {
  id: string;
  item: {
    id: string;
    name: string;
    images: string[];
  };
  lender: {
    id: string;
    name: string;
  };
  borrower: {
    id: string;
    name: string;
  } | null;
  borrowerEmail: string | null;
  status: 'pending' | 'confirmed' | 'returned' | 'cancelled';
  expectedReturnDate: string | null;
  lenderNotes: string | null;
  borrowerNotes: string | null;
  confirmedAt: string | null;
  returnedAt: string | null;
  createdAt: string;
}

export interface PublicLoanInfo {
  itemName: string;
  itemImages: string[];
  lenderName: string;
  itemDescription: string | null;
  expectedReturnDate: string | null;
  lenderNotes: string | null;
}

export async function createLoan(
  lenderId: string,
  input: CreateLoanInput
): Promise<{ loan: LoanResponse; confirmUrl: string }> {
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, input.itemId), eq(items.ownerId, lenderId)),
  });

  if (!item) {
    throw new NotFoundError(ErrorCodes.LOANS_ITEM_NOT_FOUND, 'Item not found');
  }

  const lender = await db.query.users.findFirst({
    where: eq(users.id, lenderId),
  });

  if (!lender) {
    throw new NotFoundError(ErrorCodes.LOANS_USER_NOT_FOUND, 'User not found');
  }

  const lenderName = decryptSafe(lender.nameEncrypted);

  const loanResult = await db
    .insert(loans)
    .values({
      itemId: input.itemId,
      lenderId,
      borrowerEmail: input.borrowerEmail,
      expectedReturnDate: input.expectedReturnDate ? new Date(input.expectedReturnDate) : null,
      lenderNotes: input.lenderNotes,
    })
    .returning();

  if (!loanResult[0]) {
    throw new BadRequestError(ErrorCodes.LOANS_CREATE_FAILED, 'Failed to create loan');
  }

  const loan = loanResult[0];
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(loanTokens).values({
    loanId: loan.id,
    token,
    expiresAt,
  });

  const confirmUrl = `${env.FRONTEND_URL}/confirm-loan/${token}`;
  await sendEmail({
    to: input.borrowerEmail,
    subject: `${lenderName} quer registrar um empréstimo - TáComQuem`,
    html: buildLoanConfirmationRequestEmail(input.borrowerEmail, lenderName, item.name, confirmUrl),
  });

  if (env.BETA_MODE_ENABLED) {
    const normalizedBorrowerEmail = input.borrowerEmail.toLowerCase();

    const existingInvite = await db.query.betaInvites.findFirst({
      where: eq(betaInvites.email, normalizedBorrowerEmail),
    });

    if (!existingInvite) {
      await db.insert(betaInvites).values({
        email: normalizedBorrowerEmail,
        addedBy: lenderId,
        reason: 'Invited via loan confirmation',
      });
    }

    const borrowerEmailHash = hash(input.borrowerEmail);
    const existingBorrower = await db.query.users.findFirst({
      where: eq(users.emailHash, borrowerEmailHash),
    });

    if (existingBorrower && !existingBorrower.deletedAt && existingBorrower.accessTier !== 'BETA') {
      await db
        .update(users)
        .set({
          accessTier: 'BETA',
          betaAddedAt: new Date(),
          betaWaitlistedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingBorrower.id));
    }
  }

  return {
    loan: {
      id: loan.id,
      item: {
        id: item.id,
        name: item.name,
        images: await resolveImageKeys(item.images),
      },
      lender: {
        id: lenderId,
        name: lenderName,
      },
      borrower: null,
      borrowerEmail: input.borrowerEmail,
      status: loan.status,
      expectedReturnDate: loan.expectedReturnDate?.toISOString() ?? null,
      lenderNotes: loan.lenderNotes,
      borrowerNotes: loan.borrowerNotes,
      confirmedAt: loan.confirmedAt?.toISOString() ?? null,
      returnedAt: loan.returnedAt?.toISOString() ?? null,
      createdAt: loan.createdAt.toISOString(),
    },
    confirmUrl,
  };
}

export async function getLoansByUser(
  userId: string,
  filter?: 'lent' | 'borrowed' | 'pending' | 'confirmed' | 'returned'
): Promise<LoanResponse[]> {
  let whereClause = or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId));

  switch (filter) {
    case 'lent':
      whereClause = eq(loans.lenderId, userId);
      break;
    case 'borrowed':
      whereClause = eq(loans.borrowerId, userId);
      break;
    case 'pending':
      whereClause = and(
        or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
        eq(loans.status, 'pending')
      );
      break;
    case 'confirmed':
      whereClause = and(
        or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
        eq(loans.status, 'confirmed')
      );
      break;
    case 'returned':
      whereClause = and(
        or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
        eq(loans.status, 'returned')
      );
      break;
    default:
      whereClause = or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId));
  }

  const result = await db.query.loans.findMany({
    where: whereClause,
    with: {
      item: true,
      lender: true,
      borrower: true,
    },
    orderBy: [desc(loans.createdAt)],
  });

  return Promise.all(
    result.map(async (loan) => ({
      id: loan.id,
      item: {
        id: loan.item.id,
        name: loan.item.name,
        images: await resolveImageKeys(loan.item.images),
      },
      lender: {
        id: loan.lender.id,
        name: decryptSafe(loan.lender.nameEncrypted),
      },
      borrower: loan.borrower
        ? {
            id: loan.borrower.id,
            name: decryptSafe(loan.borrower.nameEncrypted),
          }
        : null,
      borrowerEmail: loan.borrowerEmail,
      status: loan.status,
      expectedReturnDate: loan.expectedReturnDate?.toISOString() ?? null,
      lenderNotes: loan.lenderNotes,
      borrowerNotes: loan.borrowerNotes,
      confirmedAt: loan.confirmedAt?.toISOString() ?? null,
      returnedAt: loan.returnedAt?.toISOString() ?? null,
      createdAt: loan.createdAt.toISOString(),
    }))
  );
}

export async function getLoanById(loanId: string, userId: string): Promise<LoanResponse | null> {
  const loan = await db.query.loans.findFirst({
    where: and(eq(loans.id, loanId), or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId))),
    with: {
      item: true,
      lender: true,
      borrower: true,
    },
  });

  if (!loan) {
    return null;
  }

  return {
    id: loan.id,
    item: {
      id: loan.item.id,
      name: loan.item.name,
      images: await resolveImageKeys(loan.item.images),
    },
    lender: {
      id: loan.lender.id,
      name: decryptSafe(loan.lender.nameEncrypted),
    },
    borrower: loan.borrower
      ? {
          id: loan.borrower.id,
          name: decryptSafe(loan.borrower.nameEncrypted),
        }
      : null,
    borrowerEmail: loan.borrowerEmail,
    status: loan.status,
    expectedReturnDate: loan.expectedReturnDate?.toISOString() ?? null,
    lenderNotes: loan.lenderNotes,
    borrowerNotes: loan.borrowerNotes,
    confirmedAt: loan.confirmedAt?.toISOString() ?? null,
    returnedAt: loan.returnedAt?.toISOString() ?? null,
    createdAt: loan.createdAt.toISOString(),
  };
}

export async function markLoanAsReturned(
  loanId: string,
  lenderId: string
): Promise<LoanResponse | null> {
  const loan = await db.query.loans.findFirst({
    where: and(eq(loans.id, loanId), eq(loans.lenderId, lenderId)),
    with: { item: true, lender: true, borrower: true },
  });

  if (!loan) {
    return null;
  }

  if (loan.status !== 'confirmed') {
    throw new BadRequestError(
      ErrorCodes.LOANS_INVALID_STATE,
      'Only confirmed loans can be marked as returned'
    );
  }

  await db
    .update(loans)
    .set({ status: 'returned', returnedAt: new Date(), updatedAt: new Date() })
    .where(eq(loans.id, loanId));

  if (loan.borrowerId) {
    await db.insert(notifications).values({
      userId: loan.borrowerId,
      loanId: loan.id,
      type: 'loan_returned',
      title: 'Item devolvido',
      message: `Você devolveu "${loan.item.name}" para ${decryptSafe(loan.lender.nameEncrypted)}.`,
      sentAt: new Date(),
    });
  }

  return getLoanById(loanId, lenderId);
}

export async function cancelLoan(loanId: string, lenderId: string): Promise<boolean> {
  const loan = await db.query.loans.findFirst({
    where: and(eq(loans.id, loanId), eq(loans.lenderId, lenderId)),
  });

  if (!loan) {
    return false;
  }

  if (loan.status !== 'pending') {
    throw new BadRequestError(
      ErrorCodes.LOANS_INVALID_STATE,
      'Only pending loans can be cancelled'
    );
  }

  await db
    .update(loans)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(loans.id, loanId));

  return true;
}

export async function sendReminder(loanId: string, lenderId: string): Promise<boolean> {
  const loan = await db.query.loans.findFirst({
    where: and(eq(loans.id, loanId), eq(loans.lenderId, lenderId)),
    with: { item: true, lender: true, borrower: true },
  });

  if (!loan) {
    return false;
  }

  if (loan.status !== 'confirmed') {
    throw new BadRequestError(
      ErrorCodes.LOANS_INVALID_STATE,
      'Only confirmed loans can receive reminders'
    );
  }

  if (!loan.borrower) {
    throw new BadRequestError(ErrorCodes.LOANS_NO_RECEIVER, 'Loan has no confirmed receiver');
  }

  const lenderName = decryptSafe(loan.lender.nameEncrypted);
  const borrowerName = decryptSafe(loan.borrower.nameEncrypted);
  const borrowerEmail = decryptSafe(loan.borrower.emailEncrypted);

  await sendEmail({
    to: borrowerEmail,
    subject: `Lembrete de devolução: ${loan.item.name} - TáComQuem`,
    html: buildLoanReminderEmail(borrowerName, lenderName, loan.item.name, env.FRONTEND_URL),
  });

  if (loan.borrowerId) {
    await db.insert(notifications).values({
      userId: loan.borrowerId,
      loanId: loan.id,
      type: 'loan_reminder',
      title: 'Lembrete de devolução',
      message: `${lenderName} está solicitando a devolução de "${loan.item.name}".`,
      sentAt: new Date(),
    });
  }

  return true;
}

export type HistoryDirection = 'all' | 'lent' | 'borrowed';

export interface HistoryCounts {
  all: number;
  lent: number;
  borrowed: number;
}

export interface LoansHistoryResult {
  loans: LoanResponse[];
  counts: HistoryCounts;
}

const COMPLETED_STATUSES = ['returned', 'cancelled'] as const;

export async function getLoansHistory(
  userId: string,
  direction: HistoryDirection = 'all'
): Promise<LoansHistoryResult> {
  const baseCondition = and(
    or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
    inArray(loans.status, [...COMPLETED_STATUSES])
  );

  const result = await db.query.loans.findMany({
    where: baseCondition,
    with: {
      item: true,
      lender: true,
      borrower: true,
    },
    orderBy: [desc(loans.updatedAt)],
  });

  let lentCount = 0;
  let borrowedCount = 0;

  for (const loan of result) {
    if (loan.lenderId === userId) lentCount++;
    if (loan.borrowerId === userId) borrowedCount++;
  }

  const counts: HistoryCounts = {
    all: result.length,
    lent: lentCount,
    borrowed: borrowedCount,
  };

  const filtered =
    direction === 'lent'
      ? result.filter((l) => l.lenderId === userId)
      : direction === 'borrowed'
        ? result.filter((l) => l.borrowerId === userId)
        : result;

  const mappedLoans = await Promise.all(
    filtered.map(async (loan) => ({
      id: loan.id,
      item: {
        id: loan.item.id,
        name: loan.item.name,
        images: await resolveImageKeys(loan.item.images),
      },
      lender: {
        id: loan.lender.id,
        name: decryptSafe(loan.lender.nameEncrypted),
      },
      borrower: loan.borrower
        ? {
            id: loan.borrower.id,
            name: decryptSafe(loan.borrower.nameEncrypted),
          }
        : null,
      borrowerEmail: loan.borrowerEmail,
      status: loan.status,
      expectedReturnDate: loan.expectedReturnDate?.toISOString() ?? null,
      lenderNotes: loan.lenderNotes,
      borrowerNotes: loan.borrowerNotes,
      confirmedAt: loan.confirmedAt?.toISOString() ?? null,
      returnedAt: loan.returnedAt?.toISOString() ?? null,
      createdAt: loan.createdAt.toISOString(),
    }))
  );

  return { loans: mappedLoans, counts };
}

export async function getPublicLoanInfo(token: string): Promise<PublicLoanInfo | null> {
  const loanToken = await db.query.loanTokens.findFirst({
    where: eq(loanTokens.token, token),
    with: {
      loan: {
        with: {
          item: true,
          lender: true,
        },
      },
    },
  });

  if (!loanToken) {
    return null;
  }

  if (loanToken.expiresAt < new Date()) {
    return null;
  }

  if (loanToken.usedAt) {
    return null;
  }

  return {
    itemName: loanToken.loan.item.name,
    itemImages: await resolveImageKeys(loanToken.loan.item.images),
    lenderName: decryptSafe(loanToken.loan.lender.nameEncrypted),
    itemDescription: loanToken.loan.item.description ?? null,
    expectedReturnDate: loanToken.loan.expectedReturnDate?.toISOString() ?? null,
    lenderNotes: loanToken.loan.lenderNotes ?? null,
  };
}

export async function confirmLoan(token: string, borrowerId: string): Promise<LoanResponse> {
  const loanToken = await db.query.loanTokens.findFirst({
    where: eq(loanTokens.token, token),
    with: {
      loan: {
        with: {
          item: true,
          lender: true,
        },
      },
    },
  });

  if (!loanToken) {
    throw new BadRequestError(ErrorCodes.LOANS_TOKEN_INVALID, 'Invalid loan token');
  }

  if (loanToken.expiresAt < new Date()) {
    throw new GoneError(ErrorCodes.LOANS_TOKEN_EXPIRED, 'Loan token has expired');
  }

  if (loanToken.usedAt) {
    throw new BadRequestError(ErrorCodes.LOANS_TOKEN_USED, 'Loan token already used');
  }

  if (loanToken.loan.status !== 'pending') {
    throw new BadRequestError(
      ErrorCodes.LOANS_ALREADY_PROCESSED,
      'Loan has already been processed'
    );
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(loans)
        .set({
          borrowerId,
          status: 'confirmed',
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(loans.id, loanToken.loanId));

      await tx
        .update(loanTokens)
        .set({ usedAt: new Date() })
        .where(eq(loanTokens.id, loanToken.id));

      const borrower = await tx.query.users.findFirst({
        where: eq(users.id, borrowerId),
      });

      if (borrower) {
        const borrowerName = decryptSafe(borrower.nameEncrypted);
        const lenderName = decryptSafe(loanToken.loan.lender.nameEncrypted);

        await tx.insert(notifications).values({
          userId: loanToken.loan.lenderId,
          loanId: loanToken.loanId,
          type: 'loan_confirmed',
          title: 'Empréstimo confirmado',
          message: `${borrowerName} confirmou o empréstimo de "${loanToken.loan.item.name}".`,
          sentAt: new Date(),
        });

        await tx.insert(notifications).values({
          userId: borrowerId,
          loanId: loanToken.loanId,
          type: 'loan_confirmed',
          title: 'Empréstimo confirmado',
          message: `Você confirmou o empréstimo de "${loanToken.loan.item.name}" de ${lenderName}.`,
          sentAt: new Date(),
        });
      }

      await createFriendshipIfNotExists(loanToken.loan.lenderId, borrowerId, loanToken.loanId, tx);
    });
  } catch (error) {
    console.error('[loans] failed to confirm loan transaction', {
      loanId: loanToken.loanId,
      borrowerId,
      error,
    });
    throw error;
  }

  const loan = await getLoanById(loanToken.loanId, borrowerId);
  if (!loan) {
    throw new BadRequestError(ErrorCodes.LOANS_FETCH_FAILED, 'Failed to fetch loan');
  }

  return loan;
}
