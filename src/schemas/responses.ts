import { z } from 'zod';

const uuidSchema = z.string().uuid();
const dateSchema = z.string().datetime();

export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  errorCode: z.string(),
  instance: z.string(),
  errors: z.array(fieldErrorSchema).optional(),
});

export const errorResponse400 = problemDetailsSchema;
export const errorResponse401 = problemDetailsSchema;
export const errorResponse403 = problemDetailsSchema;
export const errorResponse404 = problemDetailsSchema;
export const errorResponse409 = problemDetailsSchema;
export const errorResponse410 = problemDetailsSchema;
export const errorResponse413 = problemDetailsSchema;
export const errorResponse422 = problemDetailsSchema;
export const errorResponse500 = problemDetailsSchema;

export const messageResponseSchema = z.object({
  message: z.string(),
});

export const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const userRoleSchema = z.enum(['USER', 'ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']);

export const userResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().nullable(),
  emailVerified: z.boolean(),
  role: userRoleSchema,
  isActive: z.boolean().optional(),
  blockedAt: dateSchema.nullable().optional(),
  blockedReason: z.string().nullable().optional(),
  createdAt: dateSchema.optional(),
  updatedAt: dateSchema.optional(),
});

export const itemResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  images: z.array(z.string()),
  isActive: z.boolean(),
  isLoaned: z.boolean(),
  currentLoanId: uuidSchema.nullable(),
  borrowedTo: z.string().nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const loanResponseSchema = z.object({
  id: uuidSchema,
  item: z.object({
    id: uuidSchema,
    name: z.string(),
    images: z.array(z.string()),
  }),
  lender: z.object({
    id: uuidSchema,
    name: z.string(),
  }),
  borrower: z
    .object({
      id: uuidSchema,
      name: z.string(),
    })
    .nullable(),
  borrowerEmail: z.string().email().nullable(),
  status: z.enum(['pending', 'confirmed', 'returned', 'cancelled']),
  expectedReturnDate: dateSchema.nullable(),
  lenderNotes: z.string().nullable(),
  borrowerNotes: z.string().nullable(),
  confirmedAt: dateSchema.nullable(),
  returnedAt: dateSchema.nullable(),
  createdAt: dateSchema,
});

export const publicLoanInfoSchema = z.object({
  itemName: z.string(),
  itemImages: z.array(z.string()),
  lenderName: z.string(),
  itemDescription: z.string().nullable(),
  expectedReturnDate: dateSchema.nullable(),
  lenderNotes: z.string().nullable(),
});

export const friendResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().nullable(),
  lentCount: z.number(),
  borrowedCount: z.number(),
});

export const dashboardSearchItemSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
});

export const dashboardSearchResponseSchema = z.object({
  query: z.string(),
  items: z.array(dashboardSearchItemSchema),
  friends: z.array(friendResponseSchema),
  meta: z.object({
    itemCount: z.number(),
    friendCount: z.number(),
    limit: z.number(),
  }),
});

export const dashboardStatsSchema = z.object({
  itemsCount: z.number(),
  activeLentCount: z.number(),
  activeBorrowedCount: z.number(),
  pendingCount: z.number(),
});

export const recentActivitySchema = z.object({
  id: uuidSchema,
  type: z.enum(['loan_created', 'loan_confirmed', 'loan_returned', 'loan_reminder']),
  message: z.string(),
  createdAt: dateSchema,
  read: z.boolean(),
});

export const dashboardLoanSchema = z.object({
  id: uuidSchema,
  itemName: z.string(),
  itemImages: z.array(z.string()),
  status: z.enum(['pending', 'confirmed']),
  otherParty: z.string().nullable(),
  role: z.enum(['lender', 'borrower']),
  expectedReturnDate: dateSchema.nullable(),
  createdAt: dateSchema,
  confirmedAt: dateSchema.nullable(),
});

export const dashboardDataSchema = z.object({
  stats: dashboardStatsSchema,
  recentActivity: z.array(recentActivitySchema),
  loans: z.array(dashboardLoanSchema),
});

export const historyCountsSchema = z.object({
  all: z.number(),
  lent: z.number(),
  borrowed: z.number(),
});

export const historyResponseSchema = z.object({
  loans: z.array(loanResponseSchema),
  counts: historyCountsSchema,
});

export const uploadResultSchema = z.object({
  key: z.string(),
  url: z.string().url(),
  expiresAt: z.string().datetime(),
  sizeBytes: z.number(),
});

export const healthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string().optional(),
  database: z.string().optional(),
});

