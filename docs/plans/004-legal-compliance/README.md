# Plano 004 — Conformidade Legal (LGPD + Marco Civil)

**Status:** Pendente implementação
**Prioridade:** CRÍTICA — Obrigações legais
**Escopo:** Implementar 4 requisitos mandatórios conforme Termos de Uso e Política de Privacidade

---

## Resumo Executivo

Os documentos legais criados em `docs/legal/` estabelecem direitos dos usuários e obrigações de conformidade com:
- **LGPD (Lei nº 13.709/2018)** — Lei Geral de Proteção de Dados Pessoais
- **Marco Civil da Internet (Lei nº 12.965/2014)** — Obrigações de logging

Esta task detalha os 4 requisitos críticos que **precisam de implementação no backend** antes do lançamento público.

---

## 1. Consentimento Parental para Menores até 12 Anos

**Base Legal:** LGPD art. 14 + Termos Seção 4.1 + Política Seção 10.1

**O que diz a lei:**
> O tratamento de dados de crianças de até 12 anos somente será feito com consentimento específico e expresso do responsável legal.

**O que precisa implementar:**

### 1.1 Fluxo de Registro

Quando um usuário se registra ou atualiza seu perfil:

1. **Pergunta de idade:**
   - "Qual sua data de nascimento?" (campo obrigatório)
   - Se data_nascimento ≤ 12 anos atrás, ativar fluxo parental

2. **Se menor de 12:**
   - Mostrar modal: "Esta conta é para uma criança. O responsável legal precisa confirmar."
   - Campos obrigatórios:
     - Email do responsável
     - Nome do responsável (texto)
     - Checkbox: "Confirmo ser o responsável legal e consentir o uso..."

3. **Validação no backend:**
   - Enviar e-mail de confirmação ao responsável com:
     - Link de confirmação (válido por 48h)
     - Aviso: criança pode usar apenas após confirmação parental
   - Conta criada mas bloqueada até confirmação

### 1.2 Schema Alterações

```sql
ALTER TABLE users ADD COLUMN (
  date_of_birth DATE,
  parental_consent_status VARCHAR(50) -- 'pending', 'confirmed', 'not_applicable'
  parental_email VARCHAR(255),
  parental_name VARCHAR(255),
  parental_consent_token VARCHAR(255),
  parental_consent_confirmed_at TIMESTAMP,
  parental_consent_ip_address INET
);
```

### 1.3 Endpoints Necessários

- `POST /api/auth/register` — atualizado com validação de idade
- `POST /api/auth/parental-consent/confirm?token=[token]` — confirma consentimento via email
- `GET /api/users/me/parental-consent` — status do consentimento parental

---

## 2. Direito de Exclusão de Conta (Right to be Forgotten)

**Base Legal:** LGPD art. 17 + Política Seção 7.1

**O que diz a lei:**
> O titular tem o direito de solicitar a eliminação de seus dados pessoais.

**O que precisa implementar:**

### 2.1 Fluxo de Exclusão

1. **Endpoint de requisição:**
   ```
   POST /api/users/me/account/schedule-deletion
   Body: { reason?: string }
   ```
   - Valida autenticação do usuário
   - Cria registro de "deletion request"
   - Envia email de confirmação: "Sua conta será excluída em 15 dias. Clique aqui para cancelar."
   - Link de cancelamento válido por 15 dias

2. **Após 15 dias:**
   - Script cron/job executado diariamente
   - Executa deleção de usuário:
     - Anonimiza dados pessoais (nome, email → "deleted_user_[uuid]")
     - Soft delete (user.deleted_at = now)
     - Preserve empréstimos de outros usuários (anonymize referências)
     - Log de auditoria

3. **Cancelamento:**
   ```
   POST /api/users/me/account/cancel-deletion
   ```
   - Valid by clicking email link OR sending request com token

### 2.2 Lógica de Anonimização

Quando usuário é deletado:

