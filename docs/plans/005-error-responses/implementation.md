# Implementation: Standardize API Error Responses

Tracking tasks for [design.md](./design.md).

---

## Phase 1: Infrastructure ✅

### 1.1 Install dependencies ✅
- [x] `bun add fastify-type-provider-zod` (v5.x for Zod v4 compatibility)
- [x] Verify installation: `bun run qa` passes with new dependency

### 1.2 Create `src/errors/index.ts` ✅
- [x] Define `FieldError` interface: `{ field: string; message: string }`
- [x] Create `AppError` base class extending `Error` with `code: string` property
- [x] Create subclasses:
  - [x] `NotFoundError` (→ 404)
  - [x] `BadRequestError` (→ 400)
  - [x] `ConflictError` (→ 409)
  - [x] `UnauthorizedError` (→ 401)
  - [x] `ForbiddenError` (→ 403)
  - [x] `ValidationError` (→ 422, has `fields: FieldError[]`)
  - [x] `GoneError` (→ 410)
  - [x] `PayloadTooLargeError` (→ 413)
- [x] Create `ErrorCodes` const object with `as const`:
  - [x] `AUTH_EMAIL_TAKEN`, `AUTH_INVALID_CREDENTIALS`, `AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_INVALID`, `AUTH_TOKEN_USED`, `AUTH_EMAIL_NOT_VERIFIED`, `AUTH_SOCIAL_ACCOUNT`, `AUTH_UNAUTHORIZED`, `AUTH_CREATE_FAILED`, `AUTH_TOKEN_TYPE_INVALID`
  - [x] `ITEMS_NOT_FOUND`, `ITEMS_CREATE_FAILED`, `ITEMS_UPDATE_FAILED`
  - [x] `LOANS_NOT_FOUND`, `LOANS_ITEM_NOT_FOUND`, `LOANS_USER_NOT_FOUND`, `LOANS_CREATE_FAILED`, `LOANS_INVALID_STATE`, `LOANS_TOKEN_INVALID`, `LOANS_TOKEN_EXPIRED`, `LOANS_TOKEN_USED`, `LOANS_ALREADY_PROCESSED`, `LOANS_NO_RECEIVER`, `LOANS_FETCH_FAILED`
  - [x] `LINKS_INVALID_TOKEN`, `LINKS_TOKEN_EXPIRED`
  - [x] `ADMIN_INSUFFICIENT_PERMISSIONS`, `ADMIN_TARGET_NOT_FOUND`, `ADMIN_CANNOT_DEMOTE_SELF`, `ADMIN_INVALID_ROLE`, `ADMIN_USE_REMOVE`
  - [x] `STORAGE_FILE_TOO_LARGE`, `STORAGE_UNSUPPORTED_FORMAT`, `STORAGE_PROCESSING_FAILED`, `STORAGE_UPLOAD_FAILED`, `STORAGE_RECORD_FAILED`, `STORAGE_NO_FILE`, `STORAGE_MAX_FILES`
  - [x] `VALIDATION_INVALID_REQUEST`
  - [x] `RATE_LIMIT_EXCEEDED`
- [x] Export `ErrorCode` type: `typeof ErrorCodes[keyof typeof ErrorCodes]`
- [x] Create `formatProblemDetails(error: AppError, request: FastifyRequest)` helper returning RFC 9457 object
- [x] Create `errorStatusMap`: maps error class → HTTP status code

### 1.3 Create `src/errors/__tests__/errors.test.ts` ✅
- [x] Test `AppError` base class: constructor sets `code`, `message`, extends `Error`
- [x] Test each subclass: `instanceof AppError` is true, `instanceof` specific class is true
- [x] Test `ValidationError` has `fields` array
- [x] Test `formatProblemDetails()`:
  - [x] Returns `type: 'about:blank'`
  - [x] Returns correct `title` (HTTP status text)
  - [x] Returns `status` (number)
  - [x] Returns `detail` from error message
  - [x] Returns `errorCode` from error code
  - [x] Returns `instance` from request URL
  - [x] `ValidationError` includes `errors` array
- [x] Run: `bun test src/errors/__tests__/errors.test.ts`

---

## Phase 2: App Configuration ✅

### 2.1 Configure type provider in `src/app.ts` ✅
- [x] Import `serializerCompiler`, `validatorCompiler`, `ZodTypeProvider` from `fastify-type-provider-zod`
- [x] Import `jsonSchemaTransform` from `fastify-type-provider-zod`
- [x] Register `app.setValidatorCompiler(validatorCompiler)`
- [x] Register `app.setSerializerCompiler(serializerCompiler)`
- [x] Update `@fastify/swagger` config to use `transform: jsonSchemaTransform`

