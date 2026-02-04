import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { env } from './config/env.js';
import { db } from './db/index.js';
import jwtPlugin from './plugins/jwt.js';
import googleAuthRoutes from './routes/auth/google.js';
import authRoutes from './routes/auth/index.js';
import itemsRoutes from './routes/items/index.js';
import { uploadRoutes } from './routes/upload/index.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'TáComQuem API',
        description: 'API para gestão de empréstimos pessoais entre amigos',
        version: '1.0.0',
        contact: {
          name: 'TáComQuem',
        },
      },
      servers: [
        {
          url: env.FRONTEND_URL,
          description: 'Development server',
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
        { name: 'Health', description: 'Health check endpoints' },
      ],
    },
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

  app.get(
    '/api/health',
    {
      schema: {
        description: 'Check API health status',
        tags: ['Health'],
        response: {
          200: {
            description: 'API is healthy',
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
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
        description: 'Check database connection',
        tags: ['Health'],
        response: {
          200: {
            description: 'Database status',
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok', 'error'] },
              database: { type: 'string', enum: ['connected', 'disconnected'] },
            },
          },
        },
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
  await app.register(itemsRoutes, { prefix: '/api/items' });
  await app.register(uploadRoutes, { prefix: '/api/upload' });

  return app;
}
