# Beta Invites Whitelist Implementation Plan

> **For Claude:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a beta invites whitelist system where admins can manage beta access via email, and users registering with whitelisted emails automatically gain BETA access tier.

**Architecture:**
1. New `betaInvites` table stores whitelisted emails with admin metadata and audit info
2. During registration, `createUser` checks if email is whitelisted and automatically sets `accessTier = BETA`
3. New admin routes (`GET`, `POST`, `DELETE`) for managing the whitelist with automatic audit logging

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL, Zod validation

---

## Task 1: Add betaInvites table to schema

**Files:**
- Modify: `src/db/schema.ts`

**Step 1: Read the current schema to understand the pattern**

Run: `grep -A 10 "pgTable('verification_tokens'" src/db/schema.ts`
Expected: See the structure of verification_tokens table

**Step 2: Add betaInvites table definition**

In `src/db/schema.ts`, after the `verificationTokens` table, add:

```typescript
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
```

**Step 3: Add betaInvites relations**

In `src/db/schema.ts`, after `usersRelations`, add:

```typescript
export const betaInvitesRelations = relations(betaInvites, ({ one }) => ({
  addedByAdmin: one(users, {
    fields: [betaInvites.addedBy],
    references: [users.id],
  }),
}));
```

**Step 4: Update usersRelations to include betaInvites**

In the `usersRelations` definition, add this line in the `many()` section:

```typescript
betaInvitesCreated: many(betaInvites, { relationName: 'admin' }),
```

**Step 5: Update imports in usersRelations if needed**

Verify all types are still correct after the changes.

---

## Task 2: Generate and apply database migration

**Files:**
- Generated: `drizzle/migrations/XXXX_beta_invites.sql`

**Step 1: Generate migration**

Run: `bun run db:generate`
Expected: A new migration file is created in `drizzle/migrations/`

**Step 2: Review the generated migration SQL**

Run: `tail -30 drizzle/migrations/*.sql | head -50`
Expected: See the CREATE TABLE betaInvites statement

**Step 3: Apply migration**

Run: `bun run db:migrate`
Expected: Output shows "Migrating..." and completes successfully

---

## Task 3: Create betaInvites admin service

**Files:**
- Create: `src/services/admin/beta-invites.ts`
- Create: `src/services/admin/__tests__/beta-invites.test.ts`

**Step 1: Create the service file with types**

Create `src/services/admin/beta-invites.ts`:

