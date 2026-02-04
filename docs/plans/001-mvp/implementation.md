# TáComQuem MVP — Plano de Implementação

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Construir o backend completo do MVP para gestão de empréstimos pessoais.

**Architecture:** API REST com Fastify + TypeScript rodando em Bun. Autenticação stateless via JWT. PostgreSQL com Drizzle ORM (driver nativo Bun SQL). Criptografia de dados sensíveis para LGPD.

**Tech Stack:** Bun 1.3+, TypeScript, Fastify, Drizzle ORM (bun-sql), PostgreSQL, Zod, JWT, Bun.password (bcrypt nativo)

**Referências de Documentação:**
- [Bun Docs](https://bun.com/docs)
- [Bun.password API](https://bun.com/docs/api/hashing)
- [Bun Test Runner](https://bun.com/docs/test)
- [Drizzle ORM + Bun SQL](https://orm.drizzle.team/docs/connect-bun-sql)
- [Fastify](https://fastify.dev/)

---

## Fase 1: Setup do Projeto

### Task 1.1: Inicializar projeto Bun

**Files:**
- Create: `package.json`
- Create: `.gitignore`

**Step 1: Inicializar com bun init**

```bash
cd /Users/fernando/Workspace/maverick/play/mvp/ta_com_quem
bun init -y
```

**Step 2: Atualizar .gitignore**

```gitignore
# Dependencies
node_modules/

# Build
dist/

# Environment
.env
.env.local
.env.*.local

# Logs
logs/
*.log

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Test
coverage/

# Drizzle
drizzle/meta/

# Bun
bun.lockb
```

**Step 3: Commit**

```bash
git add package.json .gitignore tsconfig.json
git commit -m "chore: initialize bun project"
```

---

### Task 1.2: Instalar dependências do Fastify

**Step 1: Adicionar Fastify e plugins**

```bash
bun add fastify @fastify/cors @fastify/jwt @fastify/cookie @fastify/rate-limit
```

**Step 2: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add fastify dependencies"
```

---

### Task 1.3: Instalar dependências do Drizzle e banco

**Step 1: Adicionar Drizzle ORM com driver nativo Bun**

```bash
bun add drizzle-orm
bun add -d drizzle-kit
```

**Step 2: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add drizzle orm dependencies"
```

---

### Task 1.4: Instalar dependências utilitárias

**Step 1: Adicionar Zod, nanoid e fastify-plugin**

```bash
bun add zod nanoid@3 fastify-plugin
```

**Step 2: Adicionar dependências de desenvolvimento**

```bash
bun add -d @types/bun @faker-js/faker prettier
```

**Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add utility dependencies"
```

---

### Task 1.5: Configurar scripts do package.json

**Files:**
- Modify: `package.json`

**Step 1: Atualizar scripts em package.json**

Editar package.json para incluir scripts:

```json
{
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "db:generate": "bunx drizzle-kit generate",
    "db:migrate": "bun src/db/migrate.ts",
    "db:studio": "bunx drizzle-kit studio",
    "format": "prettier --write \"src/**/*.ts\""
  }
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add bun scripts"
```

---

### Task 1.6: Configurar variáveis de ambiente

**Files:**
- Create: `.env.example`
- Create: `src/config/env.ts`

**Step 1: Criar .env.example**

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_URL=postgres://user:password@localhost:5432/tacomquem

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Encryption (LGPD)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Email (Resend)
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=noreply@tacomquem.com

# Frontend
FRONTEND_URL=http://localhost:5173
```

**Step 2: Criar src/config/env.ts**

```typescript
import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Encryption
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes in hex

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URI: z.string().url(),

  // Email
  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string().email(),

  // Frontend
  FRONTEND_URL: z.string().url(),
});

const parsed = envSchema.safeParse(Bun.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
```

**Step 3: Commit**

```bash
git add .env.example src/config/env.ts
git commit -m "chore: add environment configuration"
```

---

### Task 1.7: Criar servidor Fastify básico

**Files:**
- Create: `src/index.ts`
- Create: `src/app.ts`

**Step 1: Criar src/app.ts**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // Plugins
  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
```

**Step 2: Criar src/index.ts**

```typescript
import { buildApp } from './app.js';
import { env } from './config/env.js';

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 Server running at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
```

**Step 3: Commit**

```bash
git add src/index.ts src/app.ts
git commit -m "feat: add basic fastify server with health check"
```

---

## Fase 2: Banco de Dados

### Task 2.1: Configurar conexão com PostgreSQL (Bun SQL nativo)

**Files:**
- Create: `src/db/index.ts`
- Create: `drizzle.config.ts`

**Step 1: Criar src/db/index.ts**

```typescript
import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';
import { env } from '../config/env.js';
import * as schema from './schema.js';

const client = new SQL(env.DATABASE_URL);
export const db = drizzle({ client, schema });
```

**Step 2: Criar drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Step 3: Commit**

```bash
git add src/db/index.ts drizzle.config.ts
git commit -m "feat: add database connection with bun sql driver"
```

---

### Task 2.2: Criar schema do banco

**Files:**
- Create: `src/db/schema.ts`

**Step 1: Criar src/db/schema.ts**

```typescript
import { pgTable, uuid, text, varchar, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const loanStatusEnum = pgEnum('loan_status', ['pending', 'confirmed', 'returned', 'cancelled']);
export const notificationTypeEnum = pgEnum('notification_type', ['loan_created', 'loan_confirmed', 'loan_reminder', 'loan_returned']);

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailEncrypted: text('email_encrypted').notNull(),
  nameEncrypted: text('name_encrypted').notNull(),
  emailHash: varchar('email_hash', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  avatarUrl: text('avatar_url'),
  emailVerified: boolean('email_verified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// OAuth Accounts
export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Items
export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  images: text('images').notNull().default('[]'), // JSON array of URLs
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Loans
export const loans = pgTable('loans', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  lenderId: uuid('lender_id').notNull().references(() => users.id),
  borrowerId: uuid('borrower_id').references(() => users.id),
  borrowerEmail: varchar('borrower_email', { length: 255 }),
  status: loanStatusEnum('status').notNull().default('pending'),
  expectedReturnDate: timestamp('expected_return_date'),
  lenderNotes: text('lender_notes'),
  borrowerNotes: text('borrower_notes'),
  confirmedAt: timestamp('confirmed_at'),
  returnedAt: timestamp('returned_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Loan Tokens
export const loanTokens = pgTable('loan_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  loanId: uuid('loan_id').notNull().references(() => loans.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Notifications
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  loanId: uuid('loan_id').references(() => loans.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  read: boolean('read').default(false).notNull(),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Verification Tokens (email verification, password reset)
export const verificationTokens = pgTable('verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  type: varchar('type', { length: 50 }).notNull(), // 'email_verification' | 'password_reset'
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  oauthAccounts: many(oauthAccounts),
  items: many(items),
  lentLoans: many(loans, { relationName: 'lender' }),
  borrowedLoans: many(loans, { relationName: 'borrower' }),
  notifications: many(notifications),
  verificationTokens: many(verificationTokens),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  owner: one(users, {
    fields: [items.ownerId],
    references: [users.id],
  }),
  loans: many(loans),
}));

export const loansRelations = relations(loans, ({ one, many }) => ({
  item: one(items, {
    fields: [loans.itemId],
    references: [items.id],
  }),
  lender: one(users, {
    fields: [loans.lenderId],
    references: [users.id],
    relationName: 'lender',
  }),
  borrower: one(users, {
    fields: [loans.borrowerId],
    references: [users.id],
    relationName: 'borrower',
  }),
  tokens: many(loanTokens),
  notifications: many(notifications),
}));

export const loanTokensRelations = relations(loanTokens, ({ one }) => ({
  loan: one(loans, {
    fields: [loanTokens.loanId],
    references: [loans.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  loan: one(loans, {
    fields: [notifications.loanId],
    references: [loans.id],
  }),
}));

export const verificationTokensRelations = relations(verificationTokens, ({ one }) => ({
  user: one(verificationTokens, {
    fields: [verificationTokens.userId],
    references: [users.id],
  }),
}));
```

**Step 2: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add complete database schema"
```

---

### Task 2.3: Criar script de migração

**Files:**
- Create: `src/db/migrate.ts`

**Step 1: Criar src/db/migrate.ts**

```typescript
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { SQL } from 'bun';

async function main() {
  const databaseUrl = Bun.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new SQL(databaseUrl);
  const db = drizzle({ client });

  console.log('🔄 Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('✅ Migrations complete!');

  client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
```

**Step 2: Gerar migrations**

```bash
bun run db:generate
```

**Step 3: Commit**

```bash
git add src/db/migrate.ts drizzle/
git commit -m "feat: add database migration script"
```

---

### Task 2.4: Adicionar health check do banco

**Files:**
- Modify: `src/app.ts`

**Step 1: Atualizar src/app.ts com health check do DB**

Adicionar import e rota:

```typescript
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';

// Dentro de buildApp(), após o health check existente:
app.get('/api/health/db', async () => {
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', database: 'connected' };
  } catch (error) {
    return { status: 'error', database: 'disconnected' };
  }
});
```

**Step 2: Commit**

```bash
git add src/app.ts
git commit -m "feat: add database health check endpoint"
```

---

## Fase 3: Serviços de Infraestrutura

### Task 3.1: Criar serviço de criptografia (LGPD)

**Files:**
- Create: `src/services/crypto.ts`
- Create: `src/services/crypto.test.ts`

**Step 1: Escrever o teste (usando bun:test)**

```typescript
// src/services/crypto.test.ts
import { describe, it, expect, beforeAll } from 'bun:test';
import { encrypt, decrypt, hash } from './crypto.js';

// Set test env vars
beforeAll(() => {
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

describe('crypto service', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const original = 'test@example.com';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(encrypted).not.toBe(original);
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertext for same input', () => {
      const text = 'same text';
      const encrypted1 = encrypt(text);
      const encrypted2 = encrypt(text);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('hash', () => {
    it('should produce consistent hash for same input', () => {
      const text = 'test@example.com';
      const hash1 = hash(text);
      const hash2 = hash(text);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different input', () => {
      const hash1 = hash('test1@example.com');
      const hash2 = hash('test2@example.com');

      expect(hash1).not.toBe(hash2);
    });
  });
});
```

**Step 2: Rodar teste para verificar que falha**

```bash
bun test src/services/crypto.test.ts
```

Expected: FAIL (module not found)

**Step 3: Implementar src/services/crypto.ts**

```typescript
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
  const key = Bun.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY not set');
  return Buffer.from(key, 'hex');
}

export function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function hash(text: string): string {
  return createHash('sha256').update(text.toLowerCase()).digest('hex');
}
```

**Step 4: Rodar teste para verificar que passa**

```bash
bun test src/services/crypto.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/crypto.ts src/services/crypto.test.ts
git commit -m "feat: add encryption service for LGPD compliance"
```

---

### Task 3.2: Criar serviço de senha (Bun.password nativo)

**Files:**
- Create: `src/services/password.ts`
- Create: `src/services/password.test.ts`

**Step 1: Escrever o teste**

```typescript
// src/services/password.test.ts
import { describe, it, expect } from 'bun:test';
import { hashPassword, verifyPassword } from './password.js';

describe('password service', () => {
  it('should hash and verify password correctly', async () => {
    const password = 'my-secret-password';
    const hashed = await hashPassword(password);

    expect(hashed).not.toBe(password);
    expect(await verifyPassword(password, hashed)).toBe(true);
  });

  it('should reject wrong password', async () => {
    const hashed = await hashPassword('correct-password');
    expect(await verifyPassword('wrong-password', hashed)).toBe(false);
  });

  it('should produce different hashes for same password', async () => {
    const password = 'same-password';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });
});
```

**Step 2: Rodar teste para verificar que falha**

```bash
bun test src/services/password.test.ts
```

**Step 3: Implementar src/services/password.ts**

```typescript
// Usando Bun.password nativo - não precisa de bcrypt!
// Docs: https://bun.com/docs/api/hashing

const BCRYPT_COST = 12; // OWASP recomenda 10+

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: BCRYPT_COST,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}
```

**Step 4: Rodar teste para verificar que passa**

```bash
bun test src/services/password.test.ts
```

**Step 5: Commit**

```bash
git add src/services/password.ts src/services/password.test.ts
git commit -m "feat: add password service using Bun.password"
```

---

### Task 3.3: Criar serviço de email

**Files:**
- Create: `src/services/email.ts`

**Step 1: Criar src/services/email.ts**

```typescript
import { env } from '../config/env.js';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to send email:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email service error:', error);
    return false;
  }
}

export function buildVerificationEmail(name: string, verificationUrl: string): string {
  return `
    <h1>Bem-vindo ao TáComQuem, ${name}!</h1>
    <p>Clique no link abaixo para verificar seu email:</p>
    <a href="${verificationUrl}">Verificar Email</a>
    <p>Este link expira em 24 horas.</p>
  `;
}

export function buildPasswordResetEmail(name: string, resetUrl: string): string {
  return `
    <h1>Recuperação de Senha</h1>
    <p>Olá ${name},</p>
    <p>Clique no link abaixo para redefinir sua senha:</p>
    <a href="${resetUrl}">Redefinir Senha</a>
    <p>Este link expira em 24 horas.</p>
    <p>Se você não solicitou isso, ignore este email.</p>
  `;
}

export function buildLoanReminderEmail(
  borrowerName: string,
  lenderName: string,
  itemName: string,
  appUrl: string
): string {
  return `
    <h1>Lembrete de Devolução</h1>
    <p>Olá ${borrowerName},</p>
    <p>${lenderName} gostaria de lembrar que você está com o item "${itemName}" emprestado.</p>
    <p>Acesse o app para ver mais detalhes:</p>
    <a href="${appUrl}">Acessar TáComQuem</a>
  `;
}

export function buildLoanConfirmationRequestEmail(
  borrowerEmail: string,
  lenderName: string,
  itemName: string,
  confirmUrl: string
): string {
  return `
    <h1>Confirme o Empréstimo</h1>
    <p>${lenderName} registrou que emprestou "${itemName}" para você.</p>
    <p>Clique no link abaixo para confirmar:</p>
    <a href="${confirmUrl}">Confirmar Empréstimo</a>
  `;
}
```

**Step 2: Commit**

```bash
git add src/services/email.ts
git commit -m "feat: add email service with Resend"
```

---

## Fase 4: Autenticação

### Task 4.1: Criar schemas Zod para autenticação

**Files:**
- Create: `src/schemas/auth.ts`

**Step 1: Criar src/schemas/auth.ts**

```typescript
import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

**Step 2: Commit**

```bash
git add src/schemas/auth.ts
git commit -m "feat: add zod schemas for authentication"
```

---

### Task 4.2: Criar plugin JWT do Fastify

**Files:**
- Create: `src/plugins/jwt.ts`

**Step 1: Criar src/plugins/jwt.ts**

```typescript
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string };
    user: { userId: string };
  }
}

async function jwtPlugin(fastify: FastifyInstance) {
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
  });

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}

export default fp(jwtPlugin, { name: 'jwt' });
```

**Step 2: Commit**

```bash
git add src/plugins/jwt.ts
git commit -m "feat: add JWT authentication plugin"
```

---

### Task 4.3: Criar serviço de autenticação

**Files:**
- Create: `src/services/auth.ts`

**Step 1: Criar src/services/auth.ts**

```typescript
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, verificationTokens, oauthAccounts } from '../db/schema.js';
import { encrypt, decrypt, hash } from './crypto.js';
import { hashPassword, verifyPassword } from './password.js';
import { sendEmail, buildVerificationEmail, buildPasswordResetEmail } from './email.js';
import { env } from '../config/env.js';

const TOKEN_EXPIRY_HOURS = 24;

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export async function createUser(input: CreateUserInput): Promise<UserResponse> {
  const emailHash = hash(input.email);

  // Check if user exists
  const existing = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (existing) {
    throw new Error('Email já cadastrado');
  }

  const passwordHashed = await hashPassword(input.password);
  const emailEncrypted = encrypt(input.email);
  const nameEncrypted = encrypt(input.name);

  const [user] = await db.insert(users).values({
    emailEncrypted,
    nameEncrypted,
    emailHash,
    passwordHash: passwordHashed,
  }).returning();

  // Create verification token
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.insert(verificationTokens).values({
    userId: user.id,
    token,
    type: 'email_verification',
    expiresAt,
  });

  // Send verification email
  const verificationUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: input.email,
    subject: 'Verifique seu email - TáComQuem',
    html: buildVerificationEmail(input.name, verificationUrl),
  });

  return {
    id: user.id,
    name: input.name,
    email: input.email,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
  };
}

export async function verifyEmail(token: string): Promise<boolean> {
  const verification = await db.query.verificationTokens.findFirst({
    where: eq(verificationTokens.token, token),
    with: { user: true },
  });

  if (!verification) {
    throw new Error('Token inválido');
  }

  if (verification.usedAt) {
    throw new Error('Token já utilizado');
  }

  if (verification.expiresAt < new Date()) {
    throw new Error('Token expirado');
  }

  if (verification.type !== 'email_verification') {
    throw new Error('Tipo de token inválido');
  }

  await db.update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, verification.userId));

  await db.update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(verificationTokens.id, verification.id));

  return true;
}

export async function login(email: string, password: string): Promise<UserResponse> {
  const emailHash = hash(email);

  const user = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (!user) {
    throw new Error('Email ou senha inválidos');
  }

  if (!user.passwordHash) {
    throw new Error('Use o login social para esta conta');
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new Error('Email ou senha inválidos');
  }

  return {
    id: user.id,
    name: decrypt(user.nameEncrypted),
    email: decrypt(user.emailEncrypted),
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
  };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const emailHash = hash(email);

  const user = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (!user) {
    // Don't reveal if email exists
    return;
  }

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.insert(verificationTokens).values({
    userId: user.id,
    token,
    type: 'password_reset',
    expiresAt,
  });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  const name = decrypt(user.nameEncrypted);

  await sendEmail({
    to: email,
    subject: 'Recuperação de Senha - TáComQuem',
    html: buildPasswordResetEmail(name, resetUrl),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const verification = await db.query.verificationTokens.findFirst({
    where: eq(verificationTokens.token, token),
  });

  if (!verification) {
    throw new Error('Token inválido');
  }

  if (verification.usedAt) {
    throw new Error('Token já utilizado');
  }

  if (verification.expiresAt < new Date()) {
    throw new Error('Token expirado');
  }

  if (verification.type !== 'password_reset') {
    throw new Error('Tipo de token inválido');
  }

  const passwordHashed = await hashPassword(newPassword);

  await db.update(users)
    .set({ passwordHash: passwordHashed, updatedAt: new Date() })
    .where(eq(users.id, verification.userId));

  await db.update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(verificationTokens.id, verification.id));

  return true;
}

export async function findOrCreateGoogleUser(
  googleId: string,
  email: string,
  name: string,
  avatarUrl?: string
): Promise<UserResponse> {
  // Check if OAuth account exists
  const existingOauth = await db.query.oauthAccounts.findFirst({
    where: eq(oauthAccounts.providerAccountId, googleId),
    with: { user: true },
  });

  if (existingOauth) {
    const user = existingOauth.user;
    return {
      id: user.id,
      name: decrypt(user.nameEncrypted),
      email: decrypt(user.emailEncrypted),
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    };
  }

  // Check if user exists by email
  const emailHash = hash(email);
  const existingUser = await db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });

  if (existingUser) {
    // Link OAuth account to existing user
    await db.insert(oauthAccounts).values({
      userId: existingUser.id,
      provider: 'google',
      providerAccountId: googleId,
    });

    // Mark email as verified since Google verified it
    await db.update(users)
      .set({ emailVerified: true, avatarUrl: avatarUrl || existingUser.avatarUrl, updatedAt: new Date() })
      .where(eq(users.id, existingUser.id));

    return {
      id: existingUser.id,
      name: decrypt(existingUser.nameEncrypted),
      email: decrypt(existingUser.emailEncrypted),
      avatarUrl: avatarUrl || existingUser.avatarUrl,
      emailVerified: true,
    };
  }

  // Create new user
  const [user] = await db.insert(users).values({
    emailEncrypted: encrypt(email),
    nameEncrypted: encrypt(name),
    emailHash,
    avatarUrl,
    emailVerified: true, // Google already verified
  }).returning();

  await db.insert(oauthAccounts).values({
    userId: user.id,
    provider: 'google',
    providerAccountId: googleId,
  });

  return {
    id: user.id,
    name,
    email,
    avatarUrl,
    emailVerified: true,
  };
}

export async function getUserById(userId: string): Promise<UserResponse | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: decrypt(user.nameEncrypted),
    email: decrypt(user.emailEncrypted),
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
  };
}
```

**Step 2: Commit**

```bash
git add src/services/auth.ts
git commit -m "feat: add authentication service"
```

---

### Task 4.4: Criar rotas de autenticação

**Files:**
- Create: `src/routes/auth/index.ts`

**Step 1: Criar src/routes/auth/index.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type RegisterInput,
  type LoginInput,
  type VerifyEmailInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '../../schemas/auth.js';
import {
  createUser,
  login,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  getUserById,
} from '../../services/auth.js';
import { env } from '../../config/env.js';

export async function authRoutes(app: FastifyInstance) {
  // Register
  app.post<{ Body: RegisterInput }>(
    '/register',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const result = registerSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      try {
        const user = await createUser(result.data);
        return reply.status(201).send({
          message: 'Cadastro realizado! Verifique seu email.',
          user,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao cadastrar';
        return reply.status(400).send({ error: message });
      }
    }
  );

  // Login
  app.post<{ Body: LoginInput }>('/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() });
    }

    try {
      const user = await login(result.data.email, result.data.password);

      const accessToken = app.jwt.sign(
        { userId: user.id },
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      const refreshToken = app.jwt.sign(
        { userId: user.id },
        { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
      );

      return reply.send({
        user,
        accessToken,
        refreshToken,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao fazer login';
      return reply.status(401).send({ error: message });
    }
  });

  // Verify Email
  app.post<{ Body: VerifyEmailInput }>('/verify-email', async (request, reply) => {
    const result = verifyEmailSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() });
    }

    try {
      await verifyEmail(result.data.token);
      return reply.send({ message: 'Email verificado com sucesso!' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao verificar email';
      return reply.status(400).send({ error: message });
    }
  });

  // Forgot Password
  app.post<{ Body: ForgotPasswordInput }>(
    '/forgot-password',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const result = forgotPasswordSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      try {
        await requestPasswordReset(result.data.email);
        return reply.send({
          message: 'Se o email existir, você receberá instruções de recuperação.',
        });
      } catch (error) {
        // Don't reveal errors
        return reply.send({
          message: 'Se o email existir, você receberá instruções de recuperação.',
        });
      }
    }
  );

  // Reset Password
  app.post<{ Body: ResetPasswordInput }>('/reset-password', async (request, reply) => {
    const result = resetPasswordSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() });
    }

    try {
      await resetPassword(result.data.token, result.data.password);
      return reply.send({ message: 'Senha alterada com sucesso!' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao alterar senha';
      return reply.status(400).send({ error: message });
    }
  });

  // Refresh Token
  app.post('/refresh', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { userId } = request.user;

      const accessToken = app.jwt.sign(
        { userId },
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      return reply.send({ accessToken });
    } catch (error) {
      return reply.status(401).send({ error: 'Token inválido' });
    }
  });

  // Get Current User
  app.get(
    '/me',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const user = await getUserById(userId);

      if (!user) {
        return reply.status(404).send({ error: 'Usuário não encontrado' });
      }

      return reply.send({ user });
    }
  );
}
```

