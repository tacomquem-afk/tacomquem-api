import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { dataExports } from '../../db/schema.js';
import { ErrorCodes, UnauthorizedError } from '../../errors/index.js';
import { errorResponse400, errorResponse401 } from '../../schemas/responses.js';
import { buildDataExportReadyEmail, sendEmail } from '../../services/email/index.js';

const DOWNLOAD_TOKEN_EXPIRY_DAYS = 7;
const EXPORT_EXPIRY_DAYS = 7;

async function dataExportRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/me/data/export',
    {
      schema: {
        description: 'Request data export in JSON or CSV format',
        tags: ['Data Export'],
        security: [{ BearerAuth: [] }],
        body: z.object({
          format: z.enum(['json', 'csv']).default('json'),
        }),
        response: {
          200: z.object({
            status: z.enum(['processing', 'ready']),
            export_id: z.string().uuid(),
            message: z.string().optional(),
            download_url: z.string().url().optional(),
            expires_in: z.string().optional(),
            email: z.string().email().optional(),
          }),
          400: errorResponse400,
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Must be authenticated');
      }

      const { format } = request.body;
      const downloadToken = randomBytes(32).toString('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + EXPORT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const downloadTokenExpiresAt = new Date(
        now.getTime() + DOWNLOAD_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      );

      const exportRecord = await db
        .insert(dataExports)
        .values({
          userId: request.user.userId,
          format,
          status: 'pending',
          downloadToken,
          downloadTokenExpiresAt,
          expiresAt,
        })
        .returning();

      const record = exportRecord[0];
      if (!record) {
        throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Failed to create export');
      }

      // Send email with download link (async, don't wait)
      const downloadUrl = `${process.env.APP_URL}/api/users/me/data/export/${record.id}/download?token=${downloadToken}`;
      sendEmail({
        to: 'user@example.com',
        subject: 'Seu Dado de Exportação está Pronto',
        html: buildDataExportReadyEmail(downloadUrl, '7 days', format),
      }).catch((err) => app.log.error('Failed to send export email', err));

      return reply.status(200).send({
        status: 'processing',
        export_id: record.id,
        message: 'Export initiated. A download link will be sent to your email.',
      });
    }
  );

  typed.get(
    '/me/data/export/status',
    {
      schema: {
        description: 'Get data export history',
        tags: ['Data Export'],
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({
            exports: z.array(
              z.object({
                id: z.string().uuid(),
                format: z.string(),
                status: z.string(),
                created_at: z.coerce.date(),
                expires_at: z.coerce.date().nullable(),
                file_size_bytes: z.number().nullable(),
                downloaded: z.boolean(),
              })
            ),
          }),
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError(ErrorCodes.AUTH_UNAUTHORIZED, 'Must be authenticated');
      }

      const exports = await db.query.dataExports.findMany({
        where: request.user ? eq(dataExports.userId, request.user.userId) : undefined,
      });

      return reply.status(200).send({
        exports: exports.map((exp) => ({
          id: exp.id,
          format: exp.format,
          status: exp.status,
          created_at: exp.createdAt,
          expires_at: exp.expiresAt,
          file_size_bytes: exp.fileSizeBytes,
          downloaded: !!exp.downloadedAt,
        })),
      });
    }
  );

  typed.get(
    '/me/data/export/:id/download',
    {
      schema: {
        description: 'Download exported data file',
        tags: ['Data Export'],
        params: z.object({
          id: z.string().uuid(),
        }),
        querystring: z.object({
          token: z.string(),
        }),
        response: {
          200: z.any(), // File response
          401: errorResponse401,
          404: z.object({ error: z.string() }),
          410: z.object({ error: z.string() }), // Gone (expired)
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { token } = request.query;

      const exportRecord = await db.query.dataExports.findFirst({
        where: and(eq(dataExports.id, id), eq(dataExports.downloadToken, token)),
      });

      if (!exportRecord) {
        return reply.status(404).send({ error: 'Export not found' });
      }

      if (exportRecord.downloadTokenExpiresAt && exportRecord.downloadTokenExpiresAt < new Date()) {
        return reply.status(410).send({ error: 'Download link expired' });
      }

      if (exportRecord.status !== 'completed') {
        return reply.status(404).send({ error: 'Export not yet ready' });
      }

      // Mark as downloaded
      await db.update(dataExports).set({ downloadedAt: new Date() }).where(eq(dataExports.id, id));

      // Stream file from storage
      const fileContent = exportRecord.fileUrl; // Would be S3 URL or local path in production
      return reply
        .header('Content-Disposition', `attachment; filename="${id}.${exportRecord.format}"`)
        .send(fileContent);
    }
  );
}

export default dataExportRoutes;