### 2.2 Implement global error handler in `src/app.ts` ✅
- [x] Import `hasZodFastifySchemaValidationErrors` from `fastify-type-provider-zod`
- [x] Add `app.setErrorHandler()` with 3 branches:
  - [x] Branch 1: `hasZodFastifySchemaValidationErrors(error)` → 422 + `VALIDATION_INVALID_REQUEST` + field errors array
  - [x] Branch 2: `error instanceof AppError` → map to HTTP status via `errorStatusMap` + `formatProblemDetails()`
  - [x] Branch 3: Unknown error → 500 + `INTERNAL_SERVER_ERROR` (no stack trace in response)
- [x] Set `Content-Type: application/problem+json` on all error responses
- [x] Bypass Fastify serializer: `reply.serializer((payload) => JSON.stringify(payload))`
- [x] Logging:
  - [x] 5xx: `request.log.error({ err: error }, 'Internal server error')`
  - [x] 4xx: `request.log.warn({ errorCode: error.code }, error.message)`

### 2.3 Implement not-found handler in `src/app.ts` ✅
- [x] Add `app.setNotFoundHandler()` returning RFC 9457 format
- [x] Set `Content-Type: application/problem+json`
- [x] Include `instance: request.url` and `detail: 'Route METHOD:URL not found'`

### 2.4 Update rate limiter config in `src/app.ts` ✅
- [x] Add `errorResponseBuilder` to `@fastify/rate-limit` registration
- [x] Return RFC 9457 format with `errorCode: 'RATE_LIMIT_EXCEEDED'`
- [x] Include `instance: request.url`

### 2.5 Create `src/__tests__/error-handler.test.ts` ✅
- [x] Test AppError subclass → correct HTTP status + RFC 9457 response format
- [x] Test Zod validation error (from type provider) → 422 + field errors
- [x] Test generic `Error` → 500 without stack trace or internal details
- [x] Test not-found handler → 404 RFC 9457 format
- [x] Test `Content-Type: application/problem+json` header on all error responses
- [x] Test that 5xx errors don't expose stack traces
- [x] Run: `bun test src/__tests__/error-handler.test.ts`
- [x] Run: `bun run qa`

---

## Phase 3: Zod Schemas (Portuguese → English) ✅

### 3.1 Update `src/schemas/auth.ts` ✅
- [x] `registerSchema`: change Portuguese messages to English
  - `'Nome deve ter pelo menos 2 caracteres'` → `'Name must be at least 2 characters'`
  - `'Email inválido'` → `'Invalid email address'`
  - `'Senha deve ter pelo menos 8 caracteres'` → `'Password must be at least 8 characters'`
- [x] `loginSchema`: change Portuguese messages to English
- [x] `verifyEmailSchema`, `forgotPasswordSchema`, `resetPasswordSchema`: change messages
- [x] Ensure all schemas export types for route use

### 3.2 Update `src/schemas/items.ts` ✅
- [x] `createItemSchema`: change Portuguese messages to English
  - `'Nome é obrigatório'` → `'Name is required'`
- [x] `updateItemSchema`: change messages

### 3.3 Update `src/schemas/loans.ts` ✅
- [x] `createLoanSchema`: change Portuguese messages to English
  - `'Item inválido'` → `'Invalid item ID'`
  - `'Email inválido'` → `'Invalid email address'`

### 3.4 Update `src/schemas/admin.ts` ✅
- [x] All admin schemas: change Portuguese messages to English
- [x] Run: `bun run qa`

---

## Phase 4: Plugin Refactoring ✅

### 4.1 Refactor `src/plugins/jwt.ts` ✅
- [x] Import `UnauthorizedError`, `ErrorCodes` from `../../errors/index.js`
- [x] Replace `reply.code(401); throw new Error('Unauthorized')` with:
  `throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Invalid or expired token')`
- [x] Remove `reply.code()` call (error handler sets status)

### 4.2 Refactor `src/plugins/rbac.ts` ✅
- [x] Import `UnauthorizedError`, `ForbiddenError`, `ErrorCodes` from `../../errors/index.js`
- [x] Replace `reply.code(401); throw new Error('Authentication required')` with:
  `throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication required')`