**Step 2: Commit**

```bash
git add src/routes/auth/index.ts
git commit -m "feat: add authentication routes"
```

---

### Task 4.5: Criar rotas de Google OAuth

**Files:**
- Create: `src/routes/auth/google.ts`

**Step 1: Criar src/routes/auth/google.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { findOrCreateGoogleUser } from '../../services/auth.js';

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  picture?: string;
}

export async function googleAuthRoutes(app: FastifyInstance) {
  // Initiate Google OAuth
  app.get('/google', async (request, reply) => {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    return reply.redirect(authUrl);
  });

  // Google OAuth Callback
  app.get<{ Querystring: { code?: string; error?: string } }>(
    '/google/callback',
    async (request, reply) => {
      const { code, error } = request.query;

      if (error) {
        return reply.redirect(`${env.FRONTEND_URL}/login?error=oauth_denied`);
      }

      if (!code) {
        return reply.redirect(`${env.FRONTEND_URL}/login?error=no_code`);
      }

      try {
        // Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: env.GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to exchange code for tokens');
        }

        const tokens: GoogleTokenResponse = await tokenResponse.json();

        // Get user info
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!userResponse.ok) {
          throw new Error('Failed to get user info');
        }

        const googleUser: GoogleUserInfo = await userResponse.json();

        // Find or create user
        const user = await findOrCreateGoogleUser(
          googleUser.id,
          googleUser.email,
          googleUser.name,
          googleUser.picture
        );

        // Generate JWT tokens
        const accessToken = app.jwt.sign(
          { userId: user.id },
          { expiresIn: env.JWT_EXPIRES_IN }
        );

        const refreshToken = app.jwt.sign(
          { userId: user.id },
          { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
        );

        // Redirect to frontend with tokens
        const params = new URLSearchParams({
          accessToken,
          refreshToken,
        });

        return reply.redirect(`${env.FRONTEND_URL}/auth/callback?${params}`);
      } catch (error) {
        console.error('Google OAuth error:', error);
        return reply.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      }
    }
  );
}
```

**Step 2: Commit**

```bash
git add src/routes/auth/google.ts
git commit -m "feat: add Google OAuth routes"
```

---

### Task 4.6: Registrar rotas de autenticação no app

**Files:**
- Modify: `src/app.ts`

**Step 1: Atualizar src/app.ts para incluir rotas de auth**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';
import jwtPlugin from './plugins/jwt.js';
import { authRoutes } from './routes/auth/index.js';
import { googleAuthRoutes } from './routes/auth/google.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // Plugins
  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(jwtPlugin);

  // Health checks
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/api/health/db', async () => {
    try {
      await db.execute(sql`SELECT 1`);
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      return { status: 'error', database: 'disconnected' };
    }
  });

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(googleAuthRoutes, { prefix: '/api/auth' });

  return app;
}
```

