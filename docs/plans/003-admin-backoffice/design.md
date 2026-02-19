# TáComQuem — Design do Sistema Admin e Backoffice

**Data:** 2026-02-04
**Status:** Validado
**Iniciativa:** 003-admin-backoffice

---

## 1. Visão Geral

Sistema administrativo completo para gestão, moderação e analytics da plataforma TáComQuem. Implementa controle de acesso baseado em roles (RBAC) com 4 níveis de permissão.

### 1.1 Objetivos

1. **Gestão de usuários** — Visualizar, bloquear/desbloquear usuários com compliance LGPD
2. **Moderação de conteúdo** — Remover itens/empréstimos inadequados
3. **Analytics** — Dashboard com KPIs e métricas do sistema
4. **Gestão de admins** — Promover usuários, atribuir roles, audit log completo

### 1.2 Decisões Arquiteturais

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| **Sistema de permissões** | RBAC Simples com enum | MVP-first, fácil evolução futura |
| **Identificação** | Campo `role` na tabela `users` | Reutiliza estrutura existente |
| **Roles** | USER, ANALYST, SUPPORT, MODERATOR, SUPER_ADMIN | Cobertura completa de funcionalidades |
| **Bootstrap** | Script CLI | Seguro e controlado |
| **Privacy** | Dados parcialmente mascarados | Compliance LGPD |
| **Interface** | API REST apenas | Frontend separado (React/Next.js) |

---

## 2. Estrutura de Arquivos

```
src/
├── db/
│   └── schema.ts                    # ➕ Adicionar roleEnum, adminActionEnum
│                                    # ➕ Adicionar campos role, isActive, etc
│                                    # ➕ Nova tabela adminAuditLog
│
├── plugins/
│   ├── jwt.ts                       # ✏️ Modificar: incluir role no token
│   └── rbac.ts                      # 🆕 Novo: decorator requireRole
│
├── routes/
│   └── admin/
│       ├── index.ts                 # 🆕 Rotas gerais do admin
│       ├── analytics.ts             # 🆕 Dashboard e métricas
│       ├── users.ts                 # 🆕 Gestão de usuários
│       ├── moderation.ts            # 🆕 Moderação de conteúdo
│       └── admins.ts                # 🆕 Gestão de admins/roles
│
├── services/
│   └── admin/
│       ├── index.ts                 # 🆕 Gestão de usuários
│       ├── analytics.ts             # 🆕 Agregações e métricas
│       ├── moderation.ts            # 🆕 Moderação de itens/loans
│       ├── admins.ts                # 🆕 Gestão de roles
│       ├── helpers.ts               # 🆕 maskEmail, maskName, getClientIp
│       └── __tests__/
│           ├── admin.test.ts
│           ├── analytics.test.ts
│           ├── moderation.test.ts
│           └── admins.test.ts
│
├── schemas/
│   └── admin.ts                     # 🆕 Validações Zod para admin
│
└── scripts/
    └── create-admin.ts              # 🆕 CLI para criar SUPER_ADMIN
```

---

## 3. Schema do Banco de Dados

### 3.1 Modificações na Tabela `users`

```typescript
// Enum de roles
export const roleEnum = pgEnum('user_role', [
  'USER',           // Usuário comum (default)
  'ANALYST',        // Acesso read-only a métricas
  'SUPPORT',        // Visualizar usuários e dar suporte
  'MODERATOR',      // Moderar conteúdo
  'SUPER_ADMIN'     // Acesso total
]);

// Campos adicionados
export const users = pgTable('users', {
  // ... campos existentes ...
  role: roleEnum('role').default('USER').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  blockedAt: timestamp('blocked_at'),
  blockedReason: text('blocked_reason'),
  // ...
});
```

### 3.2 Nova Tabela: `adminAuditLog`

```typescript
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

export const adminAuditLog = pgTable('admin_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: adminActionEnum('action').notNull(),
  targetType: varchar('target_type', { length: 50 }), // 'user' | 'item' | 'loan'
  targetId: uuid('target_id'),
  metadata: text('metadata'), // JSON com detalhes da ação
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});
```

### 3.3 Relations

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  // ... relações existentes ...
  adminActions: many(adminAuditLog)
}));

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  admin: one(users, {
    fields: [adminAuditLog.adminId],
    references: [users.id]
  })
}));
```

### 3.4 Migrations

**0002_add_admin_roles.sql**
```sql
-- Criar enum para roles
CREATE TYPE user_role AS ENUM ('USER', 'ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN');

