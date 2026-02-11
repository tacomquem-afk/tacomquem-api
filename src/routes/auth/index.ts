import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
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
        description: 'Refresh access token using refresh token',
        tags: ['Authentication'],
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
        description: 'Get current authenticated user',
        tags: ['Authentication'],
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
}

export default authRoutes;
