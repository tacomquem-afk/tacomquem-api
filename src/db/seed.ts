/**
 * Database seed script for generating realistic test data
 *
 * Usage:
 *   bun run db:seed          # Reset and populate with test data
 *   bun run db:seed --help   # Show options
 *
 * Generates:
 *   - 500 test users with realistic data
 *   - 1500+ items (3-4 per user)
 *   - 3000+ loans with various statuses
 *   - Loan tokens and notifications
 */

import { faker } from '@faker-js/faker';
import type { InferInsertModel } from 'drizzle-orm';
import { count } from 'drizzle-orm';
import { encrypt, hash } from '../services/crypto/index';
import { db } from './index';
import {
  items,
  loans,
  loanTokens,
  notifications,
  oauthAccounts,
  users,
  verificationTokens,
} from './schema';

function logInfo(msg: string) {
  // biome-ignore lint: CLI output
  console.log(`✓ ${msg}`);
}

function logSuccess(msg: string) {
  // biome-ignore lint: CLI output
  console.log(`✅ ${msg}`);
}

function logError(msg: string) {
  const errorMsg = `❌ ${msg}`;
  process.stderr.write(`${errorMsg}\n`);
}

function logSection(msg: string) {
  // biome-ignore lint: CLI output
  console.log(`\n📋 ${msg}`);
}

const LOG = {
  info: logInfo,
  success: logSuccess,
  error: logError,
  section: logSection,
};

interface SeedOptions {
  usersCount: number;
  itemsPerUser: number;
  loansPerItem: number;
  verbose: boolean;
}

const DEFAULT_OPTIONS: SeedOptions = {
  usersCount: 500,
  itemsPerUser: 3,
  loansPerItem: 2,
  verbose: false,
};

async function clearDatabase() {
  LOG.section('Clearing database...');

  const tables = [
    'notifications',
    'loan_tokens',
    'loans',
    'items',
    'oauth_accounts',
    'verification_tokens',
    'uploads',
    'users',
  ];

  for (const table of tables) {
    await db.execute(`TRUNCATE TABLE "${table}" CASCADE`);
    LOG.info(`Cleared ${table}`);
  }
}

function generateUser() {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const email = faker.internet.email({ firstName, lastName });

  return {
    id: faker.string.uuid(),
    emailEncrypted: encrypt(email),
    nameEncrypted: encrypt(`${firstName} ${lastName}`),
    emailHash: hash(email),
    passwordHash: null,
    avatarUrl: faker.image.avatar(),
    emailVerified: faker.datatype.boolean(0.7), // 70% verified
    createdAt: faker.date.past({ years: 2 }),
    updatedAt: faker.date.recent(),
  };
}

function generateItem(ownerId: string) {
  const itemType = faker.helpers.arrayElement([
    'Book',
    'Laptop',
    'Camera',
    'Guitar',
    'Bicycle',
    'Tent',
    'Drill',
    'Monitor',
    'Headphones',
    'Projector',
    'Skateboard',
    'Cooking pot',
    'Camping stove',
    'Board game',
    'Vacuum cleaner',
  ]);

  const images =
    faker.helpers.maybe(
      () => {
        const count = faker.number.int({ min: 1, max: 3 });
        return Array.from({ length: count }, () => faker.image.url());
      },
      { probability: 0.6 }
    ) || [];

  return {
    id: faker.string.uuid(),
    ownerId,
    name: `${itemType} - ${faker.word.adjective()}`,
    description: faker.commerce.productDescription(),
    images: JSON.stringify(images),
    isActive: faker.datatype.boolean(0.85), // 85% active
    createdAt: faker.date.past({ years: 2 }),
    updatedAt: faker.date.recent(),
  };
}

