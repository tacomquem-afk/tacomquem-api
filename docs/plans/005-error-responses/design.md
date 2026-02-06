# Plan: Standardize API Error Responses (Revised)

## Context

The codebase has no centralized error handling. Current state:
- **No** `setErrorHandler` or `setNotFoundHandler` in app.ts
- ~40 `throw new Error('Portuguese message')` across services
- ~8 manual `safeParse()` + ~7 `.parse()` calls in routes (inconsistent)
- Duplicate validation: Zod schemas AND manual JSON Schema in every route
- Mixed error formats: `{ error: string }`, `{ error: ZodFlattenedError }`, Fastify default `{ statusCode, error, message }`
- Mixed languages: services in Portuguese, plugins/admin in English

This refactor standardizes ALL error responses to RFC 9457 (Problem Details), adopts domain error classes, and integrates `fastify-type-provider-zod` to eliminate manual validation and duplicate schemas.

---

## Steps

### 1. Install `fastify-type-provider-zod` v5.x

```bash
bun add fastify-type-provider-zod
```

v5.x is required for Zod v4 compatibility (project uses `zod@^4.3.6`).

**Files:** `package.json`

---

### 2. Create error infrastructure — `src/errors/index.ts`

Single module containing:

**Domain error classes** (no HTTP status codes):
```
AppError (base — code: string, message: string)
├── NotFoundError      → mapped to 404 by error handler
├── ConflictError      → 409
├── UnauthorizedError  → 401
├── ForbiddenError     → 403
├── ValidationError    → 422 (has fields: FieldError[])
├── GoneError          → 410 (expired tokens/links)
├── BadRequestError    → 400
└── PayloadTooLargeError → 413
```

**Error code constants** (as `const` object with `as const`):
```
AUTH_* (EMAIL_TAKEN, INVALID_CREDENTIALS, TOKEN_EXPIRED, TOKEN_INVALID, TOKEN_USED,
        EMAIL_NOT_VERIFIED, SOCIAL_ACCOUNT, UNAUTHORIZED, ...)
ITEMS_* (NOT_FOUND, CREATE_FAILED, UPDATE_FAILED, ...)
LOANS_* (NOT_FOUND, ITEM_NOT_FOUND, CREATE_FAILED, INVALID_STATE, TOKEN_INVALID,
         TOKEN_EXPIRED, TOKEN_USED, ALREADY_PROCESSED, NO_RECEIVER, ...)
LINKS_* (INVALID_TOKEN, TOKEN_EXPIRED, ...)
ADMIN_* (INSUFFICIENT_PERMISSIONS, TARGET_NOT_FOUND, CANNOT_DEMOTE_SELF, INVALID_ROLE, ...)
STORAGE_* (FILE_TOO_LARGE, UNSUPPORTED_FORMAT, PROCESSING_FAILED, UPLOAD_FAILED, NO_FILE, MAX_FILES, ...)
VALIDATION_* (INVALID_REQUEST)
RATE_LIMIT_EXCEEDED
```

**Helper function:**
- `formatProblemDetails(error: AppError, request: FastifyRequest)` → RFC 9457 response object

**Files:** Create `src/errors/index.ts`

---

### 3. Configure app.ts — error handler, not-found handler, type provider, rate-limit

**3a. Register `fastify-type-provider-zod`:**
```typescript
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
```

**3b. `setErrorHandler`** — handles 3 cases:
1. **Zod schema validation errors** (from type provider) — use `hasZodFastifySchemaValidationErrors()` helper from `fastify-type-provider-zod`. Return 422 + `VALIDATION_INVALID_REQUEST` + field errors array
2. **AppError subclasses** — map class to HTTP status, format with `formatProblemDetails()`
3. **Unknown errors** — 500 `INTERNAL_SERVER_ERROR`, no stack trace in response

All error responses set `Content-Type: application/problem+json` and bypass Fastify's reply serializer.