| Campo | Ação |
|-------|------|
| `email_encrypted` | Substituir por hash único anônimo |
| `name_encrypted` | Substituir por "Usuário deletado" |
| `avatar_url` | Remover / substituir por avatar genérico |
| Empréstimos (como credor) | Manter, exibir como "Usuário deletado" |
| Empréstimos (como tomador) | Manter, exibir como "Usuário deletado" |
| Itens | Anonimizar propriedade |
| Amizades | Remover edges no grafo |

### 2.3 Endpoints Necessários

- `POST /api/users/me/account/schedule-deletion` — solicita exclusão (15 dias)
- `POST /api/users/me/account/cancel-deletion` — cancela exclusão pendente
- `GET /api/users/me/account/deletion-status` — verifica status
- `POST /api/users/me/account/delete-now` — admin force delete (com auth)

### 2.4 Job Necessário

```typescript
// Cron job: executa 1x por dia
bun run jobs:process-deletions
// Lógica:
// - SELECT users WHERE deleted_at IS NOT NULL AND deleted_at + 15 days <= NOW()
// - Para cada usuário: anonymize data, cleanup related records
```

---

## 3. Direito de Portabilidade (Data Export)

**Base Legal:** LGPD art. 18 + Política Seção 7.2

**O que diz a lei:**
> O titular pode solicitar a exportação de seus dados em formato estruturado, legível por máquina.

**O que precisa implementar:**

### 3.1 Fluxo de Exportação

1. **Endpoint de requisição:**
   ```
   POST /api/users/me/data/export
   Body: { format: 'json' | 'csv' }
   ```
   - Valida autenticação
   - Gera arquivo com todos os dados do usuário
   - Envia por email ou fornece link de download (válido 7 dias)

2. **Conteúdo do export:**
   ```json
   {
     "user": {
       "id": "...",
       "email": "...",
       "name": "...",
       "created_at": "...",
       // ... todos os campos do usuário
     },
     "items": [
       { "id": "...", "name": "...", "description": "...", ... }
     ],
     "loans": {
       "as_lender": [...],
       "as_borrower": [...]
     },
     "friendships": [...],
     "notifications": [...],
     "export_date": "2026-02-19T10:30:00Z",
     "export_format_version": "1.0"
   }
   ```

### 3.2 Formato CSV

Múltiplos CSVs zipados:
- `user.csv` — dados básicos
- `items.csv` — itens do usuário
- `loans_lent.csv` — empréstimos como credor
- `loans_borrowed.csv` — empréstimos como tomador
- `friendships.csv` — conexões com amigos

### 3.3 Endpoints Necessários

- `POST /api/users/me/data/export` — solicita export
- `GET /api/users/me/data/export/:export_id/download` — baixa arquivo gerado
- `GET /api/users/me/data/export/status` — verifica status de exports anteriores

---

## 4. Logs de Acesso (Marco Civil art. 15)

**Base Legal:** Marco Civil da Internet art. 15 + Política Seção 6

**O que diz a lei:**
> Registros de acesso a aplicações de internet devem ser mantidos por **6 (seis) meses**.

**O que precisa implementar:**

### 4.1 Dados a Registrar

Para cada request HTTP:
- **timestamp** — momento do acesso
- **ip_address** — endereço IP do cliente
- **user_id** — ID do usuário autenticado (NULL se anônimo)
- **method** — HTTP method (GET, POST, etc)
- **path** — caminho da URL
- **status_code** — código de resposta
- **user_agent** — navegador/cliente
- **referrer** — origem da requisição (se houver)

### 4.2 Implementação

**Opção A: Middleware do Fastify** (recomendado)

```typescript
// src/plugins/access-logs.ts
export async function accessLogsPlugin(fastify, opts) {
  fastify.addHook('onResponse', async (request, reply) => {
    // Log apenas requests autenticadas + admin actions
    if (request.user || request.path.startsWith('/api/admin')) {
      await db.insert(accessLogs).values({
        timestamp: new Date(),
        ip_address: request.ip,
        user_id: request.user?.id,
        method: request.method,
        path: request.url,
        status_code: reply.statusCode,
        user_agent: request.headers['user-agent'],
        referrer: request.headers['referer']
      })
    }
  })
}
```

**Opção B: Logs em banco de dados separado** (PostgreSQL outro schema)

