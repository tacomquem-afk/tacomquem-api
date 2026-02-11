import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { items, uploads } from '../../db/schema.js';
import { BadRequestError, ErrorCodes } from '../../errors/index.js';
import type { CreateItemInput, UpdateItemInput } from '../../schemas/items.js';

export interface ItemResponse {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function parseImages(imagesJson: string): string[] {
  try {
    return JSON.parse(imagesJson);
  } catch {
    return [];
  }
}

function toItemResponse(item: typeof items.$inferSelect): ItemResponse {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    images: parseImages(item.images),
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function createItem(ownerId: string, input: CreateItemInput): Promise<ItemResponse> {
  const result = await db
    .insert(items)
    .values({
      ownerId,
      name: input.name,
      description: input.description,
      images: JSON.stringify(input.images),
    })
    .returning();

  if (!result[0]) {
    throw new BadRequestError(ErrorCodes.ITEMS_CREATE_FAILED, 'Failed to create item');
  }

  if (input.images && input.images.length > 0) {
    await db
      .update(uploads)
      .set({ confirmedAt: new Date() })
      .where(and(eq(uploads.userId, ownerId), inArray(uploads.url, input.images)));
  }

  return toItemResponse(result[0]);
}

export async function getItemsByOwner(ownerId: string): Promise<ItemResponse[]> {
  const result = await db.query.items.findMany({
    where: and(eq(items.ownerId, ownerId), eq(items.isActive, true)),
    orderBy: (items, { desc }) => [desc(items.createdAt)],
  });

  return result.map(toItemResponse);
}

export async function getItemById(itemId: string, ownerId: string): Promise<ItemResponse | null> {
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.ownerId, ownerId)),
  });

  if (!item) {
    return null;
  }

  return toItemResponse(item);
}

export async function updateItem(
  itemId: string,
  ownerId: string,
  input: UpdateItemInput
): Promise<ItemResponse | null> {
  const existing = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.ownerId, ownerId)),
  });

  if (!existing) {
    return null;
  }

  const updateData: Partial<typeof items.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.images !== undefined) updateData.images = JSON.stringify(input.images);

  const result = await db.update(items).set(updateData).where(eq(items.id, itemId)).returning();

  if (!result[0]) {
    throw new BadRequestError(ErrorCodes.ITEMS_UPDATE_FAILED, 'Failed to update item');
  }

  if (input.images && input.images.length > 0) {
    await db
      .update(uploads)
      .set({ confirmedAt: new Date() })
      .where(and(eq(uploads.userId, ownerId), inArray(uploads.url, input.images)));
  }

  return toItemResponse(result[0]);
}

export async function deleteItem(itemId: string, ownerId: string): Promise<boolean> {
  const existing = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.ownerId, ownerId)),
  });

  if (!existing) {
    return false;
  }

  await db
    .update(items)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(items.id, itemId));

  return true;
}

export async function getItemByIdPublic(itemId: string): Promise<ItemResponse | null> {
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.isActive, true)),
  });

  if (!item) {
    return null;
  }

  return toItemResponse(item);
}