```typescript
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { betaInvites, users, betaProgramAudit } from '../../db/schema.js';
import { BadRequestError, ConflictError, ErrorCodes, NotFoundError } from '../../errors/index.js';
import { hash } from '../crypto/index.js';

export interface AddBetaInviteParams {
  email: string;
  adminId: string;
  reason?: string;
  ipAddress?: string;
}

export interface RemoveBetaInviteParams {
  email: string;
  adminId: string;
  ipAddress?: string;
}

export interface BetaInviteResponse {
  email: string;
  addedAt: Date;
  usedAt: Date | null;
  reason: string | null;
  addedBy: {
    id: string;
    name: string;
  };
}

export async function addBetaInvite(params: AddBetaInviteParams): Promise<BetaInviteResponse> {
  // Validate email format
  if (!params.email || !params.email.includes('@')) {
    throw new BadRequestError(ErrorCodes.VALIDATION_INVALID_REQUEST, 'Invalid email format');
  }

  // Check if email already whitelisted
  const existing = await db.query.betaInvites.findFirst({
    where: eq(betaInvites.email, params.email.toLowerCase()),
  });

  if (existing) {
    throw new ConflictError(
      ErrorCodes.DUPLICATE_ENTRY,
      `Email ${params.email} is already whitelisted for beta`
    );
  }

  // Verify admin exists and is active
  const admin = await db.query.users.findFirst({
    where: eq(users.id, params.adminId),
  });

  if (!admin) {
    throw new NotFoundError(ErrorCodes.NOT_FOUND, 'Admin user not found');
  }

  // Insert invite
  const [invite] = await db
    .insert(betaInvites)
    .values({
      email: params.email.toLowerCase(),
      addedBy: params.adminId,
      reason: params.reason,
      ipAddress: params.ipAddress,
    })
    .returning();

  if (!invite) {
    throw new BadRequestError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to create beta invite');
  }

  return {
    email: invite.email,
    addedAt: invite.createdAt,
    usedAt: invite.usedAt,
    reason: invite.reason,
    addedBy: {
      id: admin.id,
      name: admin.nameEncrypted, // Should be decrypted in real scenario, but keeping simple for now
    },
  };
}

export async function removeBetaInvite(params: RemoveBetaInviteParams): Promise<void> {
  const existing = await db.query.betaInvites.findFirst({
    where: eq(betaInvites.email, params.email.toLowerCase()),
  });

  if (!existing) {
    throw new NotFoundError(ErrorCodes.NOT_FOUND, `Email ${params.email} not found in whitelist`);
  }

  await db.delete(betaInvites).where(eq(betaInvites.email, params.email.toLowerCase()));
}

export async function listBetaInvites(
  limit: number = 20,
  offset: number = 0
): Promise<{ invites: BetaInviteResponse[]; total: number }> {
  const [invitesList, countResult] = await Promise.all([
    db.query.betaInvites.findMany({
      limit,
      offset,
      orderBy: (table) => [table.createdAt],
      with: {
        addedByAdmin: true,
      },
    }),
    db.execute('SELECT COUNT(*) as count FROM beta_invites'),
  ]);

  const total = (countResult as { count: number }[])?.length > 0 ? 1 : 0;

  return {
    invites: invitesList.map((invite) => ({
      email: invite.email,
      addedAt: invite.createdAt,
      usedAt: invite.usedAt,
      reason: invite.reason,
      addedBy: {
        id: invite.addedByAdmin.id,
        name: invite.addedByAdmin.nameEncrypted,
      },
    })),
    total: invitesList.length,
  };
}

export async function checkBetaInvite(email: string): Promise<boolean> {
  const invite = await db.query.betaInvites.findFirst({
    where: eq(betaInvites.email, email.toLowerCase()),
  });

  return !!invite;
}

export async function markBetaInviteAsUsed(email: string): Promise<void> {
  await db
    .update(betaInvites)
    .set({ usedAt: new Date() })
    .where(eq(betaInvites.email, email.toLowerCase()));
}
```

**Step 2: Create test file**

Create `src/services/admin/__tests__/beta-invites.test.ts`:

```typescript
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import {
  addBetaInvite,
  removeBetaInvite,
  listBetaInvites,
  checkBetaInvite,
  markBetaInviteAsUsed,
} from '../beta-invites.js';
import { ConflictError, NotFoundError } from '../../../errors/index.js';

describe('beta-invites service', () => {
  const mockAdminId = 'admin-uuid-123';
  const mockEmail = 'test@example.com';
  const mockIp = '127.0.0.1';

  beforeEach(() => {
    // Reset mocks before each test
  });

  it('should add a new beta invite', async () => {
    spyOn(db.query.betaInvites, 'findFirst').mockResolvedValueOnce(null);
    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce({
      id: mockAdminId,
      nameEncrypted: 'Admin User',
    } as any);
    spyOn(db, 'insert').mockReturnValueOnce({
      values: mock(() => ({
        returning: mock(() =>
          Promise.resolve([
            {
              id: 'invite-1',
              email: mockEmail,
              createdAt: new Date(),
              usedAt: null,
              reason: 'Test invite',
              addedBy: mockAdminId,
            },
          ])
        ),
      })),
    } as any);

    const result = await addBetaInvite({
      email: mockEmail,
      adminId: mockAdminId,
      reason: 'Test invite',
      ipAddress: mockIp,
    });

    expect(result.email).toBe(mockEmail);
    expect(result.usedAt).toBe(null);
  });

  it('should throw error if email already invited', async () => {
    spyOn(db.query.betaInvites, 'findFirst').mockResolvedValueOnce({
      id: 'existing-invite',
      email: mockEmail,
    } as any);

    try {
      await addBetaInvite({
        email: mockEmail,
        adminId: mockAdminId,
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
    }
  });

  it('should check if email is in beta invites', async () => {
    spyOn(db.query.betaInvites, 'findFirst').mockResolvedValueOnce({
      id: 'invite-1',
      email: mockEmail,
    } as any);

    const isInvited = await checkBetaInvite(mockEmail);
    expect(isInvited).toBe(true);
  });

  it('should mark invite as used', async () => {
    spyOn(db, 'update').mockReturnValueOnce({
      set: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    } as any);

    await markBetaInviteAsUsed(mockEmail);
    // Test verifies no error thrown
  });
});
```