```sql
CREATE TABLE access_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  ip_address INET,
  user_id UUID REFERENCES users(id),
  http_method VARCHAR(10),
  path TEXT,
  status_code SMALLINT,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_access_logs_user_timestamp ON access_logs(user_id, timestamp);
CREATE INDEX idx_access_logs_timestamp ON access_logs(timestamp);
```

### 4.3 Retenção de 6 Meses

Job cron para limpeza:

```typescript
// Executa 1x por semana
bun run jobs:cleanup-old-logs

// Lógica:
// DELETE FROM access_logs WHERE timestamp < NOW() - INTERVAL '6 months'
```

### 4.4 Endpoints Necessários

- `GET /api/admin/audit/access-logs?user_id=...&from=...&to=...` — lista logs (admin only)
- `GET /api/users/me/activity` — userful vê seus próprios logs de acesso (LGPD dir. 18)

---

## 5. Validações Adicionais de Segurança

Não são requisitos legais, mas recomendados:

### 5.1 Rate Limiting
- Login/registro: 5 tentativas por 15 minutos (IP-based)
- Geral: 100 req/min por usuário

### 5.2 Validação de Condutas Proibidas (Termos Seção 6)

- Detectar múltiplas contas (fingerprint)
- Detectar spam de empréstimos falsos
- Detectar scraping (requisições automatizadas)
- Alertar admin se comportamento suspeito

---

## Ordem de Implementação

| Prioridade | Requisito | Complexidade | Esforço |
|-----------|-----------|-------------|--------|
| 1️⃣ | Direito de Exclusão (Req. 2) | Média | 2-3 dias |
| 2️⃣ | Logs de Acesso (Req. 4) | Baixa | 1-2 dias |
| 3️⃣ | Direito de Portabilidade (Req. 3) | Média | 2 dias |
| 4️⃣ | Consentimento Parental (Req. 1) | Alta | 3-4 dias |

**Razão da ordem:**
- Exclusão é base para cumprir LGPD, precisa estar pronta primeiro
- Logs são simples de implementar, dão boa cobertura
- Portabilidade é importante mas pode esperar
- Consentimento parental é complexo (novo fluxo) e pode ser MVP sem ele (com warning)

---

## Checklist de Implementação

- [ ] **Exclusão de Conta**
  - [ ] Schema: adicionar `deletion_requested_at`, `deletion_scheduled_for`
  - [ ] Endpoint POST /api/users/me/account/schedule-deletion
  - [ ] Endpoint POST /api/users/me/account/cancel-deletion
  - [ ] Job: process-deletions (cron)
  - [ ] Testes: unit + integration

- [ ] **Logs de Acesso**
  - [ ] Schema: criar `access_logs` table
  - [ ] Middleware: access-logs plugin no Fastify
  - [ ] Job: cleanup-old-logs (cron)
  - [ ] Endpoint: GET /api/admin/audit/access-logs
  - [ ] Testes

- [ ] **Portabilidade**
  - [ ] Endpoint: POST /api/users/me/data/export
  - [ ] Service: data export (JSON + CSV)
  - [ ] Endpoint: GET /api/users/me/data/export/:id/download
  - [ ] Email com link de download
  - [ ] Testes

- [ ] **Consentimento Parental**
  - [ ] Schema: campos de date_of_birth, parental_consent_*
  - [ ] Validação no /api/auth/register
  - [ ] Fluxo de email de confirmação
  - [ ] Endpoint: POST /api/auth/parental-consent/confirm
  - [ ] Testes

- [ ] **Geral**
  - [ ] Rate limiting implementado
  - [ ] Documentação de APIs atualizada
  - [ ] QA: `bun run qa` passa
  - [ ] Testes: `bun test` passa com cobertura > 80%

---

## Referências

- [LGPD Artigos relevantes](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [Marco Civil da Internet](http://www.planalto.gov.br/ccivil_03/leis/l12965.htm)
- [docs/legal/termos-de-uso.md](../legal/termos-de-uso.md)
- [docs/legal/politica-de-privacidade.md](../legal/politica-de-privacidade.md)
