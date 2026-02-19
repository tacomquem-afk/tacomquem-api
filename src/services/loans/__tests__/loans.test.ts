import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

mock.module('../../storage/index.js', () => ({
  resolveImageKeys: async (json: string) => {
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  },
}));

import { env } from '../../../config/env.js';
import { db } from '../../../db/index.js';
import { BadRequestError, ErrorCodes, GoneError, NotFoundError } from '../../../errors/index.js';
import * as cryptoModule from '../../crypto/index.js';
import * as emailModule from '../../email/index.js';
import * as friendshipsModule from '../../friendships/index.js';
import {
  cancelLoan,
  confirmLoan,
  createLoan,
  getLoanById,
  getLoansByUser,
  getLoansHistory,
  getPublicLoanInfo,
  markLoanAsReturned,
  sendReminder,
} from '../index.js';

const mockLoanData = {
  id: 'loan-123',
  itemId: 'item-123',
  lenderId: 'lender-123',
  borrowerId: null,
  borrowerEmail: 'borrower@example.com',
  status: 'pending' as const,
  expectedReturnDate: null,
  lenderNotes: null,
  borrowerNotes: null,
  confirmedAt: null,
  returnedAt: null,
  createdAt: new Date('2026-02-04'),
  updatedAt: new Date('2026-02-04'),
};

const mockItemData = {
  id: 'item-123',
  ownerId: 'lender-123',
  name: 'Test Item',
  description: 'A test item',
  images: '["https://example.com/image1.jpg"]',
  isActive: true,
  createdAt: new Date('2026-02-04'),
  updatedAt: new Date('2026-02-04'),
};

const mockLenderData = {
  id: 'lender-123',
  emailEncrypted: 'encrypted-email',
  nameEncrypted: 'encrypted-name',
  email: 'lender@example.com',
  createdAt: new Date('2026-02-04'),
};

const mockBorrowerData = {
  id: 'borrower-123',
  emailEncrypted: 'encrypted-borrower-email',
  nameEncrypted: 'encrypted-borrower-name',
  email: 'borrower@example.com',
  createdAt: new Date('2026-02-04'),
};

const mockLoanTokenData = {
  id: 'token-123',
  loanId: 'loan-123',
  token: 'token-abc123',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  usedAt: null,
  createdAt: new Date('2026-02-04'),
};

beforeEach(() => {
  spyOn(db, 'insert').mockClear();
  spyOn(db, 'update').mockClear();
  spyOn(db.query.loans, 'findMany').mockClear();
  spyOn(db.query.loans, 'findFirst').mockClear();
  spyOn(db.query.items, 'findFirst').mockClear();
  spyOn(db.query.users, 'findFirst').mockClear();
  spyOn(db.query.loanTokens, 'findFirst').mockClear();
  spyOn(db, 'transaction').mockClear();
  spyOn(cryptoModule, 'decrypt').mockClear();
  spyOn(emailModule, 'sendEmail').mockClear();
  spyOn(friendshipsModule, 'createFriendshipIfNotExists').mockClear();
  spyOn(db.query.betaInvites, 'findFirst').mockClear();
});

afterEach(() => {
  spyOn(cryptoModule, 'decrypt').mockRestore();
  spyOn(emailModule, 'sendEmail').mockRestore();
  spyOn(friendshipsModule, 'createFriendshipIfNotExists').mockRestore();
  spyOn(db, 'transaction').mockRestore();
});