Logging: 5xx at `error` level with stack trace, 4xx at `warn`. Use `request.log`.

**3c. `setNotFoundHandler`** — RFC 9457 format for undefined routes

**3d. Rate limit `errorResponseBuilder`** — RFC 9457 format for 429 responses

**3e. Swagger transform** — use `jsonSchemaTransform` from `fastify-type-provider-zod` for `@fastify/swagger`

**Response format:**
```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "A user with this email already exists",
  "errorCode": "AUTH_EMAIL_TAKEN",
  "instance": "/api/auth/register"
}
```

Validation errors add `errors` array:
```json
{
  "type": "about:blank",
  "title": "Validation Error",
  "status": 422,
  "detail": "Request validation failed",
  "errorCode": "VALIDATION_INVALID_REQUEST",
  "instance": "/api/auth/register",
  "errors": [
    { "field": "email", "message": "Must be a valid email address" }
  ]
}
```

**Files:** `src/app.ts`

---

### 4. Update Zod schemas — English messages + export for route schemas

Replace Portuguese Zod error messages with English:
- `'Nome deve ter pelo menos 2 caracteres'` → `'Name must be at least 2 characters'`
- `'Email inválido'` → `'Invalid email address'`
- `'Senha é obrigatória'` → `'Password is required'`

Schemas will now be used directly in Fastify route `schema` options (via type provider), so they must produce good error messages.

**Files:** `src/schemas/auth.ts`, `src/schemas/items.ts`, `src/schemas/loans.ts`, `src/schemas/admin.ts`

---

### 5. Refactor routes — use type provider, remove manual validation + JSON Schema

For each route file:
1. **Remove manual JSON Schema definitions** from `schema.body` / `schema.querystring` — replace with Zod schemas directly
2. **Remove ALL manual `safeParse()` / `.parse()` calls** — Fastify validates automatically via type provider
3. **Remove try-catch blocks** around service calls — errors flow to global error handler
4. **Keep `schema.response` definitions** using Zod schemas (for serialization + Swagger docs)
5. Use `app.withTypeProvider<ZodTypeProvider>()` in route registration

**Files:**
- `src/routes/auth/index.ts` — remove 5 safeParse, remove JSON Schema
- `src/routes/auth/google.ts` — keep redirect-based error handling (OAuth flow)
- `src/routes/items/index.ts` — remove 2 safeParse, remove JSON Schema
- `src/routes/loans/index.ts` — remove 1 safeParse, remove JSON Schema
- `src/routes/links/index.ts` — remove manual error replies, remove JSON Schema
- `src/routes/upload/index.ts` — keep multipart handling, remove manual error replies
- `src/routes/dashboard/index.ts` — remove JSON Schema
- `src/routes/admin/users.ts` — remove .parse(), remove JSON Schema
- `src/routes/admin/admins.ts` — remove .parse(), remove JSON Schema
- `src/routes/admin/moderation.ts` — remove .parse(), remove JSON Schema
- `src/routes/admin/analytics.ts` — remove JSON Schema

---

### 6. Refactor plugins — throw domain errors

**`src/plugins/jwt.ts`:**
- Replace `reply.code(401); throw new Error('Unauthorized')` with `throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Invalid or expired token')`

**`src/plugins/rbac.ts`:**
- Replace `reply.code(401); throw new Error('Authentication required')` with `throw new UnauthorizedError(...)`
- Replace `reply.code(403); throw new Error('Insufficient permissions')` with `throw new ForbiddenError(ErrorCodes.ADMIN_INSUFFICIENT_PERMISSIONS, ...)`

**Files:** `src/plugins/jwt.ts`, `src/plugins/rbac.ts`

---

### 7. Refactor services — throw domain errors with error codes

Replace all `throw new Error('Portuguese message')` with domain error classes.

