import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import { createItemSchema, updateItemSchema } from '../../schemas/items.js';
import {
  errorResponse401,
  errorResponse404,
  errorResponse422,
  itemResponseSchema,
} from '../../schemas/responses.js';
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
        description: `**Create a new item**

Registers a new loanable item owned by the authenticated user. Items can have multiple images (uploaded via \`POST /api/upload/images\`) and an optional description.

**Image handling:**
- Upload images first via \`POST /api/upload/images\`, then include the returned \`key\` values in the \`images\` array
- Up to 5 images per item are supported
- Images are stored as an ordered array; the first image is used as the primary thumbnail

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`422\` | \`VALIDATION_INVALID_REQUEST\` | Request body failed validation |`,
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        body: createItemSchema,
        response: {
          201: z.object({ item: itemResponseSchema }),
          401: errorResponse401,
          422: errorResponse422,
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
        description: `**List items owned by the current user**

Returns all items (active and soft-deleted) that belong to the authenticated user. Use the \`isActive\` and \`isLoaned\` fields in the response to filter in the UI.

**Response fields of note:**
| Field | Type | Description |
|-------|------|-------------|
| \`isActive\` | boolean | \`false\` means the item was soft-deleted |
| \`isLoaned\` | boolean | \`true\` means the item is currently in an active loan |
| \`currentLoanId\` | UUID \\| null | ID of the active loan, if any |
| \`borrowedTo\` | string \\| null | Name of the current borrower, if any |`,
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        response: {
          200: z.object({ items: z.array(itemResponseSchema) }),
          401: errorResponse401,
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
        description: `**Get item details**

Returns full details for a specific item. Only the owner of the item can retrieve it.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`ITEMS_NOT_FOUND\` | Item does not exist or does not belong to the authenticated user |`,
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: z.object({ item: itemResponseSchema }),
          401: errorResponse401,
          404: errorResponse404,
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
        description: `**Update item details**

Updates one or more fields on an existing item. Only the owner can update their items. All fields are optional — only send the fields you want to change.

**Constraints:**
- Cannot update an item that has been soft-deleted (\`isActive: false\`)
- Updating \`images\` replaces the entire image array; send the full desired array

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`ITEMS_NOT_FOUND\` | Item does not exist or does not belong to the authenticated user |`,
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        body: updateItemSchema,
        response: {
          200: z.object({ item: itemResponseSchema }),
          401: errorResponse401,
          404: errorResponse404,
          422: errorResponse422,
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
        description: `**Delete an item (soft delete)**

Marks an item as inactive (\`isActive: false\`). The item is not permanently removed from the database — existing loan history is preserved.

**Constraints:**
- Cannot delete an item that currently has an active loan (\`isLoaned: true\`) — cancel or complete the loan first

Returns \`204 No Content\` on success.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`ITEMS_NOT_FOUND\` | Item does not exist or does not belong to the authenticated user |`,
        tags: ['Items'],
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          204: z.null(),
          401: errorResponse401,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const deleted = await deleteItem(request.params.id, request.user.userId);

      if (!deleted) {
        throw new NotFoundError(ErrorCodes.ITEMS_NOT_FOUND, 'Item not found');
      }

      return reply.status(204).send(null);
    }
  );
}