-- Adicionar colunas à tabela users
ALTER TABLE users
  ADD COLUMN role user_role NOT NULL DEFAULT 'USER',
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN blocked_at timestamp,
  ADD COLUMN blocked_reason text;

-- Index para buscas por role
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
```

**0003_add_admin_audit_log.sql**
```sql
-- Criar enum para ações
CREATE TYPE admin_action AS ENUM (
  'user_blocked',
  'user_unblocked',
  'user_deleted',
  'item_removed',
  'loan_cancelled',
  'admin_created',
  'admin_role_changed',
  'admin_removed',
  'content_flagged'
);

-- Criar tabela de audit log
CREATE TABLE admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action admin_action NOT NULL,
  target_type varchar(50),
  target_id uuid,
  metadata text,
  ip_address varchar(45),
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Indexes para performance
CREATE INDEX idx_audit_log_admin_id ON admin_audit_log(admin_id);
CREATE INDEX idx_audit_log_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX idx_audit_log_target ON admin_audit_log(target_type, target_id);
```

---

## 4. Sistema de Permissões (RBAC)

### 4.1 Matriz de Permissões

| Funcionalidade | USER | ANALYST | SUPPORT | MODERATOR | SUPER_ADMIN |
|----------------|------|---------|---------|-----------|-------------|
| **Analytics** |
| Ver dashboard admin | ❌ | ✅ | ✅ | ✅ | ✅ |
| Exportar relatórios | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Usuários** |
| Listar usuários | ❌ | ✅ (read-only) | ✅ | ✅ | ✅ |
| Ver detalhes usuário | ❌ | ❌ | ✅ | ✅ | ✅ |
| Bloquear/desbloquear | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Moderação** |
| Ver itens/loans | ❌ | ❌ | ✅ (read-only) | ✅ | ✅ |
| Remover conteúdo | ❌ | ❌ | ❌ | ✅ | ✅ |
| Cancelar empréstimo | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Admins** |
| Listar admins | ❌ | ❌ | ❌ | ❌ | ✅ |
| Criar admin | ❌ | ❌ | ❌ | ❌ | ✅ |
| Mudar role | ❌ | ❌ | ❌ | ❌ | ✅ |
| Remover admin | ❌ | ❌ | ❌ | ❌ | ✅ |

### 4.2 Plugin RBAC

**Arquivo:** `src/plugins/rbac.ts`

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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
  return requiredRoles.some(role => roleHierarchy[userRole] >= roleHierarchy[role]);
}

async function rbacPlugin(fastify: FastifyInstance) {
  fastify.decorate('requireRole', (allowedRoles: UserRole | UserRole[]) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;

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

### 4.3 Modificação no JWT Plugin

**Incluir role no payload do token:**

```typescript
// src/plugins/jwt.ts
interface TokenPayload {
  userId: string;
  role: UserRole; // ➕ Adicionar
}

function signAccessToken(userId: string, role: UserRole): string {
  return fastify.jwt.sign(
    { userId, role },
    { expiresIn: '7d' }
  );
}

// No authenticate decorator, adicionar role ao request.user
request.user = {
  userId: decoded.userId,
  role: decoded.role || 'USER' // fallback para tokens antigos
};
```

### 4.4 Uso nas Rotas

```typescript
// Exemplo: src/routes/admin/users.ts
fastify.get('/', {
  preHandler: [
    fastify.authenticate,
    fastify.requireRole(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
  ]
}, handler);

// Apenas SUPER_ADMIN
fastify.post('/:id/block', {
  preHandler: [
    fastify.authenticate,
    fastify.requireRole('SUPER_ADMIN')
  ]
}, handler);
```

---

## 5. API Endpoints

### 5.1 Analytics - Dashboard e Métricas

**Base path:** `/api/admin/analytics`

| Método | Endpoint | Role Mínimo | Descrição |
|--------|----------|-------------|-----------|
| GET | `/dashboard` | ANALYST | KPIs gerais do sistema |
| GET | `/users/stats` | ANALYST | Estatísticas de usuários |
| GET | `/loans/stats` | ANALYST | Estatísticas de empréstimos |
| GET | `/items/stats` | ANALYST | Estatísticas de itens |

**Response `GET /dashboard`:**
```json
{
  "summary": {
    "totalUsers": 1523,
    "activeUsers": 892,
    "totalItems": 3401,
    "activeLoans": 456,
    "totalLoans": 2103
  },
  "trends": {
    "newUsersLastWeek": 45,
    "newLoansLastWeek": 123,
    "returnRateLast30Days": 0.78
  }
}
```

### 5.2 Gestão de Usuários

**Base path:** `/api/admin/users`

| Método | Endpoint | Role Mínimo | Descrição |
|--------|----------|-------------|-----------|
| GET | `/` | ANALYST | Lista usuários (paginado) |
| GET | `/:id` | SUPPORT | Detalhes de um usuário |
| POST | `/:id/block` | SUPER_ADMIN | Bloquear usuário |
| POST | `/:id/unblock` | SUPER_ADMIN | Desbloquear usuário |
| GET | `/:id/activity` | SUPPORT | Histórico de atividades |

**Query params `GET /`:**
```typescript
{
  page?: number;           // default: 1
  limit?: number;          // default: 50, max: 100
  search?: string;         // busca por nome/email (hash)
  role?: UserRole;         // filtrar por role
  isActive?: boolean;      // filtrar bloqueados/ativos
  sortBy?: 'createdAt' | 'lastActivity';
  sortOrder?: 'asc' | 'desc';
}
```

**Response `GET /` (dados mascarados):**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "jo***@gmail.com",
      "name": "João S***",
      "role": "USER",
      "isActive": true,
      "emailVerified": true,
      "loansAsLender": 5,
      "loansAsBorrower": 3,
      "itemsCount": 8,
      "createdAt": "2026-01-15T10:30:00Z",
      "lastActivityAt": "2026-02-03T14:22:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1523,
    "totalPages": 31
  }
}
```

**Body `POST /:id/block`:**
```json
{
  "reason": "string (mínimo 10 caracteres)"
}
```

### 5.3 Moderação de Conteúdo

**Base path:** `/api/admin/moderation`

| Método | Endpoint | Role Mínimo | Descrição |
|--------|----------|-------------|-----------|
| GET | `/items` | SUPPORT | Lista itens (com filtros) |
| GET | `/items/:id` | SUPPORT | Detalhes do item com histórico |
| DELETE | `/items/:id` | MODERATOR | Remover item (soft delete) |
| GET | `/loans` | SUPPORT | Lista empréstimos |
| GET | `/loans/:id` | SUPPORT | Detalhes do empréstimo |
| POST | `/loans/:id/cancel` | MODERATOR | Cancelar empréstimo |

**Response `GET /items/:id`:**
```json
{
  "id": "uuid",
  "name": "Furadeira Bosch",
  "description": "...",
  "images": ["url1", "url2"],
  "isActive": true,
  "owner": {
    "id": "uuid",
    "name": "João S***",
    "email": "jo***@gmail.com"
  },
  "loansHistory": [
    {
      "id": "uuid",
      "borrower": { "name": "Maria A***" },
      "status": "returned",
      "createdAt": "2026-01-10",
      "returnedAt": "2026-01-20"
    }
  ],
  "activeLoans": [
    {
      "id": "uuid",
      "borrower": { "name": "Pedro L***" },
      "status": "confirmed",
      "expectedReturnDate": "2026-02-10"
    }
  ],
  "createdAt": "2025-12-05",
  "updatedAt": "2026-01-10"
}
```

### 5.4 Gestão de Admins

**Base path:** `/api/admin/admins`

| Método | Endpoint | Role Mínimo | Descrição |
|--------|----------|-------------|-----------|
| GET | `/` | SUPER_ADMIN | Lista todos admins |
| POST | `/` | SUPER_ADMIN | Promover usuário a admin |
| PATCH | `/:id/role` | SUPER_ADMIN | Mudar role de um admin |
| DELETE | `/:id` | SUPER_ADMIN | Remover role de admin (volta a USER) |
| GET | `/audit-log` | SUPER_ADMIN | Log de ações administrativas |

**Body `POST /` (promover a admin):**
```json
{
  "userId": "string (UUID)",
  "role": "ANALYST | SUPPORT | MODERATOR | SUPER_ADMIN"
}
```

**Response `GET /audit-log`:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "admin": {
        "id": "uuid",
        "name": "Admin Principal",
        "role": "SUPER_ADMIN"
      },
      "action": "user_blocked",
      "targetType": "user",
      "targetId": "uuid",
      "metadata": {
        "reason": "Spam de empréstimos falsos",
        "userEmail": "sp***@example.com"
      },
      "ipAddress": "192.168.1.1",
      "createdAt": "2026-02-04T10:30:00Z"
    }
  ],
  "pagination": { }
}
```

---

## 6. Services e Lógica de Negócio

### 6.1 Helpers (`src/services/admin/helpers.ts`)

```typescript
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

export function maskName(name: string): string {
  const parts = name.split(' ');
  if (parts.length === 1) {
    return parts[0].length > 2 ? `${parts[0].slice(0, 2)}***` : `${parts[0][0]}***`;
  }
  return `${parts[0]} ${parts[parts.length - 1][0]}***`;
}

export function getClientIp(request: any): string | undefined {
  return (
    request.headers['x-forwarded-for']?.split(',')[0] ||
    request.headers['x-real-ip'] ||
    request.ip
  );
}
```

### 6.2 Analytics (`src/services/admin/analytics.ts`)

**Funções principais:**
- `getDashboardStats()` — Retorna KPIs do sistema
- `getUsersStats()` — Estatísticas de usuários
- `getLoansStats()` — Estatísticas de empréstimos
- `getItemsStats()` — Estatísticas de itens

**Implementação:**
```typescript
export async function getDashboardStats(): Promise<DashboardStats> {
  // Agregações usando Drizzle ORM
  // - Total de usuários
  // - Usuários ativos (últimos 30 dias)
  // - Total de itens ativos
  // - Empréstimos confirmados (ativos)
  // - Novos usuários/empréstimos (última semana)
  // - Taxa de devolução
}
```

### 6.3 User Management (`src/services/admin/index.ts`)

**Funções principais:**
- `listUsers(params)` — Lista usuários com dados mascarados
- `getUserDetails(userId)` — Detalhes de um usuário
- `blockUser(userId, adminId, reason, ip)` — Bloquear usuário + audit log
- `unblockUser(userId, adminId, ip)` — Desbloquear usuário + audit log

**Importante:** Sempre descriptografar dados apenas para mascarar, nunca retornar plaintext.

### 6.4 Moderation (`src/services/admin/moderation.ts`)

**Funções principais:**
- `getItemDetails(itemId)` — Item com histórico de loans
- `removeItem(itemId, adminId, reason, ip)` — Soft delete + audit log
- `getLoanDetails(loanId)` — Detalhes do empréstimo
- `cancelLoan(loanId, adminId, reason, ip)` — Cancelar + audit log

### 6.5 Admin Management (`src/services/admin/admins.ts`)

**Funções principais:**
- `listAdmins()` — Lista todos admins
- `promoteToAdmin(userId, role, adminId, ip)` — Promover usuário
- `changeAdminRole(userId, newRole, adminId, ip)` — Mudar role
- `removeAdmin(userId, adminId, ip)` — Remover role admin

---

## 7. Validações Zod

**Arquivo:** `src/schemas/admin.ts`

```typescript
import { z } from 'zod';

export const roleSchema = z.enum(['USER', 'ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']);

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

export const removeItemSchema = z.object({
  reason: z.string().min(10)
});

export const promoteAdminSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
});

