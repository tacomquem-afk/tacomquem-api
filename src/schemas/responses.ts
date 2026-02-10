import { z } from 'zod';

const uuidSchema = z.string().uuid();
const urlSchema = z.string().url();
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
  images: z.array(urlSchema),
  isActive: z.boolean(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const loanResponseSchema = z.object({
  id: uuidSchema,
  item: z.object({
    id: uuidSchema,
    name: z.string(),
    images: z.array(urlSchema),
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
  itemImages: z.array(urlSchema),
  lenderName: z.string(),
});

export const friendResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().nullable(),
  lentCount: z.number(),
  borrowedCount: z.number(),
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

export const dashboardDataSchema = z.object({
  stats: dashboardStatsSchema,
  recentActivity: z.array(recentActivitySchema),
  pendingLoans: z.array(
    z.object({
      id: uuidSchema,
      itemName: z.string(),
      borrowerEmail: z.string().email().nullable(),
      createdAt: dateSchema,
    })
  ),
  activeLoans: z.array(
    z.object({
      id: uuidSchema,
      itemName: z.string(),
      itemImages: z.array(urlSchema),
      otherParty: z.string(),
      role: z.enum(['lender', 'borrower']),
      expectedReturnDate: dateSchema.nullable(),
      confirmedAt: dateSchema,
    })
  ),
});

export const uploadResultSchema = z.object({
  url: urlSchema,
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

export const adminUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
  createdAt: dateSchema,
});

export const maskedUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
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
  email: z.string().email(),
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
  images: z.array(urlSchema),
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
    images: z.array(urlSchema),
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
