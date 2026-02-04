import type { FastifyInstance } from 'fastify';
import {
  type CreateItemInput,
  createItemSchema,
  type UpdateItemInput,
  updateItemSchema,
} from '../../schemas/items.js';
import {
  createItem,
  deleteItem,
  getItemById,
  getItemsByOwner,
  updateItem,
} from '../../services/items/index.js';

export default async function itemsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post<{ Body: CreateItemInput }>(
    '/',
    {
      schema: {
        description: 'Create a new item',
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', description: 'Item name' },
            description: { type: 'string', description: 'Item description' },
            images: {
              type: 'array',
              items: { type: 'string', format: 'uri' },
              description: 'Array of image URLs',
            },
          },
        },
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
      const result = createItemSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      const item = await createItem(request.user.userId, result.data);
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

  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description: 'Get a specific item by ID',
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
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
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const item = await getItemById(request.params.id, request.user.userId);

      if (!item) {
        return reply.status(404).send({ error: 'Item não encontrado' });
      }

      return reply.send({ item });
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateItemInput }>(
    '/:id',
    {
      schema: {
        description: 'Update an item',
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Item name' },
            description: { type: 'string', description: 'Item description' },
            images: {
              type: 'array',
              items: { type: 'string', format: 'uri' },
              description: 'Array of image URLs',
            },
          },
        },
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
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const result = updateItemSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      const item = await updateItem(request.params.id, request.user.userId, result.data);

      if (!item) {
        return reply.status(404).send({ error: 'Item não encontrado' });
      }

      return reply.send({ item });
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description: 'Delete an item (soft delete)',
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          204: {
            type: 'null',
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const deleted = await deleteItem(request.params.id, request.user.userId);

      if (!deleted) {
        return reply.status(404).send({ error: 'Item não encontrado' });
      }

      return reply.status(204).send();
    }
  );
}
