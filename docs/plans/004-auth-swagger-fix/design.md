# TáComQuem — Correção de Auth e Documentação Swagger

**Data:** 2026-02-04
**Status:** Proposto
**Iniciativa:** 004-auth-swagger-fix

---

## 1. Visão Geral

Correção de bug crítico no sistema de autenticação e melhoria da documentação Swagger/OpenAPI para todas as rotas da aplicação.

### 1.1 Problemas Identificados

| # | Problema | Severidade | Impacto |
|---|----------|------------|---------|
| 1 | Login sempre assina tokens com role `'USER'` hardcoded | **Crítico** | Admins não conseguem acessar rotas admin |
| 2 | 25 de 36 rotas sem schema Swagger | Médio | Documentação incompleta, sem tags/security |

### 1.2 Escopo

**Incluído:**
- Correção do bug de role no login email/senha
- Correção do bug de role no Google OAuth
- Adição de schemas Swagger em todas as rotas sem documentação
- Adição de tags faltantes na configuração do Swagger

**Excluído:**
- Novos endpoints
- Mudanças de lógica de negócio
- Frontend

---

## 2. Bug Crítico: Role Hardcoded

### 2.1 Análise do Problema

**Causa raiz:** O `UserResponse` retornado pelo auth service não inclui o campo `role`, e as rotas de login usam `'USER'` hardcoded.

**Fluxo atual (incorreto):**
```
1. Admin faz login com email/senha
2. auth service retorna { id, name, email, avatarUrl, emailVerified } ← SEM ROLE
3. Rota de login faz: signAccessToken(user.id, 'USER') ← HARDCODED
4. Admin recebe token com role='USER'
5. Admin tenta acessar /api/admin/* → 403 Forbidden
```

**Fluxo correto:**
```
1. Admin faz login com email/senha
2. auth service retorna { id, name, email, avatarUrl, emailVerified, role: 'SUPER_ADMIN' }
3. Rota de login faz: signAccessToken(user.id, user.role)
4. Admin recebe token com role='SUPER_ADMIN'
5. Admin acessa /api/admin/* → 200 OK
```

### 2.2 Arquivos Afetados

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `src/services/auth/index.ts` | interface | `UserResponse` sem campo `role` |
| `src/services/auth/index.ts` | ~72-78 | `createUser` não retorna role |
| `src/services/auth/index.ts` | ~136-142 | `login` não retorna role |
| `src/services/auth/index.ts` | ~225, ~255, ~285 | `findOrCreateGoogleUser` não retorna role |
| `src/services/auth/index.ts` | ~303-308 | `getUserById` não retorna role |
| `src/routes/auth/index.ts` | 152-154 | Login usa `'USER'` hardcoded |
| `src/routes/auth/google.ts` | 117-119 | OAuth usa `'USER'` hardcoded |

---

## 3. Documentação Swagger Incompleta

### 3.1 Status Atual

| Categoria | Com Schema | Sem Schema | Cobertura |
|-----------|------------|------------|-----------|
| Auth | 8 | 0 | 100% |
| Items | 5 | 0 | 100% |
| Upload | 1 | 0 | 100% |
| Loans | 0 | 6 | 0% |
| Links | 0 | 2 | 0% |
| Dashboard | 0 | 2 | 0% |
| Admin Analytics | 0 | 3 | 0% |
| Admin Users | 0 | 4 | 0% |
| Admin Moderation | 0 | 4 | 0% |
| Admin Admins | 0 | 5 | 0% |
| **Total** | **14** | **25** | **36%** |

### 3.2 Tags Faltantes no app.ts

Atualmente configuradas:
- `Authentication`
- `OAuth`
- `Items`
- `Upload`
- `Health`

Faltantes:
- `Loans`
- `Links`
- `Dashboard`
- `Admin - Analytics`
- `Admin - Users`
- `Admin - Moderation`
- `Admin - Admins`

### 3.3 Padrão de Schema a Implementar

```typescript
app.get(
  '/exemplo',
  {
    schema: {
      description: 'Descrição clara do endpoint',
      tags: ['NomeDaCategoria'],
      security: [{ BearerAuth: [] }],  // Apenas se autenticado
      params: { /* se tiver params */ },
      querystring: { /* se tiver query */ },
      body: { /* se tiver body */ },
      response: {
        200: { /* schema de sucesso */ },
        400: { /* schema de erro */ },
        401: { /* se precisar auth */ },
        403: { /* se tiver RBAC */ },
        404: { /* se recurso não existir */ },
      },
    },
  },
  async (request, reply) => { /* handler */ }
);
```

---

## 4. Arquivos a Modificar

### 4.1 Bug de Role

| Arquivo | Modificação |
|---------|-------------|
| `src/services/auth/index.ts` | Adicionar `role` em `UserResponse` e todos os returns |
| `src/routes/auth/index.ts` | Usar `user.role` ao invés de `'USER'` |
| `src/routes/auth/google.ts` | Usar `user.role` ao invés de `'USER'` |
| `src/services/auth/__tests__/auth.test.ts` | Atualizar mocks e assertions |