**`src/services/auth/index.ts`** (~12 throw sites):
- `'Email já cadastrado'` → `throw new ConflictError(AUTH_EMAIL_TAKEN, 'Email already registered')`
- `'Email ou senha inválidos'` → `throw new UnauthorizedError(AUTH_INVALID_CREDENTIALS, 'Invalid email or password')`
- `'Token inválido'` → `throw new BadRequestError(AUTH_TOKEN_INVALID, 'Invalid token')`
- `'Token expirado'` → `throw new GoneError(AUTH_TOKEN_EXPIRED, 'Token has expired')`
- `'Token já utilizado'` → `throw new BadRequestError(AUTH_TOKEN_USED, 'Token already used')`
- `'Use o login social para esta conta'` → `throw new BadRequestError(AUTH_SOCIAL_ACCOUNT, 'Use social login for this account')`

**`src/services/items/index.ts`** (~2 throw sites):
- `'Falha ao criar item'` → `throw new BadRequestError(ITEMS_CREATE_FAILED, ...)`
- `'Falha ao atualizar item'` → `throw new BadRequestError(ITEMS_UPDATE_FAILED, ...)`

**`src/services/loans/index.ts`** (~12 throw sites):
- `'Item não encontrado'` → `throw new NotFoundError(LOANS_ITEM_NOT_FOUND, ...)`
- `'Empréstimo não encontrado'` → `throw new NotFoundError(LOANS_NOT_FOUND, ...)`
- State transition errors → `throw new BadRequestError(LOANS_INVALID_STATE, ...)`
- Token errors → `throw new GoneError(LOANS_TOKEN_EXPIRED, ...)` / `throw new BadRequestError(LOANS_TOKEN_INVALID, ...)`

**`src/services/storage/index.ts`** (~6 throw sites):
- File too large → `throw new PayloadTooLargeError(STORAGE_FILE_TOO_LARGE, ...)`
- Invalid format → `throw new BadRequestError(STORAGE_UNSUPPORTED_FORMAT, ...)`

**`src/services/admin/admins.ts`** (~2 throw sites):
- Already English, just change to domain error classes

**`src/services/crypto/index.ts`** — keep as `Error` (these are configuration/system errors, not domain errors)

**Files:** `src/services/auth/index.ts`, `src/services/items/index.ts`, `src/services/loans/index.ts`, `src/services/storage/index.ts`, `src/services/admin/admins.ts`

---

### 8. Write / update tests

**Create `src/errors/__tests__/errors.test.ts`:**
- Error class construction, inheritance chain, properties
- `formatProblemDetails()` output format

**Create `src/__tests__/error-handler.test.ts`:**
- AppError subclass → correct HTTP status + RFC 9457 format
- Zod validation error → 422 + field errors
- Generic Error → 500 without stack trace
- Not-found handler → 404 RFC 9457
- Verify `Content-Type: application/problem+json` header

**Update existing service tests** (`src/services/*/__tests__/*.test.ts`):
- Assert specific error class + error code instead of Portuguese string messages
- Example: `expect(() => ...).toThrow(ConflictError)` + check `.code === 'AUTH_EMAIL_TAKEN'`

**Update existing route tests** (if any exist):
- Assert error responses match RFC 9457 shape

**Files:** Create `src/errors/__tests__/errors.test.ts`, create `src/__tests__/error-handler.test.ts`, update `src/services/*/__tests__/*.test.ts`

---

## Verification

```bash
bun run qa              # TypeScript + Biome
bun test                # All tests pass
```