**Step 2: Commit**

```bash
git add src/app.ts
git commit -m "feat: register authentication routes"
```

---

## Fase 5: Items (CRUD)

### Task 5.1: Criar schemas Zod para items

**Files:**
- Create: `src/schemas/items.ts`

**Step 1: Criar src/schemas/items.ts**

```typescript
import { z } from 'zod';

export const createItemSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255),
  description: z.string().optional(),
  images: z.array(z.string().url()).default([]),
});

export const updateItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  images: z.array(z.string().url()).optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
```

**Step 2: Commit**

```bash
git add src/schemas/items.ts
git commit -m "feat: add zod schemas for items"
```

---

### Task 5.2: Criar serviço de items

**Files:**
- Create: `src/services/items.ts`

**Step 1: Criar src/services/items.ts**

```typescript
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { items } from '../db/schema.js';
import type { CreateItemInput, UpdateItemInput } from '../schemas/items.js';

export interface ItemResponse {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function parseImages(imagesJson: string): string[] {
  try {
    return JSON.parse(imagesJson);
  } catch {
    return [];
  }
}

function toItemResponse(item: typeof items.$inferSelect): ItemResponse {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    images: parseImages(item.images),
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function createItem(ownerId: string, input: CreateItemInput): Promise<ItemResponse> {
  const [item] = await db.insert(items).values({
    ownerId,
    name: input.name,
    description: input.description,
    images: JSON.stringify(input.images),
  }).returning();

  return toItemResponse(item);
}

export async function getItemsByOwner(ownerId: string): Promise<ItemResponse[]> {
  const result = await db.query.items.findMany({
    where: and(eq(items.ownerId, ownerId), eq(items.isActive, true)),
    orderBy: (items, { desc }) => [desc(items.createdAt)],
  });

  return result.map(toItemResponse);
}

export async function getItemById(itemId: string, ownerId: string): Promise<ItemResponse | null> {
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.ownerId, ownerId)),
  });

  if (!item) {
    return null;
  }

  return toItemResponse(item);
}

export async function updateItem(
  itemId: string,
  ownerId: string,
  input: UpdateItemInput
): Promise<ItemResponse | null> {
  const existing = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.ownerId, ownerId)),
  });

  if (!existing) {
    return null;
  }

  const updateData: Partial<typeof items.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.images !== undefined) updateData.images = JSON.stringify(input.images);

  const [updated] = await db.update(items)
    .set(updateData)
    .where(eq(items.id, itemId))
    .returning();

  return toItemResponse(updated);
}

export async function deleteItem(itemId: string, ownerId: string): Promise<boolean> {
  const existing = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.ownerId, ownerId)),
  });

  if (!existing) {
    return false;
  }

  // Soft delete
  await db.update(items)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(items.id, itemId));

  return true;
}
```