describe('loans service', () => {
  describe('createLoan', () => {
    it('should create loan successfully', async () => {
      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(mockItemData as any);
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockLenderData as any);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Lender Name');

      const valuesMock = mock(() => ({ returning: mock(() => Promise.resolve([mockLoanData])) }));
      const insertObjMock = { values: valuesMock };
      spyOn(db, 'insert').mockReturnValue(insertObjMock as any);

      const sendEmailSpy = spyOn(emailModule, 'sendEmail').mockResolvedValueOnce(undefined as any);

      const result = await createLoan('lender-123', {
        itemId: 'item-123',
        borrowerEmail: 'borrower@example.com',
        expectedReturnDate: undefined,
        lenderNotes: undefined,
      });

      expect(result.loan.id).toBe('loan-123');
      expect(result.loan.status).toBe('pending');
      expect(result.confirmUrl).toContain('/confirm-loan/');
      expect(sendEmailSpy).toHaveBeenCalled();
    });

    it('should throw error if item not found', async () => {
      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(undefined);

      let errorThrown = false;
      try {
        await createLoan('lender-123', {
          itemId: 'nonexistent-item',
          borrowerEmail: 'borrower@example.com',
          expectedReturnDate: undefined,
          lenderNotes: undefined,
        });
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(NotFoundError);
        expect((e as NotFoundError).code).toBe(ErrorCodes.LOANS_ITEM_NOT_FOUND);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw error if lender not found', async () => {
      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(mockItemData as any);
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(undefined);

      let errorThrown = false;
      try {
        await createLoan('nonexistent-lender', {
          itemId: 'item-123',
          borrowerEmail: 'borrower@example.com',
          expectedReturnDate: undefined,
          lenderNotes: undefined,
        });
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(NotFoundError);
        expect((e as NotFoundError).code).toBe(ErrorCodes.LOANS_USER_NOT_FOUND);
      }
      expect(errorThrown).toBe(true);
    });

    it('should create loan with expectedReturnDate', async () => {
      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(mockItemData as any);
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockLenderData as any);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Lender Name');

      const loanWithDate = {
        ...mockLoanData,
        expectedReturnDate: new Date('2026-02-11'),
        lenderNotes: 'Test notes',
      };
      const valuesMock = mock(() => ({ returning: mock(() => Promise.resolve([loanWithDate])) }));
      spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);

      spyOn(emailModule, 'sendEmail').mockResolvedValueOnce(undefined as any);

      const result = await createLoan('lender-123', {
        itemId: 'item-123',
        borrowerEmail: 'borrower@example.com',
        expectedReturnDate: '2026-02-11',
        lenderNotes: 'Test notes',
      });

      expect(result.loan.expectedReturnDate).toEqual(new Date('2026-02-11').toISOString());
      expect(result.loan.lenderNotes).toBe('Test notes');
    });
  });

  describe('getLoansByUser', () => {
    it('should return all loans for user without filter', async () => {
      const loanWithBorrower = {
        ...mockLoanData,
        borrowerId: 'borrower-123',
        status: 'confirmed' as const,
      };

      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
        { ...mockLoanData, item: mockItemData, lender: mockLenderData, borrower: null },
        {
          ...loanWithBorrower,
          item: mockItemData,
          lender: mockLenderData,
          borrower: mockBorrowerData,
        },
      ] as any);

      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await getLoansByUser('lender-123');

      expect(result).toHaveLength(2);
      expect(result[0]?.status).toBe('pending');
      expect(result[1]?.status).toBe('confirmed');
    });

    it('should filter loans by type: lent', async () => {
      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
        { ...mockLoanData, item: mockItemData, lender: mockLenderData, borrower: null },
      ] as any);

      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await getLoansByUser('lender-123', 'lent');

      expect(result).toHaveLength(1);
    });

    it('should filter loans by type: borrowed', async () => {
      const borrowedLoan = {
        ...mockLoanData,
        borrowerId: 'borrower-123',
        lenderId: 'other-lender',
      };
      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
        { ...borrowedLoan, item: mockItemData, lender: mockLenderData, borrower: mockBorrowerData },
      ] as any);

      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await getLoansByUser('borrower-123', 'borrowed');

      expect(result).toHaveLength(1);
    });

    it('should filter loans by status: pending', async () => {
      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
        { ...mockLoanData, item: mockItemData, lender: mockLenderData, borrower: null },
      ] as any);

      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await getLoansByUser('lender-123', 'pending');

      expect(result[0]?.status).toBe('pending');
    });

    it('should return empty array if user has no loans', async () => {
      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([]);

      const result = await getLoansByUser('nonexistent-user');

      expect(result).toHaveLength(0);
    });
  });

  describe('getLoanById', () => {
    it('should return loan if user has access', async () => {
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce({
        ...mockLoanData,
        item: mockItemData,
        lender: mockLenderData,
        borrower: null,
      } as any);

      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await getLoanById('loan-123', 'lender-123');

      expect(result?.id).toBe('loan-123');
      expect(result?.status).toBe('pending');
    });

    it('should return null if loan does not exist', async () => {
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce(undefined);

      const result = await getLoanById('nonexistent-loan', 'lender-123');

      expect(result).toBeNull();
    });

    it('should return loan if user is borrower', async () => {
      const confirmedLoan = {
        ...mockLoanData,
        borrowerId: 'borrower-123',
        status: 'confirmed' as const,
      };
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce({
        ...confirmedLoan,
        item: mockItemData,
        lender: mockLenderData,
        borrower: mockBorrowerData,
      } as any);

      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await getLoanById('loan-123', 'borrower-123');

      expect(result?.borrower?.id).toBe('borrower-123');
    });
  });

  describe('markLoanAsReturned', () => {
    it('should mark confirmed loan as returned', async () => {
      const confirmedLoan = {
        ...mockLoanData,
        borrowerId: 'borrower-123',
        status: 'confirmed' as const,
      };

      spyOn(db.query.loans, 'findFirst')
        .mockResolvedValueOnce({
          ...confirmedLoan,
          item: mockItemData,
          lender: mockLenderData,
          borrower: mockBorrowerData,
        } as any)
        .mockResolvedValueOnce(undefined);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      const valuesMock = mock(() => Promise.resolve());
      spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);

      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await markLoanAsReturned('loan-123', 'lender-123');

      expect(result).toBeNull();
    });

    it('should throw error if loan is not confirmed', async () => {
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce({
        ...mockLoanData,
        item: mockItemData,
        lender: mockLenderData,
        borrower: null,
      } as any);

      let errorThrown = false;
      try {
        await markLoanAsReturned('loan-123', 'lender-123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.LOANS_INVALID_STATE);
      }
      expect(errorThrown).toBe(true);
    });

    it('should return null if loan not found', async () => {
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce(undefined);

      const result = await markLoanAsReturned('nonexistent-loan', 'lender-123');

      expect(result).toBeNull();
    });
  });

  describe('cancelLoan', () => {
    it('should cancel pending loan', async () => {
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce(mockLoanData as any);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      const result = await cancelLoan('loan-123', 'lender-123');

      expect(result).toBe(true);
    });

    it('should return false if loan not found', async () => {
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce(undefined);

      const result = await cancelLoan('nonexistent-loan', 'lender-123');

      expect(result).toBe(false);
    });

    it('should throw error if loan is not pending', async () => {
      const confirmedLoan = { ...mockLoanData, status: 'confirmed' as const };
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce(confirmedLoan as any);

      let errorThrown = false;
      try {
        await cancelLoan('loan-123', 'lender-123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.LOANS_INVALID_STATE);
      }
      expect(errorThrown).toBe(true);
    });
  });

  describe('sendReminder', () => {
    it('should send reminder email for confirmed loan', async () => {
      const confirmedLoan = {
        ...mockLoanData,
        borrowerId: 'borrower-123',
        status: 'confirmed' as const,
      };
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce({
        ...confirmedLoan,
        item: mockItemData,
        lender: mockLenderData,
        borrower: mockBorrowerData,
      } as any);

      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const sendEmailSpy = spyOn(emailModule, 'sendEmail').mockResolvedValueOnce(undefined as any);

      const valuesMock = mock(() => Promise.resolve());
      spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);

      const result = await sendReminder('loan-123', 'lender-123');

      expect(result).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalled();
    });

    it('should return false if loan not found', async () => {
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce(undefined);

      const result = await sendReminder('nonexistent-loan', 'lender-123');

      expect(result).toBe(false);
    });

    it('should throw error if loan is not confirmed', async () => {
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce({
        ...mockLoanData,
        item: mockItemData,
        lender: mockLenderData,
        borrower: null,
      } as any);

      let errorThrown = false;
      try {
        await sendReminder('loan-123', 'lender-123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.LOANS_INVALID_STATE);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw error if borrower not confirmed', async () => {
      const confirmedLoan = { ...mockLoanData, borrowerId: null, status: 'confirmed' as const };
      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce({
        ...confirmedLoan,
        item: mockItemData,
        lender: mockLenderData,
        borrower: null,
      } as any);

      let errorThrown = false;
      try {
        await sendReminder('loan-123', 'lender-123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.LOANS_NO_RECEIVER);
      }
      expect(errorThrown).toBe(true);
    });
  });

  describe('getLoansHistory', () => {
    const returnedLoanAsLender = {
      ...mockLoanData,
      id: 'loan-returned-lent',
      lenderId: 'user-123',
      borrowerId: 'borrower-123',
      status: 'returned' as const,
      returnedAt: new Date('2026-02-10'),
      updatedAt: new Date('2026-02-10'),
      item: mockItemData,
      lender: { ...mockLenderData, id: 'user-123' },
      borrower: mockBorrowerData,
    };

    const cancelledLoanAsLender = {
      ...mockLoanData,
      id: 'loan-cancelled-lent',
      lenderId: 'user-123',
      borrowerId: null,
      status: 'cancelled' as const,
      updatedAt: new Date('2026-02-08'),
      item: mockItemData,
      lender: { ...mockLenderData, id: 'user-123' },
      borrower: null,
    };

    const returnedLoanAsBorrower = {
      ...mockLoanData,
      id: 'loan-returned-borrowed',
      lenderId: 'other-user',
      borrowerId: 'user-123',
      status: 'returned' as const,
      returnedAt: new Date('2026-02-09'),
      updatedAt: new Date('2026-02-09'),
      item: mockItemData,
      lender: { ...mockLenderData, id: 'other-user' },
      borrower: { ...mockBorrowerData, id: 'user-123' },
    };

    it('should return all completed loans with counts (direction=all)', async () => {
      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
        returnedLoanAsLender,
        returnedLoanAsBorrower,
        cancelledLoanAsLender,
      ] as any);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await getLoansHistory('user-123', 'all');

      expect(result.loans).toHaveLength(3);
      expect(result.counts.all).toBe(3);
      expect(result.counts.lent).toBe(2);
      expect(result.counts.borrowed).toBe(1);
    });

    it('should filter by direction=lent and keep correct counts', async () => {
      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
        returnedLoanAsLender,
        returnedLoanAsBorrower,
        cancelledLoanAsLender,
      ] as any);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await getLoansHistory('user-123', 'lent');

      expect(result.loans).toHaveLength(2);
      expect(result.loans[0]?.id).toBe('loan-returned-lent');
      expect(result.loans[1]?.id).toBe('loan-cancelled-lent');
      expect(result.counts.all).toBe(3);
      expect(result.counts.lent).toBe(2);
      expect(result.counts.borrowed).toBe(1);
    });

    it('should filter by direction=borrowed and keep correct counts', async () => {
      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
        returnedLoanAsLender,
        returnedLoanAsBorrower,
        cancelledLoanAsLender,
      ] as any);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await getLoansHistory('user-123', 'borrowed');

      expect(result.loans).toHaveLength(1);
      expect(result.loans[0]?.id).toBe('loan-returned-borrowed');
      expect(result.counts.all).toBe(3);
    });

    it('should return empty results when no completed loans', async () => {
      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([]);

      const result = await getLoansHistory('user-123');

      expect(result.loans).toHaveLength(0);
      expect(result.counts).toEqual({ all: 0, lent: 0, borrowed: 0 });
    });

    it('should default direction to all', async () => {
      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([returnedLoanAsLender] as any);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await getLoansHistory('user-123');

      expect(result.loans).toHaveLength(1);
      expect(result.counts.all).toBe(1);
    });
  });

  describe('getPublicLoanInfo', () => {
    it('should return public loan info for valid token', async () => {
      const publicLoanToken = {
        ...mockLoanTokenData,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: null,
        loan: {
          item: mockItemData,
          lender: mockLenderData,
        },
      };

      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(publicLoanToken as any);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Lender Name');

      const result = await getPublicLoanInfo('token-abc123');

      expect(result?.itemName).toBe('Test Item');
      expect(result?.lenderName).toBe('Lender Name');
      expect(result?.itemImages).toEqual(['https://example.com/image1.jpg']);
    });

    it('should return null if token not found', async () => {
      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(undefined);

      const result = await getPublicLoanInfo('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null if token is expired', async () => {
      const expiredToken = {
        ...mockLoanTokenData,
        expiresAt: new Date(Date.now() - 1000),
        loan: {
          item: mockItemData,
          lender: mockLenderData,
        },
      };

      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(expiredToken as any);

      const result = await getPublicLoanInfo('expired-token');

      expect(result).toBeNull();
    });

    it('should return null if token already used', async () => {
      const usedToken = {
        ...mockLoanTokenData,
        usedAt: new Date('2026-02-03'),
        loan: {
          item: mockItemData,
          lender: mockLenderData,
        },
      };

      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(usedToken as any);

      const result = await getPublicLoanInfo('used-token');

      expect(result).toBeNull();
    });

    it('should return public loan info with all optional fields populated', async () => {
      const publicLoanToken = {
        ...mockLoanTokenData,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: null,
        loan: {
          ...mockLoanData,
          item: { ...mockItemData, description: 'Test item description' },
          lender: mockLenderData,
          expectedReturnDate: new Date('2026-02-28'),
          lenderNotes: 'Please return with batteries',
        },
      };

      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(publicLoanToken as any);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Lender Name');

      const result = await getPublicLoanInfo('token-with-fields');

      expect(result?.itemName).toBe('Test Item');
      expect(result?.lenderName).toBe('Lender Name');
      expect(result?.itemImages).toEqual(['https://example.com/image1.jpg']);
      expect(result?.itemDescription).toBe('Test item description');
      expect(result?.expectedReturnDate).toBe(new Date('2026-02-28').toISOString());
      expect(result?.lenderNotes).toBe('Please return with batteries');
    });

    it('should return public loan info with null optional fields when not provided', async () => {
      const publicLoanToken = {
        ...mockLoanTokenData,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: null,
        loan: {
          ...mockLoanData,
          item: { ...mockItemData, description: null },
          lender: mockLenderData,
          expectedReturnDate: null,
          lenderNotes: null,
        },
      };

      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(publicLoanToken as any);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Lender Name');

      const result = await getPublicLoanInfo('token-no-fields');

      expect(result?.itemName).toBe('Test Item');
      expect(result?.lenderName).toBe('Lender Name');
      expect(result?.itemImages).toEqual(['https://example.com/image1.jpg']);
      expect(result?.itemDescription).toBeNull();
      expect(result?.expectedReturnDate).toBeNull();
      expect(result?.lenderNotes).toBeNull();
    });
  });

  describe('confirmLoan', () => {
    it('should confirm loan successfully', async () => {
      const loanToken = {
        ...mockLoanTokenData,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: null,
        loan: {
          id: 'loan-123',
          status: 'pending' as const,
          item: mockItemData,
          lender: mockLenderData,
          lenderId: 'lender-123',
        },
      };

      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(loanToken as any);

      const confirmedLoan = {
        ...mockLoanData,
        borrowerId: 'borrower-123',
        status: 'confirmed' as const,
      };

      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce({
        ...confirmedLoan,
        item: mockItemData,
        lender: mockLenderData,
        borrower: mockBorrowerData,
      } as any);

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockBorrowerData as any);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);
      spyOn(db, 'transaction').mockImplementation(async (callback: any) => callback(db as any));

      const valuesMock = mock(() => Promise.resolve());
      spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);
      const createFriendshipSpy = spyOn(
        friendshipsModule,
        'createFriendshipIfNotExists'
      ).mockResolvedValue({
        created: true,
      });

      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await confirmLoan('token-abc123', 'borrower-123');

      expect(result).not.toBeNull();
      expect(result.status).toBe('confirmed');
      expect(createFriendshipSpy).toHaveBeenCalledWith(
        'lender-123',
        'borrower-123',
        'loan-123',
        db
      );
    });

    it('should throw error if token not found', async () => {
      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(undefined);

      let errorThrown = false;
      try {
        await confirmLoan('invalid-token', 'borrower-123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.LOANS_TOKEN_INVALID);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw error if token is expired', async () => {
      const expiredToken = {
        ...mockLoanTokenData,
        expiresAt: new Date(Date.now() - 1000),
        loan: {
          status: 'pending' as const,
        },
      };

      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(expiredToken as any);

      let errorThrown = false;
      try {
        await confirmLoan('expired-token', 'borrower-123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(GoneError);
        expect((e as GoneError).code).toBe(ErrorCodes.LOANS_TOKEN_EXPIRED);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw error if token already used', async () => {
      const usedToken = {
        ...mockLoanTokenData,
        usedAt: new Date('2026-02-03'),
        loan: {
          status: 'pending' as const,
        },
      };

      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(usedToken as any);

      let errorThrown = false;
      try {
        await confirmLoan('used-token', 'borrower-123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.LOANS_TOKEN_USED);
      }
      expect(errorThrown).toBe(true);
    });

    it('should throw error if loan already processed', async () => {
      const processedLoan = {
        ...mockLoanTokenData,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        usedAt: null,
        loan: {
          status: 'confirmed' as const,
        },
      };

      spyOn(db.query.loanTokens, 'findFirst').mockResolvedValueOnce(processedLoan as any);

      let errorThrown = false;
      try {
        await confirmLoan('token-abc123', 'borrower-123');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.LOANS_ALREADY_PROCESSED);
      }
      expect(errorThrown).toBe(true);
    });
  });

  describe('createLoan with BETA_MODE_ENABLED', () => {
    beforeEach(() => {
      Object.assign(env, { BETA_MODE_ENABLED: true });
    });

    afterEach(() => {
      Object.assign(env, { BETA_MODE_ENABLED: false });
    });

    it('should add borrower to beta invites when borrower email is not in the invite list', async () => {
      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(mockItemData as any);
      spyOn(db.query.users, 'findFirst')
        .mockResolvedValueOnce(mockLenderData as any)
        .mockResolvedValueOnce(undefined);
      spyOn(db.query.betaInvites, 'findFirst').mockResolvedValueOnce(undefined);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Lender Name');

      const valuesMock = mock(() => ({ returning: mock(() => Promise.resolve([mockLoanData])) }));
      spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);
      spyOn(emailModule, 'sendEmail').mockResolvedValueOnce(undefined as any);

      const result = await createLoan('lender-123', {
        itemId: 'item-123',
        borrowerEmail: 'borrower@example.com',
        expectedReturnDate: undefined,
        lenderNotes: undefined,
      });

      expect(result.loan.id).toBe('loan-123');
      // loans insert + loanTokens insert + betaInvites insert
      expect(valuesMock).toHaveBeenCalledTimes(3);
    });

    it('should skip beta invite insert when borrower email is already in the invite list', async () => {
      const existingInvite = {
        id: 'invite-123',
        email: 'borrower@example.com',
        addedBy: 'admin-123',
      };

      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(mockItemData as any);
      spyOn(db.query.users, 'findFirst')
        .mockResolvedValueOnce(mockLenderData as any)
        .mockResolvedValueOnce(undefined);
      spyOn(db.query.betaInvites, 'findFirst').mockResolvedValueOnce(existingInvite as any);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Lender Name');

      const valuesMock = mock(() => ({ returning: mock(() => Promise.resolve([mockLoanData])) }));
      spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);
      spyOn(emailModule, 'sendEmail').mockResolvedValueOnce(undefined as any);

      await createLoan('lender-123', {
        itemId: 'item-123',
        borrowerEmail: 'borrower@example.com',
        expectedReturnDate: undefined,
        lenderNotes: undefined,
      });

      // loans insert + loanTokens insert only (no betaInvites insert)
      expect(valuesMock).toHaveBeenCalledTimes(2);
    });

    it('should upgrade existing PUBLIC borrower to BETA so they can log in and confirm the loan', async () => {
      const existingPublicBorrower = {
        ...mockBorrowerData,
        accessTier: 'PUBLIC' as const,
        deletedAt: null,
      };

      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(mockItemData as any);
      spyOn(db.query.users, 'findFirst')
        .mockResolvedValueOnce(mockLenderData as any)
        .mockResolvedValueOnce(existingPublicBorrower as any);
      spyOn(db.query.betaInvites, 'findFirst').mockResolvedValueOnce(undefined);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Lender Name');

      const valuesMock = mock(() => ({ returning: mock(() => Promise.resolve([mockLoanData])) }));
      spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      spyOn(emailModule, 'sendEmail').mockResolvedValueOnce(undefined as any);

      await createLoan('lender-123', {
        itemId: 'item-123',
        borrowerEmail: 'borrower@example.com',
        expectedReturnDate: undefined,
        lenderNotes: undefined,
      });

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ accessTier: 'BETA', betaWaitlistedAt: null })
      );
    });

    it('should not upgrade borrower who is already BETA', async () => {
      const existingBetaBorrower = {
        ...mockBorrowerData,
        accessTier: 'BETA' as const,
        deletedAt: null,
      };

      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(mockItemData as any);
      spyOn(db.query.users, 'findFirst')
        .mockResolvedValueOnce(mockLenderData as any)
        .mockResolvedValueOnce(existingBetaBorrower as any);
      spyOn(db.query.betaInvites, 'findFirst').mockResolvedValueOnce(undefined);
      spyOn(cryptoModule, 'decrypt').mockReturnValue('Lender Name');

      const valuesMock = mock(() => ({ returning: mock(() => Promise.resolve([mockLoanData])) }));
      spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);

      const setMock = mock(() => ({ where: mock(() => Promise.resolve()) }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      spyOn(emailModule, 'sendEmail').mockResolvedValueOnce(undefined as any);

      await createLoan('lender-123', {
        itemId: 'item-123',
        borrowerEmail: 'borrower@example.com',
        expectedReturnDate: undefined,
        lenderNotes: undefined,
      });

      expect(setMock).not.toHaveBeenCalled();
    });
  });
});