- [x] Replace `reply.code(403); throw new Error('Insufficient permissions')` with:
  `throw new ForbiddenError(ErrorCodes.ADMIN_INSUFFICIENT_PERMISSIONS, 'Insufficient permissions for this role')`
- [x] Remove `reply.code()` calls
- [x] Run: `bun run qa`

---

## Phase 5: Service Layer Refactoring ✅

### 5.1 Refactor `src/services/auth/index.ts` (~12 throw sites) ✅
- [x] Import error classes + codes from `../../errors/index.js`
- [x] `'Email já cadastrado'` → `throw new ConflictError(ErrorCodes.AUTH_EMAIL_TAKEN, 'Email already registered')`
- [x] `'Erro ao criar usuário'` → `throw new BadRequestError(ErrorCodes.AUTH_CREATE_FAILED, 'Failed to create user')`
- [x] `'Token inválido'` → `throw new BadRequestError(ErrorCodes.AUTH_TOKEN_INVALID, 'Invalid token')`
- [x] `'Token já utilizado'` → `throw new BadRequestError(ErrorCodes.AUTH_TOKEN_USED, 'Token already used')`
- [x] `'Token expirado'` → `throw new GoneError(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Token has expired')`
- [x] `'Tipo de token inválido'` → `throw new BadRequestError(ErrorCodes.AUTH_TOKEN_TYPE_INVALID, 'Invalid token type')`
- [x] `'Email ou senha inválidos'` → `throw new UnauthorizedError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password')`
- [x] `'Use o login social para esta conta'` → `throw new BadRequestError(ErrorCodes.AUTH_SOCIAL_ACCOUNT, 'Use social login for this account')`

### 5.2 Refactor `src/services/items/index.ts` (~2 throw sites) ✅
- [x] Import error classes + codes from `../../errors/index.js`
- [x] `'Falha ao criar item'` → `throw new BadRequestError(ErrorCodes.ITEMS_CREATE_FAILED, 'Failed to create item')`
- [x] `'Falha ao atualizar item'` → `throw new BadRequestError(ErrorCodes.ITEMS_UPDATE_FAILED, 'Failed to update item')`

### 5.3 Refactor `src/services/loans/index.ts` (~12 throw sites) ✅
- [x] Import error classes + codes from `../../errors/index.js`
- [x] `'Item não encontrado'` → `throw new NotFoundError(ErrorCodes.LOANS_ITEM_NOT_FOUND, 'Item not found')`
- [x] `'Usuário não encontrado'` → `throw new NotFoundError(ErrorCodes.LOANS_USER_NOT_FOUND, 'User not found')`
- [x] `'Falha ao criar empréstimo'` → `throw new BadRequestError(ErrorCodes.LOANS_CREATE_FAILED, 'Failed to create loan')`
- [x] `'Apenas empréstimos confirmados podem ser marcados como devolvidos'` → `throw new BadRequestError(ErrorCodes.LOANS_INVALID_STATE, 'Only confirmed loans can be marked as returned')`
- [x] `'Apenas empréstimos pendentes podem ser cancelados'` → `throw new BadRequestError(ErrorCodes.LOANS_INVALID_STATE, 'Only pending loans can be cancelled')`
- [x] `'Apenas empréstimos confirmados podem receber lembretes'` → `throw new BadRequestError(ErrorCodes.LOANS_INVALID_STATE, 'Only confirmed loans can receive reminders')`
- [x] `'Empréstimo não tem um receptor confirmado'` → `throw new BadRequestError(ErrorCodes.LOANS_NO_RECEIVER, 'Loan has no confirmed receiver')`
- [x] `'Token inválido'` → `throw new BadRequestError(ErrorCodes.LOANS_TOKEN_INVALID, 'Invalid loan token')`
- [x] `'Token expirado'` → `throw new GoneError(ErrorCodes.LOANS_TOKEN_EXPIRED, 'Loan token has expired')`
- [x] `'Token já utilizado'` → `throw new BadRequestError(ErrorCodes.LOANS_TOKEN_USED, 'Loan token already used')`
- [x] `'Empréstimo já foi processado'` → `throw new BadRequestError(ErrorCodes.LOANS_ALREADY_PROCESSED, 'Loan has already been processed')`
- [x] `'Erro ao buscar empréstimo'` → `throw new BadRequestError(ErrorCodes.LOANS_FETCH_FAILED, 'Failed to fetch loan')`

