import multipart, { type MultipartFile } from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BadRequestError, ErrorCodes } from '../../errors/index.js';
import {
  errorResponse400,
  errorResponse401,
  errorResponse413,
  errorResponse500,
  uploadResultSchema,
} from '../../schemas/responses.js';
import {
  generatePresignedUrlResult,
  processAndUploadImage,
  type UploadResult,
} from '../../services/storage/index.js';

export async function uploadRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 5,
    },
  });

  app.post(
    '/images',
    {
      schema: {
        summary: 'Upload images',
        description: `**Upload item images**

Accepts a multipart/form-data request with one or more image files and stores them in cloud storage. Images are automatically compressed and converted to WebP format for optimal delivery.

**Limits:**
- Maximum **5 files** per request
- Maximum **10 MB** per file
- Accepted formats: JPEG, PNG, WebP, HEIC, TIFF

**Workflow:**
1. Upload images here — get back an array of \`key\` and pre-signed \`url\` values
2. Use the returned \`key\` values in item create/update requests (\`POST /api/items\`, \`PATCH /api/items/:id\`)
3. Use the returned \`url\` to display images immediately — URLs expire after 7 days (new pre-signed URLs are served by the items endpoints)

**Response per image:**
| Field | Description |
|-------|-------------|
| \`key\` | Stable storage key — store this, not the URL |
| \`url\` | Pre-signed URL for immediate display (expires in 7 days) |
| \`expiresAt\` | ISO 8601 datetime when the pre-signed URL expires |
| \`sizeBytes\` | Final file size after compression |

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`STORAGE_MAX_FILES\` | More than 5 files sent in a single request |
| \`400\` | \`STORAGE_NO_FILE\` | Request contained no valid image files |
| \`413\` | \`STORAGE_FILE_TOO_LARGE\` | One or more files exceed the 10 MB limit |`,
        tags: ['Upload'],
        security: [{ BearerAuth: [] }],
        consumes: ['multipart/form-data'],
        body: {
          type: 'object',
          properties: {
            images: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
            },
          },
        },
        response: {
          200: z.object({ images: z.array(uploadResultSchema) }),
          400: errorResponse400,
          401: errorResponse401,
          413: errorResponse413,
          500: errorResponse500,
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const parts = request.parts();
      const results: Array<UploadResult & { url: string; expiresAt: string }> = [];

      for await (const part of parts) {
        if (part.type === 'file') {
          if (results.length >= 5) {
            throw new BadRequestError(ErrorCodes.STORAGE_MAX_FILES, 'Maximum 5 files per upload');
          }

          const result = await processAndUploadImage(
            part as MultipartFile,
            request.user.userId,
            request.log
          );
          const presigned = await generatePresignedUrlResult(result.key);
          results.push({ ...result, ...presigned });
        }
      }

      if (results.length === 0) {
        throw new BadRequestError(ErrorCodes.STORAGE_NO_FILE, 'No files were uploaded');
      }

      return reply.send({
        images: results.map((r) => ({
          key: r.key,
          url: r.url,
          expiresAt: r.expiresAt,
          sizeBytes: r.sizeBytes,
        })),
      });
    }
  );
}
