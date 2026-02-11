/**
 * Seed script for creating test users with known credentials
 *
 * Usage:
 *   bun run db:seed-test-users          # Create 10 test users
 *   bun run db:seed-test-users --items  # Create users with items and loans
 *   bun run db:seed-test-users --help   # Show options
 *
 * Generates a test-users.json file with login credentials for frontend testing
 */

import { faker } from '@faker-js/faker';
import type { InferInsertModel } from 'drizzle-orm';
import { inArray, or } from 'drizzle-orm';

import { encrypt, hash } from '../services/crypto/index';
import { db } from './index';
import { items, loans, notifications, users } from './schema';

interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
  emailVerified: boolean;
}

function logInfo(msg: string) {
  // biome-ignore lint: CLI output
  console.log(`✓ ${msg}`);
}

function logSuccess(msg: string) {
  // biome-ignore lint: CLI output
  console.log(`✅ ${msg}`);
}

function logError(msg: string) {
  process.stderr.write(`❌ ${msg}\n`);
}

function logSection(msg: string) {
  // biome-ignore lint: CLI output
  console.log(`\n📋 ${msg}`);
}

interface PasswordHash {
  hash: string;
  salt: string;
}

async function hashPassword(password: string): Promise<PasswordHash> {
  const passwordService = await import('../services/password/index');
  const hash = await passwordService.hashPassword(password);
  return { hash, salt: '' };
}

async function createTestUser(
  email: string,
  password: string,
  name: string,
  emailVerified: boolean = true
): Promise<TestUser> {
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  const userToInsert: InferInsertModel<typeof users> = {
    id: userId,
    emailEncrypted: encrypt(email),
    nameEncrypted: encrypt(name),
    emailHash: hash(email),
    passwordHash: passwordHash.hash,
    avatarUrl: faker.image.avatar(),
    emailVerified,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(users).values(userToInsert);
  logInfo(`Created test user: ${email}`);

  return {
    id: userId,
    email,
    password,
    name,
    emailVerified,
  };
}

async function deleteExistingTestUsers() {
  logSection('Removing existing test users...');

  const testEmails = [
    'test1@example.com',
    'test2@example.com',
    'test3@example.com',
    'test4@example.com',
    'test5@example.com',
    'admin.test@example.com',
    'unverified@example.com',
    'lender@example.com',
    'borrower@example.com',
    'moderator@example.com',
  ];

  const emailHashes = testEmails.map((email) => hash(email));

  const existingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.emailHash, emailHashes));

  if (existingUsers.length === 0) {
    logInfo('No existing test users found');
    return;
  }

  const userIds = existingUsers.map((u) => u.id);

  await db
    .delete(loans)
    .where(or(inArray(loans.lenderId, userIds), inArray(loans.borrowerId, userIds)));

  await db.delete(users).where(inArray(users.id, userIds));

  logInfo(`Cleaned up ${existingUsers.length} existing test users`);
}

