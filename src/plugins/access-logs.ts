import { createHash } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { accessLogs } from '../db/schema.js';

/**
 * Access Logs Plugin
 * Logs all authenticated requests and admin actions for Marco Civil compliance
 * Maintains 6-month retention as required by Article 15
 */
export async function accessLogsPlugin(fastify: FastifyInstance) {
  fastify.addHook('onResponse', async (request, reply) => {
    // Only log if user is authenticated OR it's an admin action OR it's a sensitive endpoint
    const shouldLog =
      request.user ||
      request.url.startsWith('/api/admin') ||
      isSensitiveAction(request.method, request.url);

    if (!shouldLog) {
      return;
    }

    try {
      const startTime = (request as any).startTime || Date.now();
      const responseTime = Date.now() - startTime;

      await db.insert(accessLogs).values({
        timestamp: new Date(),
        ipAddress: getClientIp(request),
        userId: request.user?.userId || null,
        httpMethod: request.method,
        path: extractPath(request.url),
        queryString: extractQueryString(request.url) || null,
        statusCode: reply.statusCode,
        responseTimeMs: responseTime,
        userAgent: request.headers['user-agent'] || null,
        referrer: request.headers['referer'] || null,
        bodyHash: hashBody(request.body),
      });
    } catch (error) {
      fastify.log.warn({ err: error }, 'Failed to log access');
      // Don't interrupt request if logging fails
    }
  });
}

function getClientIp(request: any): string | null {
  // Check common headers in order of preference
  const ip =
    request.headers['cf-connecting-ip'] ||
    request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    request.headers['x-real-ip'] ||
    request.socket?.remoteAddress ||
    request.ip ||
    null;

  return ip || null;
}

function extractPath(url: string): string {
  return url.split('?')[0];
}

function extractQueryString(url: string): string | null {
  const queryIndex = url.indexOf('?');
  return queryIndex !== -1 ? url.substring(queryIndex + 1) : null;
}

function hashBody(body: any): string | null {
  if (!body) return null;

  try {
    const jsonString = typeof body === 'string' ? body : JSON.stringify(body);
    return createHash('sha256').update(jsonString).digest('hex');
  } catch {
    return null;
  }
}

function isSensitiveAction(method: string, url: string): boolean {
  const sensitivePatterns = [
    /\/api\/auth\/login/,
    /\/api\/auth\/register/,
    /\/api\/auth\/.*\/verify/,
    /\/api\/auth\/.*\/reset/,
    /\/api\/me\/account\/.*deletion/,
    /DELETE.*\/api\/items/,
    /DELETE.*\/api\/loans/,
    /POST.*\/api\/admin/,
  ];

  return method === 'POST' || method === 'DELETE' || method === 'PATCH'
    ? sensitivePatterns.some((pattern) => pattern.test(url))
    : false;
}
