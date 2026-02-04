# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TáComQuem** - A web application for tracking personal item loans between friends. Eliminates social discomfort of asking for borrowed items back through automation.

**Tech Stack:**
- **Language:** TypeScript (targeting Bun runtime for performance)
- **Framework:** Fastify (high-performance Node.js web framework)
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod schemas (runtime + compile-time)
- **Authentication:** JWT tokens with OAuth2 (Google, Apple, Facebook)
- **Deployment:** Oracle Cloud Always Free (ARM Ampere)

## Project Status

**Phase:** Documentation and planning complete. Implementation of MVP backend not yet started.

All design decisions and technical specifications are documented. Refer to [docs/prd.md](docs/prd.md) for complete technical specifications.

## Key Architecture Decisions

### MVP Scope (from [docs/plans/001-mvp/design.md](docs/plans/001-mvp/design.md))

**Included in MVP:**
- Google OAuth + Email/password authentication with verification
- Encrypted user data (name/email only) for LGPD compliance
- Item CRUD with multiple image support (stored as JSON array)
- Loan creation with confirmation links
- Manual email reminders
- Dashboard with loan cards

**Excluded from MVP (future phases):**
- Apple/Facebook OAuth
- Device fingerprinting and identity consolidation
- Temporary users (confirmation without login)
- Automatic/smart reminders
- Push notifications (FCM/APN)
- Redis cache/sessions

### Database Schema