### 4.2 Documentação Swagger

| Arquivo | Endpoints | Mudança |
|---------|-----------|---------|
| `src/app.ts` | N/A | Adicionar 7 tags |
| `src/routes/loans/index.ts` | 6 | Adicionar schemas |
| `src/routes/links/index.ts` | 2 | Adicionar schemas |
| `src/routes/dashboard/index.ts` | 2 | Adicionar schemas |
| `src/routes/admin/analytics.ts` | 3 | Adicionar schemas |
| `src/routes/admin/users.ts` | 4 | Adicionar schemas |
| `src/routes/admin/moderation.ts` | 4 | Adicionar schemas |
| `src/routes/admin/admins.ts` | 5 | Adicionar schemas |

---

## 5. Endpoints a Documentar

### 5.1 Loans (`/api/loans`)

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| POST | `/` | JWT | Criar empréstimo |
| GET | `/` | JWT | Listar empréstimos |
| GET | `/:id` | JWT | Detalhes do empréstimo |
| PATCH | `/:id/return` | JWT | Marcar como devolvido |
| PATCH | `/:id/cancel` | JWT | Cancelar empréstimo |
| POST | `/:id/remind` | JWT | Enviar lembrete |

### 5.2 Links (`/api/links`)

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| GET | `/:token` | Não | Ver detalhes públicos |
| POST | `/:token/confirm` | JWT | Confirmar empréstimo |

### 5.3 Dashboard (`/api/dashboard`)

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| GET | `/` | JWT | Dados do dashboard |
| GET | `/friends` | JWT | Lista de amigos |

### 5.4 Admin Analytics (`/api/admin/analytics`)

| Método | Endpoint | Auth | Role | Descrição |
|--------|----------|------|------|-----------|
| GET | `/dashboard` | JWT | ANALYST+ | Stats do dashboard |
| GET | `/users/stats` | JWT | ANALYST+ | Stats de usuários |
| GET | `/loans/stats` | JWT | ANALYST+ | Stats de empréstimos |

### 5.5 Admin Users (`/api/admin/users`)

| Método | Endpoint | Auth | Role | Descrição |
|--------|----------|------|------|-----------|
| GET | `/` | JWT | ANALYST+ | Listar usuários |
| GET | `/:id` | JWT | SUPPORT+ | Detalhes do usuário |
| POST | `/:id/block` | JWT | SUPER_ADMIN | Bloquear usuário |
| POST | `/:id/unblock` | JWT | SUPER_ADMIN | Desbloquear usuário |

### 5.6 Admin Moderation (`/api/admin/moderation`)

| Método | Endpoint | Auth | Role | Descrição |
|--------|----------|------|------|-----------|
| GET | `/items/:id` | JWT | SUPPORT+ | Detalhes do item |
| DELETE | `/items/:id` | JWT | MODERATOR+ | Remover item |
| GET | `/loans/:id` | JWT | SUPPORT+ | Detalhes do empréstimo |
| POST | `/loans/:id/cancel` | JWT | MODERATOR+ | Cancelar empréstimo |

### 5.7 Admin Admins (`/api/admin/admins`)

| Método | Endpoint | Auth | Role | Descrição |
|--------|----------|------|------|-----------|
| GET | `/` | JWT | SUPER_ADMIN | Listar admins |
| POST | `/` | JWT | SUPER_ADMIN | Promover a admin |
| PATCH | `/:id/role` | JWT | SUPER_ADMIN | Alterar role |
| DELETE | `/:id` | JWT | SUPER_ADMIN | Remover admin |
| GET | `/audit-log` | JWT | SUPER_ADMIN | Ver audit log |

---

## 6. Verificação

### 6.1 Testes Automatizados

```bash
bun test src/services/auth/__tests__/auth.test.ts  # Testes do auth
bun test                                            # Suite completa
bun run qa                                          # TypeScript + Biome
```

### 6.2 Teste Manual do Bug de Role

1. Criar admin: `bun run admin:create`
2. Login com credenciais admin via `/api/auth/login`
3. Decodificar token JWT (jwt.io)
4. Verificar `role` no payload do token
5. Testar acesso a `/api/admin/analytics/dashboard`

### 6.3 Verificação do Swagger

1. Iniciar servidor: `bun run dev`
2. Acessar: `http://localhost:3000/docs`
3. Verificar:
   - Rotas agrupadas por tags
   - Ícone de cadeado nas rotas autenticadas
   - Schemas de request/response documentados
   - Admin routes mostrando role requirements

---

## 7. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Quebrar testes existentes | Atualizar mocks/assertions com campo `role` |
| Tokens existentes sem role | `/refresh` já preserva role do token atual |
| Mudança no contrato da API | `role` é nova propriedade, backwards-compatible |