### 5.4 Refactor `src/services/storage/index.ts` (~6 throw sites) ✅
- [x] Import error classes + codes from `../../errors/index.js`
- [x] File too large → `throw new PayloadTooLargeError(ErrorCodes.STORAGE_FILE_TOO_LARGE, 'File exceeds maximum size of NMB')`
- [x] Invalid format → `throw new BadRequestError(ErrorCodes.STORAGE_UNSUPPORTED_FORMAT, 'Unsupported file format. Use JPEG, PNG or WebP')`
- [x] Processing error → `throw new BadRequestError(ErrorCodes.STORAGE_PROCESSING_FAILED, 'Failed to process image')`
- [x] Upload error → `throw new BadRequestError(ErrorCodes.STORAGE_UPLOAD_FAILED, 'Failed to upload file')`
- [x] Record insert → `throw new BadRequestError(ErrorCodes.STORAGE_RECORD_FAILED, 'Failed to save upload record')`
- [x] Register error → `throw new BadRequestError(ErrorCodes.STORAGE_RECORD_FAILED, 'Failed to register upload')`

### 5.5 Refactor `src/services/admin/admins.ts` (~2 throw sites) ✅
- [x] Import error classes + codes from `../../errors/index.js`
- [x] `'Cannot promote user to USER role'` → `throw new BadRequestError(ErrorCodes.ADMIN_INVALID_ROLE, 'Cannot promote user to USER role')`
- [x] `'Use removeAdmin to demote admin to user'` → `throw new BadRequestError(ErrorCodes.ADMIN_USE_REMOVE, 'Use removeAdmin to demote admin to user')`

### 5.6 Keep `src/services/crypto/index.ts` unchanged ✅
- [x] Verify: crypto errors remain plain `Error` (configuration/system errors, not domain errors)

### 5.7 QA check after services ✅
- [x] Run: `bun run qa`

---

## Phase 6: Route Refactoring ✅

### 6.1 Refactor `src/routes/auth/index.ts` ✅
- [x] Add `.withTypeProvider<ZodTypeProvider>()` to route registration
- [x] Remove all 5 manual `safeParse()` calls
- [x] Replace manual JSON Schema `body`/`querystring` definitions with Zod schema references:
  ```typescript
  schema: { body: registerSchema, response: { 201: responseSchema } }
  ```
- [x] Remove all `try-catch` blocks around service calls (errors flow to global handler)
- [x] Remove all `reply.status(4xx).send({ error: ... })` patterns
- [x] Keep response schema definitions using Zod schemas
- [x] Verify `request.body` is typed from Zod schema (no manual type assertions)

### 6.2 Refactor `src/routes/auth/google.ts` ✅
- [x] Keep redirect-based error handling (OAuth flow requires redirects, not JSON errors)
- [x] Replace any `throw new Error()` with domain error classes where applicable
- [x] Keep `reply.redirect()` patterns

### 6.3 Refactor `src/routes/items/index.ts` ✅
- [x] Add `.withTypeProvider<ZodTypeProvider>()`
- [x] Remove 2 manual `safeParse()` calls
- [x] Replace manual JSON Schema with Zod schemas
- [x] Remove `try-catch` blocks
- [x] Remove `reply.status(404).send({ error: 'Item não encontrado' })` (service throws NotFoundError)

### 6.4 Refactor `src/routes/loans/index.ts` ✅
- [x] Add `.withTypeProvider<ZodTypeProvider>()`
- [x] Remove 1 manual `safeParse()` call
- [x] Replace manual JSON Schema with Zod schemas
- [x] Remove `try-catch` blocks
- [x] Remove manual `reply.status(404).send({ error: 'Empréstimo não encontrado' })`

### 6.5 Refactor `src/routes/links/index.ts` ✅
- [x] Add `.withTypeProvider<ZodTypeProvider>()`
- [x] Replace manual JSON Schema with Zod schemas
- [x] Remove manual `reply.status(404).send({ error: 'Link inválido ou expirado' })`
- [x] Remove `try-catch` blocks

### 6.6 Refactor `src/routes/upload/index.ts` ✅
- [x] Add `.withTypeProvider<ZodTypeProvider>()`
- [x] Replace manual JSON Schema with Zod schemas
- [x] Replace `reply.status(400).send({ error: 'Máximo 5 arquivos por upload' })` with `throw new BadRequestError(ErrorCodes.STORAGE_MAX_FILES, ...)`
- [x] Replace `reply.status(400).send({ error: 'Nenhum arquivo foi enviado' })` with `throw new BadRequestError(ErrorCodes.STORAGE_NO_FILE, ...)`
- [x] Keep multipart file handling logic
- [x] Remove `try-catch` blocks around service calls

