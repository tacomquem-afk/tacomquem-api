import type { FastifyInstance } from 'fastify';
import {
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type LoginInput,
  loginSchema,
  type RegisterInput,
  type ResetPasswordInput,
  registerSchema,
  resetPasswordSchema,
  type VerifyEmailInput,
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
  app.post<{
    Body: RegisterInput;
  }>(
    '/register',
    {
      schema: {
        description: 'Register a new user with email and password',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 100, description: 'User full name' },
            email: { type: 'string', format: 'email', description: 'User email address' },
            password: {
              type: 'string',
              minLength: 8,
              description: 'User password (min 8 characters)',
            },
          },
        },
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
                },
              },
            },
          },
          400: {
            description: 'Invalid input or email already registered',
            type: 'object',
            properties: {
              error: { oneOf: [{ type: 'string' }, { type: 'object' }] },
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
      const result = registerSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      try {
        const user = await createUser(result.data);
        return reply.status(201).send({
          message: 'Cadastro realizado! Verifique seu email.',
          user,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao cadastrar';
        return reply.status(400).send({ error: message });
      }
    }
  );

  app.post<{
    Body: LoginInput;
  }>(
    '/login',
    {
      schema: {
        description: 'Authenticate with email and password',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', description: 'User email address' },
            password: { type: 'string', description: 'User password' },
          },
        },
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
                },
              },
              accessToken: { type: 'string', description: 'JWT access token (7 days)' },
              refreshToken: { type: 'string', description: 'JWT refresh token (30 days)' },
            },
          },
          401: {
            description: 'Invalid credentials',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const result = loginSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      try {
        const user = await login(result.data.email, result.data.password);

        const accessToken = (app as any).signAccessToken(user.id, 'USER');

        const refreshToken = (app as any).signRefreshToken(user.id, 'USER');

        return reply.send({
          user,
          accessToken,
          refreshToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao fazer login';
        return reply.status(401).send({ error: message });
      }
    }
  );

  app.post<{
    Body: VerifyEmailInput;
  }>(
    '/verify-email',
    {
      schema: {
        description: 'Verify email address with token sent via email',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string', description: 'Email verification token' },
          },
        },
        response: {
          200: {
            description: 'Email verified successfully',
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          400: {
            description: 'Invalid or expired token',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const result = verifyEmailSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      try {
        await verifyEmail(result.data.token);
        return reply.send({ message: 'Email verificado com sucesso!' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao verificar email';
        return reply.status(400).send({ error: message });
      }
    }
  );

  app.post<{
    Body: ForgotPasswordInput;
  }>(
    '/forgot-password',
    {
      schema: {
        description: 'Request password reset email',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email', description: 'User email address' },
          },
        },
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
      const result = forgotPasswordSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      try {
        await requestPasswordReset(result.data.email);
        return reply.send({
          message: 'Se o email existir, você receberá instruções de recuperação.',
        });
      } catch (_error) {
        return reply.send({
          message: 'Se o email existir, você receberá instruções de recuperação.',
        });
      }
    }
  );

  app.post<{
    Body: ResetPasswordInput;
  }>(
    '/reset-password',
    {
      schema: {
        description: 'Reset password with token from email',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['token', 'password'],
          properties: {
            token: { type: 'string', description: 'Password reset token' },
            password: {
              type: 'string',
              minLength: 8,
              description: 'New password (min 8 characters)',
            },
          },
        },
        response: {
          200: {
            description: 'Password reset successful',
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          400: {
            description: 'Invalid or expired token',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const result = resetPasswordSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      try {
        await resetPassword(result.data.token, result.data.password);
        return reply.send({ message: 'Senha alterada com sucesso!' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao alterar senha';
        return reply.status(400).send({ error: message });
      }
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
          401: {
            description: 'Invalid or expired refresh token',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        await request.jwtVerify();
        const { userId, role } = request.user;

        const accessToken = (app as any).signAccessToken(userId, role);

        return reply.send({ accessToken });
      } catch (_error) {
        return reply.status(401).send({ error: 'Token inválido' });
      }
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
                },
              },
            },
          },
          401: {
            description: 'Unauthorized',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          404: {
            description: 'User not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
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
        return reply.status(404).send({ error: 'Usuário não encontrado' });
      }

      return reply.send({ user });
    }
  );
}

export default authRoutes;
