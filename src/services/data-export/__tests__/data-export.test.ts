import { describe, expect, it } from 'bun:test';
import JSZip from 'jszip';
import { buildCSVExport, buildJSONExport } from '../index.js';

describe('Data Export - JSON', () => {
  it('should build valid JSON export structure', async () => {
    const userData = {
      id: 'user-123',
      emailEncrypted: 'encrypted@example.com',
      nameEncrypted: 'John Doe',
      emailVerified: true,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-02-01'),
    };

    const itemsData = [
      {
        id: 'item-1',
        name: 'Book',
        description: 'A great book',
        images: JSON.stringify(['https://example.com/book.jpg']),
        createdAt: new Date('2025-01-05'),
      },
    ];

    const loansData = [
      {
        id: 'loan-1',
        itemId: 'item-1',
        lenderId: 'user-123',
        borrowerId: 'user-456',
        status: 'confirmed',
        confirmedAt: new Date('2025-01-05T11:00:00Z'),
        returnedAt: null,
      },
    ];

    const friendshipsData = [
      {
        id: 'friendship-1',
        userAId: 'user-123',
        userBId: 'user-456',
        createdAt: new Date('2025-01-05'),
      },
    ];

    const notificationsData = [
      {
        id: 'notif-1',
        userId: 'user-123',
        type: 'loan_created',
        title: 'Loan created',
        message: 'You created a loan',
        read: false,
        createdAt: new Date('2025-01-05'),
      },
    ];

    const result = buildJSONExport({
      user: userData,
      items: itemsData,
      loans: loansData,
      friendships: friendshipsData,
      notifications: notificationsData,
    });

    expect(result.export).toBeDefined();
    expect(result.export.version).toBe('1.0');
    expect(result.export.user_id).toBe('user-123');
    expect(result.user.id).toBe('user-123');
    expect(result.items).toHaveLength(1);
    expect(result.loans).toBeDefined();
    expect(result.loans.as_lender).toBeDefined();
    expect(result.loans.as_borrower).toBeDefined();
    expect(result.friendships).toHaveLength(1);
    expect(result.notifications).toHaveLength(1);
  });

  it('should separate loans as_lender and as_borrower', async () => {
    const userData = {
      id: 'user-123',
      emailEncrypted: 'test@example.com',
      nameEncrypted: 'Test',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const loansData = [
      {
        id: 'loan-1',
        itemId: 'item-1',
        lenderId: 'user-123',
        borrowerId: 'user-456',
        status: 'confirmed',
        confirmedAt: new Date(),
        returnedAt: null,
      },
      {
        id: 'loan-2',
        itemId: 'item-2',
        lenderId: 'user-789',
        borrowerId: 'user-123',
        status: 'confirmed',
        confirmedAt: new Date(),
        returnedAt: null,
      },
    ];

    const result = buildJSONExport({
      user: userData,
      items: [],
      loans: loansData,
      friendships: [],
      notifications: [],
    });

    expect(result.loans.as_lender).toHaveLength(1);
    expect(result.loans.as_borrower).toHaveLength(1);
    expect(result.loans.as_lender[0]?.id).toBe('loan-1');
    expect(result.loans.as_borrower[0]?.id).toBe('loan-2');
  });

  it('should build CSV export as zip', async () => {
    const userData = {
      id: 'user-123',
      emailEncrypted: 'test@example.com',
      nameEncrypted: 'John',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const itemsData = [
      {
        id: 'item-1',
        name: 'Book',
        description: 'A book',
        images: '["https://example.com/book.jpg"]',
        createdAt: new Date(),
      },
    ];
    const loansData: any[] = [];
    const friendshipsData: any[] = [];
    const notificationsData: any[] = [];

    const zipBuffer = await buildCSVExport({
      user: userData,
      items: itemsData,
      loans: loansData,
      friendships: friendshipsData,
      notifications: notificationsData,
    });

    expect(zipBuffer).toBeInstanceOf(ArrayBuffer);

    const zip = await JSZip.loadAsync(zipBuffer);
    expect(zip.file('user.csv')).toBeDefined();
    expect(zip.file('items.csv')).toBeDefined();
    expect(zip.file('loans_lent.csv')).toBeDefined();
    expect(zip.file('loans_borrowed.csv')).toBeDefined();
    expect(zip.file('friendships.csv')).toBeDefined();

    const userCsv = await zip.file('user.csv')?.async('string');
    expect(userCsv).toBeDefined();
    expect(userCsv).toContain('id,email,name');
  });

  it('should export user data in requested format', async () => {
    // This test will be more specific when we implement the actual logic
    // For now, just verify the function exists
    expect(typeof buildJSONExport).toBe('function');
    expect(typeof buildCSVExport).toBe('function');
  });
});