function generateLoan(itemId: string, lenderId: string, allUsers: { id: string }[]) {
  const status = faker.helpers.weightedArrayElement([
    { weight: 0.5, value: 'returned' as const },
    { weight: 0.3, value: 'confirmed' as const },
    { weight: 0.15, value: 'pending' as const },
    { weight: 0.05, value: 'cancelled' as const },
  ]);

  const borrower = faker.helpers.arrayElement(allUsers.filter((u) => u.id !== lenderId));
  const borrowerId = borrower.id;

  const now = new Date();
  const createdAt = faker.date.past({ years: 1 });

  let expectedReturnDate: Date;
  let confirmedAt: Date | null = null;
  let returnedAt: Date | null = null;

  if (status === 'returned') {
    expectedReturnDate = faker.date.between({ from: createdAt, to: now });
    confirmedAt = faker.date.between({ from: createdAt, to: expectedReturnDate });
    returnedAt = faker.date.between({ from: confirmedAt, to: now });
  } else if (status === 'confirmed') {
    expectedReturnDate = faker.date.future({ years: 0.5, refDate: createdAt });
    confirmedAt = faker.date.between({
      from: createdAt,
      to: new Date(Math.min(expectedReturnDate.getTime(), now.getTime())),
    });
  } else if (status === 'cancelled') {
    expectedReturnDate = faker.date.future({ years: 0.5, refDate: createdAt });
    confirmedAt = faker.date.between({
      from: createdAt,
      to: new Date(Math.min(expectedReturnDate.getTime(), now.getTime())),
    });
  } else {
    expectedReturnDate = faker.date.future({ years: 0.5, refDate: createdAt });
  }

  return {
    id: faker.string.uuid(),
    itemId,
    lenderId,
    borrowerId,
    borrowerEmail: null,
    status,
    expectedReturnDate,
    confirmedAt,
    returnedAt,
    lenderNotes: faker.helpers.maybe(() => faker.lorem.sentence(), {
      probability: 0.3,
    }),
    borrowerNotes: faker.helpers.maybe(() => faker.lorem.sentence(), {
      probability: 0.3,
    }),
    createdAt,
    updatedAt: returnedAt || confirmedAt || createdAt,
  };
}

function generateLoanToken(loanId: string, loanCreatedAt: Date) {
  const token = faker.string.alphanumeric(64);
  const expiresAt = new Date(loanCreatedAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  return {
    id: faker.string.uuid(),
    loanId,
    token,
    expiresAt,
    usedAt: faker.datatype.boolean(0.8)
      ? faker.date.between({
          from: loanCreatedAt,
          to: expiresAt,
        })
      : null,
    createdAt: loanCreatedAt,
  };
}

function generateNotification(userId: string, loanId: string | null, createdAt: Date) {
  const notificationType = faker.helpers.arrayElement([
    'loan_created' as const,
    'loan_confirmed' as const,
    'loan_reminder' as const,
    'loan_returned' as const,
  ]);

  const messages: Record<string, { title: string; message: string }> = {
    loan_created: {
      title: 'New loan created',
      message: 'A new item has been loaned to you',
    },
    loan_confirmed: {
      title: 'Loan confirmed',
      message: 'The borrower has confirmed the loan',
    },
    loan_reminder: {
      title: 'Return reminder',
      message: 'Reminder to return the borrowed item',
    },
    loan_returned: {
      title: 'Loan returned',
      message: 'The borrowed item has been returned',
    },
  };

  const messageData = messages[notificationType] ?? {
    title: 'Notification',
    message: 'You have a new notification',
  };

  return {
    id: faker.string.uuid(),
    userId,
    loanId,
    type: notificationType,
    title: messageData.title,
    message: messageData.message,
    read: faker.datatype.boolean(0.6),
    sentAt: createdAt,
    createdAt,
  };
}

function generateOAuthAccount(userId: string) {
  const provider = faker.helpers.arrayElement(['google']);
  const providers: Record<string, { name: string; id: string }> = {
    google: {
      name: 'Google',
      id: faker.string.numeric(21),
    },
  };

  const providerData = providers[provider] ?? { name: 'Google', id: faker.string.numeric(21) };

  return {
    id: faker.string.uuid(),
    userId,
    provider,
    providerAccountId: providerData.id,
    accessToken: faker.string.alphanumeric(40),
    refreshToken: faker.string.alphanumeric(40),
    expiresAt: faker.date.future({ years: 1 }),
    createdAt: faker.date.past({ years: 1 }),
    updatedAt: faker.date.recent(),
  };
}

async function seedUsers(options: SeedOptions) {
  LOG.section(`Generating ${options.usersCount} users...`);

  const usersToInsert: InferInsertModel<typeof users>[] = [];

  for (let i = 0; i < options.usersCount; i++) {
    usersToInsert.push(generateUser());
  }

  await db.insert(users).values(usersToInsert);
  LOG.success(`Created ${options.usersCount} users`);

  // Add OAuth accounts for some users (50%)
  const allUsers = await db.select().from(users);
  const oauthUsersCount = Math.floor(options.usersCount * 0.5);

  const oauthToInsert: InferInsertModel<typeof oauthAccounts>[] = [];

  for (let i = 0; i < oauthUsersCount; i++) {
    const user = allUsers[i];
    if (user) {
      oauthToInsert.push(generateOAuthAccount(user.id));
    }
  }

  if (oauthToInsert.length > 0) {
    await db.insert(oauthAccounts).values(oauthToInsert);
    LOG.success(`Created ${oauthToInsert.length} OAuth accounts`);
  }

  // Add verification tokens for some users
  const verificationToInsert: InferInsertModel<typeof verificationTokens>[] = [];

  for (let i = 0; i < Math.floor(options.usersCount * 0.2); i++) {
    const user = allUsers[i];
    if (user) {
      const tokenType = faker.helpers.arrayElement(['email_verification', 'password_reset']);

      verificationToInsert.push({
        id: faker.string.uuid(),
        userId: user.id,
        token: faker.string.alphanumeric(32),
        type: tokenType,
        expiresAt: faker.date.future({ years: 0.1 }),
        usedAt: faker.helpers.maybe(() => faker.date.recent(), {
          probability: 0.5,
        }),
        createdAt: faker.date.past({ years: 0.1 }),
      });
    }
  }

  if (verificationToInsert.length > 0) {
    await db.insert(verificationTokens).values(verificationToInsert);
    LOG.info(`Created ${verificationToInsert.length} verification tokens`);
  }

  return allUsers;
}

async function seedItems(allUsers: { id: string }[], options: SeedOptions) {
  LOG.section(`Generating items (${options.itemsPerUser} per user)...`);

  const itemsToInsert: InferInsertModel<typeof items>[] = [];

  for (const user of allUsers) {
    const itemCount = faker.number.int({
      min: options.itemsPerUser - 1,
      max: options.itemsPerUser + 1,
    });

    for (let i = 0; i < itemCount; i++) {
      itemsToInsert.push(generateItem(user.id));
    }
  }

  // Insert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < itemsToInsert.length; i += batchSize) {
    const batch = itemsToInsert.slice(i, i + batchSize);
    await db.insert(items).values(batch);
  }

  LOG.success(`Created ${itemsToInsert.length} items`);
  return itemsToInsert;
}