### 6.7 Refactor `src/routes/dashboard/index.ts` ✅
- [x] Add `.withTypeProvider<ZodTypeProvider>()`
- [x] Replace manual JSON Schema with Zod schemas

### 6.8 Refactor `src/routes/admin/users.ts` ✅
- [x] Add `.withTypeProvider<ZodTypeProvider>()`
- [x] Remove `.parse()` calls
- [x] Replace manual JSON Schema with Zod schemas
- [x] Remove `reply.code(404).send({ error: 'User not found' })` (service throws NotFoundError)

### 6.9 Refactor `src/routes/admin/admins.ts` ✅
- [x] Add `.withTypeProvider<ZodTypeProvider>()`
- [x] Remove `.parse()` calls
- [x] Replace manual JSON Schema with Zod schemas

### 6.10 Refactor `src/routes/admin/moderation.ts` ✅
- [x] Add `.withTypeProvider<ZodTypeProvider>()`
- [x] Remove `.parse()` calls
- [x] Replace manual JSON Schema with Zod schemas
- [x] Remove `reply.code(404).send({ error: ... })` patterns

### 6.11 Refactor `src/routes/admin/analytics.ts` ✅
- [x] Add `.withTypeProvider<ZodTypeProvider>()`
- [x] Replace manual JSON Schema with Zod schemas

### 6.12 QA check after routes ✅
- [x] Run: `bun run qa`
- [x] Run: `bun test`

---

## Phase 7: Test Updates ✅

### 7.1 Update `src/services/auth/__tests__/auth.test.ts` ✅
- [x] Update all error assertions from Portuguese string matching to error class + code assertions
- [x] Example: `expect(fn).rejects.toThrow(ConflictError)` + verify `.code === ErrorCodes.AUTH_EMAIL_TAKEN`
- [x] Ensure all happy paths still pass

### 7.2 Update `src/services/items/__tests__/items.test.ts` ✅
- [x] Update error assertions to match new domain error classes
- [x] Verify `.code` matches expected error code

### 7.3 Update `src/services/loans/__tests__/loans.test.ts` ✅
- [x] Update all error assertions (~12 test cases)
- [x] Verify correct error class per scenario (NotFoundError, BadRequestError, GoneError)
- [x] Verify `.code` matches expected error code

### 7.4 Update `src/services/storage/__tests__/storage.test.ts` (if exists) ✅
- [x] Update error assertions to match new domain error classes

### 7.5 Update `src/services/admin/__tests__/admins.test.ts` (if exists) ✅
- [x] Update error assertions to match new domain error classes

### 7.6 Update any route-level tests ✅
- [x] Update error response assertions to match RFC 9457 format
- [x] Verify `Content-Type: application/problem+json` in error responses
- [x] Verify `errorCode` field is present

---

## Phase 8: Final Verification

### 8.1 Automated checks
- [ ] `bun run qa` passes (TypeScript + Biome)
- [ ] `bun test` — all tests pass
- [ ] `bun test:coverage` — coverage not regressed

### 8.2 Manual verification (via HTTP files or curl)
- [ ] Auth: POST `/api/auth/register` with missing fields → 422 + `VALIDATION_INVALID_REQUEST` + field errors
- [ ] Auth: POST `/api/auth/register` with duplicate email → 409 + `AUTH_EMAIL_TAKEN`
- [ ] Auth: POST `/api/auth/login` with wrong password → 401 + `AUTH_INVALID_CREDENTIALS`
- [ ] Items: GET `/api/items/nonexistent-uuid` → 404 + `ITEMS_NOT_FOUND`
- [ ] Loans: PATCH return on non-confirmed loan → 400 + `LOANS_INVALID_STATE`
- [ ] Links: GET `/api/links/expired-token` → 410 + `LINKS_TOKEN_EXPIRED`
- [ ] Admin: access without proper role → 403 + `ADMIN_INSUFFICIENT_PERMISSIONS`
- [ ] Upload: file > max size → 413 + `STORAGE_FILE_TOO_LARGE`
- [ ] GET `/api/nonexistent` → 404 + RFC 9457 format (not-found handler)
- [ ] All error responses have `Content-Type: application/problem+json`
- [ ] All error responses have `type`, `title`, `status`, `detail`, `errorCode`, `instance` fields
- [ ] Swagger docs at `/docs` still render correctly with Zod schemas
- [ ] No Portuguese strings remain in any error response
