# 🎯 Sistema de Beta: Guia Completo para Frontend

> Documentação sobre como o sistema de beta funciona, desde o convite até completar o cadastro.

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Fluxo Completo](#fluxo-completo)
3. [Endpoints da API](#endpoints-da-api)
4. [Tipos de Dados](#tipos-de-dados)
5. [Exemplos Práticos](#exemplos-práticos)
6. [Comportamento Automático](#comportamento-automático)
7. [Considerações para Frontend](#considerações-para-frontend)

---

## 🏗️ Visão Geral

O sistema de **Beta Invites** permite que administradores do TáComQuem criem uma whitelist de emails. Quando um usuário registra com um email que está na whitelist, ele **automaticamente** recebe acesso ao tier BETA.

### O que é Access Tier?

- **PUBLIC** (padrão) - Usuário comum, acesso normal
- **BETA** - Participante do programa beta, acesso a funcionalidades experimentais
- **ARCHIVED** - Conta arquivada/desativada

### O que é `betaAddedAt`?

Timestamp automático que registra quando o usuário ganhou acesso BETA (durante o registro se email estava na whitelist).

---

## 🔄 Fluxo Completo

### Flow Chart

```
┌─────────────────────────────────────────────────────────────┐
│  1. ADMIN: Adiciona email à whitelist (POST /api/admin/...) │
│     - admin@app whitelista user@example.com                 │
│     - Timestamp: 2026-02-19T10:00:00Z                       │
│     - Status: email criado, não usado ainda                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  2. USUÁRIO: Acessa site, clica em "Criar Conta"            │
│     - Vê formulário de registro padrão                       │
│     - Nenhuma indicação visual de que é "convidado"         │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  3. USUÁRIO: Preenche formulário de registro                 │
│     - Nome: "João Silva"                                     │
│     - Email: "user@example.com"  ← Mesmo email na whitelist  │
│     - Senha: "SecurePass123"                                 │
│     - Terms: Marca ✓ Aceito os Termos                        │
│     - Clica em "Criar Conta"                                 │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  4. BACKEND: Processa Registro (POST /api/auth/register)    │
│     - Valida email/password                                  │
│     - Criptografa dados (LGPD)                              │
│     - ❌ Verifica: Email está na whitelist?                  │
│     - ✅ SIM! → accessTier = "BETA"                          │
│     - ✅ SIM! → betaAddedAt = NOW()                          │
│     - ✅ SIM! → Marca invite como usedAt = NOW()             │
│     - Cria usuário no banco                                  │
│     - Envia email de verificação                             │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  5. BACKEND RESPONSE (201 Created)                           │
│     {                                                        │
│       "status": "success",                                   │
│       "user": {                                              │
│         "id": "uuid-123",                                    │
│         "name": "João Silva",                                │
│         "email": "user@example.com",                         │
│         "role": "USER",                                      │
│         "emailVerified": false,                              │
│         "avatarUrl": null,                                   │
│         "termsAccepted": true                                │
│       },                                                     │
│       "accessToken": "eyJhbGc...",                           │
│       "refreshToken": "eyJhbGc...",                          │
│       "canUseApp": true,                                     │
│       "message": "Conta criada com sucesso..."               │
│     }                                                        │
│                                                              │
│     ⚠️ IMPORTANTE: Não há indicação no response se           │
│     o usuário é BETA ou PUBLIC!                             │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  6. FRONTEND: Armazena Tokens & Redireciona                  │
│     - localStorage.setItem('accessToken', token)            │
│     - localStorage.setItem('refreshToken', token)           │
│     - Redireciona para /verify-email                         │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  7. USUÁRIO: Verifica Email                                  │
│     - Abre email do TáComQuem                                │
│     - Clica em link de verificação                           │
│     - Link: /verify-email?token=XYZ                          │
│     - Backend marca emailVerified = true                     │
│     - Frontend redireciona para /dashboard                   │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  8. USUÁRIO: Dashboard                                       │
│     - Usuário consegue acessar app normalmente               │
│     - Funcionalidades beta disponíveis? Depende UI!          │
│     - Tier BETA definido no perfil do usuário (GET /me)     │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔌 Endpoints da API

### Admin: Gerenciar Whitelist

#### 1. **Adicionar Email à Whitelist**

```http
POST /api/admin/beta-invites
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "email": "novo.usuario@example.com",
  "reason": "Tester de UI - Recrutado em conference 2026"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Email novo.usuario@example.com added to beta whitelist",
  "invite": {
    "email": "novo.usuario@example.com",
    "addedAt": "2026-02-19T10:30:00Z",
    "usedAt": null,
    "reason": "Tester de UI - Recrutado em conference 2026",
    "addedBy": {
      "id": "admin-uuid",
      "name": "Admin User"
    }
  }
}
```

**Possíveis Erros:**
- `400` - Email inválido
- `401` - Sem autenticação
- `403` - Sem permissão (requer SUPER_ADMIN)
- `409` - Email já está na whitelist

---

#### 2. **Listar Emails da Whitelist**

```http
GET /api/admin/beta-invites?limit=20&offset=0
Authorization: Bearer {accessToken}
```

**Response (200 OK):**
```json
{
  "total": 42,
  "limit": 20,
  "offset": 0,
  "invites": [
    {
      "email": "beta.user@example.com",
      "addedAt": "2026-02-10T09:00:00Z",
      "usedAt": "2026-02-15T14:30:00Z",
      "reason": "Early tester",
      "addedBy": {
        "id": "admin-uuid",
        "name": "Admin User"
      }
    },
    {
      "email": "new.tester@example.com",
      "addedAt": "2026-02-19T10:30:00Z",
      "usedAt": null,
      "reason": "Recrutado em conference",
      "addedBy": {
        "id": "admin-uuid",
        "name": "Admin User"
      }
    }
  ]
}
```

**Query Parameters:**
- `limit` (opcional, default: 20, max: 100) - Itens por página
- `offset` (opcional, default: 0) - Quantos itens pular

---

#### 3. **Remover Email da Whitelist**

```http
DELETE /api/admin/beta-invites/beta.user@example.com
Authorization: Bearer {accessToken}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Email beta.user@example.com removed from beta whitelist"
}
```

**Possíveis Erros:**
- `401` - Sem autenticação
- `403` - Sem permissão (requer SUPER_ADMIN)
- `404` - Email não encontrado na whitelist

---

### Usuário: Verificar Access Tier

#### **Obter Dados do Usuário Logado**

```http
GET /api/auth/me
Authorization: Bearer {accessToken}
```

**Response (200 OK):**
```json
{
  "id": "user-uuid-123",
  "name": "João Silva",
  "email": "user@example.com",
  "emailVerified": true,
  "emailHash": "hash...",
  "role": "USER",
  "accessTier": "BETA",
  "betaAddedAt": "2026-02-19T14:35:00Z",
  "avatarUrl": null,
  "createdAt": "2026-02-19T14:35:00Z",
  "updatedAt": "2026-02-19T14:35:00Z",
  "isActive": true,
  "blockedAt": null
}
```

💡 **Aqui você vê o `accessTier`!**

---

## 📦 Tipos de Dados

### Estrutura: `betaInvites` (Banco de Dados)

```typescript
{
  id: UUID,                    // Identificador único
  email: string,               // Email único, lowercase
  addedBy: UUID,               // ID do admin que adicionou
  reason?: string,             // Motivo opcional
  ipAddress?: string,          // IP de quem adicionou
  usedAt?: timestamp,          // Quando o email se registrou
  createdAt: timestamp         // Quando foi criado o invite
}
```

### Estrutura: `users` (Campos Relevantes)

```typescript
{
  id: UUID,
  emailEncrypted: string,      // Email criptografado (LGPD)
  emailHash: string,           // Hash do email (para lookup)
  nameEncrypted: string,       // Nome criptografado
  passwordHash: string,        // Senha hasheada
  emailVerified: boolean,      // Verified?
  role: 'USER' | 'ANALYST' | 'SUPPORT' | 'MODERATOR' | 'SUPER_ADMIN',
  accessTier: 'PUBLIC' | 'BETA' | 'ARCHIVED',  // ← BETA é automático!
  betaAddedAt?: timestamp,     // Quando ganhou acesso BETA
  createdAt: timestamp,
  updatedAt: timestamp,
  isActive: boolean,
  blockedAt?: timestamp
}
```

---

## 💻 Exemplos Práticos

### Exemplo 1: Admin Adiciona 3 Testers

```bash
# Tester 1
curl -X POST http://localhost:3000/api/admin/beta-invites \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@test.com",
    "reason": "QA Engineer"
  }'

# Tester 2
curl -X POST http://localhost:3000/api/admin/beta-invites \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@test.com",
    "reason": "UX Designer"
  }'

# Tester 3 (sem motivo)
curl -X POST http://localhost:3000/api/admin/beta-invites \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "carol@test.com"
  }'

# Resultado: 3 emails agora podem se registrar com tier BETA
```

---

### Exemplo 2: Usuário se Registra

```bash
# Alice se registra com seu email convidado
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Test",
    "email": "alice@test.com",
    "password": "SecurePass123",
    "acceptTerms": true
  }'

