import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { items, loans, uploads } from '../../db/schema.js';
import { BadRequestError, ErrorCodes } from '../../errors/index.js';
import type { CreateItemInput, UpdateItemInput } from '../../schemas/items.js';
import { decryptSafe } from '../crypto/index.js';
import { deleteUploadsFromR2, resolveImageKeys } from '../storage/index.js';

export interface ItemResponse {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  isActive: boolean;
  isLoaned: boolean;
  currentLoanId: string | null;
  borrowedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

async function toItemResponse(
  item: typeof items.$inferSelect,
  activeLoan?: {
    id: string;
    borrowerId: string | null;
    borrower?: { nameEncrypted: string } | null;
  } | null
): Promise<ItemResponse> {
  let borrowedTo: string | null = null;
  if (activeLoan?.borrower) {
    borrowedTo = decryptSafe(activeLoan.borrower.nameEncrypted);
  }

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    images: await resolveImageKeys(item.images),
    isActive: item.isActive,
    isLoaned: !!activeLoan,
    currentLoanId: activeLoan?.id ?? null,
    borrowedTo,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function getActiveLoanForItem(itemId: string) {
  const result = await db.query.loans.findFirst({
    where: and(eq(loans.itemId, itemId), eq(loans.status, 'confirmed')),
    with: { borrower: true },
  });
  return result ?? null;
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
      .where(and(eq(uploads.userId, ownerId), inArray(uploads.key, input.images)));
  }

  return toItemResponse(result[0]);
}

export async function getItemsByOwner(ownerId: string): Promise<ItemResponse[]> {
  const result = await db.query.items.findMany({
    where: and(eq(items.ownerId, ownerId), eq(items.isActive, true)),
    orderBy: (items, { desc }) => [desc(items.createdAt)],
  });

  const itemsWithLoans = await Promise.all(
    result.map(async (item) => ({
      item,
      activeLoan: await getActiveLoanForItem(item.id),
    }))
  );

  return Promise.all(
    itemsWithLoans.map(({ item, activeLoan }) => toItemResponse(item, activeLoan))
  );
}

export async function getItemById(itemId: string, ownerId: string): Promise<ItemResponse | null> {
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.ownerId, ownerId)),
  });

  if (!item) {
    return null;
  }

  const activeLoan = await getActiveLoanForItem(item.id);
  return toItemResponse(item, activeLoan);
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
      .where(and(eq(uploads.userId, ownerId), inArray(uploads.key, input.images)));
  }

  const activeLoan = await getActiveLoanForItem(itemId);
  return toItemResponse(result[0], activeLoan);
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

  let imageKeys: string[] = [];
  try {
    imageKeys = JSON.parse(existing.images);
  } catch {}

  if (imageKeys.length > 0) {
    const { failed } = await deleteUploadsFromR2(imageKeys);
    if (failed.length > 0) {
      console.warn(`Failed to delete ${failed.length} images from R2`, { failed });
    }
  }

  return true;
}

export async function getItemByIdPublic(itemId: string): Promise<ItemResponse | null> {
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.isActive, true)),
  });

  if (!item) {
    return null;
  }

  const activeLoan = await getActiveLoanForItem(item.id);
  return toItemResponse(item, activeLoan);
}
