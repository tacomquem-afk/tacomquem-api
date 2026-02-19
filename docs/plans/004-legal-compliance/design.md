# Design — Conformidade Legal LGPD + Marco Civil

**Documento:** Design detalhado das 4 obrigações legais críticas
**Data:** 19 de fevereiro de 2026
**Status:** Pronto para implementação

---

## 1. Visão Geral

Após publicação dos [Termos de Uso](../../legal/termos-de-uso.md) e [Política de Privacidade](../../legal/politica-de-privacidade.md), a plataforma comprometeu-se com 4 direitos/obrigações mandatórias:

| # | Requisito | Base Legal | Prazo |
|---|-----------|-----------|--------|
| R1 | Consentimento Parental (menores até 12) | LGPD art. 14 | Antes do launch |
| R2 | Direito de Exclusão de Conta | LGPD art. 17 | Antes do launch |
| R3 | Direito de Portabilidade (exportar dados) | LGPD art. 18 | Antes do launch |
| R4 | Logs de Acesso (6 meses) | Marco Civil art. 15 | Antes do launch |

---

## 2. Requirement 1: Consentimento Parental para Menores até 12 Anos

### 2.1 Contexto Legal

**LGPD Artigo 14:**
> "O tratamento de dados pessoais de crianças será feito com consentimento específico e em destaque dado por pelo menos um dos pais ou pelo responsável legal."

**Implicação:** Qualquer usuário com até 12 anos, para ter seus dados processados na plataforma, precisa de consentimento escrito de pelo menos um dos pais/responsáveis.

### 2.2 Fluxo de Implementação

```
[Novo Usuário]
         |
         v
[Tela de Registro]
   - Email
   - Senha
   - Nome
   - Data de Nascimento (NOVO)
         |
         v
[Sistema calcula: Hoje - Data Nascimento]
         |
         +-- Se >= 12 anos --> [Criar conta diretamente]
         |
         +-- Se < 12 anos --> [Fluxo Parental]
                              |
                              v
                       [Modal: "Conta para criança"]
                       - Nome do responsável
                       - Email do responsável
                       - Checkbox consentimento
                              |
                              v
                       [Enviar email de confirmação]
                       - Link com token único
                       - Válido por 48h
                       - IP + user agent armazenados
                              |
                              v
                       [Responsável clica link]
                       - Valida token
                       - Status muda para 'confirmed'
                       - Criança pode usar a app
                              |
                              v
                       [Se expirou token]
                       - Reenviar email ou criar nova solicitação
```

### 2.3 Schema

**Tabela:** users (alterações)

```typescript
// Adicionado a users table:
export const users = pgTable('users', {
  // ... campos existentes ...

  date_of_birth: date('date_of_birth'), // NOVO

  parental_consent_status: varchar('parental_consent_status', { length: 50 })
    .default('not_applicable') // 'pending' | 'confirmed' | 'not_applicable'
    .notNull(),

  parental_email: varchar('parental_email', { length: 255 }), // NOVO (criptografado?)

  parental_name: varchar('parental_name', { length: 255 }), // NOVO

  parental_consent_token: varchar('parental_consent_token', { length: 255 }), // NOVO

  parental_consent_token_expires_at: timestamp('parental_consent_token_expires_at'), // NOVO

  parental_consent_confirmed_at: timestamp('parental_consent_confirmed_at'), // NOVO

  parental_consent_ip_address: varchar('parental_consent_ip_address', { length: 45 }), // NOVO (IPv4/IPv6)

  parental_consent_user_agent: text('parental_consent_user_agent'), // NOVO
});
```

### 2.4 Endpoints

#### POST /api/auth/register

