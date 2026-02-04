# TáComQuem — Design do MVP

**Data:** 2026-02-03
**Status:** Validado
**Baseado em:** Revisão colaborativa do PRD original

---

## 1. Visão Geral

Aplicação web para gestão de empréstimos de itens pessoais entre amigos. Resolve três problemas principais:

1. "Emprestei e esqueci" — O dono esquece que emprestou algo
2. "Quero de volta mas tenho vergonha de cobrar" — Desconforto social
3. "Recebi emprestado e esqueci de devolver" — Receptor esquece

**Público-alvo:** Qualquer pessoa que empresta coisas (sem nicho específico).

---

## 2. Decisões de Escopo

### 2.1 O que ENTRA no MVP

| Área | Decisão |
|------|---------|
| **Autenticação** | Google OAuth + Email/senha (com verificação e recuperação) |
| **Dados do usuário** | Apenas nome e email, criptografados (LGPD) |
| **Itens** | Tabela própria, reutilizáveis entre empréstimos, múltiplas imagens (JSON array) |
| **Empréstimos** | Link de confirmação, login obrigatório para confirmar |
| **Tela de confirmação** | Mostra: foto, nome do item, quem está emprestando (antes do login) |
| **Lembretes** | Manuais por email (botão "Solicitar Devolução") |
| **Dashboard** | Cards de empréstimos + atividade recente |
| **Menu** | Visão Geral, Meus Itens, Histórico, Amigos, Configurações |

### 2.2 O que NÃO entra no MVP

- Apple/Facebook OAuth
- Device fingerprinting e consolidação de identidades
- Usuários temporários (confirmação sem login)
- Lembretes automáticos/inteligentes
- Push notifications (FCM/APN)
- Bem-Estar / Check-in Social
- Categoria do item (fácil adicionar depois)
- Redis para cache/sessions

---

## 3. Fluxos de Usuário

### 3.1 Cadastro/Login

```
Usuário novo → Escolhe: Google OAuth OU Email/Senha
                              ↓
            [Email/Senha] → Preenche dados → Recebe email de verificação
                              ↓
                        Clica no link → Conta ativada → Dashboard

            [Google] → Autoriza → Conta criada automaticamente → Dashboard
```

### 3.2 Criar Empréstimo (Registro Relâmpago)

```
Dashboard → Clica "+ Registrar Empréstimo"
                    ↓
         ┌─────────────────────────────────┐
         │  Selecione ou cadastre o item:  │
         │                                 │
         │  [Furadeira Bosch]  [Câmera]   │  ← itens existentes
         │                                 │
         │  [+ Cadastrar novo item]        │
         └─────────────────────────────────┘
                    ↓
         Se novo: preenche foto, nome, descrição
         Se existente: pode editar dados antes de continuar
                    ↓
         Preenche: para quem (nome/email)
         Opcional: data de devolução, notas
                    ↓
         Clica "Gerar Link de Confirmação"
                    ↓
         Recebe link → Compartilha via WhatsApp/email/etc
```

### 3.3 Confirmar Empréstimo (receptor)

```
Receptor abre link → Vê: foto, nome do item, quem emprestou
                              ↓
                    Clica "Confirmar" → Tela de login
                              ↓
                    Login (Google ou Email/Senha)
                              ↓
                    Empréstimo confirmado → Vai pro dashboard do receptor
```

### 3.4 Solicitar Devolução (lembrete manual)

```
Dashboard do dono → Card do empréstimo → Clica "Solicitar Devolução"
                              ↓
                    Sistema envia email para o receptor
                              ↓
                    Email contém link para o app
```

---

## 4. Schema do Banco de Dados

### 4.1 Diagrama

```
users
  ├── oauth_accounts (1:N)
  ├── items (1:N)
  │     └── loans (1:N)
  │           ├── loan_tokens (1:N)
  │           └── notifications (1:N)
  └── notifications (1:N)
```

### 4.2 Tabelas

**users** (criptografado para LGPD)
```sql
id                UUID PRIMARY KEY
email_encrypted   TEXT NOT NULL        -- criptografado
name_encrypted    TEXT NOT NULL        -- criptografado
email_hash        VARCHAR(255) NOT NULL -- hash para busca
password_hash     VARCHAR(255)         -- null se usar só OAuth
google_id         VARCHAR(255)         -- null se usar só email/senha
avatar_url        TEXT
email_verified    BOOLEAN DEFAULT false
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

**oauth_accounts**
```sql
id                  UUID PRIMARY KEY
user_id             UUID REFERENCES users
provider            VARCHAR(50) NOT NULL  -- 'google'
provider_account_id VARCHAR(255) NOT NULL
access_token        TEXT
refresh_token       TEXT
expires_at          TIMESTAMP
created_at          TIMESTAMP
updated_at          TIMESTAMP

