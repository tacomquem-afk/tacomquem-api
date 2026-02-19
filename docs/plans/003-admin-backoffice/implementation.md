# Admin & Backoffice System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build complete admin system with RBAC (5 roles), user management, content moderation, analytics dashboard, and audit logging with LGPD-compliant data masking.

**Architecture:** Service-layer pattern with encrypted data at rest. RBAC plugin with role hierarchy for authorization. JWT tokens include role claim. All admin actions logged to audit table with IP/user-agent tracking.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL, Zod, Bun test framework

---

## Phase 1: Database Schema & Core Infrastructure

### Task 1: Add Role and Admin Action Enums to Schema

**Files:**
- Modify: `src/db/schema.ts`

**Step 1: Write failing test for role enum**

Create: `src/db/__tests__/schema.test.ts`

```typescript
import { describe, expect, it } from 'bun:test';
import { roleEnum, adminActionEnum } from '../schema.js';

describe('Schema Enums', () => {
  it('should have all required user roles', () => {
    const roles = roleEnum.enumValues;
    expect(roles).toContain('USER');
    expect(roles).toContain('ANALYST');
    expect(roles).toContain('SUPPORT');
    expect(roles).toContain('MODERATOR');
    expect(roles).toContain('SUPER_ADMIN');
    expect(roles).toHaveLength(5);
  });

  it('should have all required admin actions', () => {
    const actions = adminActionEnum.enumValues;
    expect(actions).toContain('user_blocked');
    expect(actions).toContain('user_unblocked');
    expect(actions).toContain('item_removed');
    expect(actions).toContain('loan_cancelled');
    expect(actions).toContain('admin_created');
    expect(actions).toContain('admin_role_changed');
    expect(actions).toContain('admin_removed');
    expect(actions).toContain('content_flagged');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/db/__tests__/schema.test.ts`
Expected: FAIL with "roleEnum is not defined" or similar

**Step 3: Add enums to schema.ts**

In `src/db/schema.ts`, after imports, before table definitions:

```typescript
// Admin role enum
export const roleEnum = pgEnum('user_role', [
  'USER',
  'ANALYST',
  'SUPPORT',
  'MODERATOR',
  'SUPER_ADMIN'
]);

// Admin action enum for audit logging
export const adminActionEnum = pgEnum('admin_action', [
  'user_blocked',
  'user_unblocked',
  'item_removed',
  'loan_cancelled',
  'admin_created',
  'admin_role_changed',
  'admin_removed',
  'content_flagged'
]);
```

**Step 4: Run test to verify it passes**

Run: `bun test src/db/__tests__/schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/db/schema.ts src/db/__tests__/schema.test.ts
git commit -m "feat(db): add role and admin action enums"
```

---

### Task 2: Add Admin Fields to Users Table

**Files:**
- Modify: `src/db/schema.ts`

**Step 1: Write test for new user fields**

Add to `src/db/__tests__/schema.test.ts`:

```typescript
import { users } from '../schema.js';

describe('Users Table Admin Fields', () => {
  it('should have role column with USER as default', () => {
    const roleColumn = users.role;
    expect(roleColumn).toBeDefined();
    expect(roleColumn.default).toBe('USER');
    expect(roleColumn.notNull).toBe(true);
  });

  it('should have isActive column with true as default', () => {
    const isActiveColumn = users.isActive;
    expect(isActiveColumn).toBeDefined();
    expect(isActiveColumn.default).toBe(true);
    expect(isActiveColumn.notNull).toBe(true);
  });

  it('should have nullable blockedAt and blockedReason columns', () => {
    expect(users.blockedAt).toBeDefined();
    expect(users.blockedReason).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/db/__tests__/schema.test.ts`
Expected: FAIL - columns not found

**Step 3: Add columns to users table**

In `src/db/schema.ts`, in the `users` table definition, add after existing fields:

```typescript
export const users = pgTable('users', {
  // ... existing fields (id, emailEncrypted, emailHash, etc.) ...

  // Admin and moderation fields
  role: roleEnum('role').default('USER').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  blockedAt: timestamp('blocked_at'),
  blockedReason: text('blocked_reason'),

  // ... rest of existing fields (createdAt, updatedAt) ...
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/db/__tests__/schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/db/schema.ts src/db/__tests__/schema.test.ts
git commit -m "feat(db): add admin fields to users table"
```

---

### Task 3: Create Admin Audit Log Table

**Files:**
- Modify: `src/db/schema.ts`

**Step 1: Write test for audit log table structure**

Add to `src/db/__tests__/schema.test.ts`:

```typescript
import { adminAuditLog } from '../schema.js';

describe('Admin Audit Log Table', () => {
  it('should have all required columns', () => {
    expect(adminAuditLog.id).toBeDefined();
    expect(adminAuditLog.adminId).toBeDefined();
    expect(adminAuditLog.action).toBeDefined();
    expect(adminAuditLog.targetType).toBeDefined();
    expect(adminAuditLog.targetId).toBeDefined();
    expect(adminAuditLog.metadata).toBeDefined();
    expect(adminAuditLog.ipAddress).toBeDefined();
    expect(adminAuditLog.userAgent).toBeDefined();
    expect(adminAuditLog.createdAt).toBeDefined();
  });

  it('should have adminId as NOT NULL with cascade delete', () => {
    const adminIdColumn = adminAuditLog.adminId;
    expect(adminIdColumn.notNull).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/db/__tests__/schema.test.ts`
Expected: FAIL - adminAuditLog not defined

**Step 3: Add audit log table to schema**

In `src/db/schema.ts`, after users table:

```typescript
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
  createdAt: timestamp('created_at').defaultNow().notNull()
});
```

**Step 4: Add relations**