**Alteração:** Agora suporta `date_of_birth` e consentimento parental.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure...",
  "name": "João Silva",
  "date_of_birth": "2020-05-15",
  "parental_email": "pai@example.com",
  "parental_name": "Maria Silva",
  "parental_consent": true
}
```

**Response (se < 12 anos):**
```json
{
  "status": "pending_parental_consent",
  "message": "Conta criada. Email de confirmação enviado ao responsável.",
  "email_sent_to": "pai@example.com",
  "can_use_app": false
}
```

**Response (se >= 12 anos):**
```json
{
  "status": "success",
  "user": { ... },
  "access_token": "...",
  "refresh_token": "..."
}
```

#### POST /api/auth/parental-consent/confirm

**Propósito:** Confirmar consentimento via link do email.

**Request (via query param do email):**
```
GET /api/auth/parental-consent/confirm?token=abc123def456
```

**Response:**
```json
{
  "status": "success",
  "message": "Consentimento confirmado. Criança pode usar a plataforma.",
  "user_id": "..."
}
```

#### GET /api/users/me/parental-consent

**Propósito:** Usuario/responsável verifica status.

**Response:**
```json
{
  "status": "confirmed", // 'pending' | 'confirmed' | 'not_applicable'
  "confirmed_at": "2026-02-19T10:30:00Z",
  "responsible_email": "pai@example.com",
  "responsible_name": "Maria Silva"
}
```

### 2.5 Lógica de Acesso

Quando usuário tenta logar ou usar a app:

```typescript
if (user.date_of_birth < 12 years ago) {
  if (user.parental_consent_status !== 'confirmed') {
    // Bloquear acesso
    // Mostrar mensagem: "Aguardando confirmação do responsável"
    throw new UnauthorizedError('Parental consent pending');
  }
}
// Permitir acesso normal
```

### 2.6 Testes

```typescript
describe('Parental Consent', () => {
  it('should block child account until parental consent', async () => {
    // Register child (< 12 years)
    const res = await app.inject({
      method: 'POST',
      path: '/api/auth/register',
      payload: { date_of_birth: '2020-01-01', ... }
    });

    expect(res.json().status).toBe('pending_parental_consent');

    // Try to login without confirmation
    const loginRes = await app.inject({
      method: 'POST',
      path: '/api/auth/login',
      payload: { email: '...', password: '...' }
    });

    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.json().message).toContain('Parental consent');
  });

  it('should allow child account after parental consent confirmed', async () => {
    // ... create account ...
    // Confirm via token
    await db.update(users)
      .set({ parental_consent_status: 'confirmed' })
      .where(eq(users.id, childUserId));

    // Now login should work
    const loginRes = await app.inject({
      method: 'POST',
      path: '/api/auth/login',
      payload: { email: '...', password: '...' }
    });

    expect(loginRes.statusCode).toBe(200);
  });
});
```

---

## 3. Requirement 2: Direito de Exclusão de Conta (Right to be Forgotten)

### 3.1 Contexto Legal

**LGPD Artigo 17:**
> "O titular tem direito a obter do controlador, a qualquer momento, a confirmação da existência ou não de seus dados pessoais. Consoante disposição legal..." Inclui direito de solicitar exclusão.

**Política de Privacidade Seção 7.1:**
> "O Usuário pode solicitar a exclusão de sua conta e de seus dados pessoais a qualquer momento. A exclusão é processada em até 15 (quinze) dias úteis."

### 3.2 Fluxo de Implementação

```
[Usuário logado]
       |
       v
[GET /api/users/me/account/settings]
  Botão: "Deletar conta"
       |
       v
[Clica "Deletar"]
       |
       v
[Modal de confirmação]
  - "Esta ação é irreversível"
  - "Seus dados serão deletados em 15 dias"
  - Checkbox: "Entendo que não posso recuperar"
       |
       v
[POST /api/users/me/account/schedule-deletion]
  Body: { reason?: "Quero deletar", confirm: true }
       |
       v
[Sistema cria deletion record]
  - deletion_requested_at = NOW()
  - deletion_scheduled_for = NOW() + 15 days
  - status = 'pending'
       |
       v
[Email enviado: "Conta será deletada em 15 dias"]
  - "Você pode cancelar até [data+15d]"
  - Link para cancelamento: /account/cancel-deletion?token=xyz
       |
       v
[Após 15 dias: JOB executa]
  - SELECT * FROM users WHERE deletion_scheduled_for <= NOW()
  - Para cada: ANONYMIZE + SOFT DELETE
       |
       v
[Dados anonimizados]
  - email_encrypted -> random_hash
  - name_encrypted -> "Usuário deletado"
  - Empréstimos preservados (anonymized)
