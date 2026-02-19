import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { SwaggerTransform } from '@fastify/swagger';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { sql } from 'drizzle-orm';
import type { FastifySchema } from 'fastify';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import { env } from './config/env.js';
import { db } from './db/index.js';
import type { ErrorClass } from './errors/index.js';
import { AppError, errorStatusMap, formatProblemDetails } from './errors/index.js';
import { accessLogsPlugin } from './plugins/access-logs.js';
import jwtPlugin from './plugins/jwt.js';
import rbacPlugin from './plugins/rbac.js';
import accountRoutes from './routes/account/index.js';
import adminsRoutes from './routes/admin/admins.js';
import analyticsRoutes from './routes/admin/analytics.js';
import auditRoutes from './routes/admin/audit.js';
import betaProgramRoutes from './routes/admin/beta-program.js';
import moderationRoutes from './routes/admin/moderation.js';
import usersRoutes from './routes/admin/users.js';
import googleAuthRoutes from './routes/auth/google.js';
import authRoutes from './routes/auth/index.js';
import { dashboardRoutes } from './routes/dashboard/index.js';
import dataExportRoutes from './routes/data-export/index.js';
import itemsRoutes from './routes/items/index.js';
import { linksRoutes } from './routes/links/index.js';
import { loansRoutes } from './routes/loans/index.js';
import { notificationsRoutes } from './routes/notifications/index.js';
import { uploadRoutes } from './routes/upload/index.js';

export async function buildApp() {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // biome-ignore lint/suspicious/noExplicitAny: wrapper handles both Zod and raw JSON schemas (e.g. multipart)
  app.setValidatorCompiler(((opts: any) => {
    if (typeof opts.schema?.safeParse !== 'function') {
      return (data: unknown) => ({ value: data });
    }
    return validatorCompiler(opts);
  }) as typeof validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

  const multipartAwareTransform: SwaggerTransform<FastifySchema> = (input) => {
    const { schema } = input;
    if (schema?.body && typeof schema.body === 'object' && !('_zod' in schema.body)) {
      const { body, ...restSchema } = schema;
      const result = jsonSchemaTransform({ ...input, schema: restSchema });
      result.schema.body = body;
      return result;
    }
    return jsonSchemaTransform(input);
  };

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: env.API_TITLE,
        description: env.API_DESCRIPTION,
        version: env.API_VERSION,
        contact: {
          name: 'TáComQuem Team',
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
        {
          name: 'Authentication',
          description:
            'Email/password registration, login, email verification, password reset, token refresh, and terms acceptance. Start here for auth flows.',
        },
        {
          name: 'OAuth',
          description:
            'Google OAuth 2.0 Authorization Code Flow. Initiates the redirect to Google and handles the callback that returns JWT tokens to the frontend.',
        },
        {
          name: 'Users',
          description:
            'User account management: schedule/cancel account deletion, check deletion status, parental consent status, and LGPD right-of-access activity logs.',
        },
        {
          name: 'Data Export',
          description:
            'LGPD right of data portability (Art. 18, V). Request, track, and download a full export of personal data in JSON or CSV format.',
        },
        {
          name: 'Items',
          description:
            'Create and manage loanable items. Each item can have up to 5 images and belongs to a single owner. Items are soft-deleted to preserve loan history.',
        },
        {
          name: 'Upload',
          description:
            'Upload item images via multipart/form-data. Images are auto-compressed to WebP. Store the returned `key` values and use them in item create/update requests.',
        },
        {
          name: 'Loans',
          description:
            'Full loan lifecycle: create a loan with a shareable confirmation link, list active and historical loans, mark as returned, cancel, and send reminders.',
        },
        {
          name: 'Links',
          description:
            'Public share link endpoints. View loan details before logging in and confirm a loan from the link. No authentication required for the preview endpoint.',
        },
        {
          name: 'Dashboard',
          description:
            'Aggregated data for the home screen: stats summary, active loans, recent activity feed, friends list, and cross-entity search.',
        },
        {
          name: 'Notifications',
          description:
            'In-app notification management. List, filter by read status, mark as read (individually or all at once), and delete notifications.',
        },
        {
          name: 'Admin - Analytics',
          description:
            'Platform-wide statistics for the admin dashboard. Requires ANALYST role or higher. Includes user growth and loan activity metrics.',
        },
        {
          name: 'Admin - Audit',
          description:
            'Raw HTTP access logs for support investigations. Filter by user, date range, and HTTP method. Requires SUPPORT role or higher.',
        },
        {
          name: 'Admin - Users',
          description:
            'User lookup and moderation actions: list all users, view full user details, block and unblock accounts. Role requirements vary per endpoint.',
        },
        {
          name: 'Admin - Moderation',
          description:
            'Content moderation: inspect and remove items, inspect and cancel loans. Actions are logged in the audit trail. Requires SUPPORT or MODERATOR role.',
        },
        {
          name: 'Admin - Admins',
          description:
            'Admin role management: list admins, promote users, change roles, revoke access, and view the admin action audit log. Requires SUPER_ADMIN role.',
        },
        {
          name: 'Admin - Beta Program',
          description:
            'Beta program enrollment management: list beta users, grant beta access by email, and remove users from the beta program. Requires SUPER_ADMIN role.',
        },
        {
          name: 'Health',
          description:
            'Liveness and readiness probes for load balancers and monitoring systems. No authentication required.',
        },
      ],
    },
    transform: multipartAwareTransform,
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
  await app.register(accessLogsPlugin);

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
      const statusCode = errorStatusMap.get(error.constructor as ErrorClass) || 500;
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

  app.get(
    '/api/health',
    {
      schema: {
        description:
          'Returns the current server status and UTC timestamp. Use as a liveness probe — a successful response confirms the API process is running.',
        tags: ['Health'],
        summary: 'API liveness check',
      },
    },
    async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    }
  );

  app.get(
    '/api/health/db',
    {
      schema: {
        description:
          'Verifies the API can reach the PostgreSQL database. Use as a readiness probe — a `status: "ok"` response means the service is ready to handle traffic. A `status: "error"` response indicates the database is unreachable.',
        tags: ['Health'],
        summary: 'Database readiness check',
      },
    },
    async () => {
      try {
        await db.execute(sql`SELECT 1`);
        return { status: 'ok', database: 'connected' };
      } catch (_error) {
        return { status: 'error', database: 'disconnected' };
      }
    }
  );

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(googleAuthRoutes, { prefix: '/api/auth' });
  await app.register(accountRoutes, { prefix: '/api' });
  await app.register(dataExportRoutes, { prefix: '/api/users' });
  await app.register(itemsRoutes, { prefix: '/api/items' });
  await app.register(uploadRoutes, { prefix: '/api/upload' });
  await app.register(loansRoutes, { prefix: '/api/loans' });
  await app.register(linksRoutes, { prefix: '/api/links' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(notificationsRoutes, { prefix: '/api/notifications' });

  await app.register(analyticsRoutes, { prefix: '/api/admin/analytics' });
  await app.register(auditRoutes, { prefix: '/api/admin/audit' });
  await app.register(usersRoutes, { prefix: '/api/admin/users' });
  await app.register(moderationRoutes, { prefix: '/api/admin/moderation' });
  await app.register(adminsRoutes, { prefix: '/api/admin/admins' });
  await app.register(betaProgramRoutes, { prefix: '/api/admin/beta-program' });

  return app;
}
