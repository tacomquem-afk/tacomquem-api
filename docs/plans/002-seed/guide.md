# Database Seeding Guide

This guide explains how to use the database seeding script to generate test data for the TáComQuem application.

## Overview

The seed script (`src/db/seed.ts`) generates realistic test data using [Faker.js](https://fakerjs.dev/). It's designed for:

- **Local development** - Populate your database with realistic test data
- **Testing** - Generate consistent test scenarios with various loan statuses
- **Performance testing** - Create large datasets to test application performance
- **Feature demonstration** - Show how the app works with real-looking data

## Features

The seed script generates:

- **500+ users** - With encrypted names and emails (LGPD compliant)
- **1,500+ items** - With realistic names, descriptions, and image URLs
- **3,000+ loans** - With various statuses (pending, confirmed, returned, cancelled)
- **OAuth accounts** - For 50% of users with Google provider
- **Loan tokens** - For sharing loan confirmation links
- **Notifications** - Track loan events for users
- **Verification tokens** - For email verification and password reset flows

## Prerequisites

1. **Database Setup**: Ensure your PostgreSQL database is configured
   - Update `.env` with your `DATABASE_URL`
   - Run migrations: `bun run db:migrate`

2. **Environment Variables**: Required in `.env`
   ```
   DATABASE_URL=postgresql://...
   ENCRYPTION_KEY=<64-character hex string>
   ```

## Usage

### Basic Usage

Generate default test data (500 users, 3 items each, 2 loans per item):

```bash
bun run db:seed
```

### Custom Quantities

Generate fewer records (useful for quick testing):

```bash
# 10 users with 2 items each
bun run db:seed --users 10 --items 2

# 100 users with 5 items and 3 loans per item
bun run db:seed --users 100 --items 5 --loans 3

# Just 5 users for minimal testing
bun run db:seed --users 5
```

### Help

View all options:

```bash
bun run db:seed --help
```

## Important Notes

### Data Clearing

The seed script **clears all existing data** before seeding. This is intentional to ensure:

- Clean state for testing
- No duplicate data from previous runs
- Predictable test scenarios

**Warning**: Do not run the seed script on production databases!

### Generated Data Patterns

#### Users

- Email addresses: Randomly generated but realistic
- Names: Generated from Faker's person data
- Avatar URLs: Using Faker's avatar generation
- Email Verification: 70% of users marked as verified
- OAuth Accounts: 50% of users have Google OAuth configured

#### Items

- Names: Combination of item types (electronics, sports equipment, tools, etc.) + adjectives
- Descriptions: Generated product descriptions
- Images: 60% of items have 1-3 image URLs
- Active Status: 85% of items are marked as active

#### Loans

- Status Distribution:
  - 50% returned
  - 30% confirmed
  - 15% pending
  - 5% cancelled
- Dates: Realistic timelines with dates spread across the past year
- Lender/Borrower: Random selection from available users (borrower never equals lender)

#### Notifications

- Types: loan_created, loan_confirmed, loan_reminder, loan_returned
- Distribution: 2 notifications per loan (one for lender, one for borrower)
- Read Status: 60% marked as read

### Encryption

User data (names and emails) are automatically encrypted using AES-256-GCM:

- Uses the `ENCRYPTION_KEY` from your environment
- Follows LGPD compliance requirements
- Email hash stored for searchability without decryption

## Performance Considerations

Default seeding parameters generate:

- ~500 users
- ~1,500-1,600 items (3 per user)
- ~3,000-3,200 loans (2 per item)
- ~6,000-6,400 notifications (2 per loan)
- ~3,000-3,200 loan tokens

**Estimated execution time:**
- Small dataset (10 users): < 5 seconds
- Medium dataset (100 users): ~30 seconds
- Large dataset (500 users): 2-3 minutes
- Full dataset (500+ users): 3-5 minutes

Adjust `--users`, `--items`, and `--loans` parameters for faster seeding during development.

## Troubleshooting

### Connection Errors

If you get database connection errors:

1. Verify `DATABASE_URL` is set in `.env`
2. Check PostgreSQL is running
3. Ensure the database exists and migrations are applied:
   ```bash
   bun run db:migrate
   ```

### Encryption Key Errors

If you get `ENCRYPTION_KEY not set`:

1. Generate a 64-character hex key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Add to `.env`:
   ```
   ENCRYPTION_KEY=<your-64-char-hex-key>
   ```

### Type Errors

If TypeScript complains:

1. Run type checking:
   ```bash
   bun run typecheck
   ```
2. Ensure `src/db/schema.ts` exports all required tables

## Resetting Data

To reset the database and reseed:

```bash
# Clear and reseed with default parameters
bun run db:seed

# Clear and reseed with custom parameters
bun run db:seed --users 50 --items 2
```

## Integration with Testing

You can use the seed script in test suites:

```typescript
// In your test setup
import { seed } from '../src/db/seed';

beforeAll(async () => {
  // Seed with minimal data for tests
  await seed({ usersCount: 5, itemsPerUser: 2, loansPerItem: 1 });
});
```

## Advanced Usage

### Batch Insertion Optimization

The script uses batch insertion (100 records per batch) for better performance:

```typescript
const batchSize = 100;
for (let i = 0; i < records.length; i += batchSize) {
  const batch = records.slice(i, i + batchSize);
  await db.insert(table).values(batch);
}
```

### Deterministic Data

To generate the same data each time (for debugging):

```bash
export FAKER_SEED=12345  # Set before running
bun run db:seed
```

## Example Workflows

### Development Workflow

```bash
# Initial setup
bun run db:migrate
bun run db:seed --users 50

# Work on features...

# Reset and reseed when needed
bun run db:seed --users 50
```

### Testing Workflow

```bash
# Seed minimal data for fast test runs
bun run db:seed --users 5 --items 1 --loans 1

# Run tests
bun test

# Reset after tests
bun run db:seed --users 5 --items 1 --loans 1
```

### Performance Testing

```bash
# Generate large dataset
bun run db:seed --users 1000 --items 5 --loans 3

# Load test the API
# (e.g., with k6, Artillery, or similar tools)
```

## Best Practices

1. **Use small datasets during development** - Start with 10-50 users
2. **Commit your environment variables** - Keep `ENCRYPTION_KEY` in `.env` (in `.gitignore`)
3. **Never run on production** - This script clears the entire database
4. **Reset between test runs** - Ensures clean state
5. **Check generated counts** - The script prints a summary of created records

## Implementation Details

For developers interested in the seed implementation:

- **Main file**: `src/db/seed.ts`
- **Uses**: Faker.js, Drizzle ORM, Node.js crypto
- **Key functions**:
  - `generateUser()` - Creates realistic user data
  - `generateItem()` - Creates item records
  - `generateLoan()` - Creates loan relationships
  - `generateOAuthAccount()` - Creates OAuth provider connections
  - `seedUsers()`, `seedItems()`, `seedLoans()` - Batch insertion functions

The script follows industry best practices for database seeding:

- Batch insertion for performance
- Proper data relationships (foreign keys)
- Realistic data generation (Faker.js)
- Encryption of sensitive data (LGPD compliance)
- Clear progress logging