```

### 3.3 Schema

```typescript
// Adicionado a users table:
export const users = pgTable('users', {
  // ... campos existentes ...

  deletion_requested_at: timestamp('deletion_requested_at'), // NOVO

  deletion_scheduled_for: timestamp('deletion_scheduled_for'), // NOVO (NOW() + 15 days)

  deletion_status: varchar('deletion_status', { length: 50 })
    .default('active') // 'active' | 'pending' | 'scheduled' | 'completed'
    .notNull(),

  deletion_reason: text('deletion_reason'), // NOVO

  deletion_cancelled_at: timestamp('deletion_cancelled_at'), // NOVO
});

// Nova tabela: deletion_tokens
export const deletionTokens = pgTable('deletion_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').references(() => users.id).notNull(),
  token: varchar('token', { length: 255 }).unique().notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'cancel' | 'confirm'
  expires_at: timestamp('expires_at').notNull(),
  used_at: timestamp('used_at'),
});
```

### 3.4 Endpoints

#### POST /api/users/me/account/schedule-deletion

**Propósito:** Solicitar exclusão.

**Request:**
```json
{
  "reason": "Não preciso mais da app",
  "password": "user_password" // Confirmação de identidade
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Conta será deletada em 15 dias",
  "scheduled_for": "2026-03-06T10:30:00Z",
  "can_cancel_until": "2026-03-06T10:30:00Z",
  "cancel_link": "https://tacomquem.com/account/cancel-deletion?token=xyz..."
}
```

#### POST /api/users/me/account/cancel-deletion

**Propósito:** Cancelar exclusão pendente.

**Request (sem body, apenas auth):**
```json
{}
```

**Response:**
```json
{
  "status": "success",
  "message": "Exclusão cancelada. Sua conta continua ativa."
}
```

**Ou via token (email link):**
```
GET /api/users/me/account/cancel-deletion?token=abc123
```

#### GET /api/users/me/account/deletion-status

**Propósito:** Verificar status de exclusão.

**Response:**
```json
{
  "status": "active", // 'active' | 'pending' | 'scheduled' | 'completed'
  "requested_at": null,
  "scheduled_for": null,
  "can_cancel": false
}
```

Ou (se pendente):
```json
{
  "status": "pending",
  "requested_at": "2026-02-19T10:30:00Z",
  "scheduled_for": "2026-03-06T10:30:00Z",
  "can_cancel": true,
  "cancel_link": "https://tacomquem.com/account/cancel-deletion?token=..."
}
```

### 3.5 Job: process-deletions

**Execução:** 1x por dia, às 2:00 AM

```typescript
// src/jobs/process-deletions.ts
export async function processDeletions() {
  const usersToDelete = await db.query.users.findMany({
    where: and(
      eq(users.deletion_status, 'pending'),
      lte(users.deletion_scheduled_for, new Date())
    )
  });

  for (const user of usersToDelete) {
    // 1. Anonimizar dados
    const anonymizedEmail = hashEmail(user.id);

    // 2. Update user
    await db.update(users)
      .set({
        email_encrypted: encryptValue(anonymizedEmail),
        name_encrypted: encryptValue('Usuário deletado'),
        email_hash: hashEmail(anonymizedEmail),
        avatar_url: null,
        deletion_status: 'completed',
        deleted_at: new Date(),
        // ... outros campos sensíveis
      })
      .where(eq(users.id, user.id));

    // 3. Deletar/anonimizar dados relacionados
    await deleteUserRelatedData(user.id);

    // 4. Log de auditoria
    await auditLog.create({
      action: 'user_deleted',
      target_user_id: user.id,
      reason: 'Automatic deletion after user request',
      ip_address: null,
      timestamp: new Date()
    });
  }
}

