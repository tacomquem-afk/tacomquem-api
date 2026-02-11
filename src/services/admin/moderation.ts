import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { items, loans } from '../../db/schema.js';
import { decrypt } from '../crypto/index.js';
import { maskEmail, maskName } from './helpers.js';
import { logAdminAction } from './index.js';

export async function getItemDetails(itemId: string) {
  const item = await db.query.items.findFirst({
    where: eq(items.id, itemId),
    with: {
      owner: true,
      loans: {
        with: {
          borrower: true,
        },
      },
    },
  });

  if (!item) return null;

  const ownerEmail = decrypt(item.owner.emailEncrypted);
  const ownerName = decrypt(item.owner.nameEncrypted);

  const activeLoans = item.loans.filter((l) => l.status === 'confirmed').length;

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    images: typeof item.images === 'string' ? JSON.parse(item.images) : item.images,
    isActive: item.isActive,
    owner: {
      id: item.owner.id,
      email: maskEmail(ownerEmail),
      name: maskName(ownerName),
    },
    activeLoans,
    createdAt: (item.createdAt || new Date()).toISOString(),
    updatedAt: (item.updatedAt || new Date()).toISOString(),
  };
}

export async function removeItem(
  itemId: string,
  adminId: string,
  reason: string,
  ipAddress?: string
) {
  await db.update(items).set({ isActive: false }).where(eq(items.id, itemId));

  await logAdminAction({
    adminId,
    action: 'item_removed',
    targetType: 'item',
    targetId: itemId,
    metadata: { reason },
    ipAddress,
  });
}

export async function getLoanDetails(loanId: string) {
  const loan = await db.query.loans.findFirst({
    where: eq(loans.id, loanId),
    with: {
      item: true,
      lender: true,
      borrower: true,
    },
  });

  if (!loan) return null;

  const lenderEmail = decrypt(loan.lender.emailEncrypted);
  const lenderName = decrypt(loan.lender.nameEncrypted);

  return {
    id: loan.id,
    item: {
      id: loan.item.id,
      name: loan.item.name,
      images:
        typeof loan.item.images === 'string' ? JSON.parse(loan.item.images) : loan.item.images,
    },
    lender: {
      id: loan.lender.id,
      email: maskEmail(lenderEmail),
      name: maskName(lenderName),
    },
    borrower: loan.borrower
      ? {
          id: loan.borrower.id,
          email: maskEmail(decrypt(loan.borrower.emailEncrypted)),
          name: maskName(decrypt(loan.borrower.nameEncrypted)),
        }
      : null,
    borrowerEmail: loan.borrowerEmail,
    status: loan.status,
    expectedReturnDate: loan.expectedReturnDate?.toISOString() || null,
    lenderNotes: loan.lenderNotes,
    borrowerNotes: loan.borrowerNotes,
    confirmedAt: loan.confirmedAt?.toISOString() || null,
    returnedAt: loan.returnedAt?.toISOString() || null,
    createdAt: (loan.createdAt || new Date()).toISOString(),
  };
}

export async function cancelLoan(
  loanId: string,
  adminId: string,
  reason: string,
  ipAddress?: string
) {
  await db.update(loans).set({ status: 'cancelled' }).where(eq(loans.id, loanId));

  await logAdminAction({
    adminId,
    action: 'loan_cancelled',
    targetType: 'loan',
    targetId: loanId,
    metadata: { reason },
    ipAddress,
  });
}
