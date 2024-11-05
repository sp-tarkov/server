import "reflect-metadata";
import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { Money } from "@spt/models/enums/Money";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("HandbookHelper", () => {
    let handbookHelper: any;

    beforeEach(() => {
        handbookHelper = container.resolve<HandbookHelper>("HandbookHelper");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getTemplatePrice", () => {
        it("should return value greater than 1 when legitimate item is supplied and internal price cache not generated", () => {
            const result = handbookHelper.getTemplatePrice("544fb45d4bdc2dee738b4568"); // Salewa first aid kit
            expect(result).greaterThan(1);
        });

        it("should return value greater than 1 when legitimate item is supplied and internal price cache has been generated", () => {
            handbookHelper.lookupCacheGenerated = false;
            handbookHelper.getTemplatePrice("544fb45d4bdc2dee738b4568"); // Salewa first aid kit

            // Look up item second time now item cache exists
            const secondResult = handbookHelper.getTemplatePrice("544fb45d4bdc2dee738b4568"); // Salewa first aid kit
            expect(secondResult).greaterThan(1);
        });

        it("should return 0 when item not found in handbook is supplied and internal price cache has not been updated", () => {
            handbookHelper.lookupCacheGenerated = false;
            const result = handbookHelper.getTemplatePrice("fakeItem");

            expect(result).toBe(0);
        });

        it("should return 1 when item not found in handbook is supplied and internal price cache has been updated", () => {
            handbookHelper.lookupCacheGenerated = false;

            // Add item to cache
            handbookHelper.getTemplatePrice("modItemTpl");

            // Get item from cache
            const secondResult = handbookHelper.getTemplatePrice("modItemTpl");

            expect(secondResult).toBe(0);
        });
    });

    describe("templatesWithParent", () => {
        it("should return multiple items when supplied with Drinks category id", () => {
            const result = handbookHelper.templatesWithParent("5b47574386f77428ca22b335"); // Drinks category
            expect(result.length).greaterThan(5);
        });

        it("should return empty array when supplied with invalid id", () => {
            const result = handbookHelper.templatesWithParent("fakeCategory");
            expect(result.length).toBe(0);
        });
    });

    describe("inRUB", () => {
        it("should return 100 roubles when given 100 roubles", () => {
            const result = handbookHelper.inRUB(100, Money.ROUBLES);
            expect(result).toBe(100);
        });

        it("should return 0 roubles when given 0 roubles", () => {
            const result = handbookHelper.inRUB(0, Money.ROUBLES);
            expect(result).toBe(0);
        });

        it("should lookup currency value and multiply the input by the value", () => {
            // Mock the getTemplatePrice method to return a value of 100 roubles
            const getTemplatePriceSpy = vi.spyOn(handbookHelper, "getTemplatePrice").mockReturnValue(100);

            const result = handbookHelper.inRUB(5, Money.EUROS);

            expect(getTemplatePriceSpy).toHaveBeenCalled();
            expect(result).toBe(500);
        });

        it("should always return a whole number", () => {
            // Mock the getTemplatePrice method to return a value of 100 roubles
            const getTemplatePriceSpy = vi.spyOn(handbookHelper, "getTemplatePrice").mockReturnValue(123.321);

            const result = handbookHelper.inRUB(12.21, Money.EUROS);

            expect(getTemplatePriceSpy).toHaveBeenCalled();
            expect(result).toBe(1506);
        });
    });

    describe("fromRUB", () => {
        it("should return 100 roubles when given 100 roubles", () => {
            const result = handbookHelper.fromRUB(100, Money.ROUBLES);
            expect(result).toBe(100);
        });

        it("should return 0 roubles when given 0 roubles", () => {
            const result = handbookHelper.fromRUB(0, Money.ROUBLES);
            expect(result).toBe(0);
        });

        it("should return roughly 72 Dollars when given 10000 roubles ", () => {
            const result = handbookHelper.fromRUB(10000, Money.EUROS);
            expect(result).closeTo(72, 5);
        });
    });
});