**Step 2: Commit**

```bash
git add src/services/items.ts
git commit -m "feat: add items service"
```

---

### Task 5.3: Criar rotas de items

**Files:**
- Create: `src/routes/items/index.ts`

**Step 1: Criar src/routes/items/index.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { createItemSchema, updateItemSchema, type CreateItemInput, type UpdateItemInput } from '../../schemas/items.js';
import { createItem, getItemsByOwner, getItemById, updateItem, deleteItem } from '../../services/items.js';

export async function itemsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate);

  // Create item
  app.post<{ Body: CreateItemInput }>('/', async (request, reply) => {
    const result = createItemSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() });
    }

    const item = await createItem(request.user.userId, result.data);
    return reply.status(201).send({ item });
  });

  // List my items
  app.get('/', async (request, reply) => {
    const items = await getItemsByOwner(request.user.userId);
    return reply.send({ items });
  });

  // Get item by id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const item = await getItemById(request.params.id, request.user.userId);

    if (!item) {
      return reply.status(404).send({ error: 'Item não encontrado' });
    }

    return reply.send({ item });
  });

  // Update item
  app.patch<{ Params: { id: string }; Body: UpdateItemInput }>(
    '/:id',
    async (request, reply) => {
      const result = updateItemSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      const item = await updateItem(request.params.id, request.user.userId, result.data);

      if (!item) {
        return reply.status(404).send({ error: 'Item não encontrado' });
      }

      return reply.send({ item });
    }
  );

  // Delete item (soft delete)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const deleted = await deleteItem(request.params.id, request.user.userId);

    if (!deleted) {
      return reply.status(404).send({ error: 'Item não encontrado' });
    }

    return reply.status(204).send();
  });
}
```

**Step 2: Commit**

```bash
git add src/routes/items/index.ts
git commit -m "feat: add items CRUD routes"
```

---

### Task 5.4: Registrar rotas de items no app

**Files:**
- Modify: `src/app.ts`

**Step 1: Adicionar import e registro das rotas de items**

```typescript
import { itemsRoutes } from './routes/items/index.js';

// Dentro de buildApp(), após registrar rotas de auth:
await app.register(itemsRoutes, { prefix: '/api/items' });
```

**Step 2: Commit**

```bash
git add src/app.ts
git commit -m "feat: register items routes"
```

---

## Fase 6: Empréstimos (Loans)

### Task 6.1: Criar schemas Zod para loans

**Files:**
- Create: `src/schemas/loans.ts`

**Step 1: Criar src/schemas/loans.ts**

```typescript
import { z } from 'zod';

export const createLoanSchema = z.object({
  itemId: z.string().uuid('Item inválido'),
  borrowerEmail: z.string().email('Email inválido'),
  expectedReturnDate: z.string().datetime().optional(),
  lenderNotes: z.string().optional(),
});

export const updateLoanNotesSchema = z.object({
  lenderNotes: z.string().optional(),
  borrowerNotes: z.string().optional(),
});

export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type UpdateLoanNotesInput = z.infer<typeof updateLoanNotesSchema>;
```

**Step 2: Commit**

```bash
git add src/schemas/loans.ts
git commit -m "feat: add zod schemas for loans"
```

---

### Task 6.2: Criar serviço de loans

**Files:**
- Create: `src/services/loans.ts`

**Step 1: Criar src/services/loans.ts**

```typescript
import { eq, and, or, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { loans, loanTokens, items, users, notifications } from '../db/schema.js';
import { decrypt } from './crypto.js';
import { sendEmail, buildLoanConfirmationRequestEmail, buildLoanReminderEmail } from './email.js';
import { env } from '../config/env.js';
import type { CreateLoanInput } from '../schemas/loans.js';

const TOKEN_EXPIRY_DAYS = 7;

export interface LoanResponse {
  id: string;
  item: {
    id: string;
    name: string;
    images: string[];
  };
  lender: {
    id: string;
    name: string;
  };
  borrower: {
    id: string;
    name: string;
  } | null;
  borrowerEmail: string | null;
  status: 'pending' | 'confirmed' | 'returned' | 'cancelled';
  expectedReturnDate: Date | null;
  lenderNotes: string | null;
  borrowerNotes: string | null;
  confirmedAt: Date | null;
  returnedAt: Date | null;
  createdAt: Date;
}

export interface PublicLoanInfo {
  itemName: string;
  itemImages: string[];
  lenderName: string;
}

function parseImages(imagesJson: string): string[] {
  try {
    return JSON.parse(imagesJson);
  } catch {
    return [];
  }
}

export async function createLoan(lenderId: string, input: CreateLoanInput): Promise<{ loan: LoanResponse; confirmUrl: string }> {
  // Verify item belongs to lender
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, input.itemId), eq(items.ownerId, lenderId)),
  });

  if (!item) {
    throw new Error('Item não encontrado');
  }

  // Get lender info
  const lender = await db.query.users.findFirst({
    where: eq(users.id, lenderId),
  });

  if (!lender) {
    throw new Error('Usuário não encontrado');
  }

  const lenderName = decrypt(lender.nameEncrypted);

  // Create loan
  const [loan] = await db.insert(loans).values({
    itemId: input.itemId,
    lenderId,
    borrowerEmail: input.borrowerEmail,
    expectedReturnDate: input.expectedReturnDate ? new Date(input.expectedReturnDate) : null,
    lenderNotes: input.lenderNotes,
  }).returning();

  // Create token
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(loanTokens).values({
    loanId: loan.id,
    token,
    expiresAt,
  });

  // Send confirmation email
  const confirmUrl = `${env.FRONTEND_URL}/confirm-loan/${token}`;
  await sendEmail({
    to: input.borrowerEmail,
    subject: `${lenderName} quer registrar um empréstimo - TáComQuem`,
    html: buildLoanConfirmationRequestEmail(input.borrowerEmail, lenderName, item.name, confirmUrl),
  });

  return {
    loan: {
      id: loan.id,
      item: {
        id: item.id,
        name: item.name,
        images: parseImages(item.images),
      },
      lender: {
        id: lenderId,
        name: lenderName,
      },
      borrower: null,
      borrowerEmail: input.borrowerEmail,
      status: loan.status,
      expectedReturnDate: loan.expectedReturnDate,
      lenderNotes: loan.lenderNotes,
      borrowerNotes: loan.borrowerNotes,
      confirmedAt: loan.confirmedAt,
      returnedAt: loan.returnedAt,
      createdAt: loan.createdAt,
    },
    confirmUrl,
  };
}

export async function getLoansByUser(
  userId: string,
  filter?: 'lent' | 'borrowed' | 'pending' | 'confirmed' | 'returned'
): Promise<LoanResponse[]> {
  let whereClause;

  switch (filter) {
    case 'lent':
      whereClause = eq(loans.lenderId, userId);
      break;
    case 'borrowed':
      whereClause = eq(loans.borrowerId, userId);
      break;
    case 'pending':
      whereClause = and(
        or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
        eq(loans.status, 'pending')
      );
      break;
    case 'confirmed':
      whereClause = and(
        or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
        eq(loans.status, 'confirmed')
      );
      break;
    case 'returned':
      whereClause = and(
        or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
        eq(loans.status, 'returned')
      );
      break;
    default:
      whereClause = or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId));
  }

  const result = await db.query.loans.findMany({
    where: whereClause,
    with: {
      item: true,
      lender: true,
      borrower: true,
    },
    orderBy: [desc(loans.createdAt)],
  });

  return result.map((loan) => ({
    id: loan.id,
    item: {
      id: loan.item.id,
      name: loan.item.name,
      images: parseImages(loan.item.images),
    },
    lender: {
      id: loan.lender.id,
      name: decrypt(loan.lender.nameEncrypted),
    },
    borrower: loan.borrower
      ? {
          id: loan.borrower.id,
          name: decrypt(loan.borrower.nameEncrypted),
        }
      : null,
    borrowerEmail: loan.borrowerEmail,
    status: loan.status,
    expectedReturnDate: loan.expectedReturnDate,
    lenderNotes: loan.lenderNotes,
    borrowerNotes: loan.borrowerNotes,
    confirmedAt: loan.confirmedAt,
    returnedAt: loan.returnedAt,
    createdAt: loan.createdAt,
  }));
}