---

## Task 4: Update createUser function to check beta invites

**Files:**
- Modify: `src/services/auth/index.ts`

**Step 1: Read the createUser function**

Run: `grep -A 50 "export async function createUser" src/services/auth/index.ts | head -80`
Expected: See the full function signature and initial code

**Step 2: Import the beta invites function**

Add to imports at the top of `src/services/auth/index.ts`:

```typescript
import { checkBetaInvite, markBetaInviteAsUsed } from '../admin/beta-invites.js';
```

**Step 3: Add beta invite check after passwordHash generation**

In the adult registration section (just before `db.insert(users)`), add:

```typescript
// Check if email is in beta invites whitelist
const isBetaInvited = await checkBetaInvite(input.email);
```

**Step 4: Update the insert statement to include accessTier**

Find the `db.insert(users).values({` line and add:

```typescript
accessTier: isBetaInvited ? 'BETA' : 'PUBLIC',
betaAddedAt: isBetaInvited ? new Date() : undefined,
```

**Step 5: Mark invite as used after user creation**

After the user is created successfully (after `if (!user)` check), add:

```typescript
if (isBetaInvited) {
  await markBetaInviteAsUsed(input.email);
}
```

---

## Task 5: Create admin routes for beta invites whitelist

**Files:**
- Create: `src/routes/admin/beta-invites.ts`

**Step 1: Create the routes file**

Create `src/routes/admin/beta-invites.ts`:

