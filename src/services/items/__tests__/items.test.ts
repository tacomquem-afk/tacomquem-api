import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { db } from "../../../db/index.js";
import {
  createItem,
  deleteItem,
  getItemById,
  getItemByIdPublic,
  getItemsByOwner,
  type ItemResponse,
  updateItem,
} from "../index.js";

const mockItemData = {
  id: "item-123",
  ownerId: "owner-123",
  name: "Test Item",
  description: "A test item",
  images: '["https://example.com/image1.jpg"]',
  isActive: true,
  createdAt: new Date("2026-02-04"),
  updatedAt: new Date("2026-02-04"),
};

const expectedItemResponse: ItemResponse = {
  id: "item-123",
  name: "Test Item",
  description: "A test item",
  images: ["https://example.com/image1.jpg"],
  isActive: true,
  createdAt: new Date("2026-02-04"),
  updatedAt: new Date("2026-02-04"),
};

beforeEach(() => {
  spyOn(db, "insert").mockClear();
  spyOn(db, "update").mockClear();
  spyOn(db.query.items, "findMany").mockClear();
  spyOn(db.query.items, "findFirst").mockClear();
});

describe("items service", () => {
  describe("createItem", () => {
    it("should create item successfully", async () => {
      const returningMock = mock(() => Promise.resolve([mockItemData]));
      const valuesMock = mock(() => ({ returning: returningMock }));
      spyOn(db, "insert").mockReturnValue({ values: valuesMock } as any);

      const result = await createItem("owner-123", {
        name: "Test Item",
        description: "A test item",
        images: ["https://example.com/image1.jpg"],
      });

      expect(result).toEqual(expectedItemResponse);
    });

    it("should throw error if item creation fails", async () => {
      const returningMock = mock(() => Promise.resolve([]));
      const valuesMock = mock(() => ({ returning: returningMock }));
      spyOn(db, "insert").mockReturnValue({ values: valuesMock } as any);

      await expect(
        createItem("owner-123", {
          name: "Test Item",
          description: "A test item",
          images: [],
        }),
      ).rejects.toThrow("Falha ao criar item");
    });

    it("should create item with empty description", async () => {
      const itemWithoutDescription = { ...mockItemData, description: null };
      const returningMock = mock(() =>
        Promise.resolve([itemWithoutDescription]),
      );
      const valuesMock = mock(() => ({ returning: returningMock }));
      spyOn(db, "insert").mockReturnValue({ values: valuesMock } as any);

      const result = await createItem("owner-123", {
        name: "Test Item",
        images: [],
      });

      expect(result.description).toBeNull();
    });
  });

  describe("getItemsByOwner", () => {
    it("should return all active items for owner", async () => {
      const items = [mockItemData, { ...mockItemData, id: "item-124" }];
      spyOn(db.query.items, "findMany").mockResolvedValueOnce(items as any);

      const result = await getItemsByOwner("owner-123");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expectedItemResponse);
    });

    it("should return empty array if owner has no items", async () => {
      spyOn(db.query.items, "findMany").mockResolvedValueOnce([]);

      const result = await getItemsByOwner("owner-123");

      expect(result).toHaveLength(0);
    });

    it("should only return active items", async () => {
      const activeItem = { ...mockItemData, isActive: true };
      spyOn(db.query.items, "findMany").mockResolvedValueOnce([
        activeItem,
      ] as any);

      const result = await getItemsByOwner("owner-123");

      expect(result).toHaveLength(1);
      expect(result[0]?.isActive).toBe(true);
    });
  });

  describe("getItemById", () => {
    it("should return item if exists and owned by user", async () => {
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(
        mockItemData as any,
      );

      const result = await getItemById("item-123", "owner-123");

      expect(result).toEqual(expectedItemResponse);
    });

    it("should return null if item does not exist", async () => {
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(undefined);

      const result = await getItemById("nonexistent-item", "owner-123");

      expect(result).toBeNull();
    });

    it("should return null if item is not owned by user", async () => {
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(undefined);

      const result = await getItemById("item-123", "different-owner");

      expect(result).toBeNull();
    });
  });

  describe("updateItem", () => {
    it("should update item successfully", async () => {
      const findSpy = spyOn(db.query.items, "findFirst").mockResolvedValueOnce(
        mockItemData as any,
      );

      const updatedItem = {
        ...mockItemData,
        name: "Updated Item",
        updatedAt: new Date(),
      };

      const returningMock = mock(() => Promise.resolve([updatedItem]));
      const whereMock = mock(() => ({ returning: returningMock }));
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, "update").mockReturnValue({ set: setMock } as any);

      const result = await updateItem("item-123", "owner-123", {
        name: "Updated Item",
      });

      expect(result?.name).toBe("Updated Item");
      expect(findSpy).toHaveBeenCalled();
    });

    it("should return null if item does not exist", async () => {
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(undefined);

      const result = await updateItem("nonexistent-item", "owner-123", {
        name: "Updated Item",
      });

      expect(result).toBeNull();
    });

    it("should throw error if update fails", async () => {
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(
        mockItemData as any,
      );

      const returningMock = mock(() => Promise.resolve([]));
      const whereMock = mock(() => ({ returning: returningMock }));
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, "update").mockReturnValue({ set: setMock } as any);

      await expect(
        updateItem("item-123", "owner-123", {
          name: "Updated Item",
        }),
      ).rejects.toThrow("Falha ao atualizar item");
    });

    it("should only update provided fields", async () => {
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(
        mockItemData as any,
      );

      const updatedItem = {
        ...mockItemData,
        description: "New description",
        updatedAt: new Date(),
      };

      const returningMock = mock(() => Promise.resolve([updatedItem]));
      const whereMock = mock(() => ({ returning: returningMock }));
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, "update").mockReturnValue({ set: setMock } as any);

      const result = await updateItem("item-123", "owner-123", {
        description: "New description",
      });

      expect(result?.description).toBe("New description");
    });
  });

  describe("deleteItem", () => {
    it("should soft delete item successfully", async () => {
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(
        mockItemData as any,
      );

      const returningMock = mock(() => Promise.resolve());
      const whereMock = mock(() => ({ returning: returningMock }));
      const setMock = mock(() => ({ where: whereMock }));
      spyOn(db, "update").mockReturnValue({ set: setMock } as any);

      const result = await deleteItem("item-123", "owner-123");

      expect(result).toBe(true);
    });

    it("should return false if item does not exist", async () => {
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(undefined);

      const result = await deleteItem("nonexistent-item", "owner-123");

      expect(result).toBe(false);
    });

    it("should mark item as inactive", async () => {
      const findFirstSpy = spyOn(
        db.query.items,
        "findFirst",
      ).mockResolvedValueOnce(mockItemData as any);

      const whereMock = mock(() => Promise.resolve());
      const setMock = mock(() => ({ where: whereMock }));
      const updateSpy = spyOn(db, "update").mockReturnValue({
        set: setMock,
      } as any);

      await deleteItem("item-123", "owner-123");

      expect(findFirstSpy).toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe("getItemByIdPublic", () => {
    it("should return active item", async () => {
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(
        mockItemData as any,
      );

      const result = await getItemByIdPublic("item-123");

      expect(result).toEqual(expectedItemResponse);
    });

    it("should return null if item does not exist", async () => {
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(undefined);

      const result = await getItemByIdPublic("nonexistent-item");

      expect(result).toBeNull();
    });

    it("should return null if item is inactive", async () => {
      const inactiveItem = { ...mockItemData, isActive: false };
      spyOn(db.query.items, "findFirst").mockResolvedValueOnce(
        inactiveItem as any,
      );

      const result = await getItemByIdPublic("item-123");

      expect(result?.isActive).toBeFalsy();
    });

    it("should not require ownership to fetch item", async () => {
      const findFirstSpy = spyOn(
        db.query.items,
        "findFirst",
      ).mockResolvedValueOnce(mockItemData as any);

      await getItemByIdPublic("item-123");

      expect(findFirstSpy).toHaveBeenCalled();
    });
  });
});
