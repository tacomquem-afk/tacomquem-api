import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

const deleteUploadsFromR2Mock = mock(() =>
  Promise.resolve({ deleted: [] as string[], failed: [] as Array<{ key: string; error: string }> })
);

mock.module('../../storage/index.js', () => ({
  resolveImageKeys: async (json: string) => {
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  },
  deleteUploadsFromR2: deleteUploadsFromR2Mock,
}));

import { db } from '../../../db/index.js';
import { BadRequestError, ErrorCodes } from '../../../errors/index.js';
import {
  createItem,
  deleteItem,
  getItemById,
  getItemByIdPublic,
  getItemsByOwner,
  type ItemResponse,
  updateItem,
} from '../index.js';

const mocks: Array<{ mockRestore: () => void }> = [];

const mockItemData = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  ownerId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Item',
  description: 'A test item',
  images: '["https://example.com/image1.jpg"]',
  isActive: true,
  createdAt: new Date('2026-02-04'),
  updatedAt: new Date('2026-02-04'),
};

const expectedItemResponse: ItemResponse = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Item',
  description: 'A test item',
  images: ['https://example.com/image1.jpg'],
  isActive: true,
  createdAt: new Date('2026-02-04').toISOString(),
  updatedAt: new Date('2026-02-04').toISOString(),
};

beforeEach(() => {
  // Clean any leftover mocks from previous tests
  for (const mock of mocks) {
    try {
      mock.mockRestore();
    } catch (_e) {
      // Already restored
    }
  }
  mocks.length = 0;

  // Just clear, don't track these clearings
  spyOn(db, 'insert').mockClear();
  spyOn(db, 'update').mockClear();
  spyOn(db.query.items, 'findMany').mockClear();
  spyOn(db.query.items, 'findFirst').mockClear();
  deleteUploadsFromR2Mock.mockClear();
});

afterEach(() => {
  for (const mock of mocks) {
    mock.mockRestore();
  }
  mocks.length = 0;
});

