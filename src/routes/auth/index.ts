import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { CURRENT_TERMS_VERSION } from '../../config/terms.js';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import {
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  setPasswordSchema,
  verifyEmailSchema,
} from '../../schemas/auth.js';
import {
  authTokensResponseSchema,
  errorResponse400,
  errorResponse401,
  errorResponse403,
  errorResponse404,
  errorResponse409,
  errorResponse410,
  errorResponse422,
  messageResponseSchema,
  userResponseSchema,
} from '../../schemas/responses.js';
import {
  acceptTerms,
  createUser,
  deleteAccount,
  getUserById,
  login,
  requestPasswordReset,
  resetPassword,
  setPassword,
  verifyEmail,
} from '../../services/auth/index.js';
import { hash } from '../../services/crypto/index.js';

async function authRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/register',
    {
      schema: {
        description: `**Register a new user with email and password**

Creates a new account using email/password credentials. The \`acceptTerms: true\` field is **required** — it records the user's explicit consent to the Terms of Service and Privacy Policy (LGPD Art. 8).

**Rate limit:** 5 requests per hour per IP.

**Beta Mode (BETA_MODE_ENABLED=true):**

When beta mode is active, **only users with a valid beta invite can log in**. The registration creates the account regardless, but login will be blocked with \`403 Forbidden\` for non-beta users.

| Invite Status | Registration | Login |
|---------------|--------------|-------|
| In beta list | \`201\` Created | \`200\` Success |
| Not in beta list | \`201\` Created | \`403\` Forbidden |

**Response varies based on declared age:**

| Status | Situation | \`canUseApp\` |
|--------|-----------|--------------|
| \`201\` | Adult registered successfully | \`true\` (beta users) / \`false\` (non-beta when \`BETA_MODE_ENABLED=true\`) |
| \`200\` | User is under 12 — awaiting guardian authorization | \`false\` |

**After successful registration (201):**
- \`user.termsAccepted\` always returns \`true\` (terms were accepted at registration time)
- A verification email is sent — the user can access the app but should verify their email
- Call \`GET /api/auth/me\` to keep local user data in sync
- **Beta mode:** If not invited, \`canUseApp\` will be \`false\` and login will fail

**Minor accounts (200):**
- An email is sent to the guardian with a confirmation link
- The minor **cannot log in** until the guardian confirms via \`GET /api/auth/parental-consent/confirm\`

**Frontend implementation:**
\`\`\`javascript
const response = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'SecurePass123',
    acceptTerms: true, // required — must be explicitly checked by the user
  }),
});

const data = await response.json();

if (data.status === 'pending_parental_consent') {
  // Minor under 12: redirect to awaiting-consent screen
  navigate('/register/awaiting-parental-consent', { email: data.emailSentTo });
} else if (!data.canUseApp) {
  // Beta mode: user not in beta list
  navigate('/beta-waitlist');
} else {
  // Adult with beta access: store tokens and redirect to app
  localStorage.setItem('accessToken', data.accessToken);
  navigate('/dashboard');
}
\`\`\``,

        tags: ['Authentication'],
        body: registerSchema,
        response: {
          200: z.object({
            status: z.literal('pending_parental_consent'),
            message: z.string(),
            emailSentTo: z.string().email().optional(),
            canUseApp: z.boolean(),
            userId: z.string().uuid(),
          }),
          201: z.object({
            status: z.literal('success'),
            message: z.string(),
            user: userResponseSchema,
            canUseApp: z.boolean(),
          }),
          409: errorResponse409,
          422: errorResponse422,
        },
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const result = await createUser(request.body, request.ip);

      if (result.status === 'pending_parental_consent') {
        return reply.status(200).send({
          status: result.status,
          message: result.message ?? 'Parental consent required',
          emailSentTo: result.emailSentTo,
          canUseApp: result.canUseApp ?? false,
          userId: result.userId ?? '',
        });
      }

      return reply.status(201).send({
        status: result.status,
        message: result.message ?? 'Account created',
        user: result.user ?? {
          id: '',
          name: '',
          email: '',
          avatarUrl: null,
          emailVerified: false,
          role: 'USER',
          termsAccepted: true,
        },
        canUseApp: result.canUseApp ?? true,
      });
    }
  );

  typed.post(
    '/login',
    {
      schema: {
        description: `**Authenticate with email and password**

Authenticates the user and returns JWT access and refresh tokens.

**Beta Mode (BETA_MODE_ENABLED=true):**

When beta mode is active, only users with a valid beta invite can log in. Users without beta access will receive a \`403 Forbidden\` response.

| Invite Status | Login Result |
|---------------|--------------|
| In beta list | \`200\` Success |
| Not in beta list | \`403\` Forbidden — "Beta access not available" |

**Important — \`user.termsAccepted\` field:**

This field indicates whether the user has accepted the current version of the Terms of Service. If \`false\`, the frontend must redirect the user to the terms acceptance screen before granting access to the app.

| \`termsAccepted\` | Situation | Recommended action |
|-----------------|-----------|-------------------|
| \`true\` | Terms accepted and up to date | Redirect to dashboard |
| \`false\` | Never accepted or terms were updated | Redirect to terms acceptance screen |

**Recommended implementation:**
\`\`\`javascript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

if (response.status === 403) {
  // Beta mode: user not in beta list
  navigate('/beta-waitlist');
  return;
}

const { user, accessToken, refreshToken } = await response.json();

localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);

if (!user.termsAccepted) {
  navigate('/accept-terms'); // Call POST /api/auth/accept-terms after user accepts
} else {
  navigate('/dashboard');
}
\`\`\``,
        tags: ['Authentication'],
        body: loginSchema,
        response: {
          200: authTokensResponseSchema,
          401: errorResponse401,
          403: errorResponse403,
          422: errorResponse422,
        },
      },
    },
    async (request, reply) => {
      const user = await login(request.body.email, request.body.password);
      const accessToken = app.signAccessToken(user.id, user.role);
      const refreshToken = app.signRefreshToken(user.id, user.role);

      return reply.send({ user, accessToken, refreshToken });
    }
  );

  typed.post(
    '/verify-email',
    {
      schema: {
        description: `**Verify email address**

Confirms the user's email using the token received by email after registration. The token expires in 24 hours and can only be used once.

**Important:** Users can still use the app before verifying their email, but certain features may be restricted until verification is complete. Always display a verification reminder banner until \`user.emailVerified\` is \`true\`.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`VALIDATION_INVALID_REQUEST\` | Token is malformed or missing |
| \`410\` | \`AUTH_TOKEN_EXPIRED\` | Token has expired or was already used |`,
        tags: ['Authentication'],
        body: verifyEmailSchema,
        response: {
          200: messageResponseSchema,
          400: errorResponse400,
          410: errorResponse410,
        },
      },
    },
    async (request, reply) => {
      await verifyEmail(request.body.token);
      return reply.send({ message: 'Email verified successfully!' });
    }
  );

  typed.post(
    '/forgot-password',
    {
      schema: {
        description: `**Request a password reset email**

Sends a password reset link to the provided email address. The response is always identical regardless of whether the email exists — this prevents user enumeration attacks.

**Rate limit:** 3 requests per hour per IP.

**Token behavior:**
- Reset tokens expire in 24 hours
- Each new request invalidates any previously issued token for that email
- The token can only be used once`,
        tags: ['Authentication'],
        body: forgotPasswordSchema,
        response: {
          200: messageResponseSchema,
        },
      },
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      try {
        await requestPasswordReset(request.body.email);
      } catch (_error) {
        // Intentionally swallow errors to prevent email enumeration
      }

      return reply.send({
        message: 'If this email is registered, you will receive recovery instructions.',
      });
    }
  );

  typed.post(
    '/reset-password',
    {
      schema: {
        description: `**Reset password using a recovery token**

Sets a new password for the account associated with the reset token received by email (via \`POST /api/auth/forgot-password\`). The token expires in 24 hours and can only be used once.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`VALIDATION_INVALID_REQUEST\` | Token is malformed or the new password doesn't meet requirements |
| \`410\` | \`AUTH_TOKEN_EXPIRED\` | Token has expired or was already used |`,
        tags: ['Authentication'],
        body: resetPasswordSchema,
        response: {
          200: messageResponseSchema,
          400: errorResponse400,
          410: errorResponse410,
        },
      },
    },
    async (request, reply) => {
      await resetPassword(request.body.token, request.body.password);
      return reply.send({ message: 'Password changed successfully!' });
    }
  );

  app.post(
    '/refresh',
    {
      schema: {
        description: `**Refresh Access Token**

Generates a new access token using the current user's session.

**Important for Frontend Developers:**

Use this endpoint when:
- The access token is about to expire (recommended: check 5 minutes before expiry)
- You receive a 401 Unauthorized response from another endpoint

**Token Expiration:**
- Access Token: 7 days
- Refresh Token: 30 days

**Implementation Example:**
\`\`\`javascript
// Auto-refresh token before expiry
const isTokenExpiringSoon = (token) => {
  const payload = JSON.parse(atob(token.split('.')[1]));
  const expirationTime = payload.exp * 1000;
  const threshold = 5 * 60 * 1000; // 5 minutes
  return Date.now() > (expirationTime - threshold);
};

// Refresh the token
const response = await fetch('/api/auth/refresh', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${accessToken}\`
  }
});

const { accessToken } = await response.json();
localStorage.setItem('accessToken', accessToken);
\`\`\``,
        tags: ['Authentication'],
        summary: 'Refresh access token',
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({ accessToken: z.string() }),
          401: errorResponse401,
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { userId, role } = request.user;
      const accessToken = app.signAccessToken(userId, role);
      return reply.send({ accessToken });
    }
  );

  app.get(
    '/me',
    {
      schema: {
        description: `**Get authenticated user profile**

Returns the profile of the currently authenticated user. Use this endpoint to keep local user data in sync with the server.

**When to call:**
- After login (email/password or OAuth)
- After a token refresh
- On app mount to verify session state and check user flags

**Response fields:**
| Field | Type | Description |
|-------|------|-------------|
| \`id\` | UUID | Unique user identifier |
| \`name\` | string | Full name |
| \`email\` | string | Email address |
| \`avatarUrl\` | string \\| null | Profile photo URL (\`null\` if not set) |
| \`emailVerified\` | boolean | Whether the email was confirmed via the verification link |
| \`role\` | string | User role: \`USER\`, \`ANALYST\`, \`SUPPORT\`, \`MODERATOR\`, \`SUPER_ADMIN\` |
| \`termsAccepted\` | boolean | Whether the user has accepted the current Terms of Service version (LGPD) |

**User state checklist:**
\`\`\`javascript
const { user } = await getMe();

if (!user.termsAccepted) {
  navigate('/accept-terms'); // always check before showing the dashboard
}
if (!user.emailVerified) {
  showBanner('Please verify your email to continue');
}
\`\`\`

**Error handling:**
\`\`\`javascript
const response = await fetch('/api/auth/me', {
  headers: { 'Authorization': \`Bearer \${accessToken}\` }
});

if (response.status === 401) {
  // Token expired — attempt refresh or redirect to login
  await refreshToken();
}
\`\`\``,
        tags: ['Authentication'],
        summary: 'Get authenticated user profile',
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({ user: userResponseSchema }),
          401: errorResponse401,
          404: errorResponse404,
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user;
      const user = await getUserById(userId);

      if (!user) {
        throw new NotFoundError(ErrorCodes.AUTH_UNAUTHORIZED, 'User not found');
      }

      return reply.send({ user });
    }
  );

  typed.post(
    '/password',
    {
      schema: {
        description: `**Set password for OAuth-only accounts**

Sets a password for accounts created via Google OAuth that don't have a local password yet. This allows users to also log in with email/password in addition to their OAuth provider.

Returns an error if the account already has a password set — in that case, use the forgot password flow (\`POST /api/auth/forgot-password\`) to change it.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`AUTH_PASSWORD_ALREADY_SET\` | Account already has a password — use the reset flow instead |
| \`401\` | \`AUTH_UNAUTHORIZED\` | Missing or invalid access token |`,
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        body: setPasswordSchema,
        response: {
          200: messageResponseSchema,
          400: errorResponse400,
          401: errorResponse401,
          422: errorResponse422,
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user;
      await setPassword(userId, request.body.password);
      return reply.send({ message: 'Password set successfully!' });
    }
  );

  typed.get(
    '/parental-consent/confirm',
    {
      schema: {
        description: `**Confirm parental consent via email token**

Called by a parent or legal guardian to authorize a minor's account (under 12 years old). The confirmation link is sent to the guardian's email at registration time and contains a one-time token.

Once confirmed, the child's account becomes active and the minor can log in normally.

**Rate limit:** 10 requests per hour per IP.

**Token behavior:**
- Expires in 48 hours from the time of registration
- Single-use — becomes invalid after confirmation

**Error codes:**
| Status | Meaning |
|--------|---------|
| \`404\` | Token not found — invalid or already used |
| \`410\` | Token has expired — a new registration is required |`,
        tags: ['Authentication'],
        querystring: z.object({
          token: z.string(),
        }),
        response: {
          200: z.object({
            status: z.literal('success'),
            message: z.string(),
            userId: z.string().uuid(),
          }),
          404: z.object({ error: z.string() }),
          410: z.object({ error: z.string() }),
        },
      },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const { token } = request.query;
      const tokenHash = hash(token);

      const user = await db.query.users.findFirst({
        where: eq(users.parentalConsentToken, tokenHash),
      });

      if (!user) {
        return reply.status(404).send({ error: 'Invalid or expired token' });
      }

      if (user.parentalConsentTokenExpiresAt && user.parentalConsentTokenExpiresAt < new Date()) {
        return reply.status(410).send({ error: 'Token has expired' });
      }

      await db
        .update(users)
        .set({
          parentalConsentStatus: 'confirmed',
          parentalConsentConfirmedAt: new Date(),
          parentalConsentToken: null,
          parentalConsentTokenExpiresAt: null,
        })
        .where(eq(users.id, user.id));

      return reply.status(200).send({
        status: 'success',
        message: 'Parental consent confirmed. Child account is now active.',
        userId: user.id,
      });
    }
  );

  typed.delete(
    '/me',
    {
      schema: {
        description: `**Delete account (immediate)**

Permanently deletes the authenticated user's account. All personal data is anonymized in compliance with LGPD Art. 18 (right to erasure).

**Preconditions — deletion is blocked if:**
- The user has active loans as a lender (loans must be returned or cancelled first)
- The user has pending loans as a borrower

**Password confirmation:**
- Accounts with a password set: must provide \`password\` in the request body for verification
- OAuth-only accounts (no password): the \`password\` field can be omitted

**Alternative:** Use \`POST /api/me/account/schedule-deletion\` for a 15-day grace period with cancellation support instead of immediate deletion.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`AUTH_INVALID_PASSWORD\` | Password confirmation failed |
| \`409\` | \`LOANS_ACTIVE_EXIST\` | User has active loans — resolve them before deleting |`,
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        body: deleteAccountSchema,
        response: {
          200: messageResponseSchema,
          400: errorResponse400,
          401: errorResponse401,
          409: errorResponse409,
          422: errorResponse422,
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user;
      await deleteAccount(userId, request.body.password);
      return reply.send({ message: 'Account deleted successfully.' });
    }
  );

  typed.get(
    '/terms',
    {
      schema: {
        description: `**Get current Terms of Service and Privacy Policy version**

Public endpoint (no authentication required) that returns the current version of the legal documents and their URLs.

**Use this endpoint to:**
- Display links to the documents on the terms acceptance screen
- Verify whether the version the user accepted is still current

**When terms are updated**, the version changes and all users will have \`user.termsAccepted: false\` on their next login — they will need to re-accept via \`POST /api/auth/accept-terms\`.

**Frontend implementation:**
\`\`\`javascript
const { version, termsUrl, privacyUrl } = await fetch('/api/auth/terms').then(r => r.json());

// Display on the acceptance screen:
// "By continuing, you agree to our Terms of Service and Privacy Policy"
// with clickable links to termsUrl and privacyUrl
\`\`\``,
        tags: ['Authentication'],
        response: {
          200: z.object({
            version: z.string(),
            termsUrl: z.string().url(),
            privacyUrl: z.string().url(),
          }),
        },
      },
    },
    async (_request, reply) => {
      return reply.send({
        version: CURRENT_TERMS_VERSION,
        termsUrl: `${env.FRONTEND_URL}/terms`,
        privacyUrl: `${env.FRONTEND_URL}/privacy`,
      });
    }
  );

  typed.post(
    '/accept-terms',
    {
      schema: {
        description: `**Accept Terms of Service and Privacy Policy (LGPD Art. 7/8)**

Records the user's explicit consent to the current version of the terms. The IP address and timestamp of the acceptance are saved for the audit trail.

**When to use:**

| Situation | \`user.termsAccepted\` | Action |
|-----------|----------------------|--------|
| New user via Google OAuth | \`false\` | Call this endpoint after displaying the terms |
| Terms updated (new version released) | \`false\` | Request re-acceptance from the user |
| User registered via email/password | \`true\` | Not needed — already accepted at registration |

**Complete flow for OAuth users:**
\`\`\`javascript
// 1. User returns from Google at /auth/callback
const params = new URLSearchParams(window.location.search);
const accessToken = params.get('accessToken');
const termsAccepted = params.get('termsAccepted') === 'true';

localStorage.setItem('accessToken', accessToken);

// 2. If terms not accepted, redirect to terms acceptance screen
if (!termsAccepted) {
  navigate('/accept-terms');
  return;
}
navigate('/dashboard');

// 3. On the acceptance screen: fetch version/URLs and display to the user
const terms = await fetch('/api/auth/terms').then(r => r.json());
// Display: "By continuing, you agree to our Terms of Service and Privacy Policy"

// 4. User confirms — record the acceptance
const response = await fetch('/api/auth/accept-terms', {
  method: 'POST',
  headers: { 'Authorization': \`Bearer \${accessToken}\` },
});
const { user } = await response.json();
// user.termsAccepted === true now
navigate('/dashboard');
\`\`\`

**Note:** There is no request body — consent is recorded by the act of calling this authenticated endpoint, equivalent to the user clicking "I Agree".`,
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({
            message: z.string(),
            termsVersion: z.string(),
            user: userResponseSchema,
          }),
          401: errorResponse401,
          403: errorResponse403,
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user;
      await acceptTerms(userId, request.ip);
      const user = await getUserById(userId);

      if (!user) {
        throw new NotFoundError(ErrorCodes.AUTH_UNAUTHORIZED, 'User not found');
      }

      return reply.send({
        message: 'Terms of Service and Privacy Policy accepted successfully.',
        termsVersion: CURRENT_TERMS_VERSION,
        user,
      });
    }
  );
}

export default authRoutes;
