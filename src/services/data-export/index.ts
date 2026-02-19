import JSZip from 'jszip';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, items, loans, friendships, notifications } from '../../db/schema.js';

export interface UserExportData {
  id: string;
  emailEncrypted: string | null;
  nameEncrypted: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItemExportData {
  id: string;
  name: string;
  description: string | null;
  images: string;
  createdAt: Date;
}

export interface LoanExportData {
  id: string;
  itemId: string;
  lenderId: string;
  borrowerId: string | null;
  status: string;
  confirmedAt: Date | null;
  returnedAt: Date | null;
}

export interface FriendshipExportData {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: Date;
}

export interface NotificationExportData {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

export interface ExportDataInput {
  user: UserExportData;
  items: ItemExportData[];
  loans: LoanExportData[];
  friendships: FriendshipExportData[];
  notifications: NotificationExportData[];
}

export interface JSONExport {
  export: {
    version: string;
    generated_at: string;
    user_id: string;
  };
  user: {
    id: string;
    email: string;
    name: string;
    email_verified: boolean;
    created_at: string;
    updated_at: string;
  };
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    images: string[];
    created_at: string;
  }>;
  loans: {
    as_lender: Array<{
      id: string;
      item_id: string;
      borrower_id: string | null;
      status: string;
      confirmed_at: string | null;
      returned_at: string | null;
    }>;
    as_borrower: Array<{
      id: string;
      item_id: string;
      lender_id: string;
      status: string;
      confirmed_at: string | null;
      returned_at: string | null;
    }>;
  };
  friendships: Array<{
    id: string;
    friend_id: string;
    created_at: string;
  }>;
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    created_at: string;
  }>;
}

export function buildJSONExport(data: ExportDataInput): JSONExport {
  const parsedImages = (imagesJson: string): string[] => {
    try {
      return JSON.parse(imagesJson);
    } catch {
      return [];
    }
  };

  return {
    export: {
      version: '1.0',
      generated_at: new Date().toISOString(),
      user_id: data.user.id,
    },
    user: {
      id: data.user.id,
      email: data.user.emailEncrypted || '',
      name: data.user.nameEncrypted,
      email_verified: data.user.emailVerified,
      created_at: data.user.createdAt.toISOString(),
      updated_at: data.user.updatedAt.toISOString(),
    },
    items: data.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      images: parsedImages(item.images),
      created_at: item.createdAt.toISOString(),
    })),
    loans: {
      as_lender: data.loans
        .filter((loan) => loan.lenderId === data.user.id)
        .map((loan) => ({
          id: loan.id,
          item_id: loan.itemId,
          borrower_id: loan.borrowerId,
          status: loan.status,
          confirmed_at: loan.confirmedAt?.toISOString() ?? null,
          returned_at: loan.returnedAt?.toISOString() ?? null,
        })),
      as_borrower: data.loans
        .filter((loan) => loan.borrowerId === data.user.id)
        .map((loan) => ({
          id: loan.id,
          item_id: loan.itemId,
          lender_id: loan.lenderId,
          status: loan.status,
          confirmed_at: loan.confirmedAt?.toISOString() ?? null,
          returned_at: loan.returnedAt?.toISOString() ?? null,
        })),
    },
    friendships: data.friendships
      .filter((f) => f.userAId === data.user.id || f.userBId === data.user.id)
      .map((friendship) => ({
        id: friendship.id,
        friend_id: friendship.userAId === data.user.id ? friendship.userBId : friendship.userAId,
        created_at: friendship.createdAt.toISOString(),
      })),
    notifications: data.notifications.map((notif) => ({
      id: notif.id,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      read: notif.read,
      created_at: notif.createdAt.toISOString(),
    })),
  };
}

function toCSV(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const headerLine = headers.join(',');
  const dataLines = rows.map((row) =>
    row
      .map((cell) => {
        if (cell === null || cell === undefined) return '';
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

export async function buildCSVExport(data: ExportDataInput): Promise<ArrayBuffer> {
  const zip = new JSZip();

  // user.csv
  const userCsv = toCSV(
    ['id', 'email', 'name', 'email_verified', 'created_at', 'updated_at'],
    [
      [
        data.user.id,
        data.user.emailEncrypted,
        data.user.nameEncrypted,
        data.user.emailVerified ? 'true' : 'false',
        data.user.createdAt.toISOString(),
        data.user.updatedAt.toISOString(),
      ],
    ]
  );
  zip.file('user.csv', userCsv);

  // items.csv
  const itemsCsv = toCSV(
    ['id', 'name', 'description', 'images_count', 'created_at'],
    data.items.map((item) => {
      const images = JSON.parse(item.images);
      return [item.id, item.name, item.description || '', images.length, item.createdAt.toISOString()];
    })
  );
  zip.file('items.csv', itemsCsv);

  // loans_lent.csv
  const loansLentCsv = toCSV(
    ['loan_id', 'item_id', 'borrower_id', 'status', 'confirmed_at', 'returned_at'],
    data.loans
      .filter((loan) => loan.lenderId === data.user.id)
      .map((loan) => [loan.id, loan.itemId, loan.borrowerId || '', loan.status, loan.confirmedAt?.toISOString() || '', loan.returnedAt?.toISOString() || ''])
  );
  zip.file('loans_lent.csv', loansLentCsv);

  // loans_borrowed.csv
  const loansBorrowedCsv = toCSV(
    ['loan_id', 'item_id', 'lender_id', 'status', 'confirmed_at', 'returned_at'],
    data.loans
      .filter((loan) => loan.borrowerId === data.user.id)
      .map((loan) => [loan.id, loan.itemId, loan.lenderId, loan.status, loan.confirmedAt?.toISOString() || '', loan.returnedAt?.toISOString() || ''])
  );
  zip.file('loans_borrowed.csv', loansBorrowedCsv);

  // friendships.csv
  const friendshipsCsv = toCSV(
    ['friendship_id', 'friend_id', 'created_at'],
    data.friendships
      .filter((f) => f.userAId === data.user.id || f.userBId === data.user.id)
      .map((friendship) => [
        friendship.id,
        friendship.userAId === data.user.id ? friendship.userBId : friendship.userAId,
        friendship.createdAt.toISOString(),
      ])
  );
  zip.file('friendships.csv', friendshipsCsv);

  return zip.generateAsync({ type: 'arraybuffer' });
}

export async function exportUserData(userId: string, format: 'json' | 'csv') {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  const userItems = await db.query.items.findMany({
    where: eq(items.ownerId, userId),
  });

  const userLoans = await db.query.loans.findMany({
    where: and(
      eq(loans.lenderId, userId)
      // Note: also need to include loans where borrowerId = userId
    ),
  });

  // Need to get both lent and borrowed loans
  const allLoans = [
    ...userLoans,
    ...(await db.query.loans.findMany({
      where: eq(loans.borrowerId, userId),
    })),
  ];

  const userFriendships = await db.query.friendships.findMany({
    where: eq(friendships.userAId, userId),
  });

  const userNotifications = await db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
  });

  const exportData: ExportDataInput = {
    user,
    items: userItems,
    loans: allLoans,
    friendships: userFriendships,
    notifications: userNotifications,
  };

  if (format === 'json') {
    return buildJSONExport(exportData);
  } else {
    return buildCSVExport(exportData);
  }
}