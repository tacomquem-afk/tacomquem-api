import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import { env } from './config/env.js';
import { db } from './db/index.js';
import { AppError, errorStatusMap, formatProblemDetails } from './errors/index.js';
import jwtPlugin from './plugins/jwt.js';
import rbacPlugin from './plugins/rbac.js';
import adminsRoutes from './routes/admin/admins.js';
import analyticsRoutes from './routes/admin/analytics.js';
import moderationRoutes from './routes/admin/moderation.js';
import usersRoutes from './routes/admin/users.js';
import googleAuthRoutes from './routes/auth/google.js';
import authRoutes from './routes/auth/index.js';
import { dashboardRoutes } from './routes/dashboard/index.js';
import itemsRoutes from './routes/items/index.js';
import { linksRoutes } from './routes/links/index.js';
import { loansRoutes } from './routes/loans/index.js';
import { uploadRoutes } from './routes/upload/index.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  app.setValidatorCompiler(validatorCompiler);

  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (request, _context) => ({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Rate limit exceeded',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      instance: request.url,
    }),
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: env.API_TITLE,
        description: env.API_DESCRIPTION,
        version: env.API_VERSION,
        contact: {
          name: 'TáComQuem',
        },
      },
      servers: [
        {
          url: env.FRONTEND_URL,
          description: env.API_ENVIRONMENT_LABEL,
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT authentication token. Format: Bearer {token}',
          },
        },
      },
      tags: [
        { name: 'Authentication', description: 'Authentication endpoints' },
        { name: 'OAuth', description: 'OAuth authentication providers' },
        { name: 'Items', description: 'Items management endpoints' },
        { name: 'Upload', description: 'Image upload endpoints' },
        { name: 'Loans', description: 'Loan management endpoints' },
        { name: 'Links', description: 'Public loan link endpoints' },
        { name: 'Dashboard', description: 'User dashboard endpoints' },
        { name: 'Admin - Analytics', description: 'Admin analytics endpoints' },
        { name: 'Admin - Users', description: 'Admin user management endpoints' },
        { name: 'Admin - Moderation', description: 'Admin content moderation endpoints' },
        { name: 'Admin - Admins', description: 'Admin role management endpoints' },
        { name: 'Health', description: 'Health check endpoints' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecificationClone: true,
  });

  await app.register(jwtPlugin);
  await app.register(rbacPlugin);

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const fields = error.validation.map((v) => ({
        field:
          (v.params as { issue?: { path?: (string | number)[] } }).issue?.path?.join('.') || '',
        message: v.message || '',
      }));

      request.log.warn({ errorCode: 'VALIDATION_INVALID_REQUEST' }, 'Request validation failed');
      return reply
        .status(422)
        .header('Content-Type', 'application/problem+json')
        .serializer((payload: unknown) => JSON.stringify(payload))
        .send({
          type: 'about:blank',
          title: 'Validation Error',
          status: 422,
          detail: 'Request validation failed',
          errorCode: 'VALIDATION_INVALID_REQUEST',
          instance: request.url,
          errors: fields,
        });
    }

    if (error instanceof AppError) {
      const statusCode = errorStatusMap.get(error.constructor as any) || 500;
      const problemDetails = formatProblemDetails(error, request);
      if (statusCode >= 500) {
        request.log.error({ err: error }, error.message);
      } else {
        request.log.warn({ errorCode: error.code }, error.message);
      }
      return reply
        .status(statusCode)
        .header('Content-Type', 'application/problem+json')
        .serializer((payload: unknown) => JSON.stringify(payload))
        .send(problemDetails);
    }

    request.log.error({ err: error }, 'Internal server error');
    return reply
      .status(500)
      .header('Content-Type', 'application/problem+json')
      .serializer((payload: unknown) => JSON.stringify(payload))
      .send({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred',
        errorCode: 'INTERNAL_SERVER_ERROR',
        instance: request.url,
      });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .header('Content-Type', 'application/problem+json')
      .serializer((payload: unknown) => JSON.stringify(payload))
      .send({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: `Route ${request.method}:${request.url} not found`,
        errorCode: 'NOT_FOUND',
        instance: request.url,
      });
  });

  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/api/health/db', async () => {
    try {
      await db.execute(sql`SELECT 1`);
      return { status: 'ok', database: 'connected' };
    } catch (_error) {
      return { status: 'error', database: 'disconnected' };
    }
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(googleAuthRoutes, { prefix: '/api/auth' });
  await app.register(itemsRoutes, { prefix: '/api/items' });
  await app.register(uploadRoutes, { prefix: '/api/upload' });
  await app.register(loansRoutes, { prefix: '/api/loans' });
  await app.register(linksRoutes, { prefix: '/api/links' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });

  await app.register(analyticsRoutes, { prefix: '/api/admin/analytics' });
  await app.register(usersRoutes, { prefix: '/api/admin/users' });
  await app.register(moderationRoutes, { prefix: '/api/admin/moderation' });
  await app.register(adminsRoutes, { prefix: '/api/admin/admins' });

  return app;
}
