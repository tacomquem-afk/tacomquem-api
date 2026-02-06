import multipart, { type MultipartFile } from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
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
        description: 'Upload de múltiplas fotos (compacta para WebP)',
        tags: ['Upload'],
        security: [{ BearerAuth: [] }],
        consumes: ['multipart/form-data'],
        response: {
          200: {
            type: 'object',
            properties: {
              images: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', format: 'uri' },
                    sizeBytes: { type: 'number' },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const parts = request.parts();
      const uploadPromises: Promise<UploadResult>[] = [];
      let fileCount = 0;

      for await (const part of parts) {
        if (part.type === 'file') {
          fileCount++;
          if (fileCount > 5) {
            return reply.status(400).send({ error: 'Máximo 5 arquivos por upload' });
          }

          uploadPromises.push(
            processAndUploadImage(part as MultipartFile, request.user.userId).catch((error) => {
              throw error;
            })
          );
        }
      }

      if (uploadPromises.length === 0) {
        return reply.status(400).send({ error: 'Nenhum arquivo foi enviado' });
      }

      const results = await Promise.all(uploadPromises);

      return reply.send({
        images: results.map((r) => ({
          url: r.url,
          sizeBytes: r.sizeBytes,
        })),
      });
    }
  );
}