async function createTestItemsAndLoans(
  testUsers: TestUser[],
  allUsers: (typeof users.$inferSelect)[]
) {
  logSection('Creating test items and loans...');

  const itemsToInsert: InferInsertModel<typeof items>[] = [];
  const loansToInsert: InferInsertModel<typeof loans>[] = [];
  const notificationsToInsert: InferInsertModel<typeof notifications>[] = [];

  const notificationMessages: Record<string, { title: string; message: string }> = {
    loan_created: { title: 'New loan created', message: 'A new item has been loaned' },
    loan_confirmed: { title: 'Loan confirmed', message: 'The borrower has confirmed the loan' },
    loan_reminder: { title: 'Return reminder', message: 'Reminder to return the borrowed item' },
    loan_returned: { title: 'Item returned', message: 'The borrowed item has been returned' },
  };

  for (const testUser of testUsers) {
    const itemCount = faker.number.int({ min: 2, max: 3 });

    for (let i = 0; i < itemCount; i++) {
      const itemId = crypto.randomUUID();
      const itemType = faker.helpers.arrayElement([
        'Laptop',
        'Camera',
        'Guitar',
        'Bicycle',
        'Book',
        'Drill',
      ]);

      const imageCount = faker.number.int({ min: 1, max: 3 });
      const fakeImages = Array.from({ length: imageCount }, () =>
        faker.image.url({ width: 400, height: 400 })
      );

      itemsToInsert.push({
        id: itemId,
        ownerId: testUser.id,
        name: `${itemType} (Test)`,
        description: faker.commerce.productDescription(),
        images: JSON.stringify(fakeImages),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const loanCount = faker.number.int({ min: 1, max: 2 });
      for (let j = 0; j < loanCount; j++) {
        const borrower = faker.helpers.arrayElement(allUsers.filter((u) => u.id !== testUser.id));
        const status = faker.helpers.arrayElement(['pending', 'confirmed', 'returned']);
        const loanId = crypto.randomUUID();
        const createdAt = faker.date.recent({ days: 30 });

        loansToInsert.push({
          id: loanId,
          itemId,
          lenderId: testUser.id,
          borrowerId: borrower.id,
          status,
          expectedReturnDate: faker.date.future(),
          createdAt,
          updatedAt: new Date(),
        });

        const notifType = faker.helpers.arrayElement([
          'loan_created',
          'loan_confirmed',
          'loan_reminder',
          'loan_returned',
        ] as const);
        const msg = notificationMessages[notifType] ?? {
          title: 'Notification',
          message: 'You have a new notification',
        };

        notificationsToInsert.push({
          id: crypto.randomUUID(),
          userId: testUser.id,
          loanId,
          type: notifType,
          title: msg.title,
          message: msg.message,
          read: faker.datatype.boolean(0.4),
          sentAt: createdAt,
          createdAt,
        });

        notificationsToInsert.push({
          id: crypto.randomUUID(),
          userId: borrower.id,
          loanId,
          type: notifType,
          title: msg.title,
          message: msg.message,
          read: faker.datatype.boolean(0.4),
          sentAt: createdAt,
          createdAt,
        });
      }
    }
  }

  const batchSize = 50;
  for (let i = 0; i < itemsToInsert.length; i += batchSize) {
    const batch = itemsToInsert.slice(i, i + batchSize);
    await db.insert(items).values(batch);
  }

  logSuccess(`Created ${itemsToInsert.length} items`);

  for (let i = 0; i < loansToInsert.length; i += batchSize) {
    const batch = loansToInsert.slice(i, i + batchSize);
    await db.insert(loans).values(batch);
  }

  logSuccess(`Created ${loansToInsert.length} loans`);

  for (let i = 0; i < notificationsToInsert.length; i += batchSize) {
    const batch = notificationsToInsert.slice(i, i + batchSize);
    await db.insert(notifications).values(batch);
  }

  logSuccess(`Created ${notificationsToInsert.length} notifications`);
}

async function saveCredentialsFile(testUsers: TestUser[]) {
  const credentialsData = {
    created_at: new Date().toISOString(),
    description: 'Test user credentials for frontend testing',
    api_base_url: 'http://localhost:5000/api',
    users: testUsers.map((user) => ({
      email: user.email,
      password: user.password,
      name: user.name,
      id: user.id,
      email_verified: user.emailVerified,
    })),
  };

  const filePath = 'test-users.json';
  await Bun.write(filePath, JSON.stringify(credentialsData, null, 2));

  logSuccess(`Credentials saved to ${filePath}`);
  logInfo('Share this file with your frontend team for testing!');
}

async function seedTestUsers() {
  const args = process.argv.slice(2);
  const includeItems = args.includes('--items');

  if (args.includes('--help')) {
    // biome-ignore lint: CLI help output
    console.log(`
Test Users Seed Script

Usage:
  bun run db:seed-test-users [options]

Options:
  --items    Create items and loans for test users
  --help     Show this help message

Examples:
  bun run db:seed-test-users              # Create 10 test users
  bun run db:seed-test-users --items      # Create users with items and loans
    `);
    process.exit(0);
  }

  try {
    await deleteExistingTestUsers();

    logSection('Creating 10 test users with known credentials...');

    // Test users with predictable credentials
    const testUserCredentials = [
      { email: 'test1@example.com', password: 'Test@123456', name: 'Test User 1' },
      { email: 'test2@example.com', password: 'Test@234567', name: 'Test User 2' },
      { email: 'test3@example.com', password: 'Test@345678', name: 'Test User 3' },
      { email: 'test4@example.com', password: 'Test@456789', name: 'Test User 4' },
      { email: 'test5@example.com', password: 'Test@567890', name: 'Test User 5' },
      { email: 'admin.test@example.com', password: 'AdminTest@123456', name: 'Admin Test' },
      {
        email: 'unverified@example.com',
        password: 'Unverified@123456',
        name: 'Unverified User',
        verified: false,
      },
      { email: 'lender@example.com', password: 'Lender@123456', name: 'Lender Test' },
      { email: 'borrower@example.com', password: 'Borrower@123456', name: 'Borrower Test' },
      { email: 'moderator@example.com', password: 'Moderator@123456', name: 'Moderator Test' },
    ];

    const createdUsers: TestUser[] = [];

    for (const cred of testUserCredentials) {
      const testUser = await createTestUser(
        cred.email,
        cred.password,
        cred.name,
        (cred as { verified?: boolean }).verified !== false
      );
      createdUsers.push(testUser);
    }

    logSuccess(`Created ${createdUsers.length} test users`);

    // If --items flag is set, create items and loans
    if (includeItems) {
      const allUsers = await db.select().from(users);
      await createTestItemsAndLoans(createdUsers, allUsers);
    }

    // Save credentials to file
    await saveCredentialsFile(createdUsers);

    logSection('✨ Test users creation complete!');
    logInfo('Test users have been created in the database');
    logInfo('Check test-users.json for login credentials');

    process.exit(0);
  } catch (error) {
    logError(
      `Failed to create test users: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error(error);
    process.exit(1);
  }
}

seedTestUsers();