export const changeRoleSchema = z.object({
  role: z.enum(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'])
});
```

---

## 8. Script de Bootstrap

**Arquivo:** `src/scripts/create-admin.ts`

Script CLI interativo para criar SUPER_ADMIN:

```bash
bun run admin:create

# Interação:
Email: admin@tacq.com
Senha (mínimo 8 caracteres): ********
Nome completo: Admin Principal

✅ SUPER_ADMIN criado com sucesso!
```

**Funcionalidades:**
- Valida email, senha (min 8 chars), nome (min 3 chars)
- Verifica se usuário já existe
- Se existir, promove para SUPER_ADMIN
- Se não existir, cria novo com `emailVerified = true`
- Criptografa dados (email/nome) e hash de senha

**Adicionar ao `package.json`:**
```json
{
  "scripts": {
    "admin:create": "bun run src/scripts/create-admin.ts"
  }
}
```

---

## 9. Testes

### 9.1 Cobertura Esperada

- **Services:** > 80% de cobertura
- **RBAC Plugin:** 100% de cobertura
- **Helpers:** 100% de cobertura

### 9.2 Arquivos de Teste

```
src/services/admin/__tests__/
  ├── admin.test.ts           # listUsers, blockUser, unblockUser
  ├── analytics.test.ts       # getDashboardStats
  ├── moderation.test.ts      # getItemDetails, removeItem, cancelLoan
  └── admins.test.ts          # promoteToAdmin, changeRole, removeAdmin

src/plugins/__tests__/
  └── rbac.test.ts            # requireRole decorator
```

### 9.3 Executar Testes

```bash
# Todos os testes de admin
bun run test:admin

# Específico
bun test src/services/admin/__tests__/analytics.test.ts

# Com cobertura
bun test:coverage src/services/admin/
```

---

## 10. Segurança e Compliance

### 10.1 LGPD

✅ **Mascaramento de dados:**
- Email: `jo***@gmail.com`
- Nome: `João S***`
- Admins veem dados mascarados por padrão
- Descriptografia apenas para mascaramento (nunca retorna plaintext)

✅ **Audit log:**
- Todas ações administrativas registradas
- IP address e user agent capturados
- Metadata com detalhes da ação

### 10.2 Segurança

✅ **Rate limiting:** 5 req/s em rotas admin (mais restritivo)
✅ **Autenticação:** JWT obrigatório em todos endpoints
✅ **Autorização:** Role verification em cada rota
✅ **Validação:** Zod schemas em todos inputs
✅ **Logs:** Pino para auditoria

### 10.3 Recomendações Futuras

- 2FA para SUPER_ADMIN
- Sessões com timeout de 30min
- Notificações por email em mudanças de role
- Dashboard de segurança

---

## 11. Checklist de Implementação

### Fase 1: Base (2-3 dias)
- [ ] Adicionar enums `roleEnum` e `adminActionEnum` ao schema
- [ ] Adicionar campos `role`, `isActive`, `blockedAt`, `blockedReason` em `users`
- [ ] Criar tabela `adminAuditLog`
- [ ] Gerar migrations (`bun run db:generate`)
- [ ] Aplicar migrations (`bun run db:migrate`)
- [ ] Criar plugin RBAC (`src/plugins/rbac.ts`)
- [ ] Modificar JWT plugin para incluir `role`
- [ ] Criar script CLI `create-admin.ts`
- [ ] Testar criação do primeiro SUPER_ADMIN

### Fase 2: Services (3-4 dias)
- [ ] Implementar helpers (maskEmail, maskName, getClientIp)
- [ ] Implementar `admin/analytics.ts`
- [ ] Implementar `admin/index.ts` (user management)
- [ ] Implementar `admin/moderation.ts`
- [ ] Implementar `admin/admins.ts`
- [ ] Escrever testes unitários para cada service
- [ ] Garantir > 80% cobertura

### Fase 3: API Routes (2-3 dias)
- [ ] Criar schemas Zod em `src/schemas/admin.ts`
- [ ] Implementar `routes/admin/analytics.ts`
- [ ] Implementar `routes/admin/users.ts`
- [ ] Implementar `routes/admin/moderation.ts`
- [ ] Implementar `routes/admin/admins.ts`
- [ ] Registrar rotas no `src/app.ts`
- [ ] Testar endpoints (Postman/Thunder Client)

### Fase 4: QA e Documentação (1 dia)
- [ ] Atualizar Swagger/OpenAPI docs
- [ ] Documentar permissões por endpoint
- [ ] Rodar `bun run qa` e corrigir
- [ ] Rodar `bun test:coverage`
- [ ] Criar guia de uso para admins
- [ ] Commit e push

---

## 12. Estimativa e Próximos Passos

### 12.1 Tempo Estimado

**Desenvolvimento:** 8-10 dias úteis
**Testes e QA:** 2 dias úteis
**Documentação:** 1 dia útil

**Total:** ~2-3 semanas (1 desenvolvedor full-time)

### 12.2 Critérios de Sucesso

✅ SUPER_ADMIN pode ser criado via CLI
✅ Todos os 4 roles funcionam corretamente
✅ Dashboard mostra métricas em tempo real
✅ Admins podem bloquear/desbloquear usuários
✅ Moderadores podem remover conteúdo
✅ Todas ações são registradas no audit log
✅ Dados pessoais são mascarados nas respostas
✅ Cobertura de testes > 80%
✅ Documentação completa da API

### 12.3 Próximos Passos (Pós-MVP)

**Prioridade Alta:**
1. Sistema de flags/reports de usuários
2. Exportação de relatórios (CSV/PDF)
3. Filtros avançados com full-text search
4. Dashboard com gráficos (charts)

**Prioridade Média:**
5. Feature flags para A/B testing
6. Sistema de permissões granulares customizáveis
7. Impersonation de usuários (para suporte)
8. Webhooks para integrações

**Prioridade Baixa:**
9. Interface web do backoffice (React/Next.js)
10. Notificações em tempo real para admins
11. Análise de comportamento suspeito (ML)

---

## 13. Referências

- Design do MVP: [docs/plans/001-mvp/design.md](../001-mvp/design.md)
- PRD Técnico: [docs/prd.md](../../prd.md)
- CLAUDE.md: [CLAUDE.md](../../../CLAUDE.md)
- Copilot Instructions: [.github/copilot-instructions.md](../../../.github/copilot-instructions.md)

---

**Validado em:** 2026-02-04
**Pronto para implementação:** ✅
