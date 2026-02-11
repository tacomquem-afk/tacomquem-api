import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { db } from '../../../db/index.js';
import { BadRequestError, ErrorCodes, GoneError, NotFoundError } from '../../../errors/index.js';
import * as cryptoModule from '../../crypto/index.js';
import * as emailModule from '../../email/index.js';
import {
  cancelLoan,
  confirmLoan,
  createLoan,
  getLoanById,
  getLoansByUser,
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
  spyOn(cryptoModule, 'decrypt').mockClear();
  spyOn(emailModule, 'sendEmail').mockClear();
});

afterEach(() => {
  spyOn(cryptoModule, 'decrypt').mockRestore();
  spyOn(emailModule, 'sendEmail').mockRestore();
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

      const valuesMock = mock(() => Promise.resolve());
      spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);

      spyOn(cryptoModule, 'decrypt').mockReturnValue('Test Name');

      const result = await confirmLoan('token-abc123', 'borrower-123');

      expect(result).not.toBeNull();
      expect(result.status).toBe('confirmed');
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
});