# Response: User Alice é criado com accessTier = "BETA" ✅
# Response: betaAddedAt = NOW()
# DB: betaInvites.usedAt atualizado para NOW()
```

---

### Exemplo 3: Verificar Tier do Usuário

```bash
# Alice verifica seu perfil
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer alice-access-token"

# Response inclui:
# "accessTier": "BETA",
# "betaAddedAt": "2026-02-19T14:35:00Z"

# Compare com usuário que se registrou sem convite
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer regular-user-token"

# Response inclui:
# "accessTier": "PUBLIC",
# "betaAddedAt": null
```

---

### Exemplo 4: Remover da Whitelist (mas usuário já existe)

```bash
# Admin remove alice da whitelist depois que ela já se registrou
curl -X DELETE http://localhost:3000/api/admin/beta-invites/alice@test.com \
  -H "Authorization: Bearer admin-token"

# ⚠️ IMPORTANTE: Isso remove do invite, NÃO afeta Alice!
# Alice continua com:
# - accessTier = "BETA"
# - betaAddedAt = "2026-02-19T14:35:00Z"
#
# Apenas o invite é removido para reutilizar o email em outro invite
```

---

## ⚡ Comportamento Automático

### Durante Registro (POST /api/auth/register)

1. **Validação de Email**
   - Formato válido?
   - Já registrado?

2. **Verificação de Whitelist** ← Automático!
   ```
   SELECT * FROM beta_invites WHERE email = 'alice@test.com'
   ```

3. **Se Email Está na Whitelist** ✅
   ```typescript
   // Usuário criado com:
   user.accessTier = 'BETA'  // ← automático!
   user.betaAddedAt = new Date()  // ← automático!

   // E no banco:
   betaInvites.usedAt = new Date()  // ← automático!
   ```

4. **Se Email NÃO Está na Whitelist** ❌
   ```typescript
   // Usuário criado com:
   user.accessTier = 'PUBLIC'  // ← padrão
   user.betaAddedAt = null     // ← não preenchido
   ```

---

## 🎨 Considerações para Frontend

### ✅ O Que Você PODE Fazer

1. **Não há indicação visual diferente durante registro**
   - Formulário padrão, igual para todos
   - Usuário não sabe se é "convidado" ou não
   - Descobre depois após fazer login

2. **Mostrar badge BETA no Dashboard**
   ```typescript
   // Após login e verificar /api/auth/me
   if (user.accessTier === 'BETA' && user.betaAddedAt) {
     showBetaBadge() // Badge no nome/perfil do usuário
   }
   ```

3. **Condicionar Funcionalidades ao Tier**
   ```typescript
   // Exemplo: Feature Flag para Beta
   if (user.accessTier === 'BETA') {
     showExperimentalFeatures()  // UI/UX experimental
   }
   ```

4. **Dashboard para Admin**
   - Listar emails convidados (GET /api/admin/beta-invites)
   - Adicionar novos (POST /api/admin/beta-invites)
   - Remover (DELETE /api/admin/beta-invites/:email)

### ❌ O Que VOCÊ NÃO Faz (Backend faz)

- ❌ Não calcular `accessTier` no frontend
- ❌ Não decidir se usuário é BETA ou PUBLIC
- ❌ Não adicionar email à whitelist localmente
- ❌ Não criptografar dados do usuário
- ❌ Não marcar invite como `usedAt`

**Tudo isso é 100% automático no backend! ✅**

---

## 📍 Fluxo Específico: O que o Frontend Vê

### 1️⃣ Tela de Registro

```
┌─────────────────────────────┐
│   Criar Conta               │
├─────────────────────────────┤
│                             │
│ Nome: [________________]    │
│ Email: [________________]   │
│ Senha: [________________]   │
│                             │
│ ☐ Aceito os Termos         │
│                             │
│       [Criar Conta]         │
│                             │
└─────────────────────────────┘

