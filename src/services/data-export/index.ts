export interface UserExportData {
  id: string;
  emailEncrypted: string;
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
  itemId: UUID;
  lenderId: UUID;
  borrowerId: UUID | null;
  status: string;
  confirmedAt: Date | null;
  returnedAt: Date | null;
}

export interface FriendshipExportData {
  id: string;
  userAId: UUID;
  userBId: UUID;
  createdAt: Date;
}

export interface NotificationExportData {
  id: string;
  userId: UUID;
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
      email: data.user.emailEncrypted,
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