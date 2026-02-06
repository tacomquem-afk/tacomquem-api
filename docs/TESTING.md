# Testing Guide

## Frontend Testing with Test Users

### Creating Test Users

We provide a dedicated script to generate test users with known credentials for frontend development and testing.

#### Generate Test Users

```bash
# Create 10 test users (without items/loans)
bun run db:seed-test-users

# Create test users WITH items and loans (realistic data)
bun run db:seed-test-users --items
```

#### Available Test Users

After running the script, a `test-users.json` file is generated with all credentials. Share this with your frontend team:

```json
{
  "api_base_url": "http://localhost:5000/api",
  "users": [
    {
      "email": "test1@example.com",
      "password": "Test@123456",
      "name": "Test User 1",
      "email_verified": true
    },
    // ... more users
  ]
}
```

### Test User Scenarios

| Email | Password | Scenario | Use Case |
|-------|----------|----------|----------|
| `test1@example.com` | `Test@123456` | Verified user | Basic login & dashboard |
| `test2@example.com` | `Test@234567` | Verified user | Item creation |
| `test3@example.com` | `Test@345678` | Verified user | Loan creation |
| `test4@example.com` | `Test@456789` | Verified user | Lender perspective |
| `test5@example.com` | `Test@567890` | Verified user | Borrower perspective |
| `admin.test@example.com` | `AdminTest@123456` | Admin user | Admin dashboard (after role assignment) |
| `unverified@example.com` | `Unverified@123456` | Unverified user | Email verification flow |
| `lender@example.com` | `Lender@123456` | Verified user | Multiple items & loans |
| `borrower@example.com` | `Borrower@123456` | Verified user | Borrowed items |
| `moderator@example.com` | `Moderator@123456` | Moderator user | Moderation panel (after role assignment) |

### Frontend Integration

1. **Development:**
   ```javascript
   // Load credentials in your frontend app
   const testUsers = await fetch('http://localhost:5000/test-users.json');
   const { users } = await testUsers.json();

   // Use for testing
   const loginData = {
     email: users[0].email,      // "test1@example.com"
     password: users[0].password // "Test@123456"
   };
   ```

2. **Testing:**
   - Store credentials in environment variables
   - Use in E2E tests (Cypress, Playwright, etc.)
   - Create test fixtures with known data

### Backend Data Seeding

#### Full Database Seed (Large Dataset)

For realistic load testing and development:

```bash
# Create 500 users with 3 items each and 2 loans per item
bun run db:seed

# Custom scale
bun run db:seed --users 100 --items 5 --loans 3
```

#### Combining Both Approaches

```bash
# 1. Create full seed dataset
bun run db:seed --users 100

# 2. Create your specific test users
bun run db:seed-test-users --items

# Now you have both: realistic random data + known test accounts
```

### Database Management

```bash
# View database structure
bun run db:studio

# Create migration after schema changes
bun run db:generate

# Apply pending migrations
bun run db:migrate
```

## Manual Testing Checklist

### Authentication
- [ ] Register with email/password
- [ ] Login with registered credentials
- [ ] Logout
- [ ] Password reset flow
- [ ] Email verification
- [ ] Refresh token mechanism

### Items Management
- [ ] Create item with images
- [ ] View all items
- [ ] Edit item details
- [ ] Delete item (soft delete)
- [ ] Search items

### Loans
- [ ] Create loan
- [ ] Send loan link (copy to clipboard)
- [ ] Confirm loan via public link
- [ ] Mark as returned
- [ ] Cancel loan
- [ ] Send reminder

### Dashboard
- [ ] View dashboard statistics
- [ ] Filter loans (lent/borrowed/status)
- [ ] Receive notifications

## Performance Testing

Use the scaled seed script to create a larger dataset:

```bash
# Create 1000 users with realistic data
bun run db:seed --users 1000 --items 4 --loans 2
```

This generates:
- 1000 users
- ~4000 items
- ~8000 loans
- Related tokens and notifications

Perfect for testing:
- Pagination performance
- Search optimization
- Dashboard load times
- Notification delivery