async function deleteUserRelatedData(userId: UUID) {
  // Loans: manter empréstimos mas anonymize referências
  await db.update(loans)
    .set({ lender_id: null }) // ou reference 'anonymous user'
    .where(eq(loans.lender_id, userId));

  // Items: soft delete
  await db.update(items)
    .set({ deleted_at: new Date() })
    .where(eq(items.user_id, userId));

  // Friendships: remover
  await db.delete(friendships)
    .where(or(
      eq(friendships.user_a_id, userId),
      eq(friendships.user_b_id, userId)
    ));

  // Notifications: deletar
  await db.delete(notifications)
    .where(eq(notifications.user_id, userId));
}
```

### 3.6 Testes

```typescript
describe('Account Deletion', () => {
  it('should schedule deletion for 15 days', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/api/users/me/account/schedule-deletion',
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Not using', password: 'password' }
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.status).toBe('success');
    expect(data.scheduled_for).toBe(now + 15 days);
  });

  it('should prevent login after deletion is scheduled', async () => {
    // Schedule deletion
    // Try to login
    const loginRes = await app.inject({
      method: 'POST',
      path: '/api/auth/login',
      payload: { email: user.email, password: 'password' }
    });

    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.json().message).toContain('Account scheduled for deletion');
  });

  it('should allow cancellation before deadline', async () => {
    // Schedule deletion
    // Cancel via token
    const cancelRes = await app.inject({
      method: 'GET',
      path: `/api/users/me/account/cancel-deletion?token=${cancelToken}`
    });

    expect(cancelRes.statusCode).toBe(200);

    // Should be able to login again
    const loginRes = await app.inject({
      method: 'POST',
      path: '/api/auth/login',
      payload: { email: user.email, password: 'password' }
    });

    expect(loginRes.statusCode).toBe(200);
  });

  it('should anonymize data after 15 days', async () => {
    // Schedule deletion
    // Mock time to after deadline
    mockDate(now + 16 days);

    // Run job
    await processDeletions();

    // Check user is anonymized
    const deletedUser = await db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    expect(deletedUser.deleted_at).toBeDefined();
    // name is decrypted and checked
    const decryptedName = decryptValue(deletedUser.name_encrypted);
    expect(decryptedName).toBe('Usuário deletado');
  });
});
```

---

## 4. Requirement 3: Direito de Portabilidade (Data Export)

### 4.1 Contexto Legal

**LGPD Artigo 18, IV:**
> "É direito do titular obter do controlador... informações sobre a possibilidade de não fornecer consentimento e sobre as consequências da negativa."

Inclui direito de receber dados em formato estruturado.

**Política Seção 7.2:**
> "O Usuário pode solicitar a exportação de seus dados pessoais em formato estruturado e legível por máquina (JSON ou CSV). A solicitação será atendida em até 15 (quinze) dias úteis."

### 4.2 Fluxo de Implementação

```
[Usuário logado]
      |
      v
[GET /api/users/me/settings]
  Botão: "Exportar meus dados"
      |
      v
[Modal: "Exportar dados em qual formato?"]
  - JSON (recomendado)
  - CSV (múltiplos arquivos)
      |
      v
[POST /api/users/me/data/export]
  Body: { format: 'json' | 'csv' }
      |
      v
[Sistema gera arquivo]
  - Queries: user, items, loans, friendships, etc
  - Compila em JSON ou múltiplos CSVs
  - Cria UUID para referência
      |
      v
[Email enviado: "Seus dados estão prontos"]
  - Link: /api/users/me/data/export/[id]/download?token=xyz
  - "Link válido por 7 dias"
      |
      v
[Usuário clica link]
  - Valida token + expiry
  - Faz download do arquivo