In `src/db/schema.ts`, update `usersRelations` and add `adminAuditLogRelations`:

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  // ... existing relations ...
  adminActions: many(adminAuditLog)
}));

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  admin: one(users, {
    fields: [adminAuditLog.adminId],
    references: [users.id]
  })
}));
```

**Step 5: Run test to verify it passes**

Run: `bun test src/db/__tests__/schema.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/db/schema.ts src/db/__tests__/schema.test.ts
git commit -m "feat(db): add admin audit log table with relations"
```

---

### Task 4: Generate and Apply Database Migrations

**Files:**
- Create: `drizzle/migrations/0002_add_admin_roles.sql`
- Create: `drizzle/migrations/0003_add_admin_audit_log.sql`

**Step 1: Generate migrations**

Run: `bun run db:generate`
Expected: Two new migration files created in `drizzle/migrations/`

**Step 2: Review generated SQL**

Run: `cat drizzle/migrations/0002_*.sql`
Expected: Should contain:
- CREATE TYPE user_role enum
- ALTER TABLE users ADD COLUMN role, is_active, blocked_at, blocked_reason
- CREATE INDEX on role and is_active

Run: `cat drizzle/migrations/0003_*.sql`
Expected: Should contain:
- CREATE TYPE admin_action enum
- CREATE TABLE admin_audit_log
- CREATE INDEX on admin_id, created_at, target

**Step 3: Apply migrations**

Run: `bun run db:migrate`
Expected: Migrations applied successfully

**Step 4: Verify in database**

Run: `bun run db:studio`
Open browser to verify:
- users table has new columns
- admin_audit_log table exists
- Enums are created

**Step 5: Commit**

```bash
git add drizzle/migrations/*.sql drizzle/meta/*
git commit -m "feat(db): generate and apply admin schema migrations"
```

---

### Task 5: Create RBAC Plugin

**Files:**
- Create: `src/plugins/rbac.ts`
- Create: `src/plugins/__tests__/rbac.test.ts`

**Step 1: Write failing test for RBAC plugin**

Create: `src/plugins/__tests__/rbac.test.ts`

```typescript
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import rbacPlugin from '../rbac.js';

describe('RBAC Plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
      // Mock authenticate - does nothing in tests
    });
    await app.register(rbacPlugin);
  });

  it('should register requireRole decorator', () => {
    expect(app.requireRole).toBeDefined();
    expect(typeof app.requireRole).toBe('function');
  });

  it('should return 401 if user is not authenticated', async () => {
    const handler = app.requireRole('SUPER_ADMIN');
    const mockRequest = { user: null } as any;
    const mockReply = {
      code: mock((code: number) => mockReply),
      send: mock((body: any) => body)
    } as any;

    await handler(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  });

  it('should return 403 if user role is insufficient', async () => {
    const handler = app.requireRole('SUPER_ADMIN');
    const mockRequest = { user: { userId: 'test', role: 'USER' } } as any;
    const mockReply = {
      code: mock((code: number) => mockReply),
      send: mock((body: any) => body)
    } as any;

    await handler(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Insufficient permissions'
    });
  });

  it('should allow access if user has exact role', async () => {
    const handler = app.requireRole('MODERATOR');
    const mockRequest = { user: { userId: 'test', role: 'MODERATOR' } } as any;
    const mockReply = {
      code: mock(),
      send: mock()
    } as any;

    await handler(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should allow access if user has higher role in hierarchy', async () => {
    const handler = app.requireRole('ANALYST');
    const mockRequest = { user: { userId: 'test', role: 'SUPER_ADMIN' } } as any;
    const mockReply = {
      code: mock(),
      send: mock()
    } as any;

    await handler(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
  });

  it('should accept array of roles', async () => {
    const handler = app.requireRole(['ANALYST', 'SUPPORT']);
    const mockRequest = { user: { userId: 'test', role: 'SUPPORT' } } as any;
    const mockReply = {
      code: mock(),
      send: mock()
    } as any;

    await handler(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/plugins/__tests__/rbac.test.ts`
Expected: FAIL - rbacPlugin not found

**Step 3: Implement RBAC plugin**

Create: `src/plugins/rbac.ts`

```typescript
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

export type UserRole = 'USER' | 'ANALYST' | 'SUPPORT' | 'MODERATOR' | 'SUPER_ADMIN';

const roleHierarchy: Record<UserRole, number> = {
  USER: 0,
  ANALYST: 1,
  SUPPORT: 2,
  MODERATOR: 3,
  SUPER_ADMIN: 4
};

function hasRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  const userLevel = roleHierarchy[userRole];
  return requiredRoles.some(role => userLevel >= roleHierarchy[role]);
}

async function rbacPlugin(fastify: FastifyInstance) {
  fastify.decorate('requireRole', (allowedRoles: UserRole | UserRole[]) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user;

      if (!user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      if (!hasRole(user.role, roles)) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Insufficient permissions'
        });
      }
    };
  });
}

export default fp(rbacPlugin, {
  name: 'rbac',
  dependencies: ['jwt']
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/plugins/__tests__/rbac.test.ts`
Expected: PASS

**Step 5: Add TypeScript declarations**

Create: `src/types/fastify.d.ts` (if it doesn't exist, or add to existing):

```typescript
import type { UserRole } from '../plugins/rbac.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireRole(allowedRoles: UserRole | UserRole[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user?: {
      userId: string;
      role: UserRole;
    };
  }
}
```

**Step 6: Commit**

```bash
git add src/plugins/rbac.ts src/plugins/__tests__/rbac.test.ts src/types/
git commit -m "feat(auth): add RBAC plugin with role hierarchy"
```

---

### Task 6: Update JWT Plugin to Include Role

**Files:**
- Modify: `src/plugins/jwt.ts`
- Create: `src/plugins/__tests__/jwt.test.ts`

**Step 1: Write test for role in JWT token**

Create: `src/plugins/__tests__/jwt.test.ts`

```typescript
import { beforeEach, describe, expect, it } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import jwtPlugin from '../jwt.js';
import { env } from '../../config/env.js';

describe('JWT Plugin with Role', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(jwtPlugin);
  });

  it('should sign token with userId and role', () => {
    const token = (app as any).signAccessToken('user-123', 'SUPER_ADMIN');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded = app.jwt.verify(token) as any;
    expect(decoded.userId).toBe('user-123');
    expect(decoded.role).toBe('SUPER_ADMIN');
  });

  it('should default to USER role if not provided', () => {
    const token = (app as any).signAccessToken('user-456');
    const decoded = app.jwt.verify(token) as any;
    expect(decoded.role).toBe('USER');
  });

  it('should sign refresh token with role', () => {
    const token = (app as any).signRefreshToken('user-789', 'MODERATOR');
    const decoded = app.jwt.verify(token, { secret: env.JWT_REFRESH_SECRET }) as any;
    expect(decoded.userId).toBe('user-789');
    expect(decoded.role).toBe('MODERATOR');
  });

  it('should attach role to request.user in authenticate decorator', async () => {
    const token = (app as any).signAccessToken('user-abc', 'ANALYST');

    app.get('/test', {
      preHandler: [(app as any).authenticate]
    }, async (request) => {
      return { user: request.user };
    });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    const body = JSON.parse(response.body);
    expect(body.user.userId).toBe('user-abc');
    expect(body.user.role).toBe('ANALYST');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/plugins/__tests__/jwt.test.ts`
Expected: FAIL - role not included in token

**Step 3: Update JWT plugin to include role**

In `src/plugins/jwt.ts`, modify the token signing functions:

```typescript
import type { UserRole } from './rbac.js';

interface TokenPayload {
  userId: string;
  role: UserRole;
}

// Update signAccessToken
fastify.decorate('signAccessToken', (userId: string, role: UserRole = 'USER'): string => {
  return fastify.jwt.sign(
    { userId, role } as TokenPayload,
    { expiresIn: '7d' }
  );
});

// Update signRefreshToken
fastify.decorate('signRefreshToken', (userId: string, role: UserRole = 'USER'): string => {
  return fastify.jwt.sign(
    { userId, role } as TokenPayload,
    { secret: env.JWT_REFRESH_SECRET, expiresIn: '30d' }
  );
});

// Update authenticate decorator
fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const decoded = await request.jwtVerify<TokenPayload>();
    request.user = {
      userId: decoded.userId,
      role: decoded.role || 'USER' // fallback for old tokens
    };
  } catch (err) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
});
```

**Step 4: Update TypeScript declarations**

In `src/types/fastify.d.ts`:

```typescript
declare module 'fastify' {
  interface FastifyInstance {
    signAccessToken(userId: string, role?: UserRole): string;
    signRefreshToken(userId: string, role?: UserRole): string;
  }
}
```

**Step 5: Run test to verify it passes**

Run: `bun test src/plugins/__tests__/jwt.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/plugins/jwt.ts src/plugins/__tests__/jwt.test.ts src/types/
git commit -m "feat(auth): include role in JWT tokens"
```

---

### Task 7: Register RBAC Plugin in App

**Files:**
- Modify: `src/app.ts`

**Step 1: Import and register RBAC plugin**

In `src/app.ts`, after JWT plugin registration:

```typescript
import rbacPlugin from './plugins/rbac.js';

// ... existing code ...

await app.register(jwtPlugin);
await app.register(rbacPlugin); // Add this line
```

**Step 2: Test server starts correctly**

Run: `bun run dev`
Expected: Server starts without errors

**Step 3: Commit**

```bash
git add src/app.ts
git commit -m "feat(app): register RBAC plugin"
```

---

### Task 8: Create CLI Script to Create Super Admin

**Files:**
- Create: `src/scripts/create-admin.ts`
- Create: `src/scripts/__tests__/create-admin.test.ts`

**Step 1: Write test for admin creation logic**

Create: `src/scripts/__tests__/create-admin.test.ts`

```typescript
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

// Import functions we'll create
import { createSuperAdmin, findUserByEmailHash } from '../create-admin.js';

describe('Create Admin Script', () => {
  const mockEmail = 'admin@test.com';
  const mockPassword = 'SecurePass123!';
  const mockName = 'Admin User';

  beforeEach(() => {
    // Reset mocks
  });

  it('should create new SUPER_ADMIN if user does not exist', async () => {
    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(null);
    const insertSpy = spyOn(db, 'insert').mockReturnValue({
      values: mock(() => ({ returning: mock(() => Promise.resolve([{ id: 'new-user-id' }])) }))
    } as any);

    const result = await createSuperAdmin(mockEmail, mockPassword, mockName);

    expect(result.created).toBe(true);
    expect(result.userId).toBe('new-user-id');
    expect(insertSpy).toHaveBeenCalled();
  });

  it('should promote existing user to SUPER_ADMIN', async () => {
    const existingUser = {
      id: 'existing-user-id',
      role: 'USER',
      emailHash: 'hash123'
    };

    spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(existingUser as any);
    const updateSpy = spyOn(db, 'update').mockReturnValue({
      set: mock(() => ({ where: mock(() => Promise.resolve()) }))
    } as any);

    const result = await createSuperAdmin(mockEmail, mockPassword, mockName);

    expect(result.created).toBe(false);
    expect(result.userId).toBe('existing-user-id');
    expect(updateSpy).toHaveBeenCalled();
  });

  it('should validate email format', async () => {
    await expect(
      createSuperAdmin('invalid-email', mockPassword, mockName)
    ).rejects.toThrow();
  });

  it('should validate password minimum length', async () => {
    await expect(
      createSuperAdmin(mockEmail, 'short', mockName)
    ).rejects.toThrow();
  });

  it('should validate name minimum length', async () => {
    await expect(
      createSuperAdmin(mockEmail, mockPassword, 'ab')
    ).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/scripts/__tests__/create-admin.test.ts`
Expected: FAIL - module not found

**Step 3: Implement admin creation script**

Create: `src/scripts/create-admin.ts`

```typescript
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../services/password/index.js';
import { encrypt, hashEmail } from '../services/crypto/index.js';
import { z } from 'zod';

const createAdminSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres')
});

export async function findUserByEmailHash(emailHash: string) {
  return db.query.users.findFirst({
    where: eq(users.emailHash, emailHash)
  });
}

export async function createSuperAdmin(
  email: string,
  password: string,
  name: string
): Promise<{ created: boolean; userId: string }> {
  // Validate inputs
  const validated = createAdminSchema.parse({ email, password, name });

  // Hash email for lookup
  const emailHash = hashEmail(validated.email);

  // Check if user already exists
  const existingUser = await findUserByEmailHash(emailHash);

  if (existingUser) {
    // Promote to SUPER_ADMIN
    await db
      .update(users)
      .set({ role: 'SUPER_ADMIN' })
      .where(eq(users.id, existingUser.id));

    return { created: false, userId: existingUser.id };
  }

  // Create new SUPER_ADMIN
  const passwordHash = await hashPassword(validated.password);
  const emailEncrypted = encrypt(validated.email);
  const nameEncrypted = encrypt(validated.name);

  const [newUser] = await db
    .insert(users)
    .values({
      emailEncrypted,
      emailHash,
      nameEncrypted,
      passwordHash,
      role: 'SUPER_ADMIN',
      emailVerified: true,
      isActive: true
    })
    .returning({ id: users.id });

  return { created: true, userId: newUser.id };
}

// CLI interface
async function main() {
  console.log('=== TáComQuem - Criar SUPER_ADMIN ===\n');

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  try {
    const email = await question('Email: ');
    const password = await question('Senha (mínimo 8 caracteres): ');
    const name = await question('Nome completo: ');

    console.log('\nCriando SUPER_ADMIN...');
    const result = await createSuperAdmin(email.trim(), password.trim(), name.trim());

    if (result.created) {
      console.log(`\n✅ SUPER_ADMIN criado com sucesso!`);
    } else {
      console.log(`\n✅ Usuário promovido a SUPER_ADMIN!`);
    }
    console.log(`ID: ${result.userId}\n`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('\n❌ Erro de validação:');
      error.errors.forEach(e => console.error(`  - ${e.message}`));
    } else {
      console.error('\n❌ Erro:', error);
    }
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Run if called directly
if (import.meta.path === Bun.main) {
  main();
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/scripts/__tests__/create-admin.test.ts`
Expected: PASS

**Step 5: Add script to package.json**

In `package.json`, add to scripts:

```json
{
  "scripts": {
    "admin:create": "bun run src/scripts/create-admin.ts"
  }
}
```

**Step 6: Test CLI manually**

Run: `bun run admin:create`
Expected: Prompts for email, password, name
Test with valid inputs

**Step 7: Commit**

```bash
git add src/scripts/create-admin.ts src/scripts/__tests__/create-admin.test.ts package.json
git commit -m "feat(scripts): add CLI to create SUPER_ADMIN"
```

---

## Phase 2: Services Layer

### Task 9: Create Admin Helper Functions

**Files:**
- Create: `src/services/admin/helpers.ts`
- Create: `src/services/admin/__tests__/helpers.test.ts`

**Step 1: Write failing tests for helper functions**

Create: `src/services/admin/__tests__/helpers.test.ts`

```typescript
import { describe, expect, it } from 'bun:test';
import { maskEmail, maskName, getClientIp } from '../helpers.js';

describe('Admin Helpers', () => {
  describe('maskEmail', () => {
    it('should mask email with 2+ local characters', () => {
      expect(maskEmail('john.doe@example.com')).toBe('jo***@example.com');
      expect(maskEmail('maria@gmail.com')).toBe('ma***@gmail.com');
    });

    it('should handle short emails', () => {
      expect(maskEmail('a@test.com')).toBe('a***@test.com');
      expect(maskEmail('ab@test.com')).toBe('ab***@test.com');
    });

    it('should handle emails with special characters', () => {
      expect(maskEmail('john+test@example.com')).toBe('jo***@example.com');
    });
  });

  describe('maskName', () => {
    it('should mask single-word names', () => {
      expect(maskName('John')).toBe('Jo***');
      expect(maskName('Maria')).toBe('Ma***');
    });

    it('should mask multi-word names keeping first and last initial', () => {
      expect(maskName('John Doe')).toBe('John D***');
      expect(maskName('Maria Silva Santos')).toBe('Maria S***');
    });

    it('should handle very short names', () => {
      expect(maskName('Jo')).toBe('Jo');
      expect(maskName('A')).toBe('A***');
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const mockRequest = {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
        ip: '127.0.0.1'
      };
      expect(getClientIp(mockRequest)).toBe('192.168.1.1');
    });

    it('should fallback to x-real-ip header', () => {
      const mockRequest = {
        headers: { 'x-real-ip': '192.168.1.1' },
        ip: '127.0.0.1'
      };
      expect(getClientIp(mockRequest)).toBe('192.168.1.1');
    });

    it('should fallback to request.ip', () => {
      const mockRequest = {
        headers: {},
        ip: '127.0.0.1'
      };
      expect(getClientIp(mockRequest)).toBe('127.0.0.1');
    });

    it('should handle missing IP', () => {
      const mockRequest = { headers: {} };
      expect(getClientIp(mockRequest)).toBeUndefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/admin/__tests__/helpers.test.ts`
Expected: FAIL - functions not found

**Step 3: Implement helper functions**

Create: `src/services/admin/helpers.ts`

```typescript
/**
 * Masks an email address for LGPD compliance
 * Example: john.doe@example.com -> jo***@example.com
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;

  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }

  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Masks a person's name for LGPD compliance
 * Single name: John -> Jo***
 * Multiple names: John Doe -> John D***
 */
