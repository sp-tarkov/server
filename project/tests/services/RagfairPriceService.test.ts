import "reflect-metadata";
import { Money } from "@spt/models/enums/Money";
import { RagfairPriceService } from "@spt/services/RagfairPriceService";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("RagfairPriceService", () => {
    let ragfairPriceService: any; // Using "any" to access private/protected methods without type errors.

    beforeEach(() => {
        ragfairPriceService = container.resolve<RagfairPriceService>("RagfairPriceService");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getDynamicOfferPriceForOffer", () => {
        it("should return zero when empty offerItems array is passed", () => {
            const offerItems = [];
            const desiredCurrency = Money.ROUBLES;
            const isPackOffer = false;

            const price = ragfairPriceService.getDynamicOfferPriceForOffer(offerItems, desiredCurrency, isPackOffer);

            expect(price).toEqual(0);
        });

        it("should return non-zero number when valid item is passed", () => {
            const offerItems = [
                {
                    _id: "d445ea263cdfc5f278334264",
                    _tpl: "57e3dba62459770f0c32322b",
                    parentId: "631abbff398cc0170cbd3089",
                    slotId: "mod_pistol_grip",
                },
            ];
            const desiredCurrency = Money.ROUBLES;
            const isPackOffer = false;
            const expectedPrice = 42069;

            // Mock the getDynamicItemPrice method to return a static price.
            vi.spyOn(ragfairPriceService, "getDynamicItemPrice").mockReturnValue(expectedPrice);

            const price = ragfairPriceService.getDynamicOfferPriceForOffer(offerItems, desiredCurrency, isPackOffer);

            expect(price).toBe(expectedPrice);
        });

        it("should always return a whole number", () => {
            const offerItems = [
                {
                    _id: "d445ea263cdfc5f278334264",
                    _tpl: "57e3dba62459770f0c32322b",
                    parentId: "631abbff398cc0170cbd3089",
                    slotId: "mod_pistol_grip",
                },
            ];
            const desiredCurrency = Money.ROUBLES;
            const isPackOffer = false;
            const originalPrice = 42069.999999999;

            // Mock the getDynamicItemPrice method to return a static price.
            vi.spyOn(ragfairPriceService, "getDynamicItemPrice").mockReturnValue(originalPrice);

            const price = ragfairPriceService.getDynamicOfferPriceForOffer(offerItems, desiredCurrency, isPackOffer);

            expect(price).toBeGreaterThan(originalPrice);
            expect(price).toBe(Math.round(originalPrice));
        });

        it("should skip prices for soft armour inserts", () => {
            const offerItems = [
                {
                    _id: "d445ea263cdfc5f278334264",
                    _tpl: "657080a212755ae0d907ad04",
                    parentId: "631abbff398cc0170cbd3089",
                    slotId: "Soft_armor_front",
                },
            ];
            const desiredCurrency = Money.ROUBLES;
            const isPackOffer = false;

            // Mock the getDynamicItemPrice method.
            const getDynamicItemPriceSpy = vi.spyOn(ragfairPriceService, "getDynamicItemPrice");

            const price = ragfairPriceService.getDynamicOfferPriceForOffer(offerItems, desiredCurrency, isPackOffer);

            expect(price).toBe(0);
            expect(getDynamicItemPriceSpy).not.toHaveBeenCalled();
        });

        it("should not add value of mods to weapon preset", () => {
            const offerItems = [
                {
                    _id: "344d02bbf2102ce4e145bf35",
                    _tpl: "579204f224597773d619e051",
                    upd: {
                        StackObjectsCount: 1,
                        UnlimitedCount: true,
                        sptPresetId: "5841499024597759f825ff3e",
                        Repairable: { Durability: 90, MaxDurability: 90 },
                    },
                },
                {
                    _id: "59c6897a59ed48f1ca02f659",
                    _tpl: "5448c12b4bdc2d02308b456f",
                    parentId: "344d02bbf2102ce4e145bf35",
                    slotId: "mod_magazine",
                },
                {
                    _id: "7e8062d4bc57b56927c2d117",
                    _tpl: "6374a822e629013b9c0645c8",
                    parentId: "344d02bbf2102ce4e145bf35",
                    slotId: "mod_reciever",
                },
                {
                    _id: "3b09149e8b7833dc5fdd32a4",
                    _tpl: "63c6adcfb4ba094317063742",
                    parentId: "7e8062d4bc57b56927c2d117",
                    slotId: "mod_sight_rear",
                },
                {
                    _id: "e833a5c26af29870df9cdd2e",
                    _tpl: "6374a7e7417239a7bf00f042",
                    parentId: "344d02bbf2102ce4e145bf35",
                    slotId: "mod_pistolgrip",
                },
            ];
            const desiredCurrency = Money.ROUBLES;
            const isPackOffer = false;
            const expectedPrice = 10000;

            // Mock the getDynamicItemPrice method to return a static price.
            const getDynamicItemPriceSpy = vi
                .spyOn(ragfairPriceService, "getDynamicItemPrice")
                .mockReturnValue(expectedPrice);

            const price = ragfairPriceService.getDynamicOfferPriceForOffer(offerItems, desiredCurrency, isPackOffer);

            expect(price).toBe(expectedPrice);
            expect(getDynamicItemPriceSpy).toHaveBeenCalledTimes(1);
        });

        it("should sum value of all offer items", () => {
            const offerItems = [
                {
                    _id: "59c6897a59ed48f1ca02f659",
                    _tpl: "5448c12b4bdc2d02308b456f",
                    parentId: "344d02bbf2102ce4e145bf35",
                    slotId: "mod_magazine",
                },
                {
                    _id: "7e8062d4bc57b56927c2d117",
                    _tpl: "6374a822e629013b9c0645c8",
                    parentId: "344d02bbf2102ce4e145bf35",
                    slotId: "mod_reciever",
                },
                {
                    _id: "3b09149e8b7833dc5fdd32a4",
                    _tpl: "63c6adcfb4ba094317063742",
                    parentId: "7e8062d4bc57b56927c2d117",
                    slotId: "mod_sight_rear",
                },
                {
                    _id: "e833a5c26af29870df9cdd2e",
                    _tpl: "6374a7e7417239a7bf00f042",
                    parentId: "344d02bbf2102ce4e145bf35",
                    slotId: "mod_pistolgrip",
                },
            ];
            const desiredCurrency = Money.ROUBLES;
            const isPackOffer = false;
            const expectedPrice = 10000;

            // Mock the getDynamicItemPrice method to return a static price.
            const getDynamicItemPriceSpy = vi
                .spyOn(ragfairPriceService, "getDynamicItemPrice")
                .mockReturnValue(expectedPrice);

            const price = ragfairPriceService.getDynamicOfferPriceForOffer(offerItems, desiredCurrency, isPackOffer);

            expect(price).toBe(expectedPrice * offerItems.length);
            expect(getDynamicItemPriceSpy).toHaveBeenCalledTimes(offerItems.length);
        });
    });

    describe("getDynamicItemPrice", () => {
        it("should not return zero for a valid template ID", () => {
            const itemTemplateId = "5e54f6af86f7742199090bf3";
            const desiredCurrency = Money.ROUBLES;

            const price = ragfairPriceService.getDynamicItemPrice(itemTemplateId, desiredCurrency);

            expect(price).not.toBe(0);
        });

        it("should use trader price if it is higher than flea price and configuration allows it", () => {
            const itemTemplateId = "5e54f6af86f7742199090bf3";
            const desiredCurrency = Money.ROUBLES;
            const mockTraderPrice = 20000;
            const mockFleaPrice = 15000;
            const getOfferTypeRangeValues = { max: 1, min: 1 };

            // Mock the configs to allow using trader price if higher. Disable other adjustments for isolation.
            ragfairPriceService.ragfairConfig.dynamic.offerAdjustment.adjustPriceWhenBelowHandbookPrice = false;
            ragfairPriceService.ragfairConfig.dynamic.useTraderPriceForOffersIfHigher = true;
            ragfairPriceService.ragfairConfig.dynamic.itemPriceMultiplier[itemTemplateId] = null;

            // Mock the getFleaPriceForItem method to return a static price.
            vi.spyOn(ragfairPriceService, "getFleaPriceForItem").mockReturnValue(mockFleaPrice);

            // Mock the getHighestSellToTraderPrice method to return a higher static price.
            vi.spyOn((ragfairPriceService as any).traderHelper, "getHighestSellToTraderPrice").mockReturnValue(
                mockTraderPrice,
            );

            // Mock the getOfferTypeRangeValues method to return a static minMax.
            vi.spyOn(ragfairPriceService, "getOfferTypeRangeValues").mockReturnValue(getOfferTypeRangeValues);

            // Call the method.
            const price = ragfairPriceService.getDynamicItemPrice(itemTemplateId, desiredCurrency);

            expect(price).toBe(mockTraderPrice);
        });

        it("should adjust flea price when below handbook price and configuration allows it", () => {
            const itemTemplateId = "5e54f6af86f7742199090bf3";
            const desiredCurrency = Money.ROUBLES;
            const mockFleaPrice = 1;
            const handbookPrice = 10000;
            const adjustedPrice = 9000;
            const getOfferTypeRangeValues = { max: 1, min: 1 };

            // Enable adjustment for prices below handbook price. Disable other adjustments for isolation.
            ragfairPriceService.ragfairConfig.dynamic.offerAdjustment.adjustPriceWhenBelowHandbookPrice = true;
            ragfairPriceService.ragfairConfig.dynamic.useTraderPriceForOffersIfHigher = false;
            ragfairPriceService.ragfairConfig.dynamic.itemPriceMultiplier[itemTemplateId] = null;

            // Mock the getFleaPriceForItem method to return a static price below the handbook price.
            vi.spyOn(ragfairPriceService, "getFleaPriceForItem").mockReturnValue(mockFleaPrice);

            // Mock the adjustPriceIfBelowHandbook method to simulate price adjustment.
            vi.spyOn(ragfairPriceService, "adjustPriceIfBelowHandbook").mockImplementation(
                (price: number, templateId) => {
                    return price < handbookPrice ? adjustedPrice : price;
                },
            );

            // Mock the getOfferTypeRangeValues method to return a static minMax.
            vi.spyOn(ragfairPriceService, "getOfferTypeRangeValues").mockReturnValue(getOfferTypeRangeValues);

            // Call the method.
            const price = ragfairPriceService.getDynamicItemPrice(itemTemplateId, desiredCurrency);

            // Verify the price is adjusted correctly according to the mocked handbook price adjustment logic.
            expect(price).toBe(adjustedPrice);
        });

        it("should handle weapon preset prices correctly", () => {
            const itemTemplateId = "579204f224597773d619e051";
            const desiredCurrency = Money.ROUBLES;
            const mockPresetPrice = 25000;
            const getOfferTypeRangeValues = { max: 1, min: 1 };
            const offerItems = [
                {
                    _id: "344d02bbf2102ce4e145bf35",
                    _tpl: "579204f224597773d619e051",
                    upd: {
                        StackObjectsCount: 1,
                        UnlimitedCount: true,
                        sptPresetId: "5841499024597759f825ff3e",
                        Repairable: { Durability: 90, MaxDurability: 90 },
                    },
                },
                {
                    _id: "7e8062d4bc57b56927c2d117",
                    _tpl: "6374a822e629013b9c0645c8",
                    parentId: "344d02bbf2102ce4e145bf35",
                    slotId: "mod_reciever",
                },
            ];
            const item = offerItems[0];

            // Disable other adjustments for isolation.
            ragfairPriceService.ragfairConfig.dynamic.offerAdjustment.adjustPriceWhenBelowHandbookPrice = false;
            ragfairPriceService.ragfairConfig.dynamic.useTraderPriceForOffersIfHigher = false;
            ragfairPriceService.ragfairConfig.dynamic.itemPriceMultiplier[itemTemplateId] = null;

            // Mock getFleaPriceForItem to bypass initial flea price fetch
            vi.spyOn(ragfairPriceService, "getFleaPriceForItem").mockReturnValue(0);

            // Mock the isPresetBaseClass method to return true for the item
            vi.spyOn((ragfairPriceService as any).presetHelper, "isPresetBaseClass").mockReturnValue(true);

            // Mock the getWeaponPresetPrice method to return a specific preset price
            const getWeaponPresetPriceSpy = vi
                .spyOn(ragfairPriceService, "getWeaponPresetPrice")
                .mockReturnValue(mockPresetPrice);

            // Mock the getOfferTypeRangeValues method to return a static minMax.
            vi.spyOn(ragfairPriceService, "getOfferTypeRangeValues").mockReturnValue(getOfferTypeRangeValues);

            // Mock the getItemQualityModifier method to return 1 (no change)
            vi.spyOn((ragfairPriceService as any).itemHelper, "getItemQualityModifier").mockReturnValue(1);

            // Call the method with the mock item and offer items
            const price = ragfairPriceService.getDynamicItemPrice(itemTemplateId, desiredCurrency, item, offerItems);

            // Call the method.
            expect(price).toBe(mockPresetPrice);

            // Additionally, you can verify that getWeaponPresetPrice was called with the correct parameters
            expect(getWeaponPresetPriceSpy).toHaveBeenCalledWith(item, offerItems, expect.any(Number));
        });

        it("should update price based on the ragfair config item price multiplier values", () => {
            const itemTemplateId = "5e54f6af86f7742199090bf3";
            const desiredCurrency = Money.ROUBLES;
            const mockFleaPrice = 20000;
            const itemPriceMultiplier = 2;
            const getOfferTypeRangeValues = { max: 1, min: 1 };

            // Mock the ragfair config to have a price multiplier of 2. Disable other adjustments for isolation.
            ragfairPriceService.ragfairConfig.dynamic.itemPriceMultiplier[itemTemplateId] = itemPriceMultiplier;
            ragfairPriceService.ragfairConfig.dynamic.offerAdjustment.adjustPriceWhenBelowHandbookPrice = false;
            ragfairPriceService.ragfairConfig.dynamic.useTraderPriceForOffersIfHigher = false;

            // Mock the getFleaPriceForItem method to return a static price.
            vi.spyOn(ragfairPriceService, "getFleaPriceForItem").mockReturnValue(mockFleaPrice);

            // Mock the getOfferTypeRangeValues method to return a static minMax.
            vi.spyOn(ragfairPriceService, "getOfferTypeRangeValues").mockReturnValue(getOfferTypeRangeValues);

            // Call the method.
            const price = ragfairPriceService.getDynamicItemPrice(itemTemplateId, desiredCurrency);

            expect(price).toBe(mockFleaPrice * itemPriceMultiplier);
        });

        it("should adjust price when durability is not perfect", () => {
            const itemTemplateId = "579204f224597773d619e051";
            const desiredCurrency = Money.ROUBLES;
            const mockPrice = 25000;
            const mockDurabilityMulti = 0.5;
            const getOfferTypeRangeValues = { max: 1, min: 1 };
            const offerItems = [
                {
                    _id: "344d02bbf2102ce4e145bf35",
                    _tpl: "579204f224597773d619e051",
                    upd: {
                        StackObjectsCount: 1,
                        UnlimitedCount: true,
                        sptPresetId: "5841499024597759f825ff3e",
                        Repairable: { Durability: 40, MaxDurability: 90 },
                    },
                },
                {
                    _id: "7e8062d4bc57b56927c2d117",
                    _tpl: "6374a822e629013b9c0645c8",
                    parentId: "344d02bbf2102ce4e145bf35",
                    slotId: "mod_reciever",
                },
            ];
            const item = offerItems[0];

            // Disable other adjustments for isolation.
            ragfairPriceService.ragfairConfig.dynamic.offerAdjustment.adjustPriceWhenBelowHandbookPrice = false;
            ragfairPriceService.ragfairConfig.dynamic.useTraderPriceForOffersIfHigher = false;
            ragfairPriceService.ragfairConfig.dynamic.itemPriceMultiplier[itemTemplateId] = null;

            // Mock getFleaPriceForItem to bypass initial flea price fetch
            vi.spyOn(ragfairPriceService, "getFleaPriceForItem").mockReturnValue(0);

            // Mock the isPresetBaseClass method to return true for the item
            vi.spyOn((ragfairPriceService as any).presetHelper, "isPresetBaseClass").mockReturnValue(true);

            // Mock the getWeaponPresetPrice method to return a specific preset price
            vi.spyOn(ragfairPriceService, "getWeaponPresetPrice").mockReturnValue(mockPrice);

            // Mock the getOfferTypeRangeValues method to return a static minMax.
            vi.spyOn(ragfairPriceService, "getOfferTypeRangeValues").mockReturnValue(getOfferTypeRangeValues);

            // Mock the getItemQualityModifier method to return 1 (no change)
            const getItemQualityModifierSpy = vi
                .spyOn((ragfairPriceService as any).itemHelper, "getItemQualityModifier")
                .mockReturnValue(mockDurabilityMulti);

            // Call the method.
            const price = ragfairPriceService.getDynamicItemPrice(itemTemplateId, desiredCurrency, item, offerItems);

            expect(getItemQualityModifierSpy).toHaveBeenCalled();
            expect(price).toBe(mockPrice * mockDurabilityMulti);
        });

        it("should adjust unreasonable prices based on ragfair config unreasonable price values", () => {
            const itemTemplateId = "5c052f6886f7746b1e3db148";
            const desiredCurrency = Money.ROUBLES;
            const mockFleaPrice = 9999999;
            const getOfferTypeRangeValues = { max: 1, min: 1 };
            const mockBaseClassTemplateId = "57864a66245977548f04a81f";
            const mockUnreasonableModPrices = {
                itemType: "Electronics",
                enabled: true,
                handbookPriceOverMultiplier: 11,
                newPriceHandbookMultiplier: 11,
            };

            // Mock the Disable unreasonableModPrices config. Disable other adjustments for isolation.
            ragfairPriceService.ragfairConfig.dynamic.unreasonableModPrices[mockBaseClassTemplateId] =
                mockUnreasonableModPrices;
            ragfairPriceService.ragfairConfig.dynamic.offerAdjustment.adjustPriceWhenBelowHandbookPrice = false;
            ragfairPriceService.ragfairConfig.dynamic.useTraderPriceForOffersIfHigher = false;
            ragfairPriceService.ragfairConfig.dynamic.itemPriceMultiplier[itemTemplateId] = null;

            // Mock getFleaPriceForItem to bypass initial flea price fetch
            vi.spyOn(ragfairPriceService, "getFleaPriceForItem").mockReturnValue(mockFleaPrice);

            // Mock isOfBaseclass to ensure that the item is always of the base class
            const isOfBaseclassSpy = vi
                .spyOn((ragfairPriceService as any).itemHelper, "isOfBaseclass")
                .mockReturnValue(true);

            // Mock the adjustUnreasonablePrice method to ensure it was called
            const adjustUnreasonablePriceSpy = vi.spyOn(ragfairPriceService, "adjustUnreasonablePrice");

            // Mock the getOfferTypeRangeValues method to return a static minMax
            vi.spyOn(ragfairPriceService, "getOfferTypeRangeValues").mockReturnValue(getOfferTypeRangeValues);

            // Call the method.
            const price = ragfairPriceService.getDynamicItemPrice(itemTemplateId, desiredCurrency);

            expect(isOfBaseclassSpy).toHaveBeenCalled();
            expect(adjustUnreasonablePriceSpy).toHaveBeenCalled();
            expect(price).toBeLessThan(mockFleaPrice);
        });

        it("should vary the price within a random range", () => {
            const itemTemplateId = "5e54f6af86f7742199090bf3";
            const desiredCurrency = Money.ROUBLES;
            const mockFleaPrice = 10000;
            const mockRandomiseOfferPrice = 9500;

            // Mock the configs to allow using trader price if higher. Disable other adjustments for isolation.
            ragfairPriceService.ragfairConfig.dynamic.offerAdjustment.adjustPriceWhenBelowHandbookPrice = false;
            ragfairPriceService.ragfairConfig.dynamic.useTraderPriceForOffersIfHigher = false;
            ragfairPriceService.ragfairConfig.dynamic.itemPriceMultiplier[itemTemplateId] = null;

            // Mock the getFleaPriceForItem method to return a static price
            vi.spyOn(ragfairPriceService, "getFleaPriceForItem").mockReturnValue(mockFleaPrice);

            // Mock the isPresetBaseClass method to return false
            vi.spyOn((ragfairPriceService as any).presetHelper, "isPresetBaseClass").mockReturnValue(false);

            // Mock the randomiseOfferPrice method to have a simplified implementation
            const randomiseOfferPriceSpy = vi
                .spyOn(ragfairPriceService, "randomiseOfferPrice")
                .mockReturnValue(mockRandomiseOfferPrice);

            // Call the method.
            const price = ragfairPriceService.getDynamicItemPrice(itemTemplateId, desiredCurrency);

            expect(randomiseOfferPriceSpy).toHaveBeenCalled();
            expect(price).toBe(mockRandomiseOfferPrice);
        });

        it("should convert currency", () => {
            const itemTemplateId = "5e54f6af86f7742199090bf3";
            const desiredCurrency = Money.DOLLARS;
            const mockRoublePrice = 10000;
            const mockDollarPrice = 500;
            const getOfferTypeRangeValues = { max: 1, min: 1 };

            // Mock the configs to allow using trader price if higher. Disable other adjustments for isolation.
            ragfairPriceService.ragfairConfig.dynamic.offerAdjustment.adjustPriceWhenBelowHandbookPrice = false;
            ragfairPriceService.ragfairConfig.dynamic.useTraderPriceForOffersIfHigher = false;
            ragfairPriceService.ragfairConfig.dynamic.itemPriceMultiplier[itemTemplateId] = null;

            // Mock the getFleaPriceForItem method to return a static price.
            vi.spyOn(ragfairPriceService, "getFleaPriceForItem").mockReturnValue(mockRoublePrice);

            // Mock the getOfferTypeRangeValues method to return a static minMax
            vi.spyOn(ragfairPriceService, "getOfferTypeRangeValues").mockReturnValue(getOfferTypeRangeValues);

            // Mock the fromRUB method to convert the price to a different currency
            const fromRUBSpy = vi
                .spyOn((ragfairPriceService as any).handbookHelper, "fromRUB")
                .mockReturnValue(mockDollarPrice);

            // Call the method.
            const price = ragfairPriceService.getDynamicItemPrice(itemTemplateId, desiredCurrency);

            expect(fromRUBSpy).toHaveBeenCalledWith(mockRoublePrice, desiredCurrency);
            expect(price).not.toBe(mockRoublePrice);
            expect(price).toBe(mockDollarPrice);
        });
    });
});