**Manual testing with HTTP files or curl:**
1. Auth: register with invalid data → 422 with field errors; duplicate email → 409 with `AUTH_EMAIL_TAKEN`
2. Items: fetch non-existent → 404 with `ITEMS_NOT_FOUND`
3. Loans: invalid state transition → 400 with `LOANS_INVALID_STATE`
4. Links: expired token → 410 with `LINKS_TOKEN_EXPIRED`
5. Admin: insufficient role → 403 with `ADMIN_INSUFFICIENT_PERMISSIONS`
6. Upload: file too large → 413 with `STORAGE_FILE_TOO_LARGE`
7. Undefined route → 404 RFC 9457 format
8. Rate limit → 429 RFC 9457 format
9. All responses have `Content-Type: application/problem+json`

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Error format** | RFC 9457 (Problem Details) | Industry standard, client-friendly, extensible |
| **Service errors** | Domain error classes (no HTTP codes) | Separation of concerns (Stripe, GitHub pattern) |
| **`type` field** | `about:blank` | URLs would 404 for MVP, misleading per RFC 9457 |
| **Formatting** | `formatProblemDetails()` in error handler | Handler has request context (URL, method) |
| **File location** | Single `src/errors/index.ts` | Error classes + codes used together |
| **Error codes** | Flat namespaced `as const` object | Grep-friendly, type-safe, no enum overhead |
| **Validation** | `fastify-type-provider-zod` v5.x | Eliminates ~15 manual safeParse + JSON Schema duplication |
| **Content-Type** | `application/problem+json` | RFC 9457 requirement |
| **Language** | English codes + messages | API standard, frontend handles i18n via `errorCode` |
| **Breaking change** | Yes (error response format) | Acceptable for MVP phase |

---

## File Summary

| Action | File | What changes |
|--------|------|-------------|
| Create | `src/errors/index.ts` | Error classes + codes + formatProblemDetails |
| Create | `src/errors/__tests__/errors.test.ts` | Unit tests for error infrastructure |
| Create | `src/__tests__/error-handler.test.ts` | Integration tests for global handler |
| Modify | `package.json` | Add `fastify-type-provider-zod` |
| Modify | `src/app.ts` | Type provider + error handler + not-found handler + rate-limit format + swagger transform |
| Modify | `src/schemas/auth.ts` | Portuguese → English messages |
| Modify | `src/schemas/items.ts` | Portuguese → English messages |
| Modify | `src/schemas/loans.ts` | Portuguese → English messages |
| Modify | `src/schemas/admin.ts` | Portuguese → English messages |
| Modify | `src/plugins/jwt.ts` | throw UnauthorizedError |
| Modify | `src/plugins/rbac.ts` | throw UnauthorizedError / ForbiddenError |
| Modify | `src/routes/auth/index.ts` | Remove safeParse + JSON Schema, use type provider |
| Modify | `src/routes/auth/google.ts` | Keep redirect-based errors, minor cleanup |
| Modify | `src/routes/items/index.ts` | Remove safeParse + JSON Schema, use type provider |
| Modify | `src/routes/loans/index.ts` | Remove safeParse + JSON Schema, use type provider |
| Modify | `src/routes/links/index.ts` | Remove manual error replies + JSON Schema |
| Modify | `src/routes/upload/index.ts` | Remove manual error replies + JSON Schema |
| Modify | `src/routes/dashboard/index.ts` | Remove JSON Schema |
| Modify | `src/routes/admin/users.ts` | Remove .parse() + JSON Schema |
| Modify | `src/routes/admin/admins.ts` | Remove .parse() + JSON Schema |
| Modify | `src/routes/admin/moderation.ts` | Remove .parse() + JSON Schema |
| Modify | `src/routes/admin/analytics.ts` | Remove JSON Schema |
| Modify | `src/services/auth/index.ts` | Domain error classes (~12 throw sites) |
| Modify | `src/services/items/index.ts` | Domain error classes (~2 throw sites) |
| Modify | `src/services/loans/index.ts` | Domain error classes (~12 throw sites) |
| Modify | `src/services/storage/index.ts` | Domain error classes (~6 throw sites) |
| Modify | `src/services/admin/admins.ts` | Domain error classes (~2 throw sites) |
| Update | `src/services/*/__tests__/*.test.ts` | Assert error class + code instead of strings |

**Total: ~30 files** (3 create, ~27 modify)