export function maskName(name: string): string {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length === 1) {
    const single = parts[0];
    if (single.length <= 2) return single;
    return `${single.slice(0, 2)}***`;
  }

  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${firstName} ${lastInitial}***`;
}

/**
 * Extracts client IP address from request headers or direct IP
 * Checks x-forwarded-for, x-real-ip, then request.ip
 */
export function getClientIp(request: any): string | undefined {
  const forwardedFor = request.headers?.['x-forwarded-for'];
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers?.['x-real-ip'];
  if (realIp) {
    return realIp;
  }

  return request.ip;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/admin/__tests__/helpers.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/admin/helpers.ts src/services/admin/__tests__/helpers.test.ts
git commit -m "feat(admin): add helper functions for data masking and IP extraction"
```

---

### Task 10: Create Analytics Service

**Files:**
- Create: `src/services/admin/analytics.ts`
- Create: `src/services/admin/__tests__/analytics.test.ts`

**Step 1: Write failing tests for analytics service**

Create: `src/services/admin/__tests__/analytics.test.ts`

```typescript
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import { getDashboardStats, getUsersStats, getLoansStats } from '../analytics.js';

describe('Analytics Service', () => {
  beforeEach(() => {
    // Reset all mocks
  });

  describe('getDashboardStats', () => {
    it('should return complete dashboard statistics', async () => {
      // Mock database queries
      spyOn(db.query.users, 'findMany').mockResolvedValueOnce([
        { id: '1', createdAt: new Date('2026-01-01') },
        { id: '2', createdAt: new Date('2026-02-01') }
      ] as any);

      spyOn(db.query.items, 'findMany').mockResolvedValueOnce([
        { id: '1', isActive: true }
      ] as any);

      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
        { id: '1', status: 'confirmed', createdAt: new Date('2026-01-28') }
      ] as any);

      const stats = await getDashboardStats();

      expect(stats.summary.totalUsers).toBe(2);
      expect(stats.summary.totalItems).toBe(1);
      expect(stats.summary.activeLoans).toBe(1);
      expect(stats.trends.newUsersLastWeek).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getUsersStats', () => {
    it('should return user statistics grouped by role', async () => {
      spyOn(db.query.users, 'findMany').mockResolvedValueOnce([
        { role: 'USER', isActive: true },
        { role: 'USER', isActive: false },
        { role: 'MODERATOR', isActive: true }
      ] as any);

      const stats = await getUsersStats();

      expect(stats.byRole.USER).toBe(2);
      expect(stats.byRole.MODERATOR).toBe(1);
      expect(stats.activeUsers).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getLoansStats', () => {
    it('should return loan statistics by status', async () => {
      spyOn(db.query.loans, 'findMany').mockResolvedValueOnce([
        { status: 'pending', returnedAt: null },
        { status: 'confirmed', returnedAt: null },
        { status: 'returned', returnedAt: new Date() }
      ] as any);

      const stats = await getLoansStats();

      expect(stats.byStatus.pending).toBe(1);
      expect(stats.byStatus.confirmed).toBe(1);
      expect(stats.byStatus.returned).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/admin/__tests__/analytics.test.ts`
Expected: FAIL - module not found

**Step 3: Implement analytics service**

Create: `src/services/admin/analytics.ts`

```typescript
import { db } from '../../db/index.js';
import { users, items, loans } from '../../db/schema.js';
import { eq, gte, and } from 'drizzle-orm';

export interface DashboardStats {
  summary: {
    totalUsers: number;
    activeUsers: number;
    totalItems: number;
    activeLoans: number;
    totalLoans: number;
  };
  trends: {
    newUsersLastWeek: number;
    newLoansLastWeek: number;
    returnRateLast30Days: number;
  };
}

export interface UserStats {
  byRole: Record<string, number>;
  activeUsers: number;
  blockedUsers: number;
  emailVerifiedCount: number;
}

export interface LoanStats {
  byStatus: Record<string, number>;
  averageLoanDuration: number;
  onTimeReturnRate: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get all users
  const allUsers = await db.query.users.findMany();

  // Get active items
  const allItems = await db.query.items.findMany({
    where: eq(items.isActive, true)
  });

  // Get all loans
  const allLoans = await db.query.loans.findMany();

  // Active loans (confirmed or pending, not returned)
  const activeLoans = allLoans.filter(
    loan => (loan.status === 'confirmed' || loan.status === 'pending') && !loan.returnedAt
  );

  // New users last week
  const newUsersLastWeek = allUsers.filter(
    user => user.createdAt && user.createdAt >= oneWeekAgo
  ).length;

  // New loans last week
  const newLoansLastWeek = allLoans.filter(
    loan => loan.createdAt && loan.createdAt >= oneWeekAgo
  ).length;

  // Return rate last 30 days
  const loansLast30Days = allLoans.filter(
    loan => loan.createdAt && loan.createdAt >= thirtyDaysAgo
  );
  const returnedLoans = loansLast30Days.filter(loan => loan.returnedAt);
  const returnRate = loansLast30Days.length > 0
    ? returnedLoans.length / loansLast30Days.length
    : 0;

  return {
    summary: {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter(u => u.isActive).length,
      totalItems: allItems.length,
      activeLoans: activeLoans.length,
      totalLoans: allLoans.length
    },
    trends: {
      newUsersLastWeek,
      newLoansLastWeek,
      returnRateLast30Days: Math.round(returnRate * 100) / 100
    }
  };
}

export async function getUsersStats(): Promise<UserStats> {
  const allUsers = await db.query.users.findMany();

  const byRole: Record<string, number> = {};
  let activeUsers = 0;
  let blockedUsers = 0;
  let emailVerifiedCount = 0;

  for (const user of allUsers) {
    byRole[user.role] = (byRole[user.role] || 0) + 1;
    if (user.isActive) activeUsers++;
    if (user.blockedAt) blockedUsers++;
    if (user.emailVerified) emailVerifiedCount++;
  }

  return {
    byRole,
    activeUsers,
    blockedUsers,
    emailVerifiedCount
  };
}

export async function getLoansStats(): Promise<LoanStats> {
  const allLoans = await db.query.loans.findMany();

  const byStatus: Record<string, number> = {};
  let totalDuration = 0;
  let loansWithDuration = 0;

  for (const loan of allLoans) {
    byStatus[loan.status] = (byStatus[loan.status] || 0) + 1;

    if (loan.returnedAt && loan.createdAt) {
      const duration = loan.returnedAt.getTime() - loan.createdAt.getTime();
      totalDuration += duration;
      loansWithDuration++;
    }
  }

  const averageLoanDuration = loansWithDuration > 0
    ? Math.round(totalDuration / loansWithDuration / (1000 * 60 * 60 * 24)) // Convert to days
    : 0;

  // Calculate on-time return rate (simplified - would need expectedReturnDate)
  const onTimeReturnRate = 0.85; // Placeholder

  return {
    byStatus,
    averageLoanDuration,
    onTimeReturnRate
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/admin/__tests__/analytics.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/admin/analytics.ts src/services/admin/__tests__/analytics.test.ts
git commit -m "feat(admin): add analytics service for dashboard stats"
```

---

### Task 11: Create User Management Service

**Files:**
- Create: `src/services/admin/index.ts`
- Create: `src/services/admin/__tests__/admin.test.ts`

**Step 1: Write failing tests for user management**

Create: `src/services/admin/__tests__/admin.test.ts`

```typescript
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import { adminAuditLog } from '../../../db/schema.js';
import {
  listUsers,
  getUserDetails,
  blockUser,
  unblockUser,
  logAdminAction
} from '../index.js';

describe('Admin User Management Service', () => {
  beforeEach(() => {
    // Reset mocks
  });

  describe('listUsers', () => {
    it('should return paginated users with masked data', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          emailEncrypted: 'encrypted-email',
          nameEncrypted: 'encrypted-name',
          role: 'USER',
          isActive: true,
          emailVerified: true,
          createdAt: new Date()
        }
      ];

      spyOn(db.query.users, 'findMany').mockResolvedValueOnce(mockUsers as any);
      spyOn(db.select, 'from').mockReturnValue({
        then: (cb: any) => cb([{ count: 1 }])
      } as any);

      const result = await listUsers({ page: 1, limit: 50 });

      expect(result.users).toHaveLength(1);
      expect(result.users[0].email).toContain('***');
      expect(result.users[0].name).toContain('***');
      expect(result.pagination.total).toBe(1);
    });

    it('should filter by role', async () => {
      spyOn(db.query.users, 'findMany').mockResolvedValueOnce([]);
      spyOn(db.select, 'from').mockReturnValue({
        then: (cb: any) => cb([{ count: 0 }])
      } as any);

      const result = await listUsers({ page: 1, limit: 50, role: 'MODERATOR' });

      expect(result.users).toHaveLength(0);
    });
  });

  describe('getUserDetails', () => {
    it('should return user details with masked PII', async () => {
      const mockUser = {
        id: 'user-1',
        emailEncrypted: 'encrypted',
        nameEncrypted: 'encrypted',
        role: 'USER',
        isActive: true,
        lentLoans: [],
        borrowedLoans: []
      };

      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(mockUser as any);

      const result = await getUserDetails('user-1');

      expect(result).toBeDefined();
      expect(result?.email).toContain('***');
      expect(result?.name).toContain('***');
    });

    it('should return null if user not found', async () => {
      spyOn(db.query.users, 'findFirst').mockResolvedValueOnce(null);

      const result = await getUserDetails('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('blockUser', () => {
    it('should block user and create audit log', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) }))
      } as any);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve())
      } as any);

      await blockUser('user-1', 'admin-1', 'Spam behavior', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
    });
  });

  describe('unblockUser', () => {
    it('should unblock user and create audit log', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) }))
      } as any);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve())
      } as any);

      await unblockUser('user-1', 'admin-1', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
    });
  });

  describe('logAdminAction', () => {
    it('should create audit log entry', async () => {
      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve())
      } as any);

      await logAdminAction({
        adminId: 'admin-1',
        action: 'user_blocked',
        targetType: 'user',
        targetId: 'user-1',
        metadata: { reason: 'Test' },
        ipAddress: '192.168.1.1'
      });

      expect(insertSpy).toHaveBeenCalledWith(adminAuditLog);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/admin/__tests__/admin.test.ts`
