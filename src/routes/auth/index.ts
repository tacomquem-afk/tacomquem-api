import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../../schemas/auth.js';
import {
  createUser,
  getUserById,
  login,
  requestPasswordReset,
  resetPassword,
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
          201: {
            description: 'User registered successfully',
            type: 'object',
            properties: {
              message: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                  avatarUrl: { type: 'string', nullable: true },
                  emailVerified: { type: 'boolean' },
                  role: {
                    type: 'string',
                    enum: ['USER', 'ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'],
                  },
                },
              },
            },
          },
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
          200: {
            description: 'Authentication successful',
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                  avatarUrl: { type: 'string', nullable: true },
                  emailVerified: { type: 'boolean' },
                  role: {
                    type: 'string',
                    enum: ['USER', 'ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'],
                  },
                },
              },
              accessToken: { type: 'string', description: 'JWT access token (7 days)' },
              refreshToken: { type: 'string', description: 'JWT refresh token (30 days)' },
            },
          },
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
          200: {
            description: 'Email verified successfully',
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
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
          200: {
            description: 'Password reset email sent (always returns success for security)',
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
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
          200: {
            description: 'Password reset successful',
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
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
        description: 'Refresh access token using refresh token',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'Token refreshed successfully',
            type: 'object',
            properties: {
              accessToken: { type: 'string', description: 'New JWT access token (7 days)' },
            },
          },
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
        description: 'Get current authenticated user',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'User profile',
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                  avatarUrl: { type: 'string', nullable: true },
                  emailVerified: { type: 'boolean' },
                  role: {
                    type: 'string',
                    enum: ['USER', 'ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN'],
                  },
                },
              },
            },
          },
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
}

export default authRoutes;
