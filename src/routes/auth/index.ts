import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
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
  errorResponse404,
  errorResponse409,
  errorResponse410,
  errorResponse422,
  messageResponseSchema,
  userResponseSchema,
} from '../../schemas/responses.js';
import {
  createUser,
  deleteAccount,
  getUserById,
  login,
  requestPasswordReset,
  resetPassword,
  setPassword,
  verifyEmail,
} from '../../services/auth/index.js';

async function authRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/register',
    {
      schema: {
        description: 'Register a new user with email and password',
        tags: ['Authentication'],
        body: registerSchema,
        response: {
          201: z.object({
            message: z.string(),
            user: userResponseSchema,
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
      const user = await createUser(request.body);
      return reply.status(201).send({
        message: 'Registration successful! Please verify your email.',
        user,
      });
    }
  );

  typed.post(
    '/login',
    {
      schema: {
        description: 'Authenticate with email and password',
        tags: ['Authentication'],
        body: loginSchema,
        response: {
          200: authTokensResponseSchema,
          401: errorResponse401,
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
        description: 'Verify email address with token sent via email',
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
        description: 'Request password reset email',
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
        description: 'Reset password with token from email',
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
        description: `**Get Current Authenticated User**

Returns the profile information of the currently authenticated user.

**Important for Frontend Developers:**

Call this endpoint after:
- Successful login (email/password or OAuth)
- Token refresh to get updated user data

**Response includes:**
- \`id\`: User UUID
- \`name\`: User's full name
- \`email\`: User's email address
- \`avatarUrl\`: Profile picture URL (or null)
- \`emailVerified\`: Boolean indicating if email is verified
- \`role\`: User role (USER, ANALYST, SUPPORT, MODERATOR, SUPER_ADMIN)

**Implementation Example:**
\`\`\`javascript
// Fetch user data after login
const response = await fetch('/api/auth/me', {
  headers: {
    'Authorization': \`Bearer \${accessToken}\`
  }
});

if (!response.ok) {
  if (response.status === 401) {
    // Token expired, try to refresh
    await refreshAccessToken();
    // Retry the request
  }
  throw new Error('Failed to fetch user');
}

const { user } = await response.json();
console.log('Logged in as:', user.name);
\`\`\``,
        tags: ['Authentication'],
        summary: 'Get current user',
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
        throw new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'User not found');
      }

      return reply.send({ user });
    }
  );

  typed.post(
    '/password',
    {
      schema: {
        description: 'Set a password for accounts created via social login',
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

  typed.delete(
    '/me',
    {
      schema: {
        description:
          'Delete own account. All personal data is anonymized for LGPD compliance. Deletion is blocked if there are active loans.',
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
}

export default authRoutes;