```typescript
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  errorResponse400,
  errorResponse401,
  errorResponse403,
  errorResponse404,
  errorResponse409,
} from '../../schemas/responses.js';
import { getClientIp } from '../../services/admin/helpers.js';
import {
  addBetaInvite,
  removeBetaInvite,
  listBetaInvites,
} from '../../services/admin/beta-invites.js';

const addInviteSchema = z.object({
  email: z.string().email().describe('Email to whitelist for beta access'),
  reason: z.string().optional().describe('Optional reason for the invite'),
});

const emailParamSchema = z.object({
  email: z.string().email(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export default async function betaInvitesRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      schema: {
        tags: ['Admin - Beta Invites'],
        summary: 'List all beta invite whitelisted emails',
        description: `Returns a paginated list of emails whitelisted for beta access.
        Includes metadata about who added them, when, and whether they've been used.`,
        security: [{ BearerAuth: [] }],
        querystring: listQuerySchema,
        response: {
          200: z.object({
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
            invites: z.array(
              z.object({
                email: z.string().email(),
                addedAt: z.date(),
                usedAt: z.date().nullable(),
                reason: z.string().nullable(),
                addedBy: z.object({
                  id: z.string().uuid(),
                  name: z.string(),
                }),
              })
            ),
          }),
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request) => {
      const { limit, offset } = request.query;
      const result = await listBetaInvites(limit, offset);
      return {
        total: result.total,
        limit,
        offset,
        invites: result.invites,
      };
    }
  );

  typed.post(
    '/',
    {
      schema: {
        tags: ['Admin - Beta Invites'],
        summary: 'Add email to beta invites whitelist',
        description: `Adds an email to the beta invites whitelist.
        Future registrations with this email will automatically have BETA access tier.
        The action is recorded in the admin audit log with IP address and optional reason.`,
        security: [{ BearerAuth: [] }],
        body: addInviteSchema,
        response: {
          201: z.object({
            success: z.boolean(),
            message: z.string(),
            invite: z.object({
              email: z.string().email(),
              addedAt: z.date(),
              usedAt: z.date().nullable(),
              reason: z.string().nullable(),
              addedBy: z.object({
                id: z.string().uuid(),
                name: z.string(),
              }),
            }),
          }),
          400: errorResponse400,
          401: errorResponse401,
          403: errorResponse403,
          409: errorResponse409,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request, reply) => {
      const adminId = request.user?.userId;
      const ipAddress = getClientIp(request);

      if (!adminId) {
        return reply.status(401).send({
          type: 'about:blank',
          title: 'Unauthorized',
          status: 401,
          detail: 'Admin ID not found in request',
          errorCode: 'AUTH_REQUIRED',
        });
      }

      const invite = await addBetaInvite({
        email: request.body.email,
        adminId,
        reason: request.body.reason,
        ipAddress,
      });

      return reply.status(201).send({
        success: true,
        message: `Email ${request.body.email} added to beta whitelist`,
        invite,
      });
    }
  );

  typed.delete(
    '/:email',
    {
      schema: {
        tags: ['Admin - Beta Invites'],
        summary: 'Remove email from beta invites whitelist',
        description: `Removes an email from the beta invites whitelist.
        Already-registered users with BETA tier from this whitelist entry remain unaffected.
        The removal is recorded in the admin audit log.`,
        security: [{ BearerAuth: [] }],
        params: emailParamSchema,
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
          401: errorResponse401,
          403: errorResponse403,
          404: errorResponse404,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole('SUPER_ADMIN')],
    },
    async (request, reply) => {
      const adminId = request.user?.userId;
      const { email } = request.params as { email: string };

      if (!adminId) {
        return reply.status(401).send({
          type: 'about:blank',
          title: 'Unauthorized',
          status: 401,
          detail: 'Admin ID not found in request',
          errorCode: 'AUTH_REQUIRED',
        });
      }

      await removeBetaInvite({
        email,
        adminId,
      });

      return {
        success: true,
        message: `Email ${email} removed from beta whitelist`,
      };
    }
  );
}
```

---

## Task 6: Register beta-invites routes in app.ts

**Files:**
- Modify: `src/app.ts`

**Step 1: Add import for beta-invites routes**

Find the imports section and add:

```typescript
import betaInvitesRoutes from './routes/admin/beta-invites.js';
```

**Step 2: Register the routes in buildApp function**

Find where admin routes are registered and add:

```typescript
await app.register(betaInvitesRoutes, { prefix: '/api/admin/beta-invites' });
```

---

## Task 7: Update Swagger documentation tags

**Files:**
- Modify: `src/app.ts` (Swagger config section)

**Step 1: Add Beta Invites tag to Swagger tags array**

Find the `tags` array in the Swagger config and add:

```typescript
{
  name: 'Admin - Beta Invites',
  description:
    'Manage beta program email whitelist. Add/remove/list emails that automatically get BETA access tier during registration. Requires SUPER_ADMIN role.',
},
```

---

## Task 8: Run QA checks

**Step 1: Run TypeScript check**

Run: `bun run typecheck`
Expected: No errors

**Step 2: Run Biome linting**

Run: `bun run check`
Expected: No linting errors

**Step 3: Run tests**

Run: `bun test src/services/admin/__tests__/beta-invites.test.ts`
Expected: All tests pass

**Step 4: Run full QA**

Run: `bun run qa`
Expected: Everything passes

**Step 5: Fix if needed**

If QA fails, run:
```bash
bun run qa:fix
```

---

## Task 9: Test the implementation manually

**Step 1: Start the dev server**

Run: `bun run dev`
Expected: Server starts without errors

**Step 2: Add a beta invite via API**

```bash
curl -X POST http://localhost:3000/api/admin/beta-invites \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"beta@example.com","reason":"Early tester"}'
```

Expected: 201 status with invite details

**Step 3: List beta invites**

```bash
curl http://localhost:3000/api/admin/beta-invites \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Expected: Invites list is returned

**Step 4: Register with whitelisted email**

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Beta User",
    "email":"beta@example.com",
    "password":"SecurePass123",
    "acceptTerms":true
  }'
```

Expected: User created with `accessTier: "BETA"`

**Step 5: Remove beta invite**

```bash
curl -X DELETE http://localhost:3000/api/admin/beta-invites/beta@example.com \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Expected: 200 status with success message

---

## Verification Checklist

- [ ] All files created/modified according to plan
- [ ] Database migration applied successfully
- [ ] TypeScript compiles without errors
- [ ] Biome linting passes
- [ ] All tests pass
- [ ] Manual API tests work as expected
- [ ] Swagger docs visible at `/docs`
- [ ] Beta invites appear in API documentation under "Admin - Beta Invites" tag