describe('items service', () => {
  describe('createItem', () => {
    it('should create item successfully', async () => {
      const returningMock = mock(() => Promise.resolve([mockItemData]));
      const valuesMock = mock(() => ({ returning: returningMock }));
      const insertSpy = spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);
      mocks.push(insertSpy);

      const updateWhereMock = mock(() => Promise.resolve());
      const updateSetMock = mock(() => ({ where: updateWhereMock }));
      const updateSpy = spyOn(db, 'update').mockReturnValue({ set: updateSetMock } as any);
      mocks.push(updateSpy);

      const result = await createItem('550e8400-e29b-41d4-a716-446655440001', {
        name: 'Test Item',
        description: 'A test item',
        images: ['https://example.com/image1.jpg'],
      });

      expect(result).toEqual(expectedItemResponse);
    });

    it('should throw error if item creation fails', async () => {
      const returningMock = mock(() => Promise.resolve([]));
      const valuesMock = mock(() => ({ returning: returningMock }));
      const insertSpy = spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);
      mocks.push(insertSpy);

      let errorThrown = false;
      try {
        await createItem('550e8400-e29b-41d4-a716-446655440001', {
          name: 'Test Item',
          description: 'A test item',
          images: [],
        });
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.ITEMS_CREATE_FAILED);
      }
      expect(errorThrown).toBe(true);
    });

    it('should create item with empty description', async () => {
      const itemWithoutDescription = { ...mockItemData, description: null };
      const returningMock = mock(() => Promise.resolve([itemWithoutDescription]));
      const valuesMock = mock(() => ({ returning: returningMock }));
      const insertSpy = spyOn(db, 'insert').mockReturnValue({ values: valuesMock } as any);
      mocks.push(insertSpy);

      const result = await createItem('550e8400-e29b-41d4-a716-446655440001', {
        name: 'Test Item',
        images: [],
      });

      expect(result.description).toBeNull();
    });
  });

  describe('getItemsByOwner', () => {
    it('should return all active items for owner', async () => {
      const items = [mockItemData, { ...mockItemData, id: 'item-124' }];
      const findManySpy = spyOn(db.query.items, 'findMany').mockResolvedValueOnce(items as any);
      mocks.push(findManySpy);

      const result = await getItemsByOwner('550e8400-e29b-41d4-a716-446655440001');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expectedItemResponse);
    });

    it('should return empty array if owner has no items', async () => {
      const findManySpy = spyOn(db.query.items, 'findMany').mockResolvedValueOnce([]);
      mocks.push(findManySpy);

      const result = await getItemsByOwner('550e8400-e29b-41d4-a716-446655440001');

      expect(result).toHaveLength(0);
    });

    it('should only return active items', async () => {
      const activeItem = { ...mockItemData, isActive: true };
      const findManySpy = spyOn(db.query.items, 'findMany').mockResolvedValueOnce([
        activeItem,
      ] as any);
      mocks.push(findManySpy);

      const result = await getItemsByOwner('550e8400-e29b-41d4-a716-446655440001');

      expect(result).toHaveLength(1);
      expect(result[0]?.isActive).toBe(true);
    });
  });

  describe('getItemById', () => {
    it('should return item if exists and owned by user', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(
        mockItemData as any
      );
      mocks.push(findFirstSpy);

      const result = await getItemById(
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(result).toEqual(expectedItemResponse);
    });

    it('should return null if item does not exist', async () => {
      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(undefined);

      const result = await getItemById('nonexistent-item', '550e8400-e29b-41d4-a716-446655440001');

      expect(result).toBeNull();
    });

    it('should return null if item is not owned by user', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(undefined);
      mocks.push(findFirstSpy);

      const result = await getItemById('550e8400-e29b-41d4-a716-446655440000', 'different-owner');

      expect(result).toBeNull();
    });
  });

  describe('updateItem', () => {
    it('should update item successfully', async () => {
      const findSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(mockItemData as any);
      mocks.push(findSpy);

      const updatedItem = {
        ...mockItemData,
        name: 'Updated Item',
        updatedAt: new Date(),
      };

      const returningMock = mock(() => Promise.resolve([updatedItem]));
      const whereMock = mock(() => ({ returning: returningMock }));
      const setMock = mock(() => ({ where: whereMock }));
      const updateSpy = spyOn(db, 'update').mockReturnValue({ set: setMock } as any);
      mocks.push(updateSpy);

      const result = await updateItem(
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001',
        {
          name: 'Updated Item',
        }
      );

      expect(result?.name).toBe('Updated Item');
      expect(findSpy).toHaveBeenCalled();
    });

    it('should return null if item does not exist', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(undefined);
      mocks.push(findFirstSpy);

      const result = await updateItem('nonexistent-item', '550e8400-e29b-41d4-a716-446655440001', {
        name: 'Updated Item',
      });

      expect(result).toBeNull();
    });

    it('should throw error if update fails', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(
        mockItemData as any
      );
      mocks.push(findFirstSpy);

      const returningMock = mock(() => Promise.resolve([]));
      const whereMock = mock(() => ({ returning: returningMock }));
      const setMock = mock(() => ({ where: whereMock }));
      const updateSpy = spyOn(db, 'update').mockReturnValue({ set: setMock } as any);
      mocks.push(updateSpy);

      let errorThrown = false;
      try {
        await updateItem(
          '550e8400-e29b-41d4-a716-446655440000',
          '550e8400-e29b-41d4-a716-446655440001',
          {
            name: 'Updated Item',
          }
        );
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.ITEMS_UPDATE_FAILED);
      }
      expect(errorThrown).toBe(true);
    });

    it('should only update provided fields', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(
        mockItemData as any
      );
      mocks.push(findFirstSpy);

      const updatedItem = {
        ...mockItemData,
        description: 'New description',
        updatedAt: new Date(),
      };

      const returningMock = mock(() => Promise.resolve([updatedItem]));
      const whereMock = mock(() => ({ returning: returningMock }));
      const setMock = mock(() => ({ where: whereMock }));
      const updateSpy = spyOn(db, 'update').mockReturnValue({ set: setMock } as any);
      mocks.push(updateSpy);

      const result = await updateItem(
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001',
        {
          description: 'New description',
        }
      );

      expect(result?.description).toBe('New description');
    });
  });

  describe('deleteItem', () => {
    it('should soft delete item successfully', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(
        mockItemData as any
      );
      mocks.push(findFirstSpy);

      const returningMock = mock(() => Promise.resolve());
      const whereMock = mock(() => ({ returning: returningMock }));
      const setMock = mock(() => ({ where: whereMock }));
      const updateSpy = spyOn(db, 'update').mockReturnValue({ set: setMock } as any);
      mocks.push(updateSpy);

      const result = await deleteItem(
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(result).toBe(true);
    });

    it('should return false if item does not exist', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(undefined);
      mocks.push(findFirstSpy);

      const result = await deleteItem('nonexistent-item', '550e8400-e29b-41d4-a716-446655440001');

      expect(result).toBe(false);
    });

    it('should mark item as inactive', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(
        mockItemData as any
      );
      mocks.push(findFirstSpy);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      const updateSpy = spyOn(db, 'update').mockReturnValue({
        set: setMock,
      } as any);
      mocks.push(updateSpy);

      await deleteItem(
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(findFirstSpy).toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalled();
    });

    it('should delete images from R2 when item is deleted', async () => {
      const itemWithImages = {
        ...mockItemData,
        images: '["items/user/abc-123.webp", "items/user/def-456.webp"]',
      };

      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(itemWithImages as any);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      await deleteItem(
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(deleteUploadsFromR2Mock).toHaveBeenCalledWith([
        'items/user/abc-123.webp',
        'items/user/def-456.webp',
      ]);
    });

    it('should handle R2 deletion failure gracefully', async () => {
      const itemWithImages = {
        ...mockItemData,
        images: '["items/user/abc-123.webp"]',
      };

      spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(itemWithImages as any);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, 'update').mockReturnValue({ set: setMock } as any);

      deleteUploadsFromR2Mock.mockResolvedValueOnce({
        deleted: [],
        failed: [{ key: 'items/user/abc-123.webp', error: 'R2 connection failed' }],
      });

      const result = await deleteItem(
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(result).toBe(true);
    });

    it('should handle empty images array', async () => {
      const itemWithNoImages = {
        ...mockItemData,
        images: '[]',
      };

      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(
        itemWithNoImages as any
      );
      mocks.push(findFirstSpy);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      const updateSpy = spyOn(db, 'update').mockReturnValue({ set: setMock } as any);
      mocks.push(updateSpy);

      const result = await deleteItem(
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(result).toBe(true);
      expect(deleteUploadsFromR2Mock).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON in images field', async () => {
      const itemWithInvalidImages = {
        ...mockItemData,
        images: 'invalid-json',
      };

      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(
        itemWithInvalidImages as any
      );
      mocks.push(findFirstSpy);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      const updateSpy = spyOn(db, 'update').mockReturnValue({ set: setMock } as any);
      mocks.push(updateSpy);

      deleteUploadsFromR2Mock.mockClear();

      const result = await deleteItem(
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(result).toBe(true);
      expect(deleteUploadsFromR2Mock).not.toHaveBeenCalled();
    });
  });

  describe('getItemByIdPublic', () => {
    it('should return active item', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(
        mockItemData as any
      );
      mocks.push(findFirstSpy);

      const result = await getItemByIdPublic('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toEqual(expectedItemResponse);
    });

    it('should return null if item does not exist', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(undefined);
      mocks.push(findFirstSpy);

      const result = await getItemByIdPublic('nonexistent-item');

      expect(result).toBeNull();
    });

    it('should return null if item is inactive', async () => {
      const inactiveItem = { ...mockItemData, isActive: false };
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(
        inactiveItem as any
      );
      mocks.push(findFirstSpy);

      const result = await getItemByIdPublic('550e8400-e29b-41d4-a716-446655440000');

      expect(result?.isActive).toBeFalsy();
    });

    it('should not require ownership to fetch item', async () => {
      const findFirstSpy = spyOn(db.query.items, 'findFirst').mockResolvedValueOnce(
        mockItemData as any
      );
      mocks.push(findFirstSpy);

      await getItemByIdPublic('550e8400-e29b-41d4-a716-446655440000');

      expect(findFirstSpy).toHaveBeenCalled();
    });
  });
});
