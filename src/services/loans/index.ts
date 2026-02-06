import { and, desc, eq, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { items, loans, loanTokens, notifications, users } from '../../db/schema.js';
import { BadRequestError, ErrorCodes, GoneError, NotFoundError } from '../../errors/index.js';
import type { CreateLoanInput } from '../../schemas/loans.js';
import { decrypt } from '../crypto/index.js';
import {
  buildLoanConfirmationRequestEmail,
  buildLoanReminderEmail,
  sendEmail,
} from '../email/index.js';

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
  expectedReturnDate: Date | null;
  lenderNotes: string | null;
  borrowerNotes: string | null;
  confirmedAt: Date | null;
  returnedAt: Date | null;
  createdAt: Date;
}

export interface PublicLoanInfo {
  itemName: string;
  itemImages: string[];
  lenderName: string;
}

function parseImages(imagesJson: string): string[] {
  try {
    return JSON.parse(imagesJson);
  } catch {
    return [];
  }
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

  const lenderName = decrypt(lender.nameEncrypted);

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

  return {
    loan: {
      id: loan.id,
      item: {
        id: item.id,
        name: item.name,
        images: parseImages(item.images),
      },
      lender: {
        id: lenderId,
        name: lenderName,
      },
      borrower: null,
      borrowerEmail: input.borrowerEmail,
      status: loan.status,
      expectedReturnDate: loan.expectedReturnDate,
      lenderNotes: loan.lenderNotes,
      borrowerNotes: loan.borrowerNotes,
      confirmedAt: loan.confirmedAt,
      returnedAt: loan.returnedAt,
      createdAt: loan.createdAt,
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

  return result.map((loan) => ({
    id: loan.id,
    item: {
      id: loan.item.id,
      name: loan.item.name,
      images: parseImages(loan.item.images),
    },
    lender: {
      id: loan.lender.id,
      name: decrypt(loan.lender.nameEncrypted),
    },
    borrower: loan.borrower
      ? {
          id: loan.borrower.id,
          name: decrypt(loan.borrower.nameEncrypted),
        }
      : null,
    borrowerEmail: loan.borrowerEmail,
    status: loan.status,
    expectedReturnDate: loan.expectedReturnDate,
    lenderNotes: loan.lenderNotes,
    borrowerNotes: loan.borrowerNotes,
    confirmedAt: loan.confirmedAt,
    returnedAt: loan.returnedAt,
    createdAt: loan.createdAt,
  }));
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
      images: parseImages(loan.item.images),
    },
    lender: {
      id: loan.lender.id,
      name: decrypt(loan.lender.nameEncrypted),
    },
    borrower: loan.borrower
      ? {
          id: loan.borrower.id,
          name: decrypt(loan.borrower.nameEncrypted),
        }
      : null,
    borrowerEmail: loan.borrowerEmail,
    status: loan.status,
    expectedReturnDate: loan.expectedReturnDate,
    lenderNotes: loan.lenderNotes,
    borrowerNotes: loan.borrowerNotes,
    confirmedAt: loan.confirmedAt,
    returnedAt: loan.returnedAt,
    createdAt: loan.createdAt,
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
      message: `Você devolveu "${loan.item.name}" para ${decrypt(loan.lender.nameEncrypted)}.`,
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

  const lenderName = decrypt(loan.lender.nameEncrypted);
  const borrowerName = decrypt(loan.borrower.nameEncrypted);
  const borrowerEmail = decrypt(loan.borrower.emailEncrypted);

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
    itemImages: parseImages(loanToken.loan.item.images),
    lenderName: decrypt(loanToken.loan.lender.nameEncrypted),
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

  await db
    .update(loans)
    .set({
      borrowerId,
      status: 'confirmed',
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(loans.id, loanToken.loanId));

  await db.update(loanTokens).set({ usedAt: new Date() }).where(eq(loanTokens.id, loanToken.id));

  const borrower = await db.query.users.findFirst({
    where: eq(users.id, borrowerId),
  });

  if (borrower) {
    const borrowerName = decrypt(borrower.nameEncrypted);
    const lenderName = decrypt(loanToken.loan.lender.nameEncrypted);

    await db.insert(notifications).values({
      userId: loanToken.loan.lenderId,
      loanId: loanToken.loanId,
      type: 'loan_confirmed',
      title: 'Empréstimo confirmado',
      message: `${borrowerName} confirmou o empréstimo de "${loanToken.loan.item.name}".`,
      sentAt: new Date(),
    });

    await db.insert(notifications).values({
      userId: borrowerId,
      loanId: loanToken.loanId,
      type: 'loan_confirmed',
      title: 'Empréstimo confirmado',
      message: `Você confirmou o empréstimo de "${loanToken.loan.item.name}" de ${lenderName}.`,
      sentAt: new Date(),
    });
  }

  const loan = await getLoanById(loanToken.loanId, borrowerId);
  if (!loan) {
    throw new BadRequestError(ErrorCodes.LOANS_FETCH_FAILED, 'Failed to fetch loan');
  }

  return loan;
}
