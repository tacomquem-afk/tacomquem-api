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

  return {
    ...item,
    owner: {
      id: item.owner.id,
      email: maskEmail(ownerEmail),
      name: maskName(ownerName),
    },
    loans: item.loans.map((loan) => ({
      ...loan,
      borrower: loan.borrower
        ? {
            id: loan.borrower.id,
            email: maskEmail(decrypt(loan.borrower.emailEncrypted)),
            name: maskName(decrypt(loan.borrower.nameEncrypted)),
          }
        : null,
    })),
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

  return {
    ...loan,
    lender: {
      id: loan.lender.id,
      email: maskEmail(decrypt(loan.lender.emailEncrypted)),
      name: maskName(decrypt(loan.lender.nameEncrypted)),
    },
    borrower: loan.borrower
      ? {
          id: loan.borrower.id,
          email: maskEmail(decrypt(loan.borrower.emailEncrypted)),
          name: maskName(decrypt(loan.borrower.nameEncrypted)),
        }
      : null,
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
