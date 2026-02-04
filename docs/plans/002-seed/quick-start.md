# Database Seed - Quick Start Guide

## TL;DR

```bash
# Setup your database
bun run db:migrate

# Populate with test data (500 users, 1500+ items, 3000+ loans)
bun run db:seed

# Or with custom sizes
bun run db:seed --users 50 --items 3 --loans 2
```

## Common Commands

### Development Setup
```bash
# Fresh database with reasonable test data
bun run db:seed --users 100 --items 3 --loans 2
```

### Testing
```bash
# Minimal data for unit tests
bun run db:seed --users 5 --items 1 --loans 1
```

### UI Development
```bash
# Enough data to test UI with variety
bun run db:seed --users 200 --items 4 --loans 2
```

### Performance Testing
```bash
# Large dataset for load testing
bun run db:seed --users 1000 --items 5 --loans 3
```

### Help
```bash
bun run db:seed --help
```

## What Gets Created

With default settings (`bun run db:seed`):

- **500 users** with random names, emails, avatars
- **1,500+ items** with descriptions and images
- **3,000+ loans** with realistic statuses:
  - Pending (waiting for borrower confirmation)
  - Confirmed (active loans)
  - Returned (completed loans)
  - Cancelled (aborted loans)
- **6,000+ notifications** tracking loan events
- **3,000+ loan tokens** for sharing links
- **250 OAuth accounts** (Google) for half the users
- **100 verification tokens** for email verification flows

## What's Special About This Seed

✅ **LGPD Compliant** - User emails & names encrypted in database
✅ **Realistic Data** - Uses Faker.js for believable test data
✅ **Relationship Data** - Proper loans between different users
✅ **Varied Timelines** - Loans with dates spread over the past year
✅ **Mix of Statuses** - Not all loans are in one state
✅ **Fast** - 500 users generated in 3-5 minutes
✅ **Configurable** - Adjust volume with CLI parameters

## Step-by-Step Setup

### 1. First Time Setup
```bash
# Copy environment template
cp .env.example .env

# Update .env with your database URL
# DATABASE_URL=postgresql://...
# ENCRYPTION_KEY=<64-hex-chars>

# Run migrations
bun run db:migrate

# Seed test data
bun run db:seed
```

### 2. Development Workflow
```bash
# Start development server
bun run dev

# In another terminal: seed when needed
bun run db:seed

# When you want fresh data, just run seed again
# (it automatically clears old data first)
```

### 3. After Each Feature
```bash
# Test with fresh data
bun run db:seed --users 50
```

## Example Scenarios

### Scenario 1: Test Pending Loans
With ~15% pending in the generated data, you'll have ~450 pending loans to test with:

```bash
bun run db:seed
# Then query: SELECT * FROM loans WHERE status = 'pending'
```

### Scenario 2: Test Active Loans (30%)
Test your loan confirmation flow with confirmed loans:

```bash
bun run db:seed
# Then query: SELECT * FROM loans WHERE status = 'confirmed'
```

### Scenario 3: Test Completed Loans (50%)
Test loan return flow and history display:

```bash
bun run db:seed
# Then query: SELECT * FROM loans WHERE status = 'returned'
```

### Scenario 4: Multiple Users' Loans
Test dashboard with loans lent and borrowed:

```bash
bun run db:seed --users 50 --items 3
# Each user will have items lent AND items borrowed
```

## Viewing Generated Data

### Using Drizzle Studio (GUI)
```bash
bun run db:studio
# Opens web interface to browse all tables
```

### Using SQL Client (psql)
```bash
# Connect to your database
psql $DATABASE_URL

# View some stats
SELECT COUNT(*) as users FROM users;
SELECT COUNT(*) as items FROM items WHERE "isActive" = true;
SELECT COUNT(*) as loans FROM loans WHERE status = 'confirmed';
```

## Troubleshooting

### "Connection closed" Error
Your PostgreSQL database isn't running. Start it:
```bash
# macOS with Homebrew
brew services start postgresql

# Docker
docker run -d -e POSTGRES_PASSWORD=postgres postgres
```

### "ENCRYPTION_KEY not set" Error
Generate a key and add to `.env`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy the output and add to .env as ENCRYPTION_KEY=...
```

### "DATABASE_URL not found" Error
Make sure you have `.env` file with `DATABASE_URL` set. See step 1 above.

## Tips & Tricks

### Generate Same Data Each Run
```bash
export FAKER_SEED=12345
bun run db:seed
# Run again with same seed to get identical data
```

### Seed Just Users (No Items/Loans)
```bash
bun run db:seed --items 0 --loans 0
# Creates only users (useful for testing user endpoints)
```

### Clear Database Without Seeding
```bash
# Just run migrations which reset schema
bun run db:migrate --force
```

### Monitor Seeding Progress
Check database size as it fills:

```bash
# In another terminal while seeding
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
```

## Integration with Testing

In your test setup:

```typescript
import { describe, it, beforeAll } from 'bun:test';

// Could seed before tests if needed
describe('Loan API', () => {
  it('lists confirmed loans', async () => {
    // Uses data from seed
    const response = await fetch('/api/loans?status=confirmed');
    expect(response.status).toBe(200);
  });
});
```

## Remember

⚠️ **This script clears all data** - Don't run on production!

✨ **Use it to fill your dev database with realistic test data**

🚀 **It's designed to be fast even with large datasets**

📊 **Perfect for manual testing, UI development, and demos**

---

For detailed info, see [database-seeding.md](./database-seeding.md)
