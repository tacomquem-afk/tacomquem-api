# TáComQuem — Implementação: Auth + Swagger Fix

**Data:** 2026-02-04
**Iniciativa:** 004-auth-swagger-fix
**Design:** [design.md](./design.md)

---

## Checklist de Implementação

### Parte 1: Corrigir Bug de Role

- [ ] **1.1** Atualizar `src/services/auth/index.ts`
  - [ ] Importar tipo `UserRole` de `../../plugins/rbac.js`
  - [ ] Adicionar campo `role: UserRole` em `UserResponse`
  - [ ] Atualizar return de `createUser()` para incluir `role`
  - [ ] Atualizar return de `login()` para incluir `role`
  - [ ] Atualizar 3 returns de `findOrCreateGoogleUser()` para incluir `role`
  - [ ] Atualizar return de `getUserById()` para incluir `role`

- [ ] **1.2** Atualizar `src/routes/auth/index.ts`
  - [ ] Trocar `'USER'` por `user.role` no `signAccessToken` (linha 152)
  - [ ] Trocar `'USER'` por `user.role` no `signRefreshToken` (linha 154)
  - [ ] Adicionar `role` ao schema de response do `/login`
  - [ ] Adicionar `role` ao schema de response do `/me`

- [ ] **1.3** Atualizar `src/routes/auth/google.ts`
  - [ ] Trocar `'USER'` por `user.role` no `signAccessToken` (linha 117)
  - [ ] Trocar `'USER'` por `user.role` no `signRefreshToken` (linha 119)

- [ ] **1.4** Atualizar `src/services/auth/__tests__/auth.test.ts`
  - [ ] Adicionar `role: 'USER'` em todos os mock users
  - [ ] Adicionar `role: 'USER'` em todas as assertions de resultado
  - [ ] Adicionar teste para verificar role de admin no login

---

### Parte 2: Documentação Swagger

- [ ] **2.1** Atualizar `src/app.ts`
  - [ ] Adicionar tag `Loans`
  - [ ] Adicionar tag `Links`
  - [ ] Adicionar tag `Dashboard`
  - [ ] Adicionar tag `Admin - Analytics`
  - [ ] Adicionar tag `Admin - Users`
  - [ ] Adicionar tag `Admin - Moderation`
  - [ ] Adicionar tag `Admin - Admins`

- [ ] **2.2** Atualizar `src/routes/loans/index.ts` (6 endpoints)
  - [ ] `POST /` - Criar empréstimo
  - [ ] `GET /` - Listar empréstimos
  - [ ] `GET /:id` - Detalhes do empréstimo
  - [ ] `PATCH /:id/return` - Marcar como devolvido
  - [ ] `PATCH /:id/cancel` - Cancelar empréstimo
  - [ ] `POST /:id/remind` - Enviar lembrete

- [ ] **2.3** Atualizar `src/routes/links/index.ts` (2 endpoints)
  - [ ] `GET /:token` - Ver detalhes públicos (SEM security)
  - [ ] `POST /:token/confirm` - Confirmar empréstimo (COM security)

- [ ] **2.4** Atualizar `src/routes/dashboard/index.ts` (2 endpoints)
  - [ ] `GET /` - Dados do dashboard
  - [ ] `GET /friends` - Lista de amigos

- [ ] **2.5** Atualizar `src/routes/admin/analytics.ts` (3 endpoints)
  - [ ] `GET /dashboard` - Stats do dashboard (ANALYST+)
  - [ ] `GET /users/stats` - Stats de usuários (ANALYST+)
  - [ ] `GET /loans/stats` - Stats de empréstimos (ANALYST+)

- [ ] **2.6** Atualizar `src/routes/admin/users.ts` (4 endpoints)
  - [ ] `GET /` - Listar usuários (ANALYST+)
  - [ ] `GET /:id` - Detalhes do usuário (SUPPORT+)
  - [ ] `POST /:id/block` - Bloquear usuário (SUPER_ADMIN)
  - [ ] `POST /:id/unblock` - Desbloquear usuário (SUPER_ADMIN)

- [ ] **2.7** Atualizar `src/routes/admin/moderation.ts` (4 endpoints)
  - [ ] `GET /items/:id` - Detalhes do item (SUPPORT+)
  - [ ] `DELETE /items/:id` - Remover item (MODERATOR+)
  - [ ] `GET /loans/:id` - Detalhes do empréstimo (SUPPORT+)
  - [ ] `POST /loans/:id/cancel` - Cancelar empréstimo (MODERATOR+)

- [ ] **2.8** Atualizar `src/routes/admin/admins.ts` (5 endpoints)
  - [ ] `GET /` - Listar admins (SUPER_ADMIN)
  - [ ] `POST /` - Promover a admin (SUPER_ADMIN)
  - [ ] `PATCH /:id/role` - Alterar role (SUPER_ADMIN)
  - [ ] `DELETE /:id` - Remover admin (SUPER_ADMIN)
  - [ ] `GET /audit-log` - Ver audit log (SUPER_ADMIN)

---

### Parte 3: Verificação

- [ ] **3.1** Testes automatizados
  - [ ] `bun test src/services/auth/__tests__/auth.test.ts`
  - [ ] `bun test` (suite completa)
  - [ ] `bun run qa` (TypeScript + Biome)

- [ ] **3.2** Teste manual do bug de role
  - [ ] Criar admin com `bun run admin:create`
  - [ ] Login com credenciais admin
  - [ ] Verificar role no JWT decodificado
  - [ ] Acessar rota admin com sucesso

- [ ] **3.3** Verificação do Swagger
  - [ ] `bun run dev`
  - [ ] Acessar `http://localhost:3000/docs`
  - [ ] Verificar rotas agrupadas por tags
  - [ ] Verificar ícone de cadeado nas rotas autenticadas
  - [ ] Verificar schemas de request/response

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