export const authTokensResponseSchema = z.object({
  user: userResponseSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const paginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export const notificationResponseSchema = z.object({
  id: uuidSchema.describe('Unique notification ID'),
  loanId: uuidSchema.nullable().describe('Associated loan ID, null if not linked to a loan'),
  type: z
    .enum(['loan_created', 'loan_confirmed', 'loan_returned', 'loan_reminder'])
    .describe('Notification event type'),
  title: z.string().describe('Short heading displayed in the notification card'),
  message: z.string().describe('Full notification body text'),
  read: z.boolean().describe('Whether the user has read this notification'),
  createdAt: dateSchema.describe('ISO 8601 timestamp when the notification was created'),
  sentAt: dateSchema
    .nullable()
    .describe('ISO 8601 timestamp when the push/email was dispatched, null if not yet sent'),
});

export const notificationsListResponseSchema = z.object({
  notifications: z
    .array(notificationResponseSchema)
    .describe('Ordered list of notifications, newest first'),
  pagination: paginationSchema.describe('Pagination metadata'),
  unreadCount: z
    .number()
    .describe('Total unread notifications for this user (ignores active read filter)'),
});

export const adminUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string(),
  role: userRoleSchema,
  createdAt: dateSchema,
});

export const maskedUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string(),
  role: userRoleSchema,
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  loansAsLender: z.number(),
  loansAsBorrower: z.number(),
  itemsCount: z.number(),
  createdAt: dateSchema,
  lastActivityAt: dateSchema.optional(),
});

const auditLogAdminSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  role: userRoleSchema,
});

export const auditLogEntrySchema = z.object({
  id: uuidSchema,
  admin: auditLogAdminSchema,
  action: z.string(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  metadata: z.unknown().optional(),
  ipAddress: z.string().optional(),
  createdAt: dateSchema,
});

export const auditLogResponseSchema = z.object({
  logs: z.array(auditLogEntrySchema),
  pagination: paginationSchema,
});

export const adminDashboardStatsSchema = z.object({
  summary: z.object({
    totalUsers: z.number(),
    activeUsers: z.number(),
    totalItems: z.number(),
    activeLoans: z.number(),
    totalLoans: z.number(),
  }),
  trends: z.object({
    newUsersLastWeek: z.number(),
    newLoansLastWeek: z.number(),
    returnRateLast30Days: z.number(),
  }),
});

export const userStatsSchema = z.object({
  byRole: z.record(z.string(), z.number()),
  activeUsers: z.number(),
  blockedUsers: z.number(),
  emailVerifiedCount: z.number(),
});

export const loanStatsSchema = z.object({
  byStatus: z.record(z.string(), z.number()),
  averageLoanDuration: z.number(),
  onTimeReturnRate: z.number(),
});

export const adminListUsersResponseSchema = z.object({
  users: z.array(maskedUserSchema),
  pagination: paginationSchema,
});

export const adminUserDetailsSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string(),
  role: userRoleSchema,
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  blockedAt: dateSchema.nullable(),
  blockedReason: z.string().nullable(),
  lentLoans: z.array(loanResponseSchema),
  borrowedLoans: z.array(loanResponseSchema),
  items: z.array(itemResponseSchema),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const adminItemDetailsSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  images: z.array(z.string()),
  isActive: z.boolean(),
  owner: z.object({
    id: uuidSchema,
    name: z.string(),
    email: z.string().email(),
  }),
  activeLoans: z.number(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const adminLoanDetailsSchema = z.object({
  id: uuidSchema,
  item: z.object({
    id: uuidSchema,
    name: z.string(),
    images: z.array(z.string()),
  }),
  lender: z.object({
    id: uuidSchema,
    name: z.string(),
    email: z.string().email(),
  }),
  borrower: z
    .object({
      id: uuidSchema,
      name: z.string(),
      email: z.string().email(),
    })
    .nullable(),
  borrowerEmail: z.string().email().nullable(),
  status: z.enum(['pending', 'confirmed', 'returned', 'cancelled']),
  expectedReturnDate: dateSchema.nullable(),
  lenderNotes: z.string().nullable(),
  borrowerNotes: z.string().nullable(),
  confirmedAt: dateSchema.nullable(),
  returnedAt: dateSchema.nullable(),
  createdAt: dateSchema,
});

export const accessTierSchema = z
  .enum(['PUBLIC', 'BETA', 'ARCHIVED'])
  .describe('User access tier for beta program eligibility');

export const betaUserSchema = z.object({
  id: uuidSchema.describe('User ID'),
  email: z.string().describe('Masked email address returned for admin views'),
  name: z.string().describe('Masked full name returned for admin views'),
  accessTier: accessTierSchema.describe('Current access tier for the user'),
  betaAddedAt: dateSchema
    .nullable()
    .describe('Timestamp when the user was added to beta, null if not set'),
  emailVerified: z.boolean().describe('Whether the user has verified their email'),
  createdAt: dateSchema.describe('User account creation timestamp'),
});

export const betaUserListResponseSchema = z
  .object({
    users: z.array(betaUserSchema).describe('Paginated list of beta users'),
    pagination: paginationSchema.describe('Pagination metadata'),
  })
  .describe('Paginated beta program users response');

export const addBetaUserSchema = z
  .object({
    success: z.boolean().describe('Indicates whether the operation succeeded'),
    message: z.string().describe('Human-readable confirmation message'),
    user: betaUserSchema.describe('Updated beta user record (masked)'),
  })
  .describe('Beta program mutation response');
