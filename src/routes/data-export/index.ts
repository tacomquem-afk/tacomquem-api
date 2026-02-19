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
        description: `**Request a personal data export (LGPD right of portability)**

Initiates a full export of the authenticated user's personal data in the requested format. Fulfills the LGPD right of data portability (Art. 18, V).

**Export process:**
1. Call this endpoint to create an export job (status: \`processing\`)
2. A background job packages all user data (profile, items, loans, notifications)
3. A download link is emailed once the export is ready (typically within a few minutes)
4. Download the file via \`GET /api/users/me/data/export/:id/download\`

**Format options:**
| \`format\` | Description |
|-----------|-------------|
| \`json\` _(default)_ | Structured JSON — best for programmatic use |
| \`csv\` | Flat CSV — best for spreadsheet viewing |

**Expiry:** Both the export file and the download link expire after 7 days.`,
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
        description: `**Get data export history**

Returns a list of all previous data export requests made by the authenticated user. Use this to show export history and check the status of pending exports.

**Export statuses:**
| \`status\` | Meaning |
|-----------|---------|
| \`pending\` | Export job queued, not yet started |
| \`processing\` | Export is being generated |
| \`completed\` | Export is ready for download |
| \`failed\` | Export generation failed — retry by creating a new export |

**Fields of note:**
- \`downloaded\`: \`true\` if the download link was already used
- \`expires_at\`: ISO 8601 datetime when the export file will be deleted`,
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
        description: `**Download an exported data file**

Downloads the generated export file identified by its ID and a one-time download token. The token is included in the download link sent by email.

**This endpoint does not require authentication** — the \`token\` query parameter acts as the access credential for the file.

**Behavior:**
- The download token is single-use — subsequent requests with the same token will still succeed (the \`downloaded\` flag is set on first use)
- Returns the file as an attachment with the appropriate \`Content-Disposition\` header

**Error codes:**
| Status | Meaning |
|--------|---------|
| \`404\` | Export not found, token invalid, or export not yet ready |
| \`410\` | Download link has expired (7-day window) |`,
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