Expected: FAIL - functions not found

**Step 3: Implement user management service**

Create: `src/services/admin/index.ts`

```typescript
import { db } from '../../db/index.js';
import { users, adminAuditLog, loans, items } from '../../db/schema.js';
import { eq, like, and, desc, asc, sql } from 'drizzle-orm';
import { decrypt } from '../crypto/index.js';
import { maskEmail, maskName } from './helpers.js';
import type { UserRole } from '../../plugins/rbac.js';

export interface ListUsersParams {
  page: number;
  limit: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  sortBy?: 'createdAt' | 'lastActivity';
  sortOrder?: 'asc' | 'desc';
}

export interface MaskedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  loansAsLender: number;
  loansAsBorrower: number;
  itemsCount: number;
  createdAt: Date;
  lastActivityAt?: Date;
}

export async function listUsers(params: ListUsersParams) {
  const { page, limit, search, role, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [];
  if (role) conditions.push(eq(users.role, role));
  if (isActive !== undefined) conditions.push(eq(users.isActive, isActive));

  // Get users with relations
  const allUsers = await db.query.users.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      lentLoans: true,
      borrowedLoans: true,
      items: true
    },
    limit,
    offset,
    orderBy: sortOrder === 'desc' ? [desc(users[sortBy])] : [asc(users[sortBy])]
  });

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  // Decrypt and mask user data
  const maskedUsers: MaskedUser[] = allUsers.map(user => {
    const emailPlain = decrypt(user.emailEncrypted);
    const namePlain = decrypt(user.nameEncrypted);

    return {
      id: user.id,
      email: maskEmail(emailPlain),
      name: maskName(namePlain),
      role: user.role as UserRole,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      loansAsLender: user.lentLoans?.length || 0,
      loansAsBorrower: user.borrowedLoans?.length || 0,
      itemsCount: user.items?.length || 0,
      createdAt: user.createdAt!,
      lastActivityAt: user.updatedAt || undefined
    };
  });

  return {
    users: maskedUsers,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit)
    }
  };
}

export async function getUserDetails(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      lentLoans: {
        with: { item: true, borrower: true }
      },
      borrowedLoans: {
        with: { item: true, lender: true }
      },
      items: true
    }
  });

  if (!user) return null;

  const emailPlain = decrypt(user.emailEncrypted);
  const namePlain = decrypt(user.nameEncrypted);

  return {
    id: user.id,
    email: maskEmail(emailPlain),
    name: maskName(namePlain),
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    blockedAt: user.blockedAt,
    blockedReason: user.blockedReason,
    lentLoans: user.lentLoans || [],
    borrowedLoans: user.borrowedLoans || [],
    items: user.items || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export async function blockUser(
  userId: string,
  adminId: string,
  reason: string,
  ipAddress?: string
) {
  const now = new Date();

  await db
    .update(users)
    .set({
      isActive: false,
      blockedAt: now,
      blockedReason: reason
    })
    .where(eq(users.id, userId));

  await logAdminAction({
    adminId,
    action: 'user_blocked',
    targetType: 'user',
    targetId: userId,
    metadata: { reason },
    ipAddress
  });
}

export async function unblockUser(
  userId: string,
  adminId: string,
  ipAddress?: string
) {
  await db
    .update(users)
    .set({
      isActive: true,
      blockedAt: null,
      blockedReason: null
    })
    .where(eq(users.id, userId));

  await logAdminAction({
    adminId,
    action: 'user_unblocked',
    targetType: 'user',
    targetId: userId,
    ipAddress
  });
}

export async function deleteUser(
  userId: string,
  adminId: string,
  reason: string,
  ipAddress?: string
) {
  const now = new Date();

  await db
    .update(users)
    .set({
      deletedAt: now,
      deletionStatus: 'completed',
      deletionReason: reason,
      isActive: false
    })
    .where(eq(users.id, userId));

  await logAdminAction({
    adminId,
    action: 'user_deleted',
    targetType: 'user',
    targetId: userId,
    metadata: { reason },
    ipAddress
  });
}

export async function logAdminAction(params: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  await db.insert(adminAuditLog).values({
    adminId: params.adminId,
    action: params.action as any,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent
  });
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/admin/__tests__/admin.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/admin/index.ts src/services/admin/__tests__/admin.test.ts
git commit -m "feat(admin): add user management service with masking"
```

---

### Task 12: Create Moderation Service

**Files:**
- Create: `src/services/admin/moderation.ts`
- Create: `src/services/admin/__tests__/moderation.test.ts`

**Step 1: Write failing tests**

Create: `src/services/admin/__tests__/moderation.test.ts`

```typescript
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import {
  getItemDetails,
  removeItem,
  getLoanDetails,
  cancelLoan
} from '../moderation.js';

describe('Moderation Service', () => {
  describe('getItemDetails', () => {
    it('should return item with loans history and owner info', async () => {
      const mockItem = {
        id: 'item-1',
        name: 'Test Item',
        owner: {
          id: 'user-1',
          emailEncrypted: 'enc',
          nameEncrypted: 'enc'
        },
        loans: []
      };

      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(mockItem as any);

      const result = await getItemDetails('item-1');

      expect(result).toBeDefined();
      expect(result?.owner.email).toContain('***');
    });

    it('should return null if item not found', async () => {
      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(null);

      const result = await getItemDetails('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('removeItem', () => {
    it('should soft delete item and log action', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) }))
      } as any);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve())
      } as any);

      await removeItem('item-1', 'admin-1', 'Inappropriate content', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
    });
  });

  describe('getLoanDetails', () => {
    it('should return loan with lender and borrower info', async () => {
      const mockLoan = {
        id: 'loan-1',
        item: { name: 'Test Item' },
        lender: { emailEncrypted: 'enc', nameEncrypted: 'enc' },
        borrower: { emailEncrypted: 'enc', nameEncrypted: 'enc' }
      };

      spyOn(db.query.loans, 'findFirst').mockResolvedValueOnce(mockLoan as any);

      const result = await getLoanDetails('loan-1');

      expect(result).toBeDefined();
      expect(result?.lender.email).toContain('***');
      expect(result?.borrower.email).toContain('***');
    });
  });

  describe('cancelLoan', () => {
    it('should cancel loan and log action', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) }))
      } as any);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve())
      } as any);

      await cancelLoan('loan-1', 'admin-1', 'Fraudulent loan', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/admin/__tests__/moderation.test.ts`
Expected: FAIL

**Step 3: Implement moderation service**

Create: `src/services/admin/moderation.ts`