Key tables and relationships (see [docs/prd.md](docs/prd.md#3-database-schema) for full schema):

```
users
  ├── oauth_accounts (1:N)
  ├── items (1:N)
  │     └── loans (1:N)
  │           ├── loan_tokens (1:N)
  │           └── notifications (1:N)
  └── notifications (1:N)
```

**LGPD Compliance:** User data (email, name) is encrypted in the database. A hash of the email is stored for searches.

### Authentication Flow

1. User receives loan link (JWT token, 7-day expiry)
2. Link shows item details, lender name BEFORE login
3. User must login to confirm the loan
4. JWT access tokens expire in 7 days, refresh tokens in 30 days

### Project Structure

**Pattern:** Each service lives in its own folder with colocated tests.

```
src/
├── config/          # env, database
├── db/
│   └── schema.ts    # Drizzle schema
├── routes/
│   ├── auth/
│   ├── items/
│   ├── loans/
│   ├── links/
│   └── dashboard/
├── services/
│   ├── auth/
│   │   ├── index.ts
│   │   └── __tests__/
│   │       └── auth.test.ts
│   ├── crypto/
│   │   ├── index.ts
│   │   └── __tests__/
│   │       └── crypto.test.ts
│   ├── email/
│   │   ├── index.ts
│   │   └── __tests__/
│   │       └── email.test.ts
│   ├── items/
│   │   ├── index.ts
│   │   └── __tests__/
│   │       └── items.test.ts
│   └── password/
│       ├── index.ts
│       └── __tests__/
│           └── password.test.ts
├── schemas/         # Zod validations
└── index.ts
```

## Development Commands

```bash
# Using Bun runtime
bun run dev              # Development server with hot reload
bun run build            # Build TypeScript
bun run start            # Production server

# Quality & Testing
bun run qa               # TypeScript check + Biome linting (REQUIRED before commit)
bun run qa:fix           # Auto-fix lint/format issues, then typecheck
bun test                 # Run all tests
bun test [path]          # Run specific test file
bun test:coverage        # Run tests with coverage

# Database migrations
bun run db:generate      # Generate migration after schema changes
bun run db:migrate       # Apply migrations
bun run db:studio        # Open Drizzle Studio GUI
```

## Key Documentation

- **[docs/prd.md](docs/prd.md)** - Complete technical PRD with full API specifications, database schema, OAuth flow implementation, example code
- **[docs/plans/001-mvp/design.md](docs/plans/001-mvp/design.md)** - MVP scope decisions, user flows, simplified schema
- **[docs/plans/README.md](docs/plans/README.md)** - Planning structure and conventions

## API Endpoints Structure

```
POST   /api/auth/register          # Email/password registration
POST   /api/auth/login             # Email/password login
POST   /api/auth/verify-email      # Email verification
GET    /api/auth/google            # Google OAuth start
GET    /api/auth/google/callback   # Google OAuth callback
POST   /api/auth/refresh           # Refresh access token
GET    /api/auth/me                # Current user

POST   /api/items                  # Create item
GET    /api/items                  # List my items
GET    /api/items/:id              # Item details
PATCH  /api/items/:id              # Update item
DELETE /api/items/:id              # Soft delete item

POST   /api/loans                  # Create loan + generate link
GET    /api/loans                  # List loans (filters: lent/borrowed/status)
GET    /api/loans/:id              # Loan details
PATCH  /api/loans/:id/return       # Mark as returned
PATCH  /api/loans/:id/cancel       # Cancel loan
POST   /api/loans/:id/remind       # Send manual reminder (email)

GET    /api/links/:token           # View loan details (public)
POST   /api/links/:token/confirm   # Confirm loan (requires auth)

GET    /api/dashboard              # Dashboard data
GET    /api/friends                # Friends list

GET    /api/health                 # Health check
GET    /api/health/db              # Database health check
```

## Security Considerations

- **Rate Limiting:** 10 req/s general, stricter on sensitive endpoints (login, register)
- **Password Hashing:** bcrypt with cost factor 12
- **Token Expiration:** Access tokens 7 days, refresh tokens 30 days, verification/reset tokens 24 hours
- **LGPD:** All user PII encrypted at rest using AES-256

## Available Skills

When working on this project, these skills may be useful:
- **fastify** - Production Fastify patterns (schema validation, plugins, typed routes)
- **brainstorming** - Use before any creative work or new features
- **writing-plans** - Use when implementing multi-step tasks from specs

## Environment Variables (Required)

When setting up the project, reference `.env.example` for required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` / `JWT_REFRESH_SECRET` - Minimum 32 characters
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth credentials
- `APP_URL` - Base URL for link generation

## Coding Standards

### Code Comments

**DO NOT add unnecessary comments.** The code should be self-documenting.

- **Avoid** obvious comments like `// Users`, `// Items`, `// Plugins`, `// Health checks`
- **Avoid** inline comments that repeat what the code already says (e.g., `// 'email_verification' | 'password_reset'` next to a varchar field)
- **Use** blank lines for visual grouping instead of comment headers
- **Only** add comments when explaining WHY something is done (not WHAT), or for complex/non-obvious logic

Examples:
```typescript
// ❌ BAD - Obvious comment
// Users
export const users = pgTable('users', { ... });

// ❌ BAD - Redundant inline comment
type: varchar('type', { length: 50 }).notNull(), // 'email_verification' | 'password_reset'

// ✅ GOOD - Self-documenting
export const users = pgTable('users', { ... });

export const verificationTokens = pgTable('verification_tokens', {
  type: varchar('type', { length: 50 }).notNull(),
  ...
});

// ✅ ACCEPTABLE - Explains WHY (not obvious)
// Using AES-256-GCM for LGPD compliance - each encryption uses a unique IV
function encrypt(text: string): string { ... }
```

## Creating New Services

When creating a new service, always follow this pattern:

1. **Create the service folder:**
   ```
   src/services/myservice/
   ├── index.ts                           # Export only functions and types
   └── __tests__/
       └── myservice.test.ts              # Unit tests
   ```

2. **Implement the service** (`src/services/myservice/index.ts`):
   - Export typed interfaces for domain objects
   - Write pure or dependency-injected functions
   - Avoid circular imports (import from db, schemas, other services)

3. **Write comprehensive tests** (`src/services/myservice/__tests__/myservice.test.ts`):
   - Mock external dependencies (db, email service, etc.)
   - Use Bun's native `test` runner
   - Test both happy paths and error cases

4. **Run QA before committing:**
   ```bash
   bun test src/services/myservice/__tests__/myservice.test.ts
   bun run qa   # TypeScript + Biome checks
   bun run qa:fix   # Auto-fix issues if needed
   ```

Example of a well-structured service: [src/services/items/](src/services/items/) with [tests](src/services/items/__tests__/items.test.ts).
