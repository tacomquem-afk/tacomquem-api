import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const loanStatusEnum = pgEnum('loan_status', [
  'pending',
  'confirmed',
  'returned',
  'cancelled',
]);
export const notificationTypeEnum = pgEnum('notification_type', [
  'loan_created',
  'loan_confirmed',
  'loan_reminder',
  'loan_returned',
]);

export const roleEnum = pgEnum('user_role', [
  'USER',
  'ANALYST',
  'SUPPORT',
  'MODERATOR',
  'SUPER_ADMIN',
]);

export const adminActionEnum = pgEnum('admin_action', [
  'user_blocked',
  'user_unblocked',
  'user_deleted',
  'item_removed',
  'loan_cancelled',
  'admin_created',
  'admin_role_changed',
  'admin_removed',
  'content_flagged',
]);

export const accessTierEnum = pgEnum('access_tier', ['PUBLIC', 'BETA', 'ARCHIVED']);

export const betaAuditActionEnum = pgEnum('beta_audit_action', ['added', 'removed']);

export const deletionStatusEnum = pgEnum('deletion_status', [
  'active',
  'pending',
  'scheduled',
  'completed',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailEncrypted: text('email_encrypted'),
  nameEncrypted: text('name_encrypted').notNull(),
  emailHash: varchar('email_hash', { length: 255 }).unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  avatarUrl: text('avatar_url'),
  emailVerified: boolean('email_verified').default(false).notNull(),

  // Parental Consent fields
  dateOfBirth: date('date_of_birth'),
  parentalConsentStatus: varchar('parental_consent_status', { length: 50 })
    .default('not_applicable')
    .notNull(),
  parentalEmail: text('parental_email'), // encrypted
  parentalName: varchar('parental_name', { length: 255 }),
  parentalConsentToken: varchar('parental_consent_token', { length: 255 }).unique(),
  parentalConsentTokenExpiresAt: timestamp('parental_consent_token_expires_at'),
  parentalConsentConfirmedAt: timestamp('parental_consent_confirmed_at'),
  parentalConsentIpAddress: varchar('parental_consent_ip_address', { length: 45 }),
  parentalConsentUserAgent: text('parental_consent_user_agent'),

  termsVersion: varchar('terms_version', { length: 20 }),
  termsAcceptedAt: timestamp('terms_accepted_at'),
  termsAcceptedIp: varchar('terms_accepted_ip', { length: 45 }),

  role: roleEnum('role').default('USER').notNull(),
  accessTier: accessTierEnum('access_tier').default('PUBLIC').notNull(),
  betaAddedAt: timestamp('beta_added_at'),
  betaWaitlistedAt: timestamp('beta_waitlisted_at'),
  isActive: boolean('is_active').default(true).notNull(),
  blockedAt: timestamp('blocked_at'),
  blockedReason: text('blocked_reason'),
  deletedAt: timestamp('deleted_at'),
  deletionRequestedAt: timestamp('deletion_requested_at'),
  deletionScheduledFor: timestamp('deletion_scheduled_for'),
  deletionStatus: deletionStatusEnum('deletion_status').default('active').notNull(),
  deletionReason: text('deletion_reason'),
  deletionCancelledAt: timestamp('deletion_cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  images: text('images').notNull().default('[]'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const loans = pgTable('loans', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id')
    .notNull()
    .references(() => items.id),
  lenderId: uuid('lender_id')
    .notNull()
    .references(() => users.id),
  borrowerId: uuid('borrower_id').references(() => users.id),
  borrowerEmail: varchar('borrower_email', { length: 255 }),
  status: loanStatusEnum('status').notNull().default('pending'),
  expectedReturnDate: timestamp('expected_return_date'),
  lenderNotes: text('lender_notes'),
  borrowerNotes: text('borrower_notes'),
  confirmedAt: timestamp('confirmed_at'),
  returnedAt: timestamp('returned_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userAId: uuid('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: uuid('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originLoanId: uuid('origin_loan_id').references(() => loans.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    check('friendships_distinct_users_check', sql`${table.userAId} <> ${table.userBId}`),
    uniqueIndex('friendships_user_pair_unique').on(
      sql`LEAST(${table.userAId}, ${table.userBId})`,
      sql`GREATEST(${table.userAId}, ${table.userBId})`
    ),
  ]
);

export const loanTokens = pgTable('loan_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  loanId: uuid('loan_id')
    .notNull()
    .references(() => loans.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  loanId: uuid('loan_id').references(() => loans.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  read: boolean('read').default(false).notNull(),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const verificationTokens = pgTable('verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  type: varchar('type', { length: 50 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull().unique(),
  key: text('key').notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  confirmedAt: timestamp('confirmed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const adminAuditLog = pgTable('admin_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: adminActionEnum('action').notNull(),
  targetType: varchar('target_type', { length: 50 }),
  targetId: uuid('target_id'),
  metadata: text('metadata'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const betaProgramAudit = pgTable('beta_program_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: betaAuditActionEnum('action').notNull(),
  reason: text('reason'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deletionTokens = pgTable('deletion_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).unique().notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const accessLogs = pgTable(
  'access_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    timestamp: timestamp('timestamp').notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    httpMethod: varchar('http_method', { length: 10 }).notNull(),
    path: varchar('path', { length: 500 }).notNull(),
    queryString: varchar('query_string', { length: 500 }),
    statusCode: integer('status_code'),
    responseTimeMs: integer('response_time_ms'),
    userAgent: text('user_agent'),
    referrer: varchar('referrer', { length: 500 }),
    bodyHash: varchar('body_hash', { length: 64 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_access_logs_user_id_timestamp').on(table.userId, table.timestamp),
    index('idx_access_logs_timestamp').on(table.timestamp),
    index('idx_access_logs_created_at').on(table.createdAt),
  ]
);

export const dataExports = pgTable('data_exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  format: varchar('format', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  fileUrl: varchar('file_url', { length: 255 }),
  fileSizeBytes: integer('file_size_bytes'),
  downloadToken: varchar('download_token', { length: 255 }).unique(),
  downloadTokenExpiresAt: timestamp('download_token_expires_at'),
  downloadedAt: timestamp('downloaded_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const betaInvites = pgTable('beta_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  addedBy: uuid('added_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason'),
  ipAddress: varchar('ip_address', { length: 45 }),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  oauthAccounts: many(oauthAccounts),
  items: many(items),
  lentLoans: many(loans, { relationName: 'lender' }),
  borrowedLoans: many(loans, { relationName: 'borrower' }),
  friendshipsAsUserA: many(friendships, { relationName: 'userA' }),
  friendshipsAsUserB: many(friendships, { relationName: 'userB' }),
  notifications: many(notifications),
  verificationTokens: many(verificationTokens),
  uploads: many(uploads),
  adminActions: many(adminAuditLog),
  betaAuditEntriesAsAdmin: many(betaProgramAudit, { relationName: 'betaAdmin' }),
  betaAuditEntriesAsUser: many(betaProgramAudit, { relationName: 'betaUser' }),
  betaInvitesCreated: many(betaInvites, { relationName: 'admin' }),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  owner: one(users, {
    fields: [items.ownerId],
    references: [users.id],
  }),
  loans: many(loans),
}));

export const loansRelations = relations(loans, ({ one, many }) => ({
  item: one(items, {
    fields: [loans.itemId],
    references: [items.id],
  }),
  lender: one(users, {
    fields: [loans.lenderId],
    references: [users.id],
    relationName: 'lender',
  }),
  borrower: one(users, {
    fields: [loans.borrowerId],
    references: [users.id],
    relationName: 'borrower',
  }),
  friendships: many(friendships),
  tokens: many(loanTokens),
  notifications: many(notifications),
}));

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  userA: one(users, {
    fields: [friendships.userAId],
    references: [users.id],
    relationName: 'userA',
  }),
  userB: one(users, {
    fields: [friendships.userBId],
    references: [users.id],
    relationName: 'userB',
  }),
  originLoan: one(loans, {
    fields: [friendships.originLoanId],
    references: [loans.id],
  }),
}));

export const loanTokensRelations = relations(loanTokens, ({ one }) => ({
  loan: one(loans, {
    fields: [loanTokens.loanId],
    references: [loans.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  loan: one(loans, {
    fields: [notifications.loanId],
    references: [loans.id],
  }),
}));

export const verificationTokensRelations = relations(verificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [verificationTokens.userId],
    references: [users.id],
  }),
}));

export const uploadsRelations = relations(uploads, ({ one }) => ({
  user: one(users, {
    fields: [uploads.userId],
    references: [users.id],
  }),
}));

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  admin: one(users, {
    fields: [adminAuditLog.adminId],
    references: [users.id],
  }),
}));

export const betaProgramAuditRelations = relations(betaProgramAudit, ({ one }) => ({
  admin: one(users, {
    fields: [betaProgramAudit.adminId],
    references: [users.id],
    relationName: 'betaAdmin',
  }),
  user: one(users, {
    fields: [betaProgramAudit.userId],
    references: [users.id],
    relationName: 'betaUser',
  }),
}));

export const deletionTokensRelations = relations(deletionTokens, ({ one }) => ({
  user: one(users, {
    fields: [deletionTokens.userId],
    references: [users.id],
  }),
}));

export const accessLogsRelations = relations(accessLogs, ({ one }) => ({
  user: one(users, {
    fields: [accessLogs.userId],
    references: [users.id],
  }),
}));

export const dataExportsRelations = relations(dataExports, ({ one }) => ({
  user: one(users, {
    fields: [dataExports.userId],
    references: [users.id],
  }),
}));

export const betaInvitesRelations = relations(betaInvites, ({ one }) => ({
  admin: one(users, {
    fields: [betaInvites.addedBy],
    references: [users.id],
    relationName: 'admin',
  }),
}));