```typescript
import { db } from '../../db/index.js';
import { items, loans, adminAuditLog } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { decrypt } from '../crypto/index.js';
import { maskEmail, maskName } from './helpers.js';
import { logAdminAction } from './index.js';

export async function getItemDetails(itemId: string) {
  const item = await db.query.items.findFirst({
    where: eq(items.id, itemId),
    with: {
      owner: true,
      loans: {
        with: {
          borrower: true
        }
      }
    }
  });

  if (!item) return null;

  const ownerEmail = decrypt(item.owner.emailEncrypted);
  const ownerName = decrypt(item.owner.nameEncrypted);

  return {
    ...item,
    owner: {
      id: item.owner.id,
      email: maskEmail(ownerEmail),
      name: maskName(ownerName)
    },
    loans: item.loans.map(loan => ({
      ...loan,
      borrower: loan.borrower ? {
        id: loan.borrower.id,
        email: maskEmail(decrypt(loan.borrower.emailEncrypted)),
        name: maskName(decrypt(loan.borrower.nameEncrypted))
      } : null
    }))
  };
}

export async function removeItem(
  itemId: string,
  adminId: string,
  reason: string,
  ipAddress?: string
) {
  // Soft delete - set isActive to false
  await db
    .update(items)
    .set({ isActive: false })
    .where(eq(items.id, itemId));

  await logAdminAction({
    adminId,
    action: 'item_removed',
    targetType: 'item',
    targetId: itemId,
    metadata: { reason },
    ipAddress
  });
}

export async function getLoanDetails(loanId: string) {
  const loan = await db.query.loans.findFirst({
    where: eq(loans.id, loanId),
    with: {
      item: true,
      lender: true,
      borrower: true
    }
  });

  if (!loan) return null;

  return {
    ...loan,
    lender: {
      id: loan.lender.id,
      email: maskEmail(decrypt(loan.lender.emailEncrypted)),
      name: maskName(decrypt(loan.lender.nameEncrypted))
    },
    borrower: loan.borrower ? {
      id: loan.borrower.id,
      email: maskEmail(decrypt(loan.borrower.emailEncrypted)),
      name: maskName(decrypt(loan.borrower.nameEncrypted))
    } : null
  };
}

export async function cancelLoan(
  loanId: string,
  adminId: string,
  reason: string,
  ipAddress?: string
) {
  await db
    .update(loans)
    .set({ status: 'cancelled' })
    .where(eq(loans.id, loanId));

  await logAdminAction({
    adminId,
    action: 'loan_cancelled',
    targetType: 'loan',
    targetId: loanId,
    metadata: { reason },
    ipAddress
  });
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/admin/__tests__/moderation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/admin/moderation.ts src/services/admin/__tests__/moderation.test.ts
git commit -m "feat(admin): add moderation service for items and loans"
```

---

### Task 13: Create Admin Management Service

**Files:**
- Create: `src/services/admin/admins.ts`
- Create: `src/services/admin/__tests__/admins.test.ts`

**Step 1: Write failing tests**

Create: `src/services/admin/__tests__/admins.test.ts`

```typescript
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { db } from '../../../db/index.js';
import {
  listAdmins,
  promoteToAdmin,
  changeAdminRole,
  removeAdmin,
  getAuditLog
} from '../admins.js';

describe('Admin Management Service', () => {
  describe('listAdmins', () => {
    it('should return all non-USER roles', async () => {
      const mockAdmins = [
        { id: '1', role: 'SUPER_ADMIN', emailEncrypted: 'enc', nameEncrypted: 'enc' },
        { id: '2', role: 'MODERATOR', emailEncrypted: 'enc', nameEncrypted: 'enc' }
      ];

      spyOn(db.query.users, 'findMany').mockResolvedValueOnce(mockAdmins as any);

      const admins = await listAdmins();

      expect(admins).toHaveLength(2);
      expect(admins[0].role).toBe('SUPER_ADMIN');
    });
  });

  describe('promoteToAdmin', () => {
    it('should update user role and log action', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) }))
      } as any);

      const insertSpy = spyOn(db, 'insert').mockReturnValue({
        values: mock(() => Promise.resolve())
      } as any);

      await promoteToAdmin('user-1', 'MODERATOR', 'admin-1', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
    });
  });

  describe('changeAdminRole', () => {
    it('should change admin role and log action', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) }))
      } as any);

      await changeAdminRole('admin-1', 'SUPER_ADMIN', 'super-admin', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('removeAdmin', () => {
    it('should demote admin to USER role and log action', async () => {
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: mock(() => ({ where: mock(() => Promise.resolve()) }))
      } as any);

      await removeAdmin('admin-1', 'super-admin', '192.168.1.1');

      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('getAuditLog', () => {
    it('should return paginated audit log with admin details', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'user_blocked',
          admin: { emailEncrypted: 'enc', nameEncrypted: 'enc' },
          createdAt: new Date()
        }
      ];

      spyOn(db.query.adminAuditLog, 'findMany').mockResolvedValueOnce(mockLogs as any);

      const result = await getAuditLog({ page: 1, limit: 50 });

      expect(result.logs).toHaveLength(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/admin/__tests__/admins.test.ts`
Expected: FAIL

**Step 3: Implement admin management service**

Create: `src/services/admin/admins.ts`

```typescript
import { db } from '../../db/index.js';
import { users, adminAuditLog } from '../../db/schema.js';
import { eq, ne, desc } from 'drizzle-orm';
import { decrypt } from '../crypto/index.js';
import { maskEmail, maskName } from './helpers.js';
import { logAdminAction } from './index.js';
import type { UserRole } from '../../plugins/rbac.js';

export async function listAdmins() {
  const admins = await db.query.users.findMany({
    where: ne(users.role, 'USER')
  });

  return admins.map(admin => ({
    id: admin.id,
    email: maskEmail(decrypt(admin.emailEncrypted)),
    name: maskName(decrypt(admin.nameEncrypted)),
    role: admin.role as UserRole,
    isActive: admin.isActive,
    createdAt: admin.createdAt
  }));
}

export async function promoteToAdmin(
  userId: string,
  role: UserRole,
  adminId: string,
  ipAddress?: string
) {
  if (role === 'USER') {
    throw new Error('Cannot promote to USER role. Use removeAdmin instead.');
  }

  await db
    .update(users)
    .set({ role })
    .where(eq(users.id, userId));

  await logAdminAction({
    adminId,
    action: 'admin_created',
    targetType: 'user',
    targetId: userId,
    metadata: { newRole: role },
    ipAddress
  });
}

export async function changeAdminRole(
  userId: string,
  newRole: UserRole,
  adminId: string,
  ipAddress?: string
) {
  if (newRole === 'USER') {
    throw new Error('Cannot change to USER role. Use removeAdmin instead.');
  }

  await db
    .update(users)
    .set({ role: newRole })
    .where(eq(users.id, userId));

  await logAdminAction({
    adminId,
    action: 'admin_role_changed',
    targetType: 'user',
    targetId: userId,
    metadata: { newRole },
    ipAddress
  });
}

export async function removeAdmin(
  userId: string,
  adminId: string,
  ipAddress?: string
) {
  await db
    .update(users)
    .set({ role: 'USER' })
    .where(eq(users.id, userId));

  await logAdminAction({
    adminId,
    action: 'admin_removed',
    targetType: 'user',
    targetId: userId,
    ipAddress
  });
}

export async function getAuditLog(params: { page: number; limit: number }) {
  const { page, limit } = params;
  const offset = (page - 1) * limit;

  const logs = await db.query.adminAuditLog.findMany({
    with: {
      admin: true
    },
    limit,
    offset,
    orderBy: [desc(adminAuditLog.createdAt)]
  });

  return {
    logs: logs.map(log => ({
      ...log,
      admin: {
        id: log.admin.id,
        email: maskEmail(decrypt(log.admin.emailEncrypted)),
        name: maskName(decrypt(log.admin.nameEncrypted)),
        role: log.admin.role
      },
      metadata: log.metadata ? JSON.parse(log.metadata) : null
    })),
    pagination: {
      page,
      limit
    }
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/admin/__tests__/admins.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/admin/admins.ts src/services/admin/__tests__/admins.test.ts
git commit -m "feat(admin): add admin management service with role changes"
```

---

## Phase 3: API Routes

### Task 14: Create Admin Zod Schemas

**Files:**
- Create: `src/schemas/admin.ts`

**Step 1: Write schema tests**

Create: `src/schemas/__tests__/admin.test.ts`

```typescript
import { describe, expect, it } from 'bun:test';
import {
  listUsersSchema,
  blockUserSchema,
  promoteAdminSchema,
  changeRoleSchema,
  removeContentSchema
} from '../admin.js';

describe('Admin Schemas', () => {
  describe('listUsersSchema', () => {
    it('should parse valid query params', () => {
      const result = listUsersSchema.parse({
        page: '1',
        limit: '50',
        role: 'MODERATOR'
      });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.role).toBe('MODERATOR');
    });

    it('should use defaults for missing params', () => {
      const result = listUsersSchema.parse({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.sortBy).toBe('createdAt');
      expect(result.sortOrder).toBe('desc');
    });

    it('should enforce max limit of 100', () => {
      const result = listUsersSchema.parse({ limit: '200' });
      expect(result.limit).toBeLessThanOrEqual(100);
    });
  });

  describe('blockUserSchema', () => {
    it('should require reason with min 10 chars', () => {
      expect(() => blockUserSchema.parse({ reason: 'short' })).toThrow();
      expect(() => blockUserSchema.parse({ reason: 'This is a valid reason' })).not.toThrow();
    });
  });

  describe('promoteAdminSchema', () => {
    it('should validate userId as UUID', () => {
      expect(() => promoteAdminSchema.parse({ userId: 'not-uuid', role: 'MODERATOR' })).toThrow();
    });

    it('should reject USER role', () => {
      expect(() => promoteAdminSchema.parse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'USER'
      })).toThrow();
    });
  });
});
```

**Step 2: Implement schemas**

Create: `src/schemas/admin.ts`

```typescript
import { z } from 'zod';

export const roleSchema = z.enum(['USER', 'ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']);

export const adminRoleSchema = z.enum(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']);

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  role: roleSchema.optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z.enum(['createdAt', 'lastActivity']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export const blockUserSchema = z.object({
  reason: z.string().min(10, 'Motivo deve ter no mínimo 10 caracteres')
});

export const deleteUserSchema = z.object({
  reason: z.string().min(10, 'Motivo deve ter no mínimo 10 caracteres')
});

export const removeContentSchema = z.object({
  reason: z.string().min(10, 'Motivo deve ter no mínimo 10 caracteres')
});

export const promoteAdminSchema = z.object({
  userId: z.string().uuid('ID de usuário inválido'),
  role: adminRoleSchema
});

export const changeRoleSchema = z.object({
  role: adminRoleSchema
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  adminId: z.string().uuid().optional()
});
```

**Step 3: Run schema tests**

Run: `bun test src/schemas/__tests__/admin.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/schemas/admin.ts src/schemas/__tests__/admin.test.ts
git commit -m "feat(schemas): add Zod schemas for admin endpoints"
```

---

### Task 15: Create Analytics Routes

**Files:**
- Create: `src/routes/admin/analytics.ts`

**Step 1: Implement analytics routes**

Create: `src/routes/admin/analytics.ts`

```typescript
import type { FastifyInstance } from 'fastify';
import { getDashboardStats, getUsersStats, getLoansStats } from '../../services/admin/analytics.js';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  // GET /api/admin/analytics/dashboard
  fastify.get('/dashboard', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const stats = await getDashboardStats();
    return stats;
  });

  // GET /api/admin/analytics/users/stats
  fastify.get('/users/stats', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const stats = await getUsersStats();
    return stats;
  });

  // GET /api/admin/analytics/loans/stats
  fastify.get('/loans/stats', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const stats = await getLoansStats();
    return stats;
  });
}
```

**Step 2: Test routes with Fastify inject**

Create: `src/routes/admin/__tests__/analytics.test.ts`

```typescript
import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import jwtPlugin from '../../../plugins/jwt.js';
import rbacPlugin from '../../../plugins/rbac.js';
import analyticsRoutes from '../analytics.js';
import * as analyticsService from '../../../services/admin/analytics.js';

describe('Analytics Routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(rbacPlugin);
    await app.register(analyticsRoutes, { prefix: '/api/admin/analytics' });
    await app.ready();

    token = (app as any).signAccessToken('admin-user', 'ANALYST');
  });

  it('GET /dashboard should return dashboard stats', async () => {
    spyOn(analyticsService, 'getDashboardStats').mockResolvedValueOnce({
      summary: { totalUsers: 100, activeUsers: 80, totalItems: 50, activeLoans: 10, totalLoans: 200 },
      trends: { newUsersLastWeek: 5, newLoansLastWeek: 15, returnRateLast30Days: 0.85 }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/dashboard',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.summary.totalUsers).toBe(100);
  });

  it('should reject USER role', async () => {
    const userToken = (app as any).signAccessToken('regular-user', 'USER');

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics/dashboard',
      headers: { authorization: `Bearer ${userToken}` }
    });

    expect(response.statusCode).toBe(403);
  });
});
```

**Step 3: Run route tests**

Run: `bun test src/routes/admin/__tests__/analytics.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/routes/admin/analytics.ts src/routes/admin/__tests__/analytics.test.ts
git commit -m "feat(routes): add analytics admin routes"
```

---

### Task 16: Create User Management Routes

**Files:**
- Create: `src/routes/admin/users.ts`

**Step 1: Implement user routes**

Create: `src/routes/admin/users.ts`

```typescript
import type { FastifyInstance } from 'fastify';
import { listUsersSchema, blockUserSchema, deleteUserSchema } from '../../schemas/admin.js';
import {
  listUsers,
  getUserDetails,
  blockUser,
  unblockUser
} from '../../services/admin/index.js';
import { getClientIp } from '../../services/admin/helpers.js';

export default async function userRoutes(fastify: FastifyInstance) {
  // GET /api/admin/users
  fastify.get('/', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const params = listUsersSchema.parse(request.query);
    return await listUsers(params);
  });

  // GET /api/admin/users/:id
  fastify.get('/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = await getUserDetails(id);

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return user;
  });

  // POST /api/admin/users/:id/block
  fastify.post('/:id/block', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole('SUPER_ADMIN')
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = blockUserSchema.parse(request.body);
    const adminId = request.user!.userId;
    const ipAddress = getClientIp(request);

    await blockUser(id, adminId, reason, ipAddress);

    return { success: true, message: 'User blocked successfully' };
  });

  // POST /api/admin/users/:id/unblock
  fastify.post('/:id/unblock', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole('SUPER_ADMIN')
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adminId = request.user!.userId;
    const ipAddress = getClientIp(request);

    await unblockUser(id, adminId, ipAddress);

    return { success: true, message: 'User unblocked successfully' };
  });

  // DELETE /api/admin/users/:id
  fastify.delete('/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole('SUPER_ADMIN')
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = deleteUserSchema.parse(request.body);
    const adminId = request.user!.userId;
    const ipAddress = getClientIp(request);

    await deleteUser(id, adminId, reason, ipAddress);

    return { success: true, message: 'User deleted successfully' };
  });
}
```

**Step 2: Create route tests**

Create: `src/routes/admin/__tests__/users.test.ts`

```typescript
import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import jwtPlugin from '../../../plugins/jwt.js';
import rbacPlugin from '../../../plugins/rbac.js';
import userRoutes from '../users.js';
import * as adminService from '../../../services/admin/index.js';

describe('Admin User Routes', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let analystToken: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(rbacPlugin);
    await app.register(userRoutes, { prefix: '/api/admin/users' });
    await app.ready();

    superAdminToken = (app as any).signAccessToken('super-admin', 'SUPER_ADMIN');
    analystToken = (app as any).signAccessToken('analyst', 'ANALYST');
  });

  it('GET / should list users', async () => {
    spyOn(adminService, 'listUsers').mockResolvedValueOnce({
      users: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${analystToken}` }
    });

    expect(response.statusCode).toBe(200);
  });

  it('POST /:id/block should require SUPER_ADMIN', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/user-123/block',
      headers: { authorization: `Bearer ${analystToken}` },
      payload: { reason: 'Test reason for blocking' }
    });

    expect(response.statusCode).toBe(403);
  });

  it('POST /:id/block should block user as SUPER_ADMIN', async () => {
    spyOn(adminService, 'blockUser').mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/user-123/block',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { reason: 'Valid reason for blocking user' }
    });

    expect(response.statusCode).toBe(200);
  });
});
```

**Step 3: Run tests**

Run: `bun test src/routes/admin/__tests__/users.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/routes/admin/users.ts src/routes/admin/__tests__/users.test.ts
git commit -m "feat(routes): add user management admin routes"
```

---

### Task 17: Create Moderation Routes

**Files:**
- Create: `src/routes/admin/moderation.ts`

**Step 1: Implement moderation routes**

Create: `src/routes/admin/moderation.ts`

```typescript
import type { FastifyInstance } from 'fastify';
import { removeContentSchema } from '../../schemas/admin.js';
import {
  getItemDetails,
  removeItem,
  getLoanDetails,
  cancelLoan
} from '../../services/admin/moderation.js';
import { getClientIp } from '../../services/admin/helpers.js';