async function seedLoans(
  allItems: InferInsertModel<typeof items>[],
  allUsers: { id: string }[],
  options: SeedOptions
) {
  LOG.section(`Generating loans (${options.loansPerItem} per item)...`);

  const loansToInsert: InferInsertModel<typeof loans>[] = [];
  const loanTokensToInsert: InferInsertModel<typeof loanTokens>[] = [];
  const notificationsToInsert: InferInsertModel<typeof notifications>[] = [];

  for (const item of allItems) {
    const loanCount = faker.number.int({
      min: Math.max(1, options.loansPerItem - 1),
      max: options.loansPerItem + 1,
    });

    for (let i = 0; i < loanCount; i++) {
      const itemId = item.id as string;
      const ownerId = item.ownerId as string;
      const loan = generateLoan(itemId, ownerId, allUsers);
      loansToInsert.push(loan);

      // Generate loan token
      loanTokensToInsert.push(generateLoanToken(loan.id, loan.createdAt));

      // Generate notifications for lender and borrower
      notificationsToInsert.push(generateNotification(loan.lenderId, loan.id, loan.createdAt));

      if (loan.borrowerId) {
        notificationsToInsert.push(generateNotification(loan.borrowerId, loan.id, loan.createdAt));
      }
    }
  }

  // Insert loans in batches
  const batchSize = 100;
  for (let i = 0; i < loansToInsert.length; i += batchSize) {
    const batch = loansToInsert.slice(i, i + batchSize);
    await db.insert(loans).values(batch);
  }

  LOG.success(`Created ${loansToInsert.length} loans`);

  // Insert loan tokens in batches
  for (let i = 0; i < loanTokensToInsert.length; i += batchSize) {
    const batch = loanTokensToInsert.slice(i, i + batchSize);
    await db.insert(loanTokens).values(batch);
  }

  LOG.success(`Created ${loanTokensToInsert.length} loan tokens`);

  // Insert notifications in batches
  for (let i = 0; i < notificationsToInsert.length; i += batchSize) {
    const batch = notificationsToInsert.slice(i, i + batchSize);
    await db.insert(notifications).values(batch);
  }

  LOG.success(`Created ${notificationsToInsert.length} notifications`);
}

async function printSummary() {
  LOG.section('Database Summary');

  const usersCount = await db.select({ count: count() }).from(users);

  const itemsCount = await db.select({ count: count() }).from(items);

  const loansCount = await db.select({ count: count() }).from(loans);

  const tokensCount = await db.select({ count: count() }).from(loanTokens);

  const notificationsCount = await db.select({ count: count() }).from(notifications);

  const userCountValue = usersCount[0]?.count || 0;
  const itemCountValue = itemsCount[0]?.count || 0;
  const loanCountValue = loansCount[0]?.count || 0;
  const tokenCountValue = tokensCount[0]?.count || 0;
  const notifCountValue = notificationsCount[0]?.count || 0;

  LOG.section(`📊 Seeding Complete!`);
  LOG.info(`Users: ${userCountValue}`);
  LOG.info(`Items: ${itemCountValue}`);
  LOG.info(`Loans: ${loanCountValue}`);
  LOG.info(`Loan Tokens: ${tokenCountValue}`);
  LOG.info(`Notifications: ${notifCountValue}`);
}

async function seed(options: Partial<SeedOptions> = {}) {
  const finalOptions: SeedOptions = { ...DEFAULT_OPTIONS, ...options };

  try {
    LOG.info('Starting database seed...');
    LOG.info(`Options: ${JSON.stringify(finalOptions)}`);

    await clearDatabase();

    const allUsers = await seedUsers(finalOptions);
    const allItems = await seedItems(allUsers, finalOptions);
    await seedLoans(allItems, allUsers, finalOptions);

    await printSummary();

    LOG.success('Seed completed successfully! ✨');
    process.exit(0);
  } catch (error) {
    LOG.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: Partial<SeedOptions> = {};

if (args.includes('--help')) {
  // biome-ignore lint: CLI help output
  console.log(`
Database Seeding Script

Usage:
  bun run db:seed [options]

Options:
  --users <number>        Number of users to generate (default: 500)
  --items <number>        Items per user (default: 3)
  --loans <number>        Loans per item (default: 2)
  --verbose               Show detailed output
  --help                  Show this help message

Examples:
  bun run db:seed                              # Default: 500 users, 3 items each, 2 loans each
  bun run db:seed --users 100 --items 5        # 100 users with 5 items each
  bun run db:seed --verbose                    # Show detailed output
  `);
  process.exit(0);
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  if (arg === '--users' && nextArg) {
    options.usersCount = parseInt(nextArg, 10);
  }
  if (arg === '--items' && nextArg) {
    options.itemsPerUser = parseInt(nextArg, 10);
  }
  if (arg === '--loans' && nextArg) {
    options.loansPerItem = parseInt(nextArg, 10);
  }
  if (arg === '--verbose') {
    options.verbose = true;
  }
}

// Run the seed
seed(options);
