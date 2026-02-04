# Copilot Instructions for TáComQuem

> **Project:** TáComQuem – Personal item loan tracking between friends
> **Stack:** TypeScript + Fastify + Drizzle ORM + PostgreSQL + Zod
> **Status:** MVP implementation phase

---

## Architecture Overview

### Core Pattern: Service Layer with Encrypted Data

The app uses **three distinct services**:

1. **HTTP Layer** (`src/app.ts`, `src/routes/`) – Fastify routes with Zod validation
2. **Business Logic** (to be created: `src/services/`) – Pure business operations
3. **Data Access** – Drizzle ORM with pre-defined relations

**Critical Detail:** User PII (email, name) is **encrypted at rest** for LGPD compliance:

- Stored in columns: `emailEncrypted`, `nameEncrypted` (encrypted with AES-256)
- Hash stored separately: `emailHash` (for lookups without decrypting)
- Never decrypt in routes; keep encrypted or use hashed version for queries

See [src/db/schema.ts](../src/db/schema.ts#L9-L18) for current implementation.

### Loan Link System

Loans are confirmed via **JWT tokens shared without requiring signup**:

1. **Generate link** – `POST /api/loans` creates token, returns shareable URL
2. **Borrower opens link** – `GET /api/links/:token` returns loan details (no auth required)
3. **Confirm without login** – `POST /api/links/:token/confirm` creates temporary user by device fingerprint
4. **Device consolidation** – Same device later logs in via OAuth → account merged with temp user

**Token flow:** All loan tokens stored in `loanTokens` table with expiry (typically 7 days). Once used, marked with `usedAt` timestamp.

---

## ⚠️ Code Quality Requirement

**ALWAYS run the QA scripts before creating or editing code:**

```bash
bun run qa       # Run TypeScript check + Biome linting
bun run qa:fix   # Auto-fix lint/formatting issues, then typecheck
```

This is **mandatory** for any code changes. Never commit without passing QA checks locally.

---

## Tech Stack Specifics

### Fastify Patterns

**Plugin registration** (see [src/app.ts](../src/app.ts#L10-L22)):

```typescript
await app.register(pluginName, { prefix: "/api/route" });
```

**JWT authentication** – Implemented in [src/plugins/jwt.ts](../src/plugins/jwt.ts):

- Decorator: `preHandler: [app.authenticate]`
- Adds `request.user.userId` to authenticated routes
- Tokens: access (7d) + refresh (30d)

**Swagger/OpenAPI** – Auto-documented at `GET /docs`; add schema objects to route definitions.

### Zod Integration

All request/response validation uses Zod (NOT middleware):

```typescript
const schema = z.object({ name: z.string().min(3) });
const validated = schema.parse(req.body); // Throws ZodError if invalid
```

See [src/schemas/items.ts](../src/schemas/items.ts) and [src/schemas/auth.ts](../src/schemas/auth.ts) for examples.

### Database: Drizzle Relations

Relations pre-defined in schema (see [src/db/schema.ts](../src/db/schema.ts#L120-L160)):

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  lentLoans: many(loans, { relationName: "lender" }),
  borrowedLoans: many(loans, { relationName: "borrower" }),
}));
```

Query pattern:

```typescript
const loanWithRelations = await db.query.loans.findFirst({
  where: eq(loans.id, loanId),
  with: { item: true, lender: true, borrower: true },
});
```

---

## Code Conventions

### Self-Documenting Code

**NO unnecessary comments.** Structure code clearly instead:

✅ **Good:**

```typescript
export const verificationTokens = pgTable('verification_tokens', { ... });
export const loanTokens = pgTable('loan_tokens', { ... });
```

❌ **Bad:**

```typescript
// Tokens for verification
export const verificationTokens = pgTable('verification_tokens', { ... });
// Tokens for loans
export const loanTokens = pgTable('loan_tokens', { ... });
```

**Only comment WHY** (not WHAT):

```typescript
// AES-256-GCM with unique IV per encryption for LGPD compliance
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
```

### Directory Structure

```
src/
├── config/env.ts              # Environment validation (Zod)
├── db/
│   ├── index.ts              # Drizzle client setup
│   ├── schema.ts             # All tables + relations
│   └── migrate.ts            # Migration runner
├── plugins/
│   └── jwt.ts                # Authentication decorator
├── routes/
│   ├── auth/
│   │   ├── index.ts         # Local auth (email/password)
│   │   └── google.ts        # OAuth2 with Google
│   ├── items/index.ts       # CRUD operations
│   └── loans/index.ts       # Loan management (to create)
├── schemas/
│   ├── auth.ts              # Auth validations
│   └── items.ts             # Item validations
├── services/                # Business logic (to create)
│   ├── crypto/index.ts      # Encryption/decryption
│   ├── email/index.ts       # Email sending
│   └── items.ts             # Item business logic
├── app.ts                    # Express setup + plugin registration
└── index.ts                  # Entry point
```

---

## Critical Development Workflows

### Setup & Database Changes

```bash
# Initial setup
bun install

# When schema.ts changes:
bun run db:generate          # Generate migration file
bun run db:migrate           # Apply migrations

# View/manage database:
bun run db:studio            # Drizzle Studio (GUI)
```

### Development & Testing

```bash
bun run dev                  # Watch mode + hot reload
bun run test                 # Run all tests (see src/**/*.test.ts)
bun run typecheck            # TypeScript check (required before commit)
bun run check                # Biome lint + Prettier check

# Fix issues
bun run check:fix            # Auto-fix Biome + Prettier
bun run qa:fix               # Full: typecheck + check:fix
```

### Database Inspection

All tables have auto-generated migrations in `drizzle/migrations/`. Review SQL before applying:

```sql
-- Example: drizzle/0000_amusing_praxagora.sql
CREATE TABLE users (id uuid PRIMARY KEY, ...);
```

---

## Current Implementation Status

### ✅ Implemented

- **Authentication:** JWT plugin, Google OAuth partial
- **Database:** Full schema with encryption columns, relations, migrations
- **Items Routes:** Basic CRUD endpoints (see [src/routes/items/index.ts](../src/routes/items/index.ts))
- **Health Checks:** `/api/health` and `/api/health/db` operational
- **Swagger Docs:** Auto-generated at `/docs`

### 🔄 In Progress

- **Auth:** Google OAuth callback and token generation
- **Loan Management:** Create, confirm, and link-based endpoints

### ❌ Not Started

- **Email Service:** Send verification/reminder emails
- **Dashboard:** Aggregated loan statistics endpoint
- **Notifications:** Full notification system with delivery tracking
- **Tests:** Unit tests for services (see [src/services/**tests**/](../src/services/__tests__/))

---

## Integration Points & Dependencies

### Environment Variables (Required)

```env
NODE_ENV=development
PORT=3000
HOST=localhost
DATABASE_URL=postgresql://user:password@localhost/tacq
JWT_SECRET=<32+ char random string>
JWT_REFRESH_SECRET=<32+ char random string>
GOOGLE_CLIENT_ID=<OAuth app ID>
GOOGLE_CLIENT_SECRET=<OAuth secret>
FRONTEND_URL=http://localhost:3000
```

See `.env.example` for template.

### External APIs

- **Google OAuth:** Used in [src/routes/auth/google.ts](../src/routes/auth/google.ts) (partial implementation)
- **PostgreSQL:** Requires connection string with valid user/password

### Event Flow for Creating Loans

```
1. POST /api/items (create item)
   ↓
2. POST /api/loans (create loan, generate JWT)
   ↓
3. JWT token saved to loanTokens table with 7-day expiry
   ↓
4. Return confirmationLink: https://app.url/l/:token
   ↓
5. Borrower opens link → GET /api/links/:token (no auth required)
   ↓
6. POST /api/links/:token/confirm (creates temp user if needed)
   ↓
7. Device fingerprint recorded for future consolidation
```

---

## Testing & QA

### Test Organization

- Unit tests colocated: `src/services/__tests__/service.test.ts`
- Use Bun's native test runner (see `package.json` scripts)
- Example auth test: [src/services/auth/**tests**/auth.test.ts](../src/services/auth/__tests__/auth.test.ts)

### Pre-Commit Checklist

```bash
bun run qa                     # TypeScript check + Biome linting (REQUIRED)
bun run qa:fix                 # Auto-fix issues if QA fails
bun test                       # Run all tests (ensure green)
```

**DO NOT commit code that fails `bun run qa`.**

---

## Key Files Reference

| File                                    | Purpose                                      |
| --------------------------------------- | -------------------------------------------- |
| [CLAUDE.md](../CLAUDE.md)               | High-level project context                   |
| [docs/prd.md](../docs/prd.md)           | Complete technical spec + API schemas        |
| [src/db/schema.ts](../src/db/schema.ts) | Database schema with all tables + encryption |
| [package.json](../package.json)         | Dependencies + dev scripts                   |
| [tsconfig.json](../tsconfig.json)       | TypeScript strict mode enabled               |
| [biome.json](../biome.json)             | Linting + formatting rules                   |

---

## Gotchas & Important Notes

1. **Encryption/Decryption:** Always use `src/services/crypto/index.ts` for user PII. Never store plaintext email/name in logs.

2. **JWT Links:** Tokens in `loanTokens` must be checked for expiry AND `usedAt` timestamp before confirming loans.

3. **Device Fingerprinting:** Same `deviceId` should always map to same user. If user logs in with OAuth on same device, _link_ the temp user to OAuth account (see [src/routes/auth/google.ts](../src/routes/auth/google.ts) for partial logic).

4. **LGPD Compliance:** All encrypted fields must remain encrypted in responses unless explicitly decrypted by service. Never expose encryption keys in logs or error messages.

5. **Rate Limiting:** 100 req/min global (see [src/app.ts](../src/app.ts#L17)). Adjust per endpoint as needed for auth/register endpoints.

---

## Quick Start for New Features

### Adding a New Route

```typescript
// 1. Create schema in src/schemas/newfeature.ts
const createSchema = z.object({ ... });

// 2. Create route in src/routes/newfeature/index.ts
export default async function routes(fastify: FastifyInstance) {
  fastify.post("/", { schema: { ... }, preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const validated = createSchema.parse(req.body);
      // Use Drizzle query
      return result;
    }
  );
}

// 3. Register in src/app.ts
await app.register(newfeatureRoutes, { prefix: "/api/newfeature" });
```

### Running Migrations After Schema Changes

```bash
# After editing src/db/schema.ts:
bun run db:generate
# Review: cat drizzle/migrations/latest.sql
bun run db:migrate
```

---

**Last Updated:** 2026-02-04
**Feedback:** This guide is refreshed as patterns emerge. Report missing sections to CLAUDE.md maintainer.