⚠️ Nenhuma indicação de "Você foi convidado!"
   ou "Acesso Beta disponível"
```

### 2️⃣ Após Clicar "Criar Conta"

**Se email está na whitelist:**
```json
{
  "status": "success",
  "message": "Conta criada com sucesso. Verifique seu email.",
  "user": { "id": "...", ... },
  "accessToken": "...",
  "refreshToken": "...",
  "canUseApp": true
}
// ← Sem indicação de BETA!
```

**Se email NÃO está na whitelist:**
```json
{
  "status": "success",
  "message": "Conta criada com sucesso. Verifique seu email.",
  "user": { "id": "...", ... },
  "accessToken": "...",
  "refreshToken": "...",
  "canUseApp": true
}
// ← Resposta idêntica!
```

### 3️⃣ Tela de Verificar Email

```
┌─────────────────────────────────┐
│  Verifique Seu Email            │
├─────────────────────────────────┤
│                                 │
│ Enviamos um email para:         │
│ user@example.com                │
│                                 │
│ Clique no link no email para    │
│ completar o cadastro.           │
│                                 │
│       [Usar outro email]        │
│                                 │
└─────────────────────────────────┘

⚠️ Mesma tela para todos (BETA ou PUBLIC)
```

### 4️⃣ Dashboard Após Verificação

```
┌──────────────────────────────┐
│  👤 João Silva    🎯 BETA    │ ← Badge BETA só aparece aqui!
├──────────────────────────────┤
│                              │
│ 📊 Meus Empréstimos          │
│  - Itens Emprestados: 3      │
│  - Itens Pegue Emprestado: 2 │
│                              │
│ 🔧 [Funcionalidades Experimentais] ← Se BETA
│                              │
└──────────────────────────────┘

