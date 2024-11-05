import "reflect-metadata";
import { ItemBaseClassService } from "@spt/services/ItemBaseClassService";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ItemBaseClassService", () => {
    let itemBaseClassService: any;

    beforeEach(() => {
        itemBaseClassService = container.resolve<ItemBaseClassService>("ItemBaseClassService");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("hydrateItemBaseClassCache", () => {
        it("should hydrate itemBaseClassesCache dictionary property", () => {
            itemBaseClassService.cacheGenerated = false;
            itemBaseClassService.itemBaseClassesCache = {};
            itemBaseClassService.hydrateItemBaseClassCache();

            expect(Object.keys(itemBaseClassService.itemBaseClassesCache).length).greaterThan(100);
        });
    });

    describe("itemHasBaseClass", () => {
        it("should return false when undefined is passed in", () => {
            const result = itemBaseClassService.itemHasBaseClass(undefined, []);

            expect(result).toBe(false);
        });

        it("should return false when the base item type is passed in", () => {
            // Remove item from base cache
            const result = itemBaseClassService.itemHasBaseClass("54009119af1c881c07000029", []);

            expect(result).toBe(false);
        });

        it("should return true when a med item is passed in with the meds base class", () => {
            const salewaTpl = "544fb45d4bdc2dee738b4568";

            // Remove item from base cache
            delete itemBaseClassService.itemBaseClassesCache[salewaTpl];
            const result = itemBaseClassService.itemHasBaseClass(salewaTpl, ["543be5664bdc2dd4348b4569"]);

            expect(result).toBe(true);
        });

        it("should return true when an item and two matching base classes are passed in", () => {
            const salewaTpl = "544fb45d4bdc2dee738b4568";

            // Remove item from base cache
            delete itemBaseClassService.itemBaseClassesCache[salewaTpl];
            const result = itemBaseClassService.itemHasBaseClass(salewaTpl, [
                "543be5664bdc2dd4348b4569",
                "54009119af1c881c07000029",
            ]); // "Meds" and "Item" base classes

            expect(result).toBe(true);
        });

        it("should return true when an item is passed in and cache has not been generated", () => {
            // Set cache to false
            itemBaseClassService.cacheGenerated = false;

            const hydrateItemBaseClassCacheSpy = vi.spyOn(itemBaseClassService, "hydrateItemBaseClassCache");

            // Remove item from base cache
            const salewaTpl = "544fb45d4bdc2dee738b4568";
            delete itemBaseClassService.itemBaseClassesCache[salewaTpl];

            // Perform check
            const result = itemBaseClassService.itemHasBaseClass(salewaTpl, ["543be5664bdc2dd4348b4569"]);

            expect(result).toBe(true);
            expect(hydrateItemBaseClassCacheSpy).toHaveBeenCalled();
        });

        it("should return false for any item template ID that does not exist", () => {
            const result = itemBaseClassService.itemHasBaseClass("not-a-valid-template-id", [
                "543be5664bdc2dd4348b4569",
            ]);

            expect(result).toBe(false);
        });

        it("should return false for any item template ID without the Item type ", () => {
            const result = itemBaseClassService.itemHasBaseClass("54009119af1c881c07000029", [
                "543be5664bdc2dd4348b4569",
            ]);

            expect(result).toBe(false);
        });
    });

    describe("getItemBaseClasses", () => {
        it("should return empty array when undefined is passed in", () => {
            const result = itemBaseClassService.getItemBaseClasses(undefined);

            expect(result).toStrictEqual([]);
        });

        it("should return empty array when the base item type is passed in", () => {
            // Remove item from base cache
            const result = itemBaseClassService.getItemBaseClasses("54009119af1c881c07000029");

            expect(result).toStrictEqual([]);
        });

        it("should return array of 3 items when an item is passed in", () => {
            const salewaTpl = "544fb45d4bdc2dee738b4568";

            const result = itemBaseClassService.getItemBaseClasses(salewaTpl);

            expect(result.length).toBe(3);
        });

        it("should return array of 3 items when an item is passed in and cache has not been generated", () => {
            itemBaseClassService.cacheGenerated = false;
            const hydrateItemBaseClassCacheSpy = vi.spyOn(itemBaseClassService, "hydrateItemBaseClassCache");

            const salewaTpl = "544fb45d4bdc2dee738b4568";
            const result = itemBaseClassService.getItemBaseClasses(salewaTpl);

            expect(result.length).toBe(3);
            expect(hydrateItemBaseClassCacheSpy).toHaveBeenCalled();
        });

        it("should return base item type when an item is passed in", () => {
            const salewaTpl = "544fb45d4bdc2dee738b4568";
            const result = itemBaseClassService.getItemBaseClasses(salewaTpl);

            expect(result).toContain("54009119af1c881c07000029");
            expect(result).toContain("5448f39d4bdc2d0a728b4568");
        });

        it("should return empty array when an invalid item is passed in", () => {
            const result = itemBaseClassService.getItemBaseClasses("fakeTpl");
            expect(result).toStrictEqual([]);
        });
    });
});
