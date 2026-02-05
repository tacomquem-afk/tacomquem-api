import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { resetAllDbMocks } from '../../../__tests__/helpers/db-mock-reset.js';
import { db } from '../../../db/index.js';
import * as cryptoModule from '../../crypto/index.js';
import { cancelLoan, getItemDetails, getLoanDetails, removeItem } from '../moderation.js';

const mocks: Array<{ mockRestore: () => void }> = [];

describe('Moderation Service', () => {
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

  describe('getItemDetails', () => {
    it('should return item with loans history and owner info', async () => {
      const mockItem = {
        id: 'item-1',
        name: 'Test Item',
        isActive: true,
        owner: {
          id: 'user-1',
          emailEncrypted: 'enc',
          nameEncrypted: 'enc',
        },
        loans: [],
      };

      mocks.push(
        spyOn(cryptoModule, 'decrypt')
          .mockReturnValueOnce('owner@example.com')
          .mockReturnValueOnce('Owner Name')
      );

      mocks.push(spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(mockItem as any));

      const result = await getItemDetails('item-1');

      expect(result).toBeDefined();
      expect(result?.owner.email).toBeDefined();
      expect(typeof result?.owner.email).toBe('string');
      expect(result?.owner.email).toContain('***');
    });

    it('should return null if item not found', async () => {
      mocks.push(spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(null as any));

      const result = await getItemDetails('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('removeItem', () => {
    it('should soft delete item and log action', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) })),
      } as any);
      mocks.push(updateSpy);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);
      mocks.push(insertSpy);

      await removeItem('item-1', 'admin-1', 'Inappropriate content', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
    });
  });

  describe('getLoanDetails', () => {
    it('should return loan with lender and borrower info', async () => {
      const mockLoan = {
        id: 'loan-1',
        item: { name: 'Test Item' },
        lender: { id: 'user-1', emailEncrypted: 'enc', nameEncrypted: 'enc' },
        borrower: { id: 'user-2', emailEncrypted: 'enc', nameEncrypted: 'enc' },
      };

      mocks.push(
        spyOn(cryptoModule, 'decrypt')
          .mockReturnValueOnce('lender@example.com')
          .mockReturnValueOnce('Lender Name')
          .mockReturnValueOnce('borrower@example.com')
          .mockReturnValueOnce('Borrower Name')
      );

      mocks.push(spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce(mockLoan as any));

      const result = await getLoanDetails('loan-1');

      expect(result).toBeDefined();
      expect(result?.lender.email).toBeDefined();
      expect(typeof result?.lender.email).toBe('string');
      expect(result?.lender.email).toContain('***');
      expect(result?.borrower?.email).toBeDefined();
      expect(typeof result?.borrower?.email).toBe('string');
      expect(result?.borrower?.email).toContain('***');
    });
  });

  describe('cancelLoan', () => {
    it('should cancel loan and log action', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) })),
      } as any);
      mocks.push(updateSpy);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve()),
      } as any);
      mocks.push(insertSpy);

      await cancelLoan('loan-1', 'admin-1', 'Fraudulent loan', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
    });
  });
});