```

### 4.3 Schema

```typescript
// Nova tabela: data_exports
export const dataExports = pgTable('data_exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').references(() => users.id).notNull(),
  format: varchar('format', { length: 50 }).notNull(), // 'json' | 'csv'
  status: varchar('status', { length: 50 }).notNull(), // 'pending' | 'completed' | 'expired'
  file_url: varchar('file_url', { length: 255 }), // S3 ou local path
  file_size_bytes: bigint('file_size_bytes'),
  download_token: varchar('download_token', { length: 255 }).unique(),
  download_token_expires_at: timestamp('download_token_expires_at'),
  downloaded_at: timestamp('downloaded_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  expires_at: timestamp('expires_at'), // 7 dias
});
```

### 4.4 Endpoints

#### POST /api/users/me/data/export

**Propósito:** Solicitar exportação de dados.

**Request:**
```json
{
  "format": "json" // ou 'csv'
}
```

**Response (imediato ou background job):**
```json
{
  "status": "processing",
  "export_id": "abc123-def456",
  "message": "Exportação iniciada. Enviaremos um email quando estiver pronto.",
  "email": "user@example.com"
}
```

**Ou se processado imediatamente:**
```json
{
  "status": "ready",
  "export_id": "abc123-def456",
  "download_url": "/api/users/me/data/export/abc123-def456/download?token=xyz...",
  "expires_in": "7 days"
}
```

#### GET /api/users/me/data/export/:export_id/download

**Propósito:** Baixar arquivo exportado.

**Query params:**
- `token` — download token (from email link)

**Response:** Arquivo (application/json ou application/zip)

#### GET /api/users/me/data/export/status

**Propósito:** Ver histórico de exportações.

**Response:**
```json
{
  "exports": [
    {
      "id": "abc123",
      "format": "json",
      "status": "completed",
      "created_at": "2026-02-19T10:30:00Z",
      "expires_at": "2026-02-26T10:30:00Z",
      "file_size_bytes": 1024000,
      "downloaded": false
    }
  ]
}
```

### 4.5 Formato de Dados

#### JSON

```json
{
  "export": {
    "version": "1.0",
    "generated_at": "2026-02-19T10:30:00Z",
    "user_id": "abc123"
  },
  "user": {
    "id": "abc123",
    "email": "user@example.com",
    "name": "João Silva",
    "avatar_url": "https://...",
    "email_verified": true,
    "created_at": "2025-01-01T10:00:00Z",
    "updated_at": "2026-02-19T10:30:00Z"
  },
  "items": [
    {
      "id": "item1",
      "name": "Livro",
      "description": "...",
      "images": ["url1", "url2"],
      "created_at": "2025-01-05T10:00:00Z"
    }
  ],
  "loans": {
    "as_lender": [
      {
        "id": "loan1",
        "item_id": "item1",
        "borrower": "João Amigo",
        "status": "returned",
        "expected_return_date": "2025-02-05",
        "confirmed_at": "2025-01-05T11:00:00Z",
        "returned_at": "2025-02-10T15:30:00Z"
      }
    ],
    "as_borrower": [...]
  },
  "friendships": [
    {
      "friend_id": "friend1",
      "friend_name": "Maria",
      "created_at": "2025-01-05T10:00:00Z"
    }
  ],
  "notifications": [
    {
      "id": "notif1",
      "type": "loan_created",
      "title": "...",
      "message": "...",
      "read": false
    }
  ]
}
```

#### CSV (Múltiplos arquivos, zipados)

```
user.csv:
id,email,name,created_at
abc123,user@example.com,João Silva,2025-01-01

items.csv:
id,name,description,images_count
item1,Livro,Descrição...,2

loans_lent.csv:
loan_id,item_name,borrower_name,status,created_at,returned_at
loan1,Livro,João Amigo,returned,2025-01-05,2025-02-10

loans_borrowed.csv:
...

friendships.csv:
friend_id,friend_name,met_at
friend1,Maria,2025-01-05
```

### 4.6 Service: Data Export

```typescript
// src/services/data-export/index.ts
export async function exportUserData(userId: UUID, format: 'json' | 'csv') {
  const user = await getUser(userId);
  const items = await getItems(userId);
  const loans = await getLoans(userId);
  const friendships = await getFriendships(userId);
  const notifications = await getNotifications(userId);

  if (format === 'json') {
    return buildJSON({ user, items, loans, friendships, notifications });
  } else {
    return buildCSVZip({ user, items, loans, friendships, notifications });
  }
}

function buildJSON(data) {
  return {
    export: {
      version: '1.0',
      generated_at: new Date().toISOString(),
      user_id: data.user.id
    },
    user: data.user,
    items: data.items,
    loans: {
      as_lender: data.loans.filter(l => l.lender_id === data.user.id),
      as_borrower: data.loans.filter(l => l.borrower_id === data.user.id)
    },
    friendships: data.friendships,
    notifications: data.notifications
  };
}