UNIQUE(provider, provider_account_id)
```

**items**
```sql
id            UUID PRIMARY KEY
owner_id      UUID REFERENCES users
name          VARCHAR(255) NOT NULL
description   TEXT
images        JSONB NOT NULL        -- array de URLs
is_active     BOOLEAN DEFAULT true
created_at    TIMESTAMP
updated_at    TIMESTAMP
```

**loans**
```sql
id                   UUID PRIMARY KEY
item_id              UUID REFERENCES items
lender_id            UUID REFERENCES users
borrower_id          UUID REFERENCES users  -- null até confirmar
borrower_email       VARCHAR(255)           -- para quem ainda não confirmou
status               loan_status NOT NULL   -- pending, confirmed, returned, cancelled
expected_return_date TIMESTAMP
lender_notes         TEXT
borrower_notes       TEXT
confirmed_at         TIMESTAMP
returned_at          TIMESTAMP
created_at           TIMESTAMP
updated_at           TIMESTAMP
```

**loan_tokens**
```sql
id          UUID PRIMARY KEY
loan_id     UUID REFERENCES loans
token       TEXT NOT NULL UNIQUE
expires_at  TIMESTAMP NOT NULL
used_at     TIMESTAMP
created_at  TIMESTAMP
```

**notifications**
```sql
id         UUID PRIMARY KEY
user_id    UUID REFERENCES users
loan_id    UUID REFERENCES loans
type       notification_type NOT NULL
title      VARCHAR(255) NOT NULL
message    TEXT NOT NULL
read       BOOLEAN DEFAULT false
sent_at    TIMESTAMP
created_at TIMESTAMP
```

### 4.3 Enums

```sql
CREATE TYPE loan_status AS ENUM ('pending', 'confirmed', 'returned', 'cancelled');
CREATE TYPE notification_type AS ENUM ('loan_created', 'loan_confirmed', 'loan_reminder', 'loan_returned');
```

---

## 5. API Endpoints

### 5.1 Autenticação

```
POST   /api/auth/register          # Cadastro email/senha
POST   /api/auth/login             # Login email/senha
POST   /api/auth/verify-email      # Verificar email (token)
POST   /api/auth/forgot-password   # Solicitar reset de senha
POST   /api/auth/reset-password    # Resetar senha (token)
GET    /api/auth/google            # Inicia OAuth Google
GET    /api/auth/google/callback   # Callback Google
POST   /api/auth/refresh           # Renovar access token
GET    /api/auth/me                # Usuário atual
```

### 5.2 Itens

```
POST   /api/items                  # Criar item
GET    /api/items                  # Listar meus itens
GET    /api/items/:id              # Detalhes do item
PATCH  /api/items/:id              # Atualizar item
DELETE /api/items/:id              # Desativar item (soft delete)
```

### 5.3 Empréstimos

```
POST   /api/loans                  # Criar empréstimo + gerar link
GET    /api/loans                  # Listar empréstimos (filtros: lent/borrowed/status)
GET    /api/loans/:id              # Detalhes do empréstimo
PATCH  /api/loans/:id/return       # Marcar como devolvido
PATCH  /api/loans/:id/cancel       # Cancelar empréstimo
POST   /api/loans/:id/remind       # Enviar lembrete (email)
```

### 5.4 Links Públicos

```
GET    /api/links/:token           # Ver detalhes do empréstimo (público)
POST   /api/links/:token/confirm   # Confirmar empréstimo (requer auth)
```

### 5.5 Dashboard

```
GET    /api/dashboard              # Dados da visão geral
GET    /api/friends                # Lista de pessoas com interações
```

### 5.6 Health

```
GET    /api/health                 # Health check
GET    /api/health/db              # Database health check
```

---

## 6. Stack Técnica

### 6.1 Backend

| Tecnologia | Uso |
|------------|-----|
| TypeScript | Linguagem |
| Fastify | Framework HTTP |
| Drizzle ORM | Acesso ao banco |
| PostgreSQL | Banco de dados |
| Zod | Validação de schemas |
| JWT | Autenticação stateless |

### 6.2 Serviços Externos

| Serviço | Uso |
|---------|-----|
| Google OAuth | Login social |
| Resend ou SendGrid | Envio de emails |
| Oracle Object Storage ou Cloudflare R2 | Armazenamento de imagens |

### 6.3 Infraestrutura

| Componente | Escolha |
|------------|---------|
| Servidor | Oracle Cloud Always Free (ARM Ampere) |
| Banco | PostgreSQL na Oracle Cloud |
| SSL | Let's Encrypt via Nginx |

### 6.4 Estrutura de Pastas

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
│   ├── email.ts
│   ├── crypto.ts
│   └── storage.ts
├── schemas/         # Zod validations
└── index.ts
```

---

## 7. Segurança

### 7.1 LGPD Compliance

- Armazenar apenas nome e email do usuário
- Ambos criptografados no banco (AES-256 ou similar)
- Hash do email para buscas (SHA-256)
- Soft delete para manter histórico sem dados pessoais expostos

### 7.2 Autenticação

- Senhas com hash bcrypt (cost factor 12)
- JWT access token (expira em 7 dias)
- JWT refresh token (expira em 30 dias)
- Tokens de verificação/reset expiram em 24h

### 7.3 Rate Limiting

- Rate limit básico do Fastify
- Limites mais restritivos em endpoints sensíveis (login, register)

---

## 8. Funcionalidades Futuras (pós-MVP)

Prioridade para implementar depois do MVP validado:

1. **Categoria de itens** — Campo opcional, ~2h de trabalho
2. **Apple/Facebook OAuth** — Expandir opções de login
3. **Push notifications** — FCM/APN para lembretes
4. **Lembretes automáticos** — Baseado em data de devolução
5. **App mobile** — React Native

---

## 9. Menu da Aplicação

```
┌─────────────────────┐
│  Visão Geral        │  ← Dashboard principal
│  Meus Itens         │  ← Itens cadastrados (agrupados)
│  Histórico          │  ← Todos os empréstimos
│  Amigos             │  ← Pessoas com quem interagiu
│  Configurações      │  ← Perfil e preferências
└─────────────────────┘
```

**Removido do MVP:**
- Bem-Estar / Check-in Social

---

## 10. Referências

- PRD original: [docs/prd.md](../prd.md)
- Mockup do dashboard: Central de Empréstimos com cards
- Mockup do cadastro: Registro Relâmpago
