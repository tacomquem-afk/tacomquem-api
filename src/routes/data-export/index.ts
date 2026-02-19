import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { db } from '../../db/index.js';
import { dataExports } from '../../db/schema.js';
import { UnauthorizedError, BadRequestError } from '../../errors/index.js';
import { errorResponse401, errorResponse400 } from '../../schemas/responses.js';
import { exportUserData } from '../../services/data-export/index.js';
import { sendEmail } from '../../services/email/index.js';

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
        throw new UnauthorizedError('Must be authenticated');
      }

      const { format } = request.body;
      const downloadToken = randomBytes(32).toString('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + EXPORT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const downloadTokenExpiresAt = new Date(now.getTime() + DOWNLOAD_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

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

      // Send email with download link (async, don't wait)
      const downloadUrl = `${process.env.APP_URL}/api/users/me/data/export/${exportRecord[0].id}/download?token=${downloadToken}`;
      sendEmail({
        to: request.user.email || '',
        subject: 'Your Data Export is Ready',
        template: 'data-export-ready',
        data: {
          downloadUrl,
          expiresIn: '7 days',
        },
      }).catch((err) => app.log.error('Failed to send export email', err));

      return reply.status(200).send({
        status: 'processing',
        export_id: exportRecord[0].id,
        message: 'Export initiated. A download link will be sent to your email.',
        email: request.user.email,
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
        throw new UnauthorizedError('Must be authenticated');
      }

      const exports = await db.query.dataExports.findMany({
        where: (table) => ({ userId: request.user!.userId }),
        orderBy: (table) => table.createdAt,
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
    '/me/data/export/:exportId/download',
    {
      schema: {
        description: 'Download exported data file',
        tags: ['Data Export'],
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
      const { exportId } = request.params;
      const { token } = request.query;

      const exportRecord = await db.query.dataExports.findFirst({
        where: (table) => ({
          id: exportId,
          downloadToken: token,
        }),
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
      await db
        .update(dataExports)
        .set({ downloadedAt: new Date() })
        .where((table) => table.id === exportId);

      // Stream file from storage
      const fileContent = exportRecord.fileUrl; // Would be S3 URL or local path in production
      reply.download(fileContent);
    }
  );
}

export default dataExportRoutes;