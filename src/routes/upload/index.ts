import multipart, { type MultipartFile } from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BadRequestError, ErrorCodes } from '../../errors/index.js';
import {
  errorResponse400,
  errorResponse401,
  errorResponse413,
  uploadResultSchema,
} from '../../schemas/responses.js';
import { processAndUploadImage, type UploadResult } from '../../services/storage/index.js';

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
        description: 'Upload multiple images (compressed to WebP)',
        tags: ['Upload'],
        security: [{ BearerAuth: [] }],
        consumes: ['multipart/form-data'],
        response: {
          200: z.object({ images: z.array(uploadResultSchema) }),
          400: errorResponse400,
          401: errorResponse401,
          413: errorResponse413,
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const parts = request.parts();
      const results: UploadResult[] = [];

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
          results.push(result);
        }
      }

      if (results.length === 0) {
        throw new BadRequestError(ErrorCodes.STORAGE_NO_FILE, 'No files were uploaded');
      }

      return reply.send({
        images: results.map((r) => ({
          key: r.key,
          sizeBytes: r.sizeBytes,
        })),
      });
    }
  );
}