export default async function moderationRoutes(fastify: FastifyInstance) {
  // GET /api/admin/moderation/items/:id
  fastify.get('/items/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getItemDetails(id);

    if (!item) {
      return reply.code(404).send({ error: 'Item not found' });
    }

    return item;
  });

  // DELETE /api/admin/moderation/items/:id
  fastify.delete('/items/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = removeContentSchema.parse(request.body);
    const adminId = request.user!.userId;
    const ipAddress = getClientIp(request);

    await removeItem(id, adminId, reason, ipAddress);

    return { success: true, message: 'Item removed successfully' };
  });

  // GET /api/admin/moderation/loans/:id
  fastify.get('/loans/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const loan = await getLoanDetails(id);

    if (!loan) {
      return reply.code(404).send({ error: 'Loan not found' });
    }

    return loan;
  });

  // POST /api/admin/moderation/loans/:id/cancel
  fastify.post('/loans/:id/cancel', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole(['MODERATOR', 'SUPER_ADMIN'])
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = removeContentSchema.parse(request.body);
    const adminId = request.user!.userId;
    const ipAddress = getClientIp(request);

    await cancelLoan(id, adminId, reason, ipAddress);

    return { success: true, message: 'Loan cancelled successfully' };
  });
}
```

**Step 2: Commit**

```bash
git add src/routes/admin/moderation.ts
git commit -m "feat(routes): add moderation admin routes"
```

---

### Task 18: Create Admin Management Routes

**Files:**
- Create: `src/routes/admin/admins.ts`

**Step 1: Implement admin management routes**

Create: `src/routes/admin/admins.ts`

```typescript
import type { FastifyInstance } from 'fastify';
import { promoteAdminSchema, changeRoleSchema, auditLogQuerySchema } from '../../schemas/admin.js';
import {
  listAdmins,
  promoteToAdmin,
  changeAdminRole,
  removeAdmin,
  getAuditLog
} from '../../services/admin/admins.js';
import { getClientIp } from '../../services/admin/helpers.js';

export default async function adminsRoutes(fastify: FastifyInstance) {
  // GET /api/admin/admins
  fastify.get('/', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole('SUPER_ADMIN')
    ]
  }, async (request, reply) => {
    return await listAdmins();
  });

  // POST /api/admin/admins
  fastify.post('/', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole('SUPER_ADMIN')
    ]
  }, async (request, reply) => {
    const { userId, role } = promoteAdminSchema.parse(request.body);
    const adminId = request.user!.userId;
    const ipAddress = getClientIp(request);

    await promoteToAdmin(userId, role, adminId, ipAddress);

    return { success: true, message: 'User promoted to admin' };
  });

  // PATCH /api/admin/admins/:id/role
  fastify.patch('/:id/role', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole('SUPER_ADMIN')
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { role } = changeRoleSchema.parse(request.body);
    const adminId = request.user!.userId;
    const ipAddress = getClientIp(request);

    await changeAdminRole(id, role, adminId, ipAddress);

    return { success: true, message: 'Admin role changed' };
  });

  // DELETE /api/admin/admins/:id
  fastify.delete('/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole('SUPER_ADMIN')
    ]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adminId = request.user!.userId;
    const ipAddress = getClientIp(request);

    await removeAdmin(id, adminId, ipAddress);

    return { success: true, message: 'Admin removed' };
  });

  // GET /api/admin/admins/audit-log
  fastify.get('/audit-log', {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole('SUPER_ADMIN')
    ]
  }, async (request, reply) => {
    const params = auditLogQuerySchema.parse(request.query);
    return await getAuditLog(params);
  });
}
```

**Step 2: Commit**

```bash
git add src/routes/admin/admins.ts
git commit -m "feat(routes): add admin management routes"
```

---

### Task 19: Register All Admin Routes in App

**Files:**
- Modify: `src/app.ts`

**Step 1: Import and register admin routes**

In `src/app.ts`, after existing route registrations:

```typescript
import analyticsRoutes from './routes/admin/analytics.js';
import adminUsersRoutes from './routes/admin/users.js';
import moderationRoutes from './routes/admin/moderation.js';
import adminsRoutes from './routes/admin/admins.js';

// ... existing code ...

// Admin routes
await app.register(analyticsRoutes, { prefix: '/api/admin/analytics' });
await app.register(adminUsersRoutes, { prefix: '/api/admin/users' });
await app.register(moderationRoutes, { prefix: '/api/admin/moderation' });
await app.register(adminsRoutes, { prefix: '/api/admin/admins' });
```

**Step 2: Test server startup**

Run: `bun run dev`
Expected: Server starts successfully, admin routes registered

**Step 3: Commit**

```bash
git add src/app.ts
git commit -m "feat(app): register all admin routes"
```

---

## Phase 4: Quality Assurance & Documentation

### Task 20: Run Complete Test Suite

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 2: Check test coverage**

Run: `bun test --coverage`
Expected: >80% coverage for services

**Step 3: Fix any failing tests**

If tests fail, debug and fix issues

**Step 4: Commit fixes if any**

```bash
git add .
git commit -m "test: ensure all admin tests pass"
```

---

### Task 21: Run QA Checks

**Step 1: Run TypeScript check**

Run: `bun run typecheck`
Expected: No TypeScript errors

**Step 2: Run Biome linting**

Run: `bun run check`
Expected: No lint errors

**Step 3: Auto-fix issues**

Run: `bun run check:fix`

**Step 4: Run full QA**

Run: `bun run qa`
Expected: Clean pass

**Step 5: Commit any auto-fixes**

```bash
git add .
git commit -m "chore: fix linting and formatting issues"
```

---

### Task 22: Test Admin Endpoints Manually

**Step 1: Create first SUPER_ADMIN**

Run: `bun run admin:create`
Input test credentials

**Step 2: Test authentication**

Use REST client (Thunder Client, Postman, or curl):

```bash
# Login to get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com", "password": "YourPassword"}'
```

**Step 3: Test analytics endpoint**

```bash
curl -X GET http://localhost:3000/api/admin/analytics/dashboard \
  -H "Authorization: Bearer <token>"
```

Expected: Dashboard stats returned

**Step 4: Test user listing**

```bash
curl -X GET "http://localhost:3000/api/admin/users?limit=10" \
  -H "Authorization: Bearer <token>"
```

Expected: Paginated users with masked data

**Step 5: Document any issues found**

Create GitHub issues or fix immediately

---

### Task 23: Update Project Documentation

**Step 1: Update CLAUDE.md**

In `CLAUDE.md`, add section about admin system:

```markdown
## Admin System

RBAC with 5 roles: USER, ANALYST, SUPPORT, MODERATOR, SUPER_ADMIN

**Create first admin:**
```bash
bun run admin:create
```

**Admin routes:** `/api/admin/*`
**Full docs:** See `docs/plans/003-admin-backoffice/design.md`
```

**Step 2: Update README.md**

Add admin setup instructions

**Step 3: Commit documentation**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add admin system documentation"
```

---

### Task 24: Create Admin User Guide

**Step 1: Create user guide**

Create: `docs/admin-user-guide.md`

```markdown
# TáComQuem Admin User Guide

## Getting Started

### Creating Your First Admin

Run: `bun run admin:create`

Provide email, password (min 8 chars), and full name.

## Role Permissions

... (copy from design.md)

## Common Tasks

### Blocking a User
1. GET /api/admin/users to find user
2. POST /api/admin/users/:id/block with reason

... (add more examples)
```

**Step 2: Commit guide**

```bash
git add docs/admin-user-guide.md
git commit -m "docs: add admin user guide"
```

---

### Task 25: Final Integration Test

**Step 1: Full workflow test**

1. Create SUPER_ADMIN via CLI
2. Login via API
3. View dashboard
4. List users
5. Block a user
6. Promote user to MODERATOR
7. Check audit log
8. Verify all actions logged

**Step 2: Document test results**

Create: `docs/admin-test-results.md`

**Step 3: Final commit**

```bash
git add .
git commit -m "feat(admin): complete admin and backoffice system"
```

---

## Execution Options

Plan complete and saved to `docs/plans/003-admin-backoffice/implementation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
