/**
 * Seed script for creating test users with known credentials
 *
 * Usage:
 *   bun run db:seed-test-users                                # Create 10 test users
 *   bun run db:seed-test-users --count 3                      # Create 3 test users (1-10)
 *   bun run db:seed-test-users --items                        # Create users with items and loans
 *   bun run db:seed-test-users --count 5 --items              # 5 users with items/loans + R2 images
 *   bun run db:seed-test-users --items --real-loans           # Create users with confirmed loans and friendships
 *   bun run db:seed-test-users --count 2 --items --real-loans # 2 users with real loans
 *   bun run db:seed-test-users --help                         # Show options
 *
 * Generates a test-users.json file with login credentials for frontend testing
 */

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { faker } from '@faker-js/faker';
import type { InferInsertModel } from 'drizzle-orm';
import { inArray, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import sharp from 'sharp';

import { env } from '../config/env';
import { r2Client } from '../config/r2';
import { encrypt, hash } from '../services/crypto/index';
import { deleteUploadsFromR2 } from '../services/storage/index';
import { db } from './index';
import { friendships, items, loans, loanTokens, notifications, uploads, users } from './schema';

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

async function generateAndUploadImage(userId: string): Promise<{ key: string; sizeBytes: number }> {
  const color = faker.color.rgb({ format: 'hex' });
  const width = faker.number.int({ min: 300, max: 600 });
  const height = faker.number.int({ min: 300, max: 600 });

  const svgText = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${color}"/>
    <text x="50%" y="50%" font-size="24" fill="white" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">
      Test Item
    </text>
  </svg>`;

  const webpBuffer = await sharp(Buffer.from(svgText))
    .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const id = nanoid(8);
  const timestamp = Date.now();
  const key = `items/${userId}/${id}-${timestamp}.webp`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: webpBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000',
    })
  );

  return { key, sizeBytes: webpBuffer.length };
}

async function deleteExistingTestUsers() {
  logSection('Removing existing test users...');

  const testEmails = [
    'admin.test@example.com',
    'borrower@example.com',
    'lender@example.com',
    'moderator@example.com',
    'test1@example.com',
    'test2@example.com',
    'test3@example.com',
    'test4@example.com',
    'test5@example.com',
    'unverified@example.com',
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

  const existingItems = await db
    .select({ images: items.images })
    .from(items)
    .where(inArray(items.ownerId, userIds));

  const r2Keys: string[] = [];
  for (const item of existingItems) {
    try {
      const parsed = JSON.parse(item.images);
      if (Array.isArray(parsed)) {
        for (const key of parsed) {
          if (typeof key === 'string' && key.startsWith('items/')) {
            r2Keys.push(key);
          }
        }
      }
    } catch {}
  }

  if (r2Keys.length > 0) {
    logInfo(`Cleaning up ${r2Keys.length} R2 images...`);
    const result = await deleteUploadsFromR2(r2Keys);
    logInfo(`Deleted ${result.deleted.length} R2 objects (${result.failed.length} failed)`);
  }

  await db
    .delete(loans)
    .where(or(inArray(loans.lenderId, userIds), inArray(loans.borrowerId, userIds)));

  await db.delete(users).where(inArray(users.id, userIds));

  logInfo(`Cleaned up ${existingUsers.length} existing test users`);
}

async function createTestItemsAndLoans(
  testUsers: TestUser[],
  allUsers: (typeof users.$inferSelect)[],
  createRealLoans: boolean = false
) {
  logSection(
    createRealLoans
      ? 'Creating real loans with friendships (uploading images to R2)...'
      : 'Creating test items and loans (uploading images to R2)...'
  );

  const itemsToInsert: InferInsertModel<typeof items>[] = [];
  const uploadsToInsert: InferInsertModel<typeof uploads>[] = [];
  const loansToInsert: InferInsertModel<typeof loans>[] = [];
  const notificationsToInsert: InferInsertModel<typeof notifications>[] = [];
  const friendshipsToInsert: InferInsertModel<typeof friendships>[] = [];
  const loanTokensToInsert: InferInsertModel<typeof loanTokens>[] = [];

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
      const imageKeys: string[] = [];

      for (let img = 0; img < imageCount; img++) {
        const uploaded = await generateAndUploadImage(testUser.id);
        imageKeys.push(uploaded.key);

        uploadsToInsert.push({
          userId: testUser.id,
          url: uploaded.key,
          key: uploaded.key,
          filename: `seed-${itemType.toLowerCase()}-${img}.webp`,
          mimeType: 'image/webp',
          sizeBytes: uploaded.sizeBytes,
          createdAt: new Date(),
        });
      }

      logInfo(`Uploaded ${imageCount} image(s) for "${itemType} (Test)" [${testUser.email}]`);

      itemsToInsert.push({
        id: itemId,
        ownerId: testUser.id,
        name: `${itemType} (Test)`,
        description: faker.commerce.productDescription(),
        images: JSON.stringify(imageKeys),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      if (allUsers.length < 2) continue;

      const loanCount = createRealLoans ? 1 : faker.number.int({ min: 1, max: 2 });
      for (let j = 0; j < loanCount; j++) {
        const borrower = faker.helpers.arrayElement(allUsers.filter((u) => u.id !== testUser.id));
        const status = createRealLoans
          ? 'confirmed'
          : faker.helpers.arrayElement(['pending', 'confirmed', 'returned']);
        const loanId = crypto.randomUUID();
        const createdAt = faker.date.recent({ days: 30 });
        const confirmedAt =
          createRealLoans || status === 'confirmed'
            ? faker.date.between({ from: createdAt, to: new Date() })
            : null;

        loansToInsert.push({
          id: loanId,
          itemId,
          lenderId: testUser.id,
          borrowerId: borrower.id,
          status,
          expectedReturnDate: faker.date.future(),
          confirmedAt: confirmedAt ?? undefined,
          createdAt,
          updatedAt: new Date(),
        });

        if (createRealLoans) {
          const userAId = testUser.id < borrower.id ? testUser.id : borrower.id;
          const userBId = testUser.id < borrower.id ? borrower.id : testUser.id;

          const friendshipExists = friendshipsToInsert.some(
            (f) =>
              (f.userAId === userAId && f.userBId === userBId) ||
              (f.userAId === userBId && f.userBId === userAId)
          );

          if (!friendshipExists && confirmedAt) {
            friendshipsToInsert.push({
              id: crypto.randomUUID(),
              userAId,
              userBId,
              originLoanId: loanId,
              createdAt: confirmedAt,
              updatedAt: new Date(),
            });
          }

          if (confirmedAt) {
            const token = nanoid(32);
            loanTokensToInsert.push({
              id: crypto.randomUUID(),
              loanId,
              token,
              expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
              usedAt: confirmedAt,
              createdAt,
            });
          }
        }

        const notifType = createRealLoans
          ? 'loan_confirmed'
          : faker.helpers.arrayElement([
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

  for (let i = 0; i < uploadsToInsert.length; i += batchSize) {
    const batch = uploadsToInsert.slice(i, i + batchSize);
    await db.insert(uploads).values(batch);
  }

  logSuccess(`Registered ${uploadsToInsert.length} uploads`);

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

  if (friendshipsToInsert.length > 0) {
    for (let i = 0; i < friendshipsToInsert.length; i += batchSize) {
      const batch = friendshipsToInsert.slice(i, i + batchSize);
      await db.insert(friendships).values(batch);
    }
    logSuccess(`Created ${friendshipsToInsert.length} friendships`);
  }

  if (loanTokensToInsert.length > 0) {
    for (let i = 0; i < loanTokensToInsert.length; i += batchSize) {
      const batch = loanTokensToInsert.slice(i, i + batchSize);
      await db.insert(loanTokens).values(batch);
    }
    logSuccess(`Created ${loanTokensToInsert.length} loan tokens`);
  }

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

function parseCount(args: string[]): number {
  const countIdx = args.indexOf('--count');
  if (countIdx === -1) return 10;

  const raw = args[countIdx + 1];
  if (!raw) {
    logError('--count requires a number (1-10)');
    process.exit(1);
  }

  const count = Number.parseInt(raw, 10);
  if (Number.isNaN(count) || count < 1 || count > 10) {
    logError('--count must be between 1 and 10');
    process.exit(1);
  }

  return count;
}

async function seedTestUsers() {
  const args = process.argv.slice(2);
  const includeItems = args.includes('--items');
  const createRealLoans = args.includes('--real-loans');
  const count = parseCount(args);

  if (args.includes('--help')) {
    // biome-ignore lint: CLI help output
    console.log(`
Test Users Seed Script

Usage:
  bun run db:seed-test-users [options]

Options:
  --count N      Number of test users to create (1-10, default: 10)
  --items        Create items and loans for test users (uploads real images to R2)
  --real-loans   Create confirmed loans with friendships (requires --items)
  --help         Show this help message

Examples:
  bun run db:seed-test-users                              # Create 10 test users
  bun run db:seed-test-users --count 3                    # Create 3 test users
  bun run db:seed-test-users --items                      # Create users with items, loans and R2 images
  bun run db:seed-test-users --count 5 --items            # 5 users with items/loans + R2 images
  bun run db:seed-test-users --items --real-loans         # Create users with confirmed loans and friendships
  bun run db:seed-test-users --count 2 --items --real-loans  # 2 users with real loans
    `);
    process.exit(0);
  }

  if (createRealLoans && !includeItems) {
    logError('--real-loans requires --items to be set');
    process.exit(1);
  }

  if (createRealLoans && count < 2) {
    logError('--real-loans requires at least 2 users (--count 2 or more)');
    process.exit(1);
  }

  try {
    await deleteExistingTestUsers();

    logSection(`Creating ${count} test user(s) with known credentials...`);

    const testUserCredentials = [
      { email: 'admin.test@example.com', password: 'AdminTest@123456', name: 'Admin Test' },
      { email: 'test1@example.com', password: 'Test@123456', name: 'Test User 1' },
      { email: 'test2@example.com', password: 'Test@234567', name: 'Test User 2' },
      { email: 'test3@example.com', password: 'Test@345678', name: 'Test User 3' },
      { email: 'test4@example.com', password: 'Test@456789', name: 'Test User 4' },
      { email: 'test5@example.com', password: 'Test@567890', name: 'Test User 5' },
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

    const selectedCredentials = testUserCredentials.slice(0, count);
    const createdUsers: TestUser[] = [];

    for (const cred of selectedCredentials) {
      const testUser = await createTestUser(
        cred.email,
        cred.password,
        cred.name,
        (cred as { verified?: boolean }).verified !== false
      );
      createdUsers.push(testUser);
    }

    logSuccess(`Created ${createdUsers.length} test user(s)`);

    if (includeItems) {
      const allUsers = await db.select().from(users);
      await createTestItemsAndLoans(createdUsers, allUsers, createRealLoans);
    }

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
