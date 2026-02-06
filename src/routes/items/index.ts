import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import { createItemSchema, updateItemSchema } from '../../schemas/items.js';
import {
  createItem,
  deleteItem,
  getItemById,
  getItemsByOwner,
  updateItem,
} from '../../services/items/index.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function itemsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', app.authenticate);

  typed.post(
    '/',
    {
      schema: {
        description: 'Create a new item',
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        body: createItemSchema,
        response: {
          201: {
            type: 'object',
            properties: {
              item: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: ['string', 'null'] },
                  images: { type: 'array', items: { type: 'string' } },
                  isActive: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const item = await createItem(request.user.userId, request.body);
      return reply.status(201).send({ item });
    }
  );

  app.get(
    '/',
    {
      schema: {
        description: 'List all items owned by the current user',
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: ['string', 'null'] },
                    images: { type: 'array', items: { type: 'string' } },
                    isActive: { type: 'boolean' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const items = await getItemsByOwner(request.user.userId);
      return reply.send({ items });
    }
  );

  typed.get(
    '/:id',
    {
      schema: {
        description: 'Get a specific item by ID',
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              item: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: ['string', 'null'] },
                  images: { type: 'array', items: { type: 'string' } },
                  isActive: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const item = await getItemById(request.params.id, request.user.userId);

      if (!item) {
        throw new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
      }

      return reply.send({ item });
    }
  );

  typed.patch(
    '/:id',
    {
      schema: {
        description: 'Update an item',
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: updateItemSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              item: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: ['string', 'null'] },
                  images: { type: 'array', items: { type: 'string' } },
                  isActive: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const item = await updateItem(request.params.id, request.user.userId, request.body);

      if (!item) {
        throw new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
      }

      return reply.send({ item });
    }
  );

  typed.delete(
    '/:id',
    {
      schema: {
        description: 'Delete an item (soft delete)',
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          204: { type: 'null' },
        },
      },
    },
    async (request, reply) => {
      const deleted = await deleteItem(request.params.id, request.user.userId);

      if (!deleted) {
        throw new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
      }

      return reply.status(204).send();
    }
  );
}