💡 Frontend checa: if(user.accessTier === 'BETA')
   - Mostra badge BETA
   - Mostra features experimentais opcionais
```

---

## 🔑 Informações para Implementar

### Onde Armazenar `accessTier`

```javascript
// Quando usuário faz login e chama GET /api/auth/me
const user = await fetch('/api/auth/me')
const data = await user.json()

// Armazene globalmente
globalState.user = {
  id: data.id,
  name: data.name,
  email: data.email,
  accessTier: data.accessTier,  // 'BETA' ou 'PUBLIC'
  betaAddedAt: data.betaAddedAt,  // null ou timestamp
  role: data.role
}

// Use em componentes
if (globalState.user.accessTier === 'BETA') {
  showBetaBadge()
  loadExperimentalFeatures()
}
```

### Componentes do Frontend Envolvidos

1. **Register Page**
   - Formulário padrão (sem alterações)
   - POST para `/api/auth/register`
   - Redirecionar para `/verify-email`

2. **Verify Email Page**
   - Mesma para todos (já existe)
   - Após verificação → `/dashboard`

3. **Dashboard/Perfil**
   - Mostrar badge `BETA` se `accessTier === 'BETA'`
   - Mostrar `betaAddedAt` no tooltip (opcional)

4. **Admin Panel**
   - Nova tela: "Beta Invites"
   - Listar (GET), Adicionar (POST), Remover (DELETE)
   - Paginação
   - Campo opcional de "Motivo"

---

## 🚀 Resumo Técnico

| Aspecto | Details |
|---------|---------|
| **Quando é Decidido** | Durante POST /api/auth/register |
| **Quem Decide** | Backend (automático) |
| **Base da Decisão** | Lookup na tabela `betaInvites` |
| **Visível ao Usuário** | Após GET /api/auth/me no campo `accessTier` |
| **Alterável Depois** | ❌ Não (apenas por admin manualmente no DB) |
| **Regra** | Se email na whitelist → BETA, senão → PUBLIC |
| **Timestamp** | `betaAddedAt` preenchido automaticamente |

---

## 📱 Checklist para Frontend Developer

- [ ] Formulário de registro (já existe, sem mudanças)
- [ ] GET /api/auth/me para verificar `accessTier`
- [ ] Mostrar badge BETA no perfil se `accessTier === 'BETA'`
- [ ] Feature flag para condicionar UI experimental
- [ ] Admin panel: Listar beta invites (GET)
- [ ] Admin panel: Adicionar novo invite (POST com email + motivo)
- [ ] Admin panel: Remove r invite (DELETE com email)
- [ ] Armazenar `accessTier` em estado global/context
- [ ] Testes: User normal vs User BETA

---

## 🆘 FAQ

**P: Por que o usuário não vê que foi "convidado" durante registro?**
R: Por design! O sistema é transparente. Descobrem depois que acessam o app.

**P: Posso mostrar algo diferente para users BETA?**
R: Sim! Use `user.accessTier === 'BETA'` para condicionar UI/funcionalidades.

**P: E se o email já está registrado?**
R: Não pode registrar novamente (erro 409 CONFLICT). A whitelist não afeta isso.

**P: Posso remover alguém do tier BETA?**
R: Não pelo API. Apenas admin pode fazer no banco de dados diretamente. O tier é permanente por usuário.

**P: E se tirar o email da whitelist depois que se registrou?**
R: Não afeta. Usuário já conseguiu ter acesso BETA. Whitelist só afeta **novos registros**.

**P: Quantas pessoas podem estar na whitelist?**
R: Sem limite. Pode ser centenas.

**P: Preciso chamar os endpoints de admin?**
R: Só se for implementar UI para admins gerenciarem. Senão, ignore.
