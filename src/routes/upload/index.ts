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
        description:
          'Upload up to 5 images (max 10MB each). Images are auto-compressed to WebP. Accepted formats: JPEG, PNG, WebP, HEIC, TIFF.',
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