export async function getLoanById(loanId: string, userId: string): Promise<LoanResponse | null> {
  const loan = await db.query.loans.findFirst({
    where: and(
      eq(loans.id, loanId),
      or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId))
    ),
    with: {
      item: true,
      lender: true,
      borrower: true,
    },
  });

  if (!loan) {
    return null;
  }

  return {
    id: loan.id,
    item: {
      id: loan.item.id,
      name: loan.item.name,
      images: parseImages(loan.item.images),
    },
    lender: {
      id: loan.lender.id,
      name: decrypt(loan.lender.nameEncrypted),
    },
    borrower: loan.borrower
      ? {
          id: loan.borrower.id,
          name: decrypt(loan.borrower.nameEncrypted),
        }
      : null,
    borrowerEmail: loan.borrowerEmail,
    status: loan.status,
    expectedReturnDate: loan.expectedReturnDate,
    lenderNotes: loan.lenderNotes,
    borrowerNotes: loan.borrowerNotes,
    confirmedAt: loan.confirmedAt,
    returnedAt: loan.returnedAt,
    createdAt: loan.createdAt,
  };
}

export async function markLoanAsReturned(loanId: string, lenderId: string): Promise<LoanResponse | null> {
  const loan = await db.query.loans.findFirst({
    where: and(eq(loans.id, loanId), eq(loans.lenderId, lenderId)),
    with: { item: true, lender: true, borrower: true },
  });

  if (!loan) {
    return null;
  }

  if (loan.status !== 'confirmed') {
    throw new Error('Apenas empréstimos confirmados podem ser marcados como devolvidos');
  }

  await db.update(loans)
    .set({ status: 'returned', returnedAt: new Date(), updatedAt: new Date() })
    .where(eq(loans.id, loanId));

  // Create notification for borrower
  if (loan.borrowerId) {
    await db.insert(notifications).values({
      userId: loan.borrowerId,
      loanId: loan.id,
      type: 'loan_returned',
      title: 'Item devolvido',
      message: `Você devolveu "${loan.item.name}" para ${decrypt(loan.lender.nameEncrypted)}.`,
      sentAt: new Date(),
    });
  }

  return getLoanById(loanId, lenderId);
}

export async function cancelLoan(loanId: string, lenderId: string): Promise<boolean> {
  const loan = await db.query.loans.findFirst({
    where: and(eq(loans.id, loanId), eq(loans.lenderId, lenderId)),
  });

  if (!loan) {
    return false;
  }

  if (loan.status !== 'pending') {
    throw new Error('Apenas empréstimos pendentes podem ser cancelados');
  }

  await db.update(loans)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(loans.id, loanId));

  return true;
}

export async function sendReminder(loanId: string, lenderId: string): Promise<boolean> {
  const loan = await db.query.loans.findFirst({
    where: and(eq(loans.id, loanId), eq(loans.lenderId, lenderId)),
    with: { item: true, lender: true, borrower: true },
  });

  if (!loan) {
    return false;
  }

  if (loan.status !== 'confirmed') {
    throw new Error('Apenas empréstimos confirmados podem receber lembretes');
  }

  if (!loan.borrower) {
    throw new Error('Empréstimo não tem um receptor confirmado');
  }

  const lenderName = decrypt(loan.lender.nameEncrypted);
  const borrowerName = decrypt(loan.borrower.nameEncrypted);
  const borrowerEmail = decrypt(loan.borrower.emailEncrypted);

  await sendEmail({
    to: borrowerEmail,
    subject: `Lembrete de devolução: ${loan.item.name} - TáComQuem`,
    html: buildLoanReminderEmail(borrowerName, lenderName, loan.item.name, env.FRONTEND_URL),
  });

  // Create notification
  await db.insert(notifications).values({
    userId: loan.borrowerId!,
    loanId: loan.id,
    type: 'loan_reminder',
    title: 'Lembrete de devolução',
    message: `${lenderName} está solicitando a devolução de "${loan.item.name}".`,
    sentAt: new Date(),
  });

  return true;
}

// Public link functions
export async function getPublicLoanInfo(token: string): Promise<PublicLoanInfo | null> {
  const loanToken = await db.query.loanTokens.findFirst({
    where: eq(loanTokens.token, token),
    with: {
      loan: {
        with: {
          item: true,
          lender: true,
        },
      },
    },
  });

  if (!loanToken) {
    return null;
  }

  if (loanToken.expiresAt < new Date()) {
    return null;
  }

  if (loanToken.usedAt) {
    return null;
  }

  return {
    itemName: loanToken.loan.item.name,
    itemImages: parseImages(loanToken.loan.item.images),
    lenderName: decrypt(loanToken.loan.lender.nameEncrypted),
  };
}

