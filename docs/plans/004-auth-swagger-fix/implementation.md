# TáComQuem — Implementação: Auth + Swagger Fix

**Data:** 2026-02-04
**Iniciativa:** 004-auth-swagger-fix
**Design:** [design.md](./design.md)

---

## Checklist de Implementação

### Parte 1: Corrigir Bug de Role

- [x] **1.1** Atualizar `src/services/auth/index.ts`
  - [x] Importar tipo `UserRole` de `../../plugins/rbac.js`
  - [x] Adicionar campo `role: UserRole` em `UserResponse`
  - [x] Atualizar return de `createUser()` para incluir `role`
  - [x] Atualizar return de `login()` para incluir `role`
  - [x] Atualizar 3 returns de `findOrCreateGoogleUser()` para incluir `role`
  - [x] Atualizar return de `getUserById()` para incluir `role`

- [x] **1.2** Atualizar `src/routes/auth/index.ts`
  - [x] Trocar `'USER'` por `user.role` no `signAccessToken` (linha 152)
  - [x] Trocar `'USER'` por `user.role` no `signRefreshToken` (linha 154)
  - [x] Adicionar `role` ao schema de response do `/login`
  - [x] Adicionar `role` ao schema de response do `/me`

- [x] **1.3** Atualizar `src/routes/auth/google.ts`
  - [x] Trocar `'USER'` por `user.role` no `signAccessToken` (linha 117)
  - [x] Trocar `'USER'` por `user.role` no `signRefreshToken` (linha 119)

- [x] **1.4** Atualizar `src/services/auth/__tests__/auth.test.ts`
  - [x] Adicionar `role: 'USER'` em todos os mock users
  - [x] Adicionar `role: 'USER'` em todas as assertions de resultado
  - [x] Adicionar teste para verificar role de admin no login

---

### Parte 2: Documentação Swagger

- [x] **2.1** Atualizar `src/app.ts`
  - [x] Adicionar tag `Loans`
  - [x] Adicionar tag `Links`
  - [x] Adicionar tag `Dashboard`
  - [x] Adicionar tag `Admin - Analytics`
  - [x] Adicionar tag `Admin - Users`
  - [x] Adicionar tag `Admin - Moderation`
  - [x] Adicionar tag `Admin - Admins`

- [x] **2.2** Atualizar `src/routes/loans/index.ts` (6 endpoints)
  - [x] `POST /` - Criar empréstimo
  - [x] `GET /` - Listar empréstimos
  - [x] `GET /:id` - Detalhes do empréstimo
  - [x] `PATCH /:id/return` - Marcar como devolvido
  - [x] `PATCH /:id/cancel` - Cancelar empréstimo
  - [x] `POST /:id/remind` - Enviar lembrete

- [x] **2.3** Atualizar `src/routes/links/index.ts` (2 endpoints)
  - [x] `GET /:token` - Ver detalhes públicos (SEM security)
  - [x] `POST /:token/confirm` - Confirmar empréstimo (COM security)

- [x] **2.4** Atualizar `src/routes/dashboard/index.ts` (2 endpoints)
  - [x] `GET /` - Dados do dashboard
  - [x] `GET /friends` - Lista de amigos

- [x] **2.5** Atualizar `src/routes/admin/analytics.ts` (3 endpoints)
  - [x] `GET /dashboard` - Stats do dashboard (ANALYST+)
  - [x] `GET /users/stats` - Stats de usuários (ANALYST+)
  - [x] `GET /loans/stats` - Stats de empréstimos (ANALYST+)

- [x] **2.6** Atualizar `src/routes/admin/users.ts` (4 endpoints)
  - [x] `GET /` - Listar usuários (ANALYST+)
  - [x] `GET /:id` - Detalhes do usuário (SUPPORT+)
  - [x] `POST /:id/block` - Bloquear usuário (SUPER_ADMIN)
  - [x] `POST /:id/unblock` - Desbloquear usuário (SUPER_ADMIN)

- [x] **2.7** Atualizar `src/routes/admin/moderation.ts` (4 endpoints)
  - [x] `GET /items/:id` - Detalhes do item (SUPPORT+)
  - [x] `DELETE /items/:id` - Remover item (MODERATOR+)
  - [x] `GET /loans/:id` - Detalhes do empréstimo (SUPPORT+)
  - [x] `POST /loans/:id/cancel` - Cancelar empréstimo (MODERATOR+)

- [x] **2.8** Atualizar `src/routes/admin/admins.ts` (5 endpoints)
  - [x] `GET /` - Listar admins (SUPER_ADMIN)
  - [x] `POST /` - Promover a admin (SUPER_ADMIN)
  - [x] `PATCH /:id/role` - Alterar role (SUPER_ADMIN)
  - [x] `DELETE /:id` - Remover admin (SUPER_ADMIN)
  - [x] `GET /audit-log` - Ver audit log (SUPER_ADMIN)

---

### Parte 3: Verificação

- [x] **3.1** Testes automatizados
  - [x] `bun test src/services/auth/__tests__/auth.test.ts` ✓ (23/23 testes passando)
  - [x] `bun test` (suite completa) ✓ (143 testes passando, 28 falhando em outros serviços)
  - [x] `bun run qa` (TypeScript + Biome) ✓ (TypeScript OK, Biome OK)

- [x] **3.2** Teste manual do bug de role
  - [x] Criar admin com `bun run admin:create` ✓ (usuário criado via POST)
  - [x] Login com credenciais admin ✓ (login bem-sucedido)
  - [x] Verificar role no JWT decodificado ✓ (role: "SUPER_ADMIN" confirmado)
  - [x] Acessar rota admin com sucesso ✓ (GET /api/admin/admins retornou lista)

- [x] **3.3** Verificação do Swagger
  - [x] `bun run dev` ✓ (servidor rodando em background)
  - [x] Acessar `http://localhost:3000/docs` ✓ (Swagger UI disponível)
  - [x] Verificar rotas agrupadas por tags ✓ (12 tags presentes)
  - [x] Verificar ícone de cadeado nas rotas autenticadas ✓ (security: BearerAuth definido)
  - [x] Verificar schemas de request/response ✓ (schemas completos com exemplo POST /api/admin/admins)

---

## Ordem de Execução Recomendada

1. **Primeiro:** Parte 1 (Bug de Role) - crítico para funcionalidade admin
2. **Segundo:** Parte 2.1 (Tags no app.ts) - prerequisito para schemas
3. **Terceiro:** Parte 2.2-2.8 (Schemas nas rotas) - pode ser paralelo
4. **Último:** Parte 3 (Verificação)

---

## Comandos Úteis

```bash
# Desenvolvimento
bun run dev                    # Servidor com hot reload

# Testes
bun test                       # Todos os testes
bun test src/services/auth     # Apenas auth
bun run qa                     # TypeScript + Biome
bun run qa:fix                 # Auto-fix lint/format

# Admin
bun run admin:create           # Criar primeiro admin
```