function buildCSVZip(data) {
  const zip = new JSZip();

  zip.file('user.csv', toCSV([data.user]));
  zip.file('items.csv', toCSV(data.items));
  zip.file('loans_lent.csv', toCSV(
    data.loans.filter(l => l.lender_id === data.user.id)
  ));
  zip.file('loans_borrowed.csv', toCSV(
    data.loans.filter(l => l.borrower_id === data.user.id)
  ));
  zip.file('friendships.csv', toCSV(data.friendships));

  return zip.generateAsync({ type: 'arraybuffer' });
}
```

### 4.7 Testes

```typescript
describe('Data Export', () => {
  it('should generate JSON export', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/api/users/me/data/export',
      headers: { authorization: `Bearer ${token}` },
      payload: { format: 'json' }
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.export.version).toBe('1.0');
    expect(json.user.id).toBe(userId);
    expect(json.items).toBeArray();
    expect(json.loans).toHaveProperty('as_lender');
  });

  it('should generate CSV export', async () => {
    // ... similar flow
  });

  it('should expire download after 7 days', async () => {
    // Create export
    // Mock time to 8 days later
    // Try to download
    // Should get 410 Gone or 401 Unauthorized
  });
});
```

---

## 5. Requirement 4: Logs de Acesso (Marco Civil art. 15)

### 5.1 Contexto Legal

**Marco Civil Artigo 15:**
> "O provedor de conexão à internet fica obrigado a manter os registros de acesso a aplicações de internet pelo prazo de seis meses."

### 5.2 O Que Registrar

Para cada request HTTP autenticado (ou admin actions):

```json
{
  "timestamp": "2026-02-19T10:30:45.123Z",
  "ip_address": "192.168.1.1",
  "user_id": "abc123",
  "user_agent": "Mozilla/5.0...",
  "http_method": "POST",
  "path": "/api/items",
  "query_string": "?filter=active",
  "status_code": 201,
  "response_time_ms": 145,
  "referrer": "https://tacomquem.com/items"
}
```

### 5.3 Implementação

**Opção: Middleware Fastify** (recomendado)

```typescript
// src/plugins/access-logs.ts
export async function accessLogsPlugin(fastify: FastifyInstance) {
  fastify.addHook('onResponse', async (request, reply) => {
    // Log apenas:
    // 1. Requests autenticadas (com usuário)
    // 2. Admin/moderação actions
    // 3. Ações sensíveis (login, deletar, etc)

    const shouldLog =
      request.user ||
      request.url.startsWith('/api/admin') ||
      isSensitiveAction(request.method, request.url);

    if (!shouldLog) return;

    try {
      await db.insert(accessLogs).values({
        timestamp: new Date(),
        ip_address: request.ip || request.socket.remoteAddress,
        user_id: request.user?.id || null,
        http_method: request.method,
        path: request.url.split('?')[0],
        query_string: request.url.split('?')[1] || null,
        status_code: reply.statusCode,
        response_time_ms: Date.now() - request.startTime,
        user_agent: request.headers['user-agent'],
        referrer: request.headers['referer'] || null,
        body_hash: hashBody(request.body) // para segurança, não armazenar body
      });
    } catch (error) {
      fastify.log.error('Failed to log access', error);
      // Não interromper request por erro de logging
    }
  });
}

function isSensitiveAction(method: string, url: string): boolean {
  return (
    (method === 'POST' && url.includes('/auth/login')) ||
    (method === 'POST' && url.includes('/auth/register')) ||
    (method === 'DELETE' && url.includes('/users')) ||
    (method === 'POST' && url.includes('/admin'))
  );
}
```

### 5.4 Schema

```typescript
// Nova tabela: access_logs
export const accessLogs = pgTable('access_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  timestamp: timestamp('timestamp').notNull(),
  ip_address: varchar('ip_address', { length: 45 }), // IPv4 ou IPv6
  user_id: uuid('user_id').references(() => users.id).nullable(),
  http_method: varchar('http_method', { length: 10 }).notNull(),
  path: varchar('path', { length: 500 }).notNull(),
  query_string: varchar('query_string', { length: 500 }),
  status_code: smallint('status_code'),
  response_time_ms: integer('response_time_ms'),
  user_agent: text('user_agent'),
  referrer: varchar('referrer', { length: 500 }),
  body_hash: varchar('body_hash', { length: 64 }), // SHA256 of request body
  created_at: timestamp('created_at').defaultNow()
});

// Índices
export const accessLogsUserIdTimestampIdx = index('idx_access_logs_user_id_timestamp')
  .on(accessLogs.user_id, accessLogs.timestamp);
export const accessLogsTimestampIdx = index('idx_access_logs_timestamp')
  .on(accessLogs.timestamp);
export const accessLogsCreatedAtIdx = index('idx_access_logs_created_at')
  .on(accessLogs.created_at);
```

### 5.5 Endpoints

#### GET /api/admin/audit/access-logs

**Propósito:** Admin vê logs de acesso (suporte, moderação, super admin).

**Query params:**
- `user_id` — filtrar por usuário
- `from` — data início (ISO 8601)
- `to` — data fim (ISO 8601)
- `method` — HTTP method
- `path` — caminho (wildcards)
- `status_code` — código HTTP
- `limit` — por padrão 100
- `offset` — paginação

**Response:**
```json
{
  "total": 5000,
  "limit": 100,
  "offset": 0,
  "logs": [
    {
      "id": "...",
      "timestamp": "2026-02-19T10:30:45.123Z",
      "user_id": "abc123",
      "user_email": "user@example.com",
      "http_method": "POST",
      "path": "/api/items",
      "status_code": 201,
      "response_time_ms": 145,
      "ip_address": "192.168.1.1"
    }
  ]
}
```

#### GET /api/users/me/activity

**Propósito:** Usuário vê seu próprio log de acesso (LGPD art. 18 — direito de acesso).

**Query params:**
- `from` — data início
- `to` — data fim
- `limit` — por padrão 50
- `offset`

**Response:** Mesmo formato, mas apenas logs do usuário.

### 5.6 Job: cleanup-old-logs

**Execução:** 1x por semana, às 3:00 AM

```typescript
// src/jobs/cleanup-old-logs.ts
export async function cleanupOldLogs() {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 6); // 6 meses atrás

  const result = await db
    .delete(accessLogs)
    .where(lt(accessLogs.created_at, cutoffDate));

  logger.info(`Deleted ${result.rowCount} old access logs`);
}
```

### 5.7 Testes

```typescript
describe('Access Logs', () => {
  it('should log authenticated request', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/api/items',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);

    // Check log was created
    const log = await db.query.accessLogs.findFirst({
      where: eq(accessLogs.user_id, userId),
      orderBy: desc(accessLogs.timestamp)
    });

    expect(log).toBeDefined();
    expect(log.path).toBe('/api/items');
    expect(log.http_method).toBe('GET');
    expect(log.status_code).toBe(200);
  });

  it('should not log unauthenticated public requests', async () => {
    const beforeCount = await db.query.accessLogs.findMany();

    const res = await app.inject({
      method: 'GET',
      path: '/api/health'
    });

    expect(res.statusCode).toBe(200);

    const afterCount = await db.query.accessLogs.findMany();
    expect(afterCount.length).toBe(beforeCount.length); // Sem novos logs
  });

  it('should cleanup logs older than 6 months', async () => {
    // Create old log
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 7);

    await db.insert(accessLogs).values({
      timestamp: oldDate,
      user_id: userId,
      http_method: 'GET',
      path: '/api/items',
      status_code: 200
    });

    // Run cleanup
    await cleanupOldLogs();

    // Old log should be deleted
    const remaining = await db.query.accessLogs.findFirst({
      where: lt(accessLogs.created_at, oldDate)
    });

    expect(remaining).toBeUndefined();
  });
});
```

---

## 6. Resumo de Implementação

| Req | Prioridade | Complexidade | Tempo Est. | Crítico? |
|-----|-----------|-------------|----------|---------|
| R2 — Exclusão | 1️⃣ | Média | 2-3 dias | ✅ Sim |
| R4 — Logs | 2️⃣ | Baixa | 1-2 dias | ✅ Sim |
| R3 — Portabilidade | 3️⃣ | Média | 2 dias | ✅ Sim |
| R1 — Consentimento Parental | 4️⃣ | Alta | 3-4 dias | ✅ Sim |

**Total estimado:** 8-12 dias de desenvolvimento + QA + testes

---

## 7. Checklist Final

- [ ] Schema alterado e migration criada
- [ ] Todos os endpoints implementados
- [ ] Jobs/crons implementados e testados
- [ ] Testes unitários passam (> 80% cobertura)
- [ ] Testes integração passam
- [ ] QA: `bun run qa` passa (TypeScript + Biome)
- [ ] Rate limiting implementado
- [ ] Documentação de API atualizada
- [ ] Testes de conformidade LGPD completados
- [ ] Review de segurança realizado

---

## Referências

- [LGPD — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [Marco Civil da Internet — Lei nº 12.965/2014](http://www.planalto.gov.br/ccivil_03/leis/l12965.htm)
- [ANPD — Guia Prático LGPD](https://www.gov.br/cidadania/pt-br/acesso-a-informacao/lgpd)