export async function confirmLoan(token: string, borrowerId: string): Promise<LoanResponse> {
  const loanToken = await db.query.loanTokens.findFirst({
    where: eq(loanTokens.token, token),
    with: {
      loan: {
        with: {
          item: true,
          lender: true,
        },
      },
    },
  });

  if (!loanToken) {
    throw new Error('Token inválido');
  }

  if (loanToken.expiresAt < new Date()) {
    throw new Error('Token expirado');
  }

  if (loanToken.usedAt) {
    throw new Error('Token já utilizado');
  }

  if (loanToken.loan.status !== 'pending') {
    throw new Error('Empréstimo já foi processado');
  }

  // Update loan
  await db.update(loans)
    .set({
      borrowerId,
      status: 'confirmed',
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(loans.id, loanToken.loanId));

  // Mark token as used
  await db.update(loanTokens)
    .set({ usedAt: new Date() })
    .where(eq(loanTokens.id, loanToken.id));

  // Create notifications
  const borrower = await db.query.users.findFirst({
    where: eq(users.id, borrowerId),
  });

  if (borrower) {
    const borrowerName = decrypt(borrower.nameEncrypted);
    const lenderName = decrypt(loanToken.loan.lender.nameEncrypted);

    // Notify lender
    await db.insert(notifications).values({
      userId: loanToken.loan.lenderId,
      loanId: loanToken.loanId,
      type: 'loan_confirmed',
      title: 'Empréstimo confirmado',
      message: `${borrowerName} confirmou o empréstimo de "${loanToken.loan.item.name}".`,
      sentAt: new Date(),
    });

    // Notify borrower
    await db.insert(notifications).values({
      userId: borrowerId,
      loanId: loanToken.loanId,
      type: 'loan_confirmed',
      title: 'Empréstimo confirmado',
      message: `Você confirmou o empréstimo de "${loanToken.loan.item.name}" de ${lenderName}.`,
      sentAt: new Date(),
    });
  }

  const loan = await getLoanById(loanToken.loanId, borrowerId);
  if (!loan) {
    throw new Error('Erro ao buscar empréstimo');
  }

  return loan;
}
```

**Step 2: Commit**

```bash
git add src/services/loans.ts
git commit -m "feat: add loans service"
```

---

### Task 6.3: Criar rotas de loans

**Files:**
- Create: `src/routes/loans/index.ts`

**Step 1: Criar src/routes/loans/index.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { createLoanSchema, type CreateLoanInput } from '../../schemas/loans.js';
import {
  createLoan,
  getLoansByUser,
  getLoanById,
  markLoanAsReturned,
  cancelLoan,
  sendReminder,
} from '../../services/loans.js';

export async function loansRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate);

  // Create loan
  app.post<{ Body: CreateLoanInput }>('/', async (request, reply) => {
    const result = createLoanSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() });
    }

    try {
      const { loan, confirmUrl } = await createLoan(request.user.userId, result.data);
      return reply.status(201).send({ loan, confirmUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao criar empréstimo';
      return reply.status(400).send({ error: message });
    }
  });

  // List loans
  app.get<{ Querystring: { filter?: 'lent' | 'borrowed' | 'pending' | 'confirmed' | 'returned' } }>(
    '/',
    async (request, reply) => {
      const loans = await getLoansByUser(request.user.userId, request.query.filter);
      return reply.send({ loans });
    }
  );

  // Get loan by id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const loan = await getLoanById(request.params.id, request.user.userId);

    if (!loan) {
      return reply.status(404).send({ error: 'Empréstimo não encontrado' });
    }

    return reply.send({ loan });
  });

  // Mark as returned
  app.patch<{ Params: { id: string } }>('/:id/return', async (request, reply) => {
    try {
      const loan = await markLoanAsReturned(request.params.id, request.user.userId);

      if (!loan) {
        return reply.status(404).send({ error: 'Empréstimo não encontrado' });
      }

      return reply.send({ loan });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao marcar como devolvido';
      return reply.status(400).send({ error: message });
    }
  });

  // Cancel loan
  app.patch<{ Params: { id: string } }>('/:id/cancel', async (request, reply) => {
    try {
      const cancelled = await cancelLoan(request.params.id, request.user.userId);

      if (!cancelled) {
        return reply.status(404).send({ error: 'Empréstimo não encontrado' });
      }

      return reply.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao cancelar empréstimo';
      return reply.status(400).send({ error: message });
    }
  });

  // Send reminder
  app.post<{ Params: { id: string } }>('/:id/remind', async (request, reply) => {
    try {
      const sent = await sendReminder(request.params.id, request.user.userId);

      if (!sent) {
        return reply.status(404).send({ error: 'Empréstimo não encontrado' });
      }

      return reply.send({ message: 'Lembrete enviado com sucesso!' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao enviar lembrete';
      return reply.status(400).send({ error: message });
    }
  });
}
```

**Step 2: Commit**

```bash
git add src/routes/loans/index.ts
git commit -m "feat: add loans routes"
```

---

### Task 6.4: Criar rotas de links públicos

**Files:**
- Create: `src/routes/links/index.ts`

**Step 1: Criar src/routes/links/index.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { getPublicLoanInfo, confirmLoan } from '../../services/loans.js';

export async function linksRoutes(app: FastifyInstance) {
  // Get public loan info (no auth required)
  app.get<{ Params: { token: string } }>('/:token', async (request, reply) => {
    const info = await getPublicLoanInfo(request.params.token);

    if (!info) {
      return reply.status(404).send({ error: 'Link inválido ou expirado' });
    }

    return reply.send(info);
  });

  // Confirm loan (auth required)
  app.post<{ Params: { token: string } }>(
    '/:token/confirm',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const loan = await confirmLoan(request.params.token, request.user.userId);
        return reply.send({ loan, message: 'Empréstimo confirmado com sucesso!' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao confirmar empréstimo';
        return reply.status(400).send({ error: message });
      }
    }
  );
}
```

**Step 2: Commit**

```bash
git add src/routes/links/index.ts
git commit -m "feat: add public links routes"
```

---

### Task 6.5: Registrar rotas de loans e links no app

**Files:**
- Modify: `src/app.ts`

**Step 1: Adicionar imports e registro das rotas**

```typescript
import { loansRoutes } from './routes/loans/index.js';
import { linksRoutes } from './routes/links/index.js';

// Dentro de buildApp(), após registrar rotas existentes:
await app.register(loansRoutes, { prefix: '/api/loans' });
await app.register(linksRoutes, { prefix: '/api/links' });
```

**Step 2: Commit**

```bash
git add src/app.ts
git commit -m "feat: register loans and links routes"
```

---

## Fase 7: Dashboard

### Task 7.1: Criar serviço de dashboard

**Files:**
- Create: `src/services/dashboard.ts`

**Step 1: Criar src/services/dashboard.ts**

```typescript
import { eq, and, or, desc, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { loans, items, users, notifications } from '../db/schema.js';
import { decrypt } from './crypto.js';

export interface DashboardStats {
  itemsCount: number;
  activeLentCount: number;
  activeBorrowedCount: number;
  pendingCount: number;
}

export interface RecentActivity {
  id: string;
  type: 'loan_created' | 'loan_confirmed' | 'loan_returned' | 'loan_reminder';
  message: string;
  createdAt: Date;
  read: boolean;
}

export interface DashboardData {
  stats: DashboardStats;
  recentActivity: RecentActivity[];
  pendingLoans: Array<{
    id: string;
    itemName: string;
    borrowerEmail: string;
    createdAt: Date;
  }>;
  activeLoans: Array<{
    id: string;
    itemName: string;
    itemImages: string[];
    otherParty: string;
    role: 'lender' | 'borrower';
    expectedReturnDate: Date | null;
    confirmedAt: Date;
  }>;
}

function parseImages(imagesJson: string): string[] {
  try {
    return JSON.parse(imagesJson);
  } catch {
    return [];
  }
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  // Get stats
  const [itemsCount] = await db
    .select({ count: count() })
    .from(items)
    .where(and(eq(items.ownerId, userId), eq(items.isActive, true)));

  const [activeLentCount] = await db
    .select({ count: count() })
    .from(loans)
    .where(and(eq(loans.lenderId, userId), eq(loans.status, 'confirmed')));

  const [activeBorrowedCount] = await db
    .select({ count: count() })
    .from(loans)
    .where(and(eq(loans.borrowerId, userId), eq(loans.status, 'confirmed')));

  const [pendingCount] = await db
    .select({ count: count() })
    .from(loans)
    .where(and(eq(loans.lenderId, userId), eq(loans.status, 'pending')));

  // Get recent activity
  const recentNotifications = await db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: [desc(notifications.createdAt)],
    limit: 10,
  });

  // Get pending loans
  const pendingLoans = await db.query.loans.findMany({
    where: and(eq(loans.lenderId, userId), eq(loans.status, 'pending')),
    with: { item: true },
    orderBy: [desc(loans.createdAt)],
    limit: 5,
  });

  // Get active loans (both lent and borrowed)
  const activeLoans = await db.query.loans.findMany({
    where: and(
      or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)),
      eq(loans.status, 'confirmed')
    ),
    with: {
      item: true,
      lender: true,
      borrower: true,
    },
    orderBy: [desc(loans.confirmedAt)],
    limit: 10,
  });

  return {
    stats: {
      itemsCount: itemsCount.count,
      activeLentCount: activeLentCount.count,
      activeBorrowedCount: activeBorrowedCount.count,
      pendingCount: pendingCount.count,
    },
    recentActivity: recentNotifications.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      createdAt: n.createdAt,
      read: n.read,
    })),
    pendingLoans: pendingLoans.map((l) => ({
      id: l.id,
      itemName: l.item.name,
      borrowerEmail: l.borrowerEmail || '',
      createdAt: l.createdAt,
    })),
    activeLoans: activeLoans.map((l) => {
      const isLender = l.lenderId === userId;
      const otherParty = isLender
        ? l.borrower ? decrypt(l.borrower.nameEncrypted) : 'Pendente'
        : decrypt(l.lender.nameEncrypted);

      return {
        id: l.id,
        itemName: l.item.name,
        itemImages: parseImages(l.item.images),
        otherParty,
        role: isLender ? 'lender' : 'borrower',
        expectedReturnDate: l.expectedReturnDate,
        confirmedAt: l.confirmedAt!,
      };
    }),
  };
}

