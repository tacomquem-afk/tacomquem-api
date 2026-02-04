# PRD Técnico Completo: TáComQuem

## Product Requirements Document

**Versão:** 1.0
**Stack:** TypeScript + Fastify + Drizzle ORM + PostgreSQL + Zod
**Autenticação:** Social Login (Google, Apple, Facebook)
**Target:** Oracle Cloud Always Free (ARM Ampere)

---

## 📋 Índice

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Arquitetura Técnica](#2-arquitetura-técnica)
3. [Database Schema](#3-database-schema)
4. [Fluxo de Autenticação Social](#4-fluxo-de-autenticação-social)
5. [API Endpoints](#5-api-endpoints)
6. [Validações Zod](#6-validações-zod)
7. [Lógica de Negócio](#7-lógica-de-negócio)
8. [Estrutura de Pastas](#8-estrutura-de-pastas)
9. [Configuração do Projeto](#9-configuração-do-projeto)
10. [Segurança e Rate Limiting](#10-segurança-e-rate-limiting)
11. [Testes](#11-testes)
12. [Deploy e CI/CD](#12-deploy-e-cicd)

---

## 1. Visão Geral do Sistema

### 1.1 Objetivo

Aplicação web/mobile para gestão de empréstimos de itens pessoais entre amigos, eliminando o desconforto social de cobranças através de automação inteligente.

### 1.2 Características Principais

- ✅ Registro de empréstimos com foto do item
- ✅ Links de confirmação sem necessidade de cadastro prévio
- ✅ Autenticação via Social Login (Google/Apple/Facebook)
- ✅ Consolidação automática de identidades
- ✅ Lembretes inteligentes baseados em behavioral science
- ✅ Dashboard visual de itens emprestados/recebidos
- ✅ Sistema de notificações push

### 1.3 Tech Stack Justificada

| Tecnologia      | Por quê?                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| **Fastify**     | 2-3x mais rápido que Express, schema validation nativa, TypeScript first-class |
| **Drizzle ORM** | Type-safe, zero-overhead, migrations SQL puras, melhor DX que Prisma           |
| **Zod**         | Runtime + compile-time validation, integração perfeita com Fastify             |
| **PostgreSQL**  | ACID compliant, JSON support, full-text search, gratuito na Oracle Cloud       |
| **Passport.js** | Padrão de mercado para OAuth2, suporte a 500+ providers                        |

---

## 2. Arquitetura Técnica

### 2.1 Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENTE (React/React Native)            │
│  - Device Fingerprinting (FingerprintJS)                    │
│  - OAuth2 Redirect Handling                                 │
│  - Token Storage (Secure Storage/Cookies)                   │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS/WSS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     NGINX (Reverse Proxy)                   │
│  - SSL Termination                                          │
│  - Rate Limiting (10 req/s geral, 30 req/s API)            │
│  - Compression (gzip/brotli)                                │
│  - Static Assets Cache                                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  FASTIFY SERVER (Node.js)                   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Middlewares / Plugins                                │  │
│  │ - CORS                                               │  │
│  │ - Helmet (Security Headers)                          │  │
│  │ - JWT Verification                                   │  │
│  │ - Request Logger (Pino)                              │  │
│  │ - Error Handler                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Routes                                               │  │
│  │ /auth/*    - Social Login (Google/Apple/Facebook)   │  │
│  │ /items/*   - CRUD de itens                          │  │
│  │ /loans/*   - Empréstimos                            │  │
│  │ /links/*   - Geração/validação de links            │  │
│  │ /users/*   - Perfil e configurações                │  │
│  │ /health    - Health check                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Services (Business Logic)                            │  │
│  │ - AuthService                                        │  │
│  │ - LoanService                                        │  │
│  │ - NotificationService                                │  │
│  │ - UserConsolidationService                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Repositories (Data Access)                           │  │
│  │ - Drizzle ORM Queries                                │  │
│  │ - Transaction Management                             │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
┌────────────────────────┐  ┌──────────────────────┐
│   PostgreSQL 16        │  │   Redis (Cache)      │
│   - Users              │  │   - Sessions         │
│   - Items              │  │   - Rate Limits      │
│   - Loans              │  │   - Temp Tokens      │
│   - Devices            │  └──────────────────────┘
│   - OAuth Accounts     │
│   - Notifications      │
└────────────────────────┘
```

### 2.2 Fluxo de Dados: Criação de Empréstimo

```
[User A - Dono]
      │
      │ 1. POST /api/items (foto + descrição)
      ▼
[Fastify] → Valida com Zod → Salva imagem → Insere no DB
      │
      │ 2. POST /api/loans { itemId, borrowerHint: "João" }
      ▼
[LoanService]
      │
      ├─→ Gera JWT com payload: { loanId, expiresIn: 7d }
      ├─→ Salva token no Redis (TTL: 7d)
      └─→ Retorna: https://tacq.app/l/eyJhbGc...
      │
      │ 3. User A envia link via WhatsApp para User B
      ▼
[User B - Receptor]
      │
      │ 4. Abre link no browser/app
      ▼
[Fastify] GET /l/:token
      │
      ├─→ Valida JWT
      ├─→ Verifica se já foi usado
      ├─→ Captura device fingerprint
      └─→ Busca ou cria User temporário
      │
      │ 5. Exibe: "Fulano te emprestou: Furadeira Bosch"
      │    [Confirmar Empréstimo] [Login com Google]
      ▼
[User B escolhe]
      │
      ├─→ Opção A: Clica "Confirmar" sem login
      │   → Cria user temp + device
      │   → Marca empréstimo como CONFIRMED
      │   → Redireciona: "Quer receber lembretes? Faça login"
      │
      └─→ Opção B: Clica "Login com Google"
          → OAuth2 flow
          → Consolida com user existente (se houver)
          → Confirma empréstimo
          → Redireciona para dashboard
```

---

## 3. Database Schema

### 3.1 Schema Completo com Drizzle ORM

```typescript
// src/db/schema.ts

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
  json,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ========================================
// ENUMS
// ========================================

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "merged", // Conta foi consolidada com outra
  "suspended",
  "deleted",
]);

export const loanStatusEnum = pgEnum("loan_status", [
  "pending", // Link enviado, aguardando confirmação
  "confirmed", // Receptor confirmou posse
  "returned", // Item devolvido
  "cancelled", // Cancelado pelo dono
  "disputed", // Há uma disputa
]);

export const oauthProviderEnum = pgEnum("oauth_provider", [
  "google",
  "apple",
  "facebook",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "loan_created",
  "loan_confirmed",
  "loan_reminder",
  "loan_returned",
  "loan_overdue",
]);

// ========================================
// TABLES
// ========================================

// Usuários (conta canônica)
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Dados básicos (vindos do OAuth)
    email: varchar("email", { length: 255 }),
    emailVerified: boolean("email_verified").default(false),
    name: varchar("name", { length: 255 }),
    avatarUrl: text("avatar_url"),

    // Metadados
    status: userStatusEnum("status").default("active").notNull(),
    mergedInto: uuid("merged_into").references(() => users.id),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastLoginAt: timestamp("last_login_at"),
  },
  (table) => ({
    emailIdx: index("email_idx").on(table.email),
    statusIdx: index("status_idx").on(table.status),
  }),
);

// Contas OAuth vinculadas
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    provider: oauthProviderEnum("provider").notNull(),
    providerAccountId: varchar("provider_account_id", {
      length: 255,
    }).notNull(), // ID no Google/Apple

    // Tokens OAuth (criptografados)
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at"),

    // Metadata do provider
    scope: text("scope"),
    tokenType: varchar("token_type", { length: 50 }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Garante um provider account por user
    providerAccountIdx: uniqueIndex("provider_account_idx").on(
      table.provider,
      table.providerAccountId,
    ),
    userIdx: index("oauth_user_idx").on(table.userId),
  }),
);

// Dispositivos (para consolidação de identidade)
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    // Device fingerprint
    deviceId: varchar("device_id", { length: 255 }).notNull(),
    fingerprint: json("fingerprint").$type<{
      userAgent: string;
      screenResolution: string;
      timezone: string;
      language: string;
      platform: string;
    }>(),

    // Metadados
    trusted: boolean("trusted").default(false),
    lastSeen: timestamp("last_seen").defaultNow().notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    deviceIdIdx: uniqueIndex("device_id_idx").on(table.deviceId),
    userDeviceIdx: index("user_device_idx").on(table.userId),
  }),
);

// Itens (coisas que podem ser emprestadas)
export const items = pgTable(
  "items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    // Descrição do item
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    imageUrl: text("image_url").notNull(),

    // Valor estimado (para contexto)
    estimatedValue: varchar("estimated_value", { length: 50 }),

    // Metadados
    category: varchar("category", { length: 100 }), // Ferramentas, Livros, Eletrônicos
    isActive: boolean("is_active").default(true).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("item_owner_idx").on(table.ownerId),
    activeIdx: index("item_active_idx").on(table.isActive),
  }),
);

// Empréstimos
export const loans = pgTable(
  "loans",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    itemId: uuid("item_id")
      .references(() => items.id, { onDelete: "cascade" })
      .notNull(),
    lenderId: uuid("lender_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    borrowerId: uuid("borrower_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Status e datas
    status: loanStatusEnum("status").default("pending").notNull(),
    borrowerHint: varchar("borrower_hint", { length: 255 }), // "João" antes do login

    lentAt: timestamp("lent_at").defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at"),
    expectedReturnDate: timestamp("expected_return_date"),
    returnedAt: timestamp("returned_at"),

    // Notas
    lenderNotes: text("lender_notes"), // "Lembre de trazer o carregador"
    borrowerNotes: text("borrower_notes"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    lenderIdx: index("loan_lender_idx").on(table.lenderId),
    borrowerIdx: index("loan_borrower_idx").on(table.borrowerId),
    statusIdx: index("loan_status_idx").on(table.status),
    itemIdx: index("loan_item_idx").on(table.itemId),
  }),
);

// Tokens de links temporários
export const loanTokens = pgTable(
  "loan_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    loanId: uuid("loan_id")
      .references(() => loans.id, { onDelete: "cascade" })
      .notNull(),

    token: text("token").notNull(), // JWT assinado
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    usedByDeviceId: varchar("used_by_device_id", { length: 255 }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("loan_token_idx").on(table.token),
    loanIdx: index("token_loan_idx").on(table.loanId),
  }),
);

// Notificações/Lembretes
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    loanId: uuid("loan_id").references(() => loans.id, { onDelete: "cascade" }),

    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),

    // Dual-node reminder structure
    targetItem: varchar("target_item", { length: 255 }), // "Furadeira"
    intendedAction: varchar("intended_action", { length: 255 }), // "Solicite a devolução"

    read: boolean("read").default(false).notNull(),
    sentAt: timestamp("sent_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("notification_user_idx").on(table.userId),
    readIdx: index("notification_read_idx").on(table.read),
  }),
);

// ========================================
// RELATIONS
// ========================================

export const usersRelations = relations(users, ({ many, one }) => ({
  oauthAccounts: many(oauthAccounts),
  devices: many(devices),
  ownedItems: many(items),
  lentLoans: many(loans, { relationName: "lender" }),
  borrowedLoans: many(loans, { relationName: "borrower" }),
  notifications: many(notifications),
  mergedFrom: one(users, {
    fields: [users.mergedInto],
    references: [users.id],
  }),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  user: one(users, {
    fields: [devices.userId],
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
    relationName: "lender",
  }),
  borrower: one(users, {
    fields: [loans.borrowerId],
    references: [users.id],
    relationName: "borrower",
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
```

### 3.2 Migrations

```typescript
// drizzle.config.ts
import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
```

```bash
# Gerar migration
npx drizzle-kit generate:pg

# Aplicar migration
npx drizzle-kit push:pg
```

---

## 4. Fluxo de Autenticação Social

### 4.1 Arquitetura OAuth2

```
┌──────────────┐
│ User Browser │
└──────┬───────┘
       │ 1. GET /auth/google
       ▼
┌─────────────────────────────────────────┐
│ Fastify Server                          │
│                                         │
│ passport.authenticate('google')         │
│ → Redireciona para Google OAuth        │
└──────┬──────────────────────────────────┘
       │ 2. Redirect to Google
       ▼
┌──────────────────────┐
│ Google OAuth Server  │
│ - User faz login     │
│ - Aprova scopes      │
└──────┬───────────────┘
       │ 3. Callback redirect
       │    /auth/google/callback?code=xyz
       ▼
┌─────────────────────────────────────────┐
│ Fastify Server                          │
│                                         │
│ 1. Troca code por access_token          │
│ 2. Busca profile do usuário             │
│ 3. Procura oauth_accounts.provider_id   │
│    ├─ Existe? → Login                   │
│    └─ Não existe?                       │
│       ├─ Tem deviceId? → Link account   │
│       └─ Novo user → Create + Link      │
│ 4. Gera JWT (accessToken + refreshToken)│
│ 5. Redireciona com token                │
└──────┬──────────────────────────────────┘
       │ 4. Redirect to app
       │    /?token=jwt_access_token
       ▼
┌──────────────┐
│ User Browser │
│ - Salva token│
│ - Vai /dashboard
└──────────────┘
```

### 4.2 Implementação com Passport.js

```typescript
// src/plugins/auth.ts

import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { db } from "../db";
import { users, oauthAccounts, devices } from "../db/schema";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";

export default fp(async (fastify: FastifyInstance) => {
  // ========================================
  // GOOGLE STRATEGY
  // ========================================

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: `${process.env.APP_URL}/auth/google/callback`,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const deviceId = req.cookies?.device_id || req.headers["x-device-id"];

          // 1. Busca conta OAuth existente
          const [existingAccount] = await db
            .select()
            .from(oauthAccounts)
            .where(
              and(
                eq(oauthAccounts.provider, "google"),
                eq(oauthAccounts.providerAccountId, profile.id),
              ),
            )
            .limit(1);

          let user;

          if (existingAccount) {
            // Usuário já existe - faz login
            [user] = await db
              .select()
              .from(users)
              .where(eq(users.id, existingAccount.userId))
              .limit(1);

            // Atualiza last login
            await db
              .update(users)
              .set({ lastLoginAt: new Date() })
              .where(eq(users.id, user.id));
          } else {
            // Novo usuário ou linking de conta

            // Verifica se há usuário temporário neste device
            let tempUser;
            if (deviceId) {
              const [device] = await db
                .select()
                .from(devices)
                .where(eq(devices.deviceId, deviceId))
                .limit(1);

              if (device) {
                [tempUser] = await db
                  .select()
                  .from(users)
                  .where(eq(users.id, device.userId))
                  .limit(1);
              }
            }

            if (tempUser && !tempUser.email) {
              // Upgrading temp user to full user
              [user] = await db
                .update(users)
                .set({
                  email,
                  emailVerified: true,
                  name: profile.displayName,
                  avatarUrl: profile.photos?.[0]?.value,
                  lastLoginAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(users.id, tempUser.id))
                .returning();
            } else {
              // Cria novo usuário
              [user] = await db
                .insert(users)
                .values({
                  email,
                  emailVerified: true,
                  name: profile.displayName,
                  avatarUrl: profile.photos?.[0]?.value,
                  lastLoginAt: new Date(),
                })
                .returning();
            }

            // Cria OAuth account
            await db.insert(oauthAccounts).values({
              userId: user.id,
              provider: "google",
              providerAccountId: profile.id,
              accessToken,
              refreshToken,
              expiresAt: new Date(Date.now() + 3600 * 1000), // 1h
              scope: "email profile",
              tokenType: "Bearer",
            });
          }

          // Link device se ainda não estiver linkado
          if (deviceId) {
            await db
              .insert(devices)
              .values({
                userId: user.id,
                deviceId,
                fingerprint: JSON.parse(req.headers["x-fingerprint"] || "{}"),
                trusted: true,
              })
              .onConflictDoUpdate({
                target: devices.deviceId,
                set: {
                  userId: user.id,
                  lastSeen: new Date(),
                  trusted: true,
                },
              });
          }

          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      },
    ),
  );

  // ========================================
  // FACEBOOK STRATEGY (similar)
  // ========================================

  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID!,
        clientSecret: process.env.FACEBOOK_APP_SECRET!,
        callbackURL: `${process.env.APP_URL}/auth/facebook/callback`,
        profileFields: ["id", "emails", "name", "picture"],
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        // Implementação similar ao Google
        // ...
      },
    ),
  );

  // Serialização (não usamos session, mas Passport exige)
  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    done(null, user);
  });

  fastify.decorate("passport", passport);
});

declare module "fastify" {
  interface FastifyInstance {
    passport: typeof passport;
  }
}
```

### 4.3 Routes de Autenticação

```typescript
// src/routes/auth/index.ts

import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

export default async function authRoutes(fastify: FastifyInstance) {
  // ========================================
  // GOOGLE AUTH
  // ========================================

  fastify.get(
    "/google",
    {
      schema: {
        tags: ["auth"],
        summary: "Inicia OAuth com Google",
        querystring: {
          type: "object",
          properties: {
            redirect: { type: "string" }, // URL de retorno após login
          },
        },
      },
      preHandler: (req, reply, done) => {
        // Salva redirect em cookie para usar no callback
        if (req.query.redirect) {
          reply.setCookie("auth_redirect", req.query.redirect, {
            httpOnly: true,
            maxAge: 600, // 10 min
          });
        }
        done();
      },
    },
    (req, reply) => {
      fastify.passport.authenticate("google", {
        scope: ["email", "profile"],
        session: false,
      })(req.raw, reply.raw);
    },
  );

  fastify.get(
    "/google/callback",
    {
      schema: {
        tags: ["auth"],
        summary: "Callback do Google OAuth",
      },
    },
    (req, reply) => {
      fastify.passport.authenticate(
        "google",
        {
          session: false,
          failureRedirect: "/login?error=auth_failed",
        },
        async (err, user) => {
          if (err || !user) {
            return reply.redirect("/login?error=auth_failed");
          }

          // Gera JWT tokens
          const accessToken = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET!,
            { expiresIn: "7d" },
          );

          const refreshToken = jwt.sign(
            { userId: user.id, type: "refresh" },
            process.env.JWT_REFRESH_SECRET!,
            { expiresIn: "30d" },
          );

          // Redirect com token
          const redirectUrl = req.cookies.auth_redirect || "/dashboard";
          reply.clearCookie("auth_redirect");

          return reply.redirect(
            `${redirectUrl}?access_token=${accessToken}&refresh_token=${refreshToken}`,
          );
        },
      )(req.raw, reply.raw);
    },
  );

  // ========================================
  // FACEBOOK AUTH
  // ========================================

  fastify.get("/facebook", (req, reply) => {
    fastify.passport.authenticate("facebook", {
      scope: ["email", "public_profile"],
      session: false,
    })(req.raw, reply.raw);
  });

  fastify.get("/facebook/callback", (req, reply) => {
    // Similar ao Google
  });

  // ========================================
  // REFRESH TOKEN
  // ========================================

  fastify.post(
    "/refresh",
    {
      schema: {
        tags: ["auth"],
        summary: "Renova access token",
        body: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { refreshToken } = req.body;

      try {
        const decoded = jwt.verify(
          refreshToken,
          process.env.JWT_REFRESH_SECRET!,
        ) as {
          userId: string;
          type: string;
        };

        if (decoded.type !== "refresh") {
          return reply.code(401).send({ error: "Invalid token type" });
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, decoded.userId))
          .limit(1);

        if (!user) {
          return reply.code(401).send({ error: "User not found" });
        }

        const newAccessToken = jwt.sign(
          { userId: user.id, email: user.email },
          process.env.JWT_SECRET!,
          { expiresIn: "7d" },
        );

        return { accessToken: newAccessToken };
      } catch (error) {
        return reply.code(401).send({ error: "Invalid refresh token" });
      }
    },
  );

  // ========================================
  // LOGOUT
  // ========================================

  fastify.post(
    "/logout",
    {
      schema: {
        tags: ["auth"],
        summary: "Faz logout (invalida tokens)",
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      // Em produção: adicionar token a blacklist no Redis
      return { message: "Logged out successfully" };
    },
  );

  // ========================================
  // GET CURRENT USER
  // ========================================

  fastify.get(
    "/me",
    {
      schema: {
        tags: ["auth"],
        summary: "Retorna usuário autenticado",
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          avatarUrl: users.avatarUrl,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, req.user.userId))
        .limit(1);

      return user;
    },
  );
}
```

---

## 5. API Endpoints

### 5.1 Estrutura de Endpoints

```
POST   /api/auth/google                    # Inicia OAuth Google
GET    /api/auth/google/callback           # Callback Google
POST   /api/auth/facebook                  # Inicia OAuth Facebook
GET    /api/auth/facebook/callback         # Callback Facebook
POST   /api/auth/refresh                   # Renova access token
POST   /api/auth/logout                    # Logout
GET    /api/auth/me                        # User atual

POST   /api/items                          # Criar item
GET    /api/items                          # Listar meus itens
GET    /api/items/:id                      # Detalhes do item
PATCH  /api/items/:id                      # Atualizar item
DELETE /api/items/:id                      # Deletar item
POST   /api/items/:id/upload-image         # Upload de foto

POST   /api/loans                          # Criar empréstimo
GET    /api/loans                          # Listar empréstimos
GET    /api/loans/:id                      # Detalhes do empréstimo
PATCH  /api/loans/:id/confirm              # Confirmar recebimento
PATCH  /api/loans/:id/return               # Marcar como devolvido
PATCH  /api/loans/:id/cancel               # Cancelar empréstimo
POST   /api/loans/:id/remind               # Enviar lembrete manual

GET    /api/links/:token                   # Validar link de empréstimo
POST   /api/links/:token/confirm           # Confirmar via link (sem auth)

GET    /api/dashboard                      # Dashboard do usuário
GET    /api/dashboard/stats                # Estatísticas

GET    /api/notifications                  # Listar notificações
PATCH  /api/notifications/:id/read         # Marcar como lida
DELETE /api/notifications/:id              # Deletar notificação

GET    /api/health                         # Health check
GET    /api/health/db                      # DB health check
```

### 5.2 Implementação Detalhada dos Endpoints

#### **Items Routes**

```typescript
// src/routes/items/index.ts

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db";
import { items } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { uploadImage } from "../../services/storage";

const createItemSchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  estimatedValue: z.string().max(50).optional(),
  imageBase64: z.string(), // Base64 encoded image
});

const updateItemSchema = createItemSchema.partial().omit({ imageBase64: true });

export default async function itemsRoutes(fastify: FastifyInstance) {
  // CREATE ITEM
  fastify.post(
    "/",
    {
      schema: {
        tags: ["items"],
        summary: "Cria um novo item",
        body: createItemSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const data = createItemSchema.parse(req.body);

      // Upload da imagem
      const imageUrl = await uploadImage(
        data.imageBase64,
        `items/${req.user.userId}`,
      );

      const [item] = await db
        .insert(items)
        .values({
          ownerId: req.user.userId,
          name: data.name,
          description: data.description,
          category: data.category,
          estimatedValue: data.estimatedValue,
          imageUrl,
        })
        .returning();

      return reply.code(201).send(item);
    },
  );

  // LIST ITEMS
  fastify.get(
    "/",
    {
      schema: {
        tags: ["items"],
        summary: "Lista itens do usuário",
        querystring: z.object({
          active: z.enum(["true", "false"]).optional(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const { active } = req.query;

      const userItems = await db
        .select()
        .from(items)
        .where(
          active
            ? and(
                eq(items.ownerId, req.user.userId),
                eq(items.isActive, active === "true"),
              )
            : eq(items.ownerId, req.user.userId),
        )
        .orderBy(items.createdAt);

      return userItems;
    },
  );

  // GET ITEM
  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["items"],
        summary: "Detalhes de um item",
        params: z.object({
          id: z.string().uuid(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const { id } = req.params;

      const [item] = await db
        .select()
        .from(items)
        .where(and(eq(items.id, id), eq(items.ownerId, req.user.userId)))
        .limit(1);

      if (!item) {
        return reply.code(404).send({ error: "Item not found" });
      }

      return item;
    },
  );

  // UPDATE ITEM
  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["items"],
        summary: "Atualiza um item",
        params: z.object({
          id: z.string().uuid(),
        }),
        body: updateItemSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const { id } = req.params;
      const data = updateItemSchema.parse(req.body);

      const [item] = await db
        .update(items)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(eq(items.id, id), eq(items.ownerId, req.user.userId)))
        .returning();

      if (!item) {
        return reply.code(404).send({ error: "Item not found" });
      }

      return item;
    },
  );

  // DELETE ITEM
  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["items"],
        summary: "Deleta um item",
        params: z.object({
          id: z.string().uuid(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const { id } = req.params;

      // Verifica se tem empréstimos ativos
      const [activeLoans] = await db
        .select()
        .from(loans)
        .where(and(eq(loans.itemId, id), eq(loans.status, "confirmed")))
        .limit(1);

      if (activeLoans) {
        return reply.code(400).send({
          error: "Cannot delete item with active loans",
        });
      }

      await db
        .update(items)
        .set({ isActive: false })
        .where(and(eq(items.id, id), eq(items.ownerId, req.user.userId)));

      return reply.code(204).send();
    },
  );
}
```

#### **Loans Routes**

```typescript
// src/routes/loans/index.ts

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db";
import { loans, items, loanTokens, users } from "../../db/schema";
import { eq, and, or } from "drizzle-orm";
import { generateLoanLink } from "../../services/loan-link";
import { sendNotification } from "../../services/notifications";

const createLoanSchema = z.object({
  itemId: z.string().uuid(),
  borrowerHint: z.string().min(1).max(255),
  expectedReturnDate: z.string().datetime().optional(),
  lenderNotes: z.string().max(1000).optional(),
});

export default async function loansRoutes(fastify: FastifyInstance) {
  // CREATE LOAN
  fastify.post(
    "/",
    {
      schema: {
        tags: ["loans"],
        summary: "Cria empréstimo e gera link",
        body: createLoanSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const data = createLoanSchema.parse(req.body);

      // Verifica se o item existe e pertence ao usuário
      const [item] = await db
        .select()
        .from(items)
        .where(
          and(eq(items.id, data.itemId), eq(items.ownerId, req.user.userId)),
        )
        .limit(1);

      if (!item) {
        return reply.code(404).send({ error: "Item not found" });
      }

      // Cria o empréstimo
      const [loan] = await db
        .insert(loans)
        .values({
          itemId: data.itemId,
          lenderId: req.user.userId,
          borrowerHint: data.borrowerHint,
          expectedReturnDate: data.expectedReturnDate
            ? new Date(data.expectedReturnDate)
            : undefined,
          lenderNotes: data.lenderNotes,
          status: "pending",
        })
        .returning();

      // Gera link de confirmação
      const { link, token } = await generateLoanLink(loan.id, {
        borrowerHint: data.borrowerHint,
      });

      // Salva token no banco
      await db.insert(loanTokens).values({
        loanId: loan.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
      });

      return reply.code(201).send({
        loan,
        confirmationLink: link,
        message: `Share this link with ${data.borrowerHint}`,
      });
    },
  );

  // LIST LOANS
  fastify.get(
    "/",
    {
      schema: {
        tags: ["loans"],
        summary: "Lista empréstimos",
        querystring: z.object({
          type: z.enum(["lent", "borrowed", "all"]).default("all"),
          status: z
            .enum(["pending", "confirmed", "returned", "cancelled"])
            .optional(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const { type, status } = req.query;

      let whereClause;
      if (type === "lent") {
        whereClause = eq(loans.lenderId, req.user.userId);
      } else if (type === "borrowed") {
        whereClause = eq(loans.borrowerId, req.user.userId);
      } else {
        whereClause = or(
          eq(loans.lenderId, req.user.userId),
          eq(loans.borrowerId, req.user.userId),
        );
      }

      if (status) {
        whereClause = and(whereClause, eq(loans.status, status));
      }

      const userLoans = await db
        .select({
          loan: loans,
          item: items,
          lender: users,
          borrower: users,
        })
        .from(loans)
        .leftJoin(items, eq(loans.itemId, items.id))
        .leftJoin(users, eq(loans.lenderId, users.id))
        .leftJoin(users, eq(loans.borrowerId, users.id))
        .where(whereClause)
        .orderBy(loans.createdAt);

      return userLoans;
    },
  );

  // CONFIRM LOAN (apenas para receptor)
  fastify.patch(
    "/:id/confirm",
    {
      schema: {
        tags: ["loans"],
        summary: "Confirma recebimento do item",
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          borrowerNotes: z.string().max(1000).optional(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const { id } = req.params;
      const { borrowerNotes } = req.body;

      const [loan] = await db
        .update(loans)
        .set({
          status: "confirmed",
          borrowerId: req.user.userId,
          confirmedAt: new Date(),
          borrowerNotes,
          updatedAt: new Date(),
        })
        .where(and(eq(loans.id, id), eq(loans.status, "pending")))
        .returning();

      if (!loan) {
        return reply.code(404).send({
          error: "Loan not found or already confirmed",
        });
      }

      // Notifica o dono
      await sendNotification({
        userId: loan.lenderId,
        type: "loan_confirmed",
        loanId: loan.id,
        title: "Item emprestado confirmado",
        message: `${req.user.name} confirmou que recebeu o item`,
      });

      return loan;
    },
  );

  // RETURN LOAN
  fastify.patch(
    "/:id/return",
    {
      schema: {
        tags: ["loans"],
        summary: "Marca item como devolvido",
        params: z.object({
          id: z.string().uuid(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const { id } = req.params;

      // Pode ser marcado como devolvido pelo dono OU pelo receptor
      const [loan] = await db
        .select()
        .from(loans)
        .where(eq(loans.id, id))
        .limit(1);

      if (!loan) {
        return reply.code(404).send({ error: "Loan not found" });
      }

      const isLender = loan.lenderId === req.user.userId;
      const isBorrower = loan.borrowerId === req.user.userId;

      if (!isLender && !isBorrower) {
        return reply.code(403).send({ error: "Unauthorized" });
      }

      const [updatedLoan] = await db
        .update(loans)
        .set({
          status: "returned",
          returnedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(loans.id, id))
        .returning();

      // Notifica a outra parte
      const notifyUserId = isLender ? loan.borrowerId! : loan.lenderId;
      await sendNotification({
        userId: notifyUserId,
        type: "loan_returned",
        loanId: loan.id,
        title: "Item devolvido",
        message: `${req.user.name} marcou o item como devolvido`,
      });

      return updatedLoan;
    },
  );

  // CANCEL LOAN (apenas dono)
  fastify.patch(
    "/:id/cancel",
    {
      schema: {
        tags: ["loans"],
        summary: "Cancela empréstimo",
        params: z.object({
          id: z.string().uuid(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const { id } = req.params;

      const [loan] = await db
        .update(loans)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(loans.id, id),
            eq(loans.lenderId, req.user.userId),
            or(eq(loans.status, "pending"), eq(loans.status, "confirmed")),
          ),
        )
        .returning();

      if (!loan) {
        return reply.code(404).send({
          error: "Loan not found or cannot be cancelled",
        });
      }

      return loan;
    },
  );

  // SEND MANUAL REMINDER
  fastify.post(
    "/:id/remind",
    {
      schema: {
        tags: ["loans"],
        summary: "Envia lembrete manual",
        params: z.object({
          id: z.string().uuid(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (req, reply) => {
      const { id } = req.params;

      const [loan] = await db
        .select({
          loan: loans,
          item: items,
        })
        .from(loans)
        .leftJoin(items, eq(loans.itemId, items.id))
        .where(
          and(
            eq(loans.id, id),
            eq(loans.lenderId, req.user.userId),
            eq(loans.status, "confirmed"),
          ),
        )
        .limit(1);

      if (!loan) {
        return reply.code(404).send({ error: "Loan not found" });
      }

      // Envia notificação com estrutura dual-node
      await sendNotification({
        userId: loan.loan.borrowerId!,
        type: "loan_reminder",
        loanId: loan.loan.id,
        title: `Lembrete: ${loan.item!.name}`,
        message: `${loan.item!.name} ainda está com você. Solicite a devolução agora.`,
        targetItem: loan.item!.name,
        intendedAction: "Devolva o item",
      });

      return { message: "Reminder sent successfully" };
    },
  );
}
```

#### **Link Routes (Acesso Público)**

```typescript
// src/routes/links/index.ts

import { FastifyInstance } from "fastify";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db } from "../../db";
import { loans, loanTokens, items, users, devices } from "../../db/schema";
import { eq, and } from "drizzle-orm";

export default async function linksRoutes(fastify: FastifyInstance) {
  // VALIDATE LINK (GET)
  fastify.get(
    "/:token",
    {
      schema: {
        tags: ["links"],
        summary: "Valida e retorna detalhes do empréstimo via link",
        params: z.object({
          token: z.string(),
        }),
      },
    },
    async (req, reply) => {
      const { token } = req.params;

      try {
        // 1. Verifica JWT
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
          loanId: string;
          borrowerHint: string;
        };

        // 2. Busca token no banco
        const [tokenRecord] = await db
          .select()
          .from(loanTokens)
          .where(eq(loanTokens.token, token))
          .limit(1);

        if (!tokenRecord) {
          return reply.code(404).send({ error: "Invalid link" });
        }

        if (tokenRecord.usedAt) {
          return reply.code(400).send({ error: "Link already used" });
        }

        if (new Date() > tokenRecord.expiresAt) {
          return reply.code(400).send({ error: "Link expired" });
        }

        // 3. Busca detalhes do empréstimo
        const [loanData] = await db
          .select({
            loan: loans,
            item: items,
            lender: {
              id: users.id,
              name: users.name,
              avatarUrl: users.avatarUrl,
            },
          })
          .from(loans)
          .leftJoin(items, eq(loans.itemId, items.id))
          .leftJoin(users, eq(loans.lenderId, users.id))
          .where(eq(loans.id, payload.loanId))
          .limit(1);

        if (!loanData) {
          return reply.code(404).send({ error: "Loan not found" });
        }

        // 4. Captura device fingerprint se disponível
        const deviceId = req.headers["x-device-id"] as string;
        let suggestedUser = null;

        if (deviceId) {
          const [device] = await db
            .select({
              user: users,
            })
            .from(devices)
            .leftJoin(users, eq(devices.userId, users.id))
            .where(eq(devices.deviceId, deviceId))
            .limit(1);

          if (device?.user) {
            suggestedUser = {
              id: device.user.id,
              name: device.user.name,
              email: device.user.email,
            };
          }
        }

        return {
          loan: loanData.loan,
          item: loanData.item,
          lender: loanData.lender,
          borrowerHint: payload.borrowerHint,
          suggestedUser, // Se já tiver usado o app neste device
          requiresAuth: !suggestedUser, // Se true, precisa fazer login
        };
      } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
          return reply.code(400).send({ error: "Invalid token" });
        }
        throw error;
      }
    },
  );

  // CONFIRM LOAN VIA LINK (sem autenticação)
  fastify.post(
    "/:token/confirm",
    {
      schema: {
        tags: ["links"],
        summary: "Confirma empréstimo via link (cria user temp se necessário)",
        params: z.object({
          token: z.string(),
        }),
        body: z.object({
          deviceId: z.string(),
          fingerprint: z.object({
            userAgent: z.string(),
            screenResolution: z.string(),
            timezone: z.string(),
            language: z.string(),
            platform: z.string(),
          }),
          notes: z.string().max(1000).optional(),
        }),
      },
    },
    async (req, reply) => {
      const { token } = req.params;
      const { deviceId, fingerprint, notes } = req.body;

      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
          loanId: string;
        };

        // Busca token
        const [tokenRecord] = await db
          .select()
          .from(loanTokens)
          .where(eq(loanTokens.token, token))
          .limit(1);

        if (!tokenRecord || tokenRecord.usedAt) {
          return reply.code(400).send({ error: "Invalid or used link" });
        }

        // Busca ou cria usuário baseado no device
        let userId: string;

        const [existingDevice] = await db
          .select()
          .from(devices)
          .where(eq(devices.deviceId, deviceId))
          .limit(1);

        if (existingDevice) {
          userId = existingDevice.userId;
        } else {
          // Cria usuário temporário
          const [newUser] = await db
            .insert(users)
            .values({
              status: "active",
            })
            .returning();

          userId = newUser.id;

          // Registra device
          await db.insert(devices).values({
            userId,
            deviceId,
            fingerprint,
          });
        }

        // Atualiza empréstimo
        const [loan] = await db
          .update(loans)
          .set({
            borrowerId: userId,
            status: "confirmed",
            confirmedAt: new Date(),
            borrowerNotes: notes,
            updatedAt: new Date(),
          })
          .where(eq(loans.id, payload.loanId))
          .returning();

        // Marca token como usado
        await db
          .update(loanTokens)
          .set({
            usedAt: new Date(),
            usedByDeviceId: deviceId,
          })
          .where(eq(loanTokens.id, tokenRecord.id));

        // Notifica dono
        await sendNotification({
          userId: loan.lenderId,
          type: "loan_confirmed",
          loanId: loan.id,
          title: "Empréstimo confirmado",
          message: "O item foi confirmado como recebido",
        });

        return {
          success: true,
          loan,
          message: "Loan confirmed successfully",
          isTemporaryUser: !existingDevice,
          loginUrl: "/auth/google", // Sugerir login
        };
      } catch (error) {
        throw error;
      }
    },
  );
}
```

### 5.3 Middleware de Autenticação

```typescript
// src/plugins/authenticate.ts

import fp from "fastify-plugin";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

declare module "fastify" {
  interface FastifyRequest {
    user: {
      userId: string;
      email?: string;
    };
  }
}

async function authenticatePlugin(fastify: FastifyInstance) {
  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return reply.code(401).send({ error: "Missing or invalid token" });
        }

        const token = authHeader.substring(7);

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
          userId: string;
          email?: string;
        };

        request.user = decoded;
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          return reply.code(401).send({ error: "Token expired" });
        }
        return reply.code(401).send({ error: "Invalid token" });
      }
    },
  );
}

export default fp(authenticatePlugin);
```

---

## 6. Validações Zod

### 6.1 Schemas Centralizados

```typescript
// src/schemas/common.ts

import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email();
export const urlSchema = z.string().url();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const timestampSchema = z.string().datetime();
```

```typescript
// src/schemas/items.ts

import { z } from "zod";

export const createItemSchema = z.object({
  name: z
    .string()
    .min(3, "Name must be at least 3 characters")
    .max(255, "Name too long"),
  description: z.string().max(1000, "Description too long").optional(),
  category: z.string().max(100).optional(),
  estimatedValue: z.string().max(50).optional(),
  imageBase64: z
    .string()
    .regex(/^data:image\/(png|jpg|jpeg|webp);base64,/, "Invalid image format"),
});

export const updateItemSchema = createItemSchema.partial().omit({
  imageBase64: true,
});

export const itemQuerySchema = z.object({
  active: z.enum(["true", "false"]).optional(),
  category: z.string().optional(),
});
```

```typescript
// src/schemas/loans.ts

import { z } from "zod";

export const createLoanSchema = z.object({
  itemId: z.string().uuid(),
  borrowerHint: z.string().min(1, "Borrower hint is required").max(255),
  expectedReturnDate: z
    .string()
    .datetime()
    .optional()
    .refine((date) => {
      if (!date) return true;
      return new Date(date) > new Date();
    }, "Expected return date must be in the future"),
  lenderNotes: z.string().max(1000).optional(),
});

export const confirmLoanSchema = z.object({
  borrowerNotes: z.string().max(1000).optional(),
});

export const loanQuerySchema = z.object({
  type: z.enum(["lent", "borrowed", "all"]).default("all"),
  status: z.enum(["pending", "confirmed", "returned", "cancelled"]).optional(),
});
```

### 6.2 Fastify Schema Integration

```typescript
// src/utils/schema-compiler.ts

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export function registerZodSchemas(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(({ schema }) => {
    return (data) => {
      try {
        if (schema instanceof z.ZodType) {
          schema.parse(data);
          return { value: data };
        }
        return { value: data };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return { error: error };
        }
        throw error;
      }
    };
  });

  fastify.setSerializerCompiler(({ schema }) => {
    if (schema instanceof z.ZodType) {
      const jsonSchema = zodToJsonSchema(schema);
      return (data) => JSON.stringify(data);
    }
    return (data) => JSON.stringify(data);
  });
}
```

---

## 7. Lógica de Negócio

### 7.1 Service: Loan Link Generation

```typescript
// src/services/loan-link.ts

import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";

interface GenerateLoanLinkOptions {
  borrowerHint: string;
}

export async function generateLoanLink(
  loanId: string,
  options: GenerateLoanLinkOptions,
) {
  const nonce = nanoid(16); // Anti-replay

  const payload = {
    loanId,
    borrowerHint: options.borrowerHint,
    nonce,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "7d" });

  const link = `${process.env.APP_URL}/l/${token}`;

  return { link, token };
}

export async function validateLoanToken(token: string) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      loanId: string;
      borrowerHint: string;
      nonce: string;
    };

    return { valid: true, payload };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { valid: false, error: "Token expired" };
    }
    return { valid: false, error: "Invalid token" };
  }
}
```

### 7.2 Service: User Consolidation

```typescript
// src/services/user-consolidation.ts

import { db } from "../db";
import { users, devices, loans, oauthAccounts } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Consolida um usuário temporário em um usuário completo
 * quando ele faz login social
 */
export async function consolidateUser(tempUserId: string, oauthUserId: string) {
  return await db.transaction(async (tx) => {
    // 1. Move todos os devices para o usuário OAuth
    await tx
      .update(devices)
      .set({ userId: oauthUserId })
      .where(eq(devices.userId, tempUserId));

    // 2. Move todos os empréstimos como borrower
    await tx
      .update(loans)
      .set({ borrowerId: oauthUserId })
      .where(eq(loans.borrowerId, tempUserId));

    // 3. Marca usuário temp como merged
    await tx
      .update(users)
      .set({
        status: "merged",
        mergedInto: oauthUserId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, tempUserId));

    return { success: true };
  });
}

/**
 * Detecta se um usuário temporário deve ser consolidado
 * quando um OAuth account é criado
 */
export async function detectAndConsolidateTempUser(
  deviceId: string,
  oauthUserId: string,
) {
  // Busca device
  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.deviceId, deviceId))
    .limit(1);

  if (!device) return null;

  // Verifica se é user temporário (sem email)
  const [tempUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, device.userId))
    .limit(1);

  if (!tempUser || tempUser.email) return null; // Não é temp

  // Consolida
  await consolidateUser(tempUser.id, oauthUserId);

  return { consolidated: true, tempUserId: tempUser.id };
}
```

### 7.3 Service: Notifications

```typescript
// src/services/notifications.ts

import { db } from "../db";
import { notifications } from "../db/schema";

interface SendNotificationOptions {
  userId: string;
  type:
    | "loan_created"
    | "loan_confirmed"
    | "loan_reminder"
    | "loan_returned"
    | "loan_overdue";
  loanId?: string;
  title: string;
  message: string;
  targetItem?: string;
  intendedAction?: string;
}

export async function sendNotification(options: SendNotificationOptions) {
  // Cria notificação no banco
  const [notification] = await db
    .insert(notifications)
    .values({
      userId: options.userId,
      loanId: options.loanId,
      type: options.type,
      title: options.title,
      message: options.message,
      targetItem: options.targetItem,
      intendedAction: options.intendedAction,
      sentAt: new Date(),
    })
    .returning();

  // TODO: Implementar push notification real
  // - Firebase Cloud Messaging (FCM)
  // - Apple Push Notification (APN)
  // - Web Push API

  return notification;
}

/**
 * Sistema de lembretes inteligentes
 * Baseado na ciência de Guynn, McDaniel, Einstein (1998)
 */
export async function scheduleSmartReminder(loanId: string) {
  const [loanData] = await db
    .select({
      loan: loans,
      item: items,
      borrower: users,
    })
    .from(loans)
    .leftJoin(items, eq(loans.itemId, items.id))
    .leftJoin(users, eq(loans.borrowerId, users.id))
    .where(eq(loans.id, loanId))
    .limit(1);

  if (!loanData || !loanData.borrower) return;

  // Dual-Node Reminder: [Target] + [Action]
  await sendNotification({
    userId: loanData.borrower.id,
    type: "loan_reminder",
    loanId,
    title: `Lembrete: ${loanData.item!.name}`,
    message: `${loanData.item!.name} ainda está com você. Solicite a devolução agora.`,
    targetItem: loanData.item!.name, // Target Node
    intendedAction: "Devolva o item", // Action Node
  });
}
```

### 7.4 Service: Image Upload

```typescript
// src/services/storage.ts

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { nanoid } from "nanoid";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

export async function uploadImage(
  base64Data: string,
  folder: string,
): Promise<string> {
  // Parse base64
  const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);

  if (!matches) {
    throw new Error("Invalid base64 image format");
  }

  const extension = matches[1];
  const imageBuffer = Buffer.from(matches[2], "base64");

  // Gera nome único
  const filename = `${nanoid()}.${extension}`;
  const relativePath = join(folder, filename);
  const absolutePath = join(UPLOAD_DIR, relativePath);

  // Cria diretório se não existe
  await mkdir(join(UPLOAD_DIR, folder), { recursive: true });

  // Salva arquivo
  await writeFile(absolutePath, imageBuffer);

  // Retorna URL público
  return `/uploads/${relativePath}`;
}

/**
 * Em produção, usar Oracle Object Storage:
 * https://docs.oracle.com/en-us/iaas/Content/Object/home.htm
 */
export async function uploadToOracleStorage(buffer: Buffer, filename: string) {
  // TODO: Implementar com Oracle SDK
  // const oci = require('oci-sdk');
  // ...
}
```

---

## 8. Estrutura de Pastas

```
taccomquem/
├── drizzle/
│   └── migrations/              # SQL migrations
│       ├── 0000_initial.sql
│       └── meta/
├── src/
│   ├── config/
│   │   ├── database.ts          # Drizzle config
│   │   ├── redis.ts             # Redis client
│   │   └── env.ts               # Environment variables
│   ├── db/
│   │   ├── schema.ts            # Database schema
│   │   └── index.ts             # DB connection
│   ├── plugins/
│   │   ├── auth.ts              # Passport config
│   │   ├── authenticate.ts      # JWT middleware
│   │   ├── cors.ts              # CORS config
│   │   ├── helmet.ts            # Security headers
│   │   ├── rate-limit.ts        # Rate limiting
│   │   └── swagger.ts           # API docs
│   ├── routes/
│   │   ├── auth/
│   │   │   └── index.ts
│   │   ├── items/
│   │   │   └── index.ts
│   │   ├── loans/
│   │   │   └── index.ts
│   │   ├── links/
│   │   │   └── index.ts
│   │   ├── notifications/
│   │   │   └── index.ts
│   │   ├── dashboard/
│   │   │   └── index.ts
│   │   └── health/
│   │       └── index.ts
│   ├── services/
│   │   ├── loan-link.ts
│   │   ├── notifications.ts
│   │   ├── storage.ts
│   │   └── user-consolidation.ts
│   ├── schemas/
│   │   ├── common.ts
│   │   ├── items.ts
│   │   ├── loans.ts
│   │   └── auth.ts
│   ├── utils/
│   │   ├── logger.ts            # Pino logger
│   │   ├── crypto.ts            # Encryption helpers
│   │   └── schema-compiler.ts
│   ├── types/
│   │   ├── fastify.d.ts         # Type augmentation
│   │   └── index.ts
│   ├── jobs/                    # Background jobs
│   │   ├── reminder-scheduler.ts
│   │   └── cleanup-expired-tokens.ts
│   └── index.ts                 # App entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── uploads/                     # Local file storage (dev)
├── logs/                        # Application logs
├── .env.example
├── .env
├── .dockerignore
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## 9. Configuração do Projeto

### 9.1 package.json

```json
{
  "name": "taccomquem",
  "version": "1.0.0",
  "description": "Loan tracking app with social login",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node --max-old-space-size=384 dist/index.js",
    "migrate:generate": "drizzle-kit generate:pg",
    "migrate:push": "drizzle-kit push:pg",
    "migrate:drop": "drizzle-kit drop",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^12.0.1",
    "@fastify/jwt": "^8.0.1",
    "@fastify/rate-limit": "^10.1.1",
    "@fastify/static": "^7.0.4",
    "@fastify/cookie": "^10.0.1",
    "@fastify/multipart": "^9.0.1",
    "drizzle-orm": "^0.35.3",
    "fastify": "^5.2.0",
    "fastify-plugin": "^5.0.1",
    "ioredis": "^5.4.1",
    "jsonwebtoken": "^9.0.2",
    "nanoid": "^5.0.9",
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "passport-facebook": "^3.0.0",
    "pg": "^8.13.1",
    "pino": "^9.5.0",
    "pino-pretty": "^13.0.0",
    "zod": "^3.23.8",
    "zod-to-json-schema": "^3.24.1",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.10.2",
    "@types/passport": "^1.0.17",
    "@types/passport-google-oauth20": "^2.0.16",
    "@types/passport-facebook": "^3.0.3",
    "@types/pg": "^8.11.10",
    "@typescript-eslint/eslint-plugin": "^8.18.2",
    "@typescript-eslint/parser": "^8.18.2",
    "drizzle-kit": "^0.28.1",
    "eslint": "^9.17.0",
    "prettier": "^3.4.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

### 9.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "types": ["node"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 9.3 .env.example

```bash
# Server
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://tacq_user:password@localhost:5432/taccomquem

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars

# OAuth - Google
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# OAuth - Facebook
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# Storage
UPLOAD_DIR=./uploads

# Logging
LOG_LEVEL=info
```

### 9.4 Main Application File

```typescript
// src/index.ts

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import { join } from "path";
import dotenv from "dotenv";

// Plugins
import authPlugin from "./plugins/auth";
import authenticatePlugin from "./plugins/authenticate";

// Routes
import authRoutes from "./routes/auth";
import itemsRoutes from "./routes/items";
import loansRoutes from "./routes/loans";
import linksRoutes from "./routes/links";
import healthRoutes from "./routes/health";

dotenv.config();

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport:
      process.env.NODE_ENV === "development"
        ? {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          }
        : undefined,
  },
});

async function start() {
  try {
    // Security
    await fastify.register(helmet, {
      contentSecurityPolicy: false, // Desabilitar para dev
    });

    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
    });

    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
    });

    // Utilities
    await fastify.register(cookie);
    await fastify.register(multipart);

    await fastify.register(staticFiles, {
      root: join(__dirname, "../uploads"),
      prefix: "/uploads/",
    });

    // Auth
    await fastify.register(authPlugin);
    await fastify.register(authenticatePlugin);

    // Routes
    await fastify.register(authRoutes, { prefix: "/api/auth" });
    await fastify.register(itemsRoutes, { prefix: "/api/items" });
    await fastify.register(loansRoutes, { prefix: "/api/loans" });
    await fastify.register(linksRoutes, { prefix: "/l" }); // Short URL
    await fastify.register(healthRoutes, { prefix: "/api/health" });

    // Start server
    const port = parseInt(process.env.PORT || "3000", 10);
    const host = process.env.HOST || "0.0.0.0";

    await fastify.listen({ port, host });

    console.log(`🚀 Server running at http://${host}:${port}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
```

---

## 10. Segurança e Rate Limiting

### 10.1 Rate Limiting Avançado

```typescript
// src/plugins/rate-limit.ts

import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import { FastifyInstance } from "fastify";
import Redis from "ioredis";

export default fp(async (fastify: FastifyInstance) => {
  const redis = new Redis(process.env.REDIS_URL!);

  await fastify.register(rateLimit, {
    global: false, // Não aplicar globalmente
    redis, // Use Redis para rate limiting distribuído
    keyGenerator: (req) => {
      // Rate limit por IP + userId (se autenticado)
      const userId = req.user?.userId || "anonymous";
      return `${req.ip}-${userId}`;
    },
  });

  // Rate limit específico para criação de empréstimos
  fastify.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/api/loans") && request.method === "POST") {
      await fastify.rateLimit({
        max: 10,
        timeWindow: "1 hour",
      })(request, reply);
    }
  });

  // Rate limit para confirmação de links (prevenir abuse)
  fastify.addHook("preHandler", async (request, reply) => {
    if (request.url.match(/^\/l\/.*\/confirm$/)) {
      await fastify.rateLimit({
        max: 5,
        timeWindow: "10 minutes",
      })(request, reply);
    }
  });
});
```

### 10.2 Helmet Security Headers

```typescript
// src/plugins/helmet.ts

import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import { FastifyInstance } from "fastify";

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://accounts.google.com"],
        frameSrc: ["'self'", "https://accounts.google.com"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });
});
```

---

## 11. Testes

### 11.1 Configuração de Testes

```typescript
// tests/setup.ts

import { beforeAll, afterAll } from "vitest";
import { db } from "../src/db";
import { sql } from "drizzle-orm";

beforeAll(async () => {
  // Setup test database
  await db.execute(sql`DROP SCHEMA IF EXISTS test CASCADE`);
  await db.execute(sql`CREATE SCHEMA test`);
  // Run migrations
});

afterAll(async () => {
  // Cleanup
  await db.execute(sql`DROP SCHEMA IF EXISTS test CASCADE`);
});
```

### 11.2 Exemplos de Testes

```typescript
// tests/unit/loan-link.test.ts

import { describe, it, expect } from "vitest";
import {
  generateLoanLink,
  validateLoanToken,
} from "../../src/services/loan-link";

describe("Loan Link Service", () => {
  it("should generate valid loan link", async () => {
    const { link, token } = await generateLoanLink("loan-123", {
      borrowerHint: "João",
    });

    expect(link).toContain("/l/");
    expect(token).toBeTruthy();

    const validation = await validateLoanToken(token);
    expect(validation.valid).toBe(true);
    expect(validation.payload?.loanId).toBe("loan-123");
  });

  it("should reject expired tokens", async () => {
    // Mock JWT com data expirada
    // ...
  });
});
```

```typescript
// tests/integration/auth.test.ts

import { describe, it, expect } from "vitest";
import { build } from "../helpers";

describe("Auth Routes", () => {
  it("should redirect to Google OAuth", async () => {
    const app = await build();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/google",
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain("accounts.google.com");
  });
});
```

---

## 12. Deploy e CI/CD

### 12.1 GitHub Actions

```yaml
# .github/workflows/deploy.yml

name: Deploy to Oracle Cloud

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Deploy to Oracle Cloud
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.ORACLE_HOST }}
          username: ubuntu
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ~/taccomquem
            git pull origin main
            docker compose down
            docker compose up -d --build
```

### 12.2 Health Checks

```typescript
// src/routes/health/index.ts

import { FastifyInstance } from "fastify";
import { db } from "../../db";
import { sql } from "drizzle-orm";

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  fastify.get("/db", async (req, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return { status: "ok", database: "connected" };
    } catch (error) {
      return reply.code(503).send({
        status: "error",
        database: "disconnected",
      });
    }
  });
}
```

---

## 13. Próximos Passos

### Fase 1: MVP (2-3 semanas)

- [ ] Setup do projeto + Docker
- [ ] Database schema com Drizzle
- [ ] Autenticação Google OAuth
- [ ] CRUD de items
- [ ] Criação e confirmação de empréstimos
- [ ] Sistema de links temporários

### Fase 2: Core Features (2 semanas)

- [ ] Dashboard com estatísticas
- [ ] Sistema de notificações
- [ ] Upload de imagens para Oracle Object Storage
- [ ] Lembretes inteligentes (dual-node)

### Fase 3: Polish (1-2 semanas)

- [ ] Apple/Facebook OAuth
- [ ] Testes E2E
- [ ] Performance optimization
- [ ] Deploy automatizado

### Fase 4: Scale (futuro)

- [ ] Push notifications (FCM/APN)
- [ ] WebSockets para real-time updates
- [ ] Analytics dashboard
- [ ] Mobile app (React Native)

---