export interface Friend {
  id: string;
  name: string;
  avatarUrl: string | null;
  lentCount: number;
  borrowedCount: number;
}

export async function getFriends(userId: string): Promise<Friend[]> {
  // Get all users that have interacted with this user via loans
  const lentLoans = await db.query.loans.findMany({
    where: and(eq(loans.lenderId, userId), eq(loans.status, 'confirmed')),
    with: { borrower: true },
  });

  const borrowedLoans = await db.query.loans.findMany({
    where: and(eq(loans.borrowerId, userId), eq(loans.status, 'confirmed')),
    with: { lender: true },
  });

  const friendsMap = new Map<string, Friend>();

  for (const loan of lentLoans) {
    if (!loan.borrower) continue;

    const existing = friendsMap.get(loan.borrower.id);
    if (existing) {
      existing.lentCount++;
    } else {
      friendsMap.set(loan.borrower.id, {
        id: loan.borrower.id,
        name: decrypt(loan.borrower.nameEncrypted),
        avatarUrl: loan.borrower.avatarUrl,
        lentCount: 1,
        borrowedCount: 0,
      });
    }
  }

  for (const loan of borrowedLoans) {
    const existing = friendsMap.get(loan.lender.id);
    if (existing) {
      existing.borrowedCount++;
    } else {
      friendsMap.set(loan.lender.id, {
        id: loan.lender.id,
        name: decrypt(loan.lender.nameEncrypted),
        avatarUrl: loan.lender.avatarUrl,
        lentCount: 0,
        borrowedCount: 1,
      });
    }
  }

  return Array.from(friendsMap.values()).sort(
    (a, b) => (b.lentCount + b.borrowedCount) - (a.lentCount + a.borrowedCount)
  );
}
```

**Step 2: Commit**

```bash
git add src/services/dashboard.ts
git commit -m "feat: add dashboard service"
```

---

### Task 7.2: Criar rotas de dashboard

**Files:**
- Create: `src/routes/dashboard/index.ts`

**Step 1: Criar src/routes/dashboard/index.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { getDashboardData, getFriends } from '../../services/dashboard.js';

export async function dashboardRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate);

  // Get dashboard data
  app.get('/', async (request, reply) => {
    const data = await getDashboardData(request.user.userId);
    return reply.send(data);
  });

  // Get friends list
  app.get('/friends', async (request, reply) => {
    const friends = await getFriends(request.user.userId);
    return reply.send({ friends });
  });
}
```

**Step 2: Commit**

```bash
git add src/routes/dashboard/index.ts
git commit -m "feat: add dashboard routes"
```

---

### Task 7.3: Registrar rotas de dashboard no app

**Files:**
- Modify: `src/app.ts`

**Step 1: Adicionar import e registro**

```typescript
import { dashboardRoutes } from './routes/dashboard/index.js';

// Dentro de buildApp():
await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
```

**Step 2: Commit**

```bash
git add src/app.ts
git commit -m "feat: register dashboard routes"
```

---

## Fase 8: Finalização

### Task 8.1: Criar app.ts final

**Files:**
- Modify: `src/app.ts` (versão final completa)

**Step 1: Verificar src/app.ts final**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';
import jwtPlugin from './plugins/jwt.js';
import { authRoutes } from './routes/auth/index.js';
import { googleAuthRoutes } from './routes/auth/google.js';
import { itemsRoutes } from './routes/items/index.js';
import { loansRoutes } from './routes/loans/index.js';
import { linksRoutes } from './routes/links/index.js';
import { dashboardRoutes } from './routes/dashboard/index.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // Plugins
  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(jwtPlugin);

  // Health checks
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/api/health/db', async () => {
    try {
      await db.execute(sql`SELECT 1`);
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      return { status: 'error', database: 'disconnected' };
    }
  });

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(googleAuthRoutes, { prefix: '/api/auth' });
  await app.register(itemsRoutes, { prefix: '/api/items' });
  await app.register(loansRoutes, { prefix: '/api/loans' });
  await app.register(linksRoutes, { prefix: '/api/links' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });

  return app;
}
```

**Step 2: Commit**

```bash
git add src/app.ts
git commit -m "chore: finalize app with all routes"
```

---

### Task 8.2: Criar README do projeto

**Files:**
- Create: `README.md`

**Step 1: Criar README.md**

```markdown
# TáComQuem

API para gestão de empréstimos pessoais entre amigos.

## Stack

- **Runtime:** Bun 1.3+
- **Framework:** Fastify
- **ORM:** Drizzle (driver nativo Bun SQL)
- **Database:** PostgreSQL
- **Validation:** Zod
- **Auth:** JWT + Google OAuth

## Setup

```bash
# Instalar Bun (se não tiver)
curl -fsSL https://bun.sh/install | bash

# Instalar dependências
bun install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# Rodar migrations
bun run db:generate
bun run db:migrate

# Iniciar em desenvolvimento
bun run dev
```

## Scripts

- `bun run dev` - Inicia servidor em modo desenvolvimento (hot reload)
- `bun run start` - Inicia servidor em produção
- `bun run test` - Roda testes
- `bun run test:coverage` - Roda testes com cobertura
- `bun run db:generate` - Gera migrations
- `bun run db:migrate` - Aplica migrations
- `bun run db:studio` - Abre Drizzle Studio

## Deploy (Oracle Cloud ARM)

```bash
# Instalar Bun no servidor ARM64
curl -fsSL https://bun.sh/install | bash

# Clonar e instalar
git clone <repo>
cd tacomquem
bun install --production

# Rodar migrations
bun run db:migrate

# Iniciar (usar PM2 ou systemd para produção)
bun run start
```

## API Endpoints

Ver [docs/plans/001-mvp/design.md](./docs/plans/001-mvp/design.md) para documentação completa.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add project README"
```

---

## Resumo das Fases

| Fase | Tarefas | Descrição |
|------|---------|-----------|
| 1 | 1.1 - 1.7 | Setup do projeto (bun init, deps, fastify) |
| 2 | 2.1 - 2.4 | Banco de dados (Drizzle + Bun SQL) |
| 3 | 3.1 - 3.3 | Serviços (crypto, Bun.password, email) |
| 4 | 4.1 - 4.6 | Autenticação (email/senha, Google OAuth, JWT) |
| 5 | 5.1 - 5.4 | Items CRUD |
| 6 | 6.1 - 6.5 | Empréstimos (loans, links públicos) |
| 7 | 7.1 - 7.3 | Dashboard e amigos |
| 8 | 8.1 - 8.2 | Finalização |

**Total: ~35 tarefas**

---

## Diferenças do Plano Original (Node.js → Bun)

| Aspecto | Node.js | Bun |
|---------|---------|-----|
| Package manager | `npm install` | `bun add` |
| Dev server | `tsx watch` | `bun --watch` |
| Tests | Vitest | `bun test` |
| Password hashing | bcrypt | `Bun.password` (nativo) |
| DB driver | postgres.js | Bun SQL nativo |
| tsconfig | Manual | Auto-gerado |
| Type checking | `tsc` | Bun runtime |

**Dependências removidas:** tsx, vitest, bcrypt, @types/bcrypt
