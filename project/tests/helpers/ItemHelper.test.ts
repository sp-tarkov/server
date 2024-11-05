import "reflect-metadata";

import { ItemHelper } from "@spt/helpers/ItemHelper";
import { IItem, IUpdRepairable } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { HashUtil } from "@spt/utils/HashUtil";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ItemHelper", () => {
    let itemHelper: ItemHelper;

    beforeEach(() => {
        itemHelper = container.resolve<ItemHelper>("ItemHelper");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("isValidItem", () => {
        it("should return false when item details are not available", () => {
            const result = itemHelper.isValidItem("non-existent-item");
            expect(result).toBe(false);
        });

        it("should return false when item is a quest item", () => {
            const result = itemHelper.isValidItem("590de92486f77423d9312a33"); // "Gold pocket watch on a chain"
            expect(result).toBe(false);
        });

        it("should return false when item is of an invalid base type", () => {
            const result = itemHelper.isValidItem("5fc64ea372b0dd78d51159dc", ["5447e1d04bdc2dff2f8b4567"]); // "Cultist knife"
            expect(result).toBe(false);
        });

        it("should return false when item's price is zero", () => {
            // Unsure if any item has price of "0", so mock the getItemPrice method to return 0.
            vi.spyOn(itemHelper, "getItemPrice").mockReturnValue(0);

            const result = itemHelper.isValidItem("5fc64ea372b0dd78d51159dc");
            expect(result).toBe(false);
        });

        it("should return false when item is in the blacklist", () => {
            const result = itemHelper.isValidItem("6087e570b998180e9f76dc24"); // "Superfors DB 2020 Dead Blow Hammer"
            expect(result).toBe(false);
        });

        it("should return true when item is valid", () => {
            const result = itemHelper.isValidItem("5fc64ea372b0dd78d51159dc"); // "Cultist knife"
            expect(result).toBe(true);
        });
    });

    describe("isOfBaseclass", () => {
        it("should return true when item has the given base class", () => {
            // ID 590c657e86f77412b013051d is a "Grizzly medical kit" of base class "MedKit".
            const result = itemHelper.isOfBaseclass("590c657e86f77412b013051d", "5448f39d4bdc2d0a728b4568");
            expect(result).toBe(true);
        });

        it("should return false when item does not have the given base class", () => {
            // ID 590c657e86f77412b013051d is a "Grizzly medical kit" not of base class "Knife".
            const result = itemHelper.isOfBaseclass("590c657e86f77412b013051d", "5447e1d04bdc2dff2f8b4567");
            expect(result).toBe(false);
        });
    });

    describe("isOfBaseclasses", () => {
        it("should return true when item has the given base class", () => {
            // ID 590c657e86f77412b013051d is a "Grizzly medical kit" of base class "MedKit".
            const result = itemHelper.isOfBaseclasses("590c657e86f77412b013051d", ["5448f39d4bdc2d0a728b4568"]);
            expect(result).toBe(true);
        });

        it("should return false when item does not have the given base class", () => {
            // ID 590c657e86f77412b013051d is a "Grizzly medical kit" not of base class "Knife".
            const result = itemHelper.isOfBaseclasses("590c657e86f77412b013051d", ["5447e1d04bdc2dff2f8b4567"]);
            expect(result).toBe(false);
        });
    });

    describe("getItemPrice", () => {
        it("should return static price when it is greater than or equal to 1", () => {
            const staticPrice = 1;
            const tpl = "590c657e86f77412b013051d";

            vi.spyOn(itemHelper, "getStaticItemPrice").mockReturnValue(staticPrice);

            const result = itemHelper.getItemPrice(tpl);

            expect(result).toBe(staticPrice);
        });

        it("should return dynamic price when static price is less than 1", () => {
            const staticPrice = 0;
            const dynamicPrice = 42069;
            const tpl = "590c657e86f77412b013051d";

            vi.spyOn(itemHelper, "getStaticItemPrice").mockReturnValue(staticPrice);
            vi.spyOn(itemHelper, "getDynamicItemPrice").mockReturnValue(dynamicPrice);

            const result = itemHelper.getItemPrice(tpl);

            // Failing because getDynamicItemPrice is called incorrectly.
            expect(result).toBe(dynamicPrice);
        });

        it("should return 0 when neither handbook nor dynamic price is available", () => {
            const tpl = "590c657e86f77412b013051d";

            vi.spyOn(itemHelper, "getStaticItemPrice").mockReturnValue(0);
            vi.spyOn(itemHelper, "getDynamicItemPrice").mockReturnValue(0);

            const result = itemHelper.getItemPrice(tpl);

            // Failing because getStaticItemPrice will return 1 on a failed lookup. ???
            expect(result).toBe(0);
        });
    });

    describe("getItemMaxPrice", () => {
        it("should return static price when it is higher", () => {
            const staticPrice = 420;
            const dynamicPrice = 69;
            const tpl = "590c657e86f77412b013051d";

            vi.spyOn(itemHelper, "getStaticItemPrice").mockReturnValue(staticPrice);
            vi.spyOn(itemHelper, "getDynamicItemPrice").mockReturnValue(dynamicPrice);

            const result = itemHelper.getItemMaxPrice(tpl);

            expect(result).toBe(staticPrice);
        });

        it("should return dynamic price when it is higher", () => {
            const staticPrice = 69;
            const dynamicPrice = 420;
            const tpl = "590c657e86f77412b013051d";

            vi.spyOn(itemHelper, "getStaticItemPrice").mockReturnValue(staticPrice);
            vi.spyOn(itemHelper, "getDynamicItemPrice").mockReturnValue(dynamicPrice);

            const result = itemHelper.getItemMaxPrice(tpl);

            expect(result).toBe(dynamicPrice);
        });

        it("should return either when both prices are equal", () => {
            const price = 42069;
            const tpl = "590c657e86f77412b013051d";

            vi.spyOn(itemHelper, "getStaticItemPrice").mockReturnValue(price);
            vi.spyOn(itemHelper, "getDynamicItemPrice").mockReturnValue(price);

            const result = itemHelper.getItemMaxPrice(tpl);

            expect(result).toBe(price);
        });

        it("should return 0 when item does not exist", () => {
            const tpl = "non-existent-item";

            const result = itemHelper.getItemMaxPrice(tpl);

            // Failing because getStaticItemPrice will return 1 on a failed lookup. ???
            expect(result).toBe(0);
        });
    });

    describe("getStaticItemPrice", () => {
        it("should return handbook price when it is greater than or equal to 1", () => {
            const price = 42069;
            const tpl = "590c657e86f77412b013051d";

            const handbookHelperGetTemplatePriceSpy = vi.spyOn((itemHelper as any).handbookHelper, "getTemplatePrice");
            handbookHelperGetTemplatePriceSpy.mockReturnValue(price);

            const result = itemHelper.getStaticItemPrice(tpl);

            expect(result).toBe(price);
        });

        it("should return 0 when handbook price is less than 1", () => {
            const price = 0;
            const tpl = "590c657e86f77412b013051d"; // "Grizzly medical kit"

            const handbookHelperGetTemplatePriceSpy = vi.spyOn((itemHelper as any).handbookHelper, "getTemplatePrice");
            handbookHelperGetTemplatePriceSpy.mockReturnValue(price);

            const result = itemHelper.getStaticItemPrice(tpl);

            expect(result).toBe(price);
        });
    });

    describe("getDynamicItemPrice", () => {
        it("should return the correct dynamic price when it exists", () => {
            const tpl = "590c657e86f77412b013051d"; // "Grizzly medical kit"

            const result = itemHelper.getDynamicItemPrice(tpl);

            expect(result).toBeGreaterThanOrEqual(1);
        });

        it("should return 0 when the dynamic price does not exist", () => {
            const tpl = "non-existent-item";

            const result = itemHelper.getDynamicItemPrice(tpl);

            expect(result).toBe(0);
        });
    });

    describe("fixItemStackCount", () => {
        it("should set upd.StackObjectsCount to 1 if upd is undefined", () => {
            const initialItem: IItem = { _id: "", _tpl: "" };
            const fixedItem = itemHelper.fixItemStackCount(initialItem);

            expect(fixedItem.upd).toBeDefined();
            expect(fixedItem.upd?.StackObjectsCount).toBe(1);
        });

        it("should set upd.StackObjectsCount to 1 if upd.StackObjectsCount is undefined", () => {
            const initialItem: IItem = { _id: "", _tpl: "", upd: {} };
            const fixedItem = itemHelper.fixItemStackCount(initialItem);

            expect(fixedItem.upd).toBeDefined();
            expect(fixedItem.upd?.StackObjectsCount).toBe(1);
        });

        it("should not change upd.StackObjectsCount if it is already defined", () => {
            const initialItem: IItem = { _id: "", _tpl: "", upd: { StackObjectsCount: 5 } };
            const fixedItem = itemHelper.fixItemStackCount(initialItem);

            expect(fixedItem.upd).toBeDefined();
            expect(fixedItem.upd?.StackObjectsCount).toBe(5);
        });
    });

    describe("getItems", () => {
        it("should call databaseService.getItems() and jsonUtil.clone() methods", () => {
            const databaseServerGetTablesSpy = vi.spyOn((itemHelper as any).databaseService, "getItems");
            const clonerSpy = vi.spyOn((itemHelper as any).cloner, "clone");

            itemHelper.getItems();

            expect(databaseServerGetTablesSpy).toHaveBeenCalled();
            expect(clonerSpy).toHaveBeenCalled();
        });

        it("should return a new array, not a reference to the original", () => {
            const tables = container.resolve<DatabaseServer>("DatabaseServer").getTables();
            const originalItems = Object.values(tables.templates.items);

            const clonedItems = itemHelper.getItems();

            // Change something in the cloned array
            clonedItems[0]._id = "modified";

            // Validate that the original array remains unchanged
            expect(originalItems[0]._id).not.toBe("modified");
        });
    });

    describe("getItem", () => {
        it("should return true and the item if the tpl exists", () => {
            // ID 590c657e86f77412b013051d is a "Grizzly medical kit".
            const tpl = "590c657e86f77412b013051d";
            const tables = container.resolve<DatabaseServer>("DatabaseServer").getTables();
            const item = tables.templates.items[tpl];

            const [isValid, returnedItem] = itemHelper.getItem(tpl);

            expect(isValid).toBe(true);
            expect(returnedItem).toBe(item);
        });

        it("should return false and undefined if the tpl does not exist", () => {
            const tpl = "non-existent-item";

            const [isValid, returnedItem] = itemHelper.getItem(tpl);

            expect(isValid).toBe(false);
            expect(returnedItem).toBeUndefined();
        });
    });

    describe("isItemInDb", () => {
        it("should return true if getItem returns true as the first element", () => {
            const tpl = "590c657e86f77412b013051d"; // "Grizzly medical kit"

            const result = itemHelper.isItemInDb(tpl);

            expect(result).toBe(true);
        });

        it("should return false if getItem returns false as the first element", () => {
            const tpl = "non-existent-item";

            const result = itemHelper.isItemInDb(tpl);

            expect(result).toBe(false);
        });

        it("should call getItem with the provided tpl", () => {
            const itemHelperSpy = vi.spyOn(itemHelper, "getItem");

            const tpl = "590c657e86f77412b013051d"; // "Grizzly medical kit"

            itemHelper.isItemInDb(tpl);

            expect(itemHelperSpy).toHaveBeenCalledWith(tpl);
        });
    });

    describe("getItemQualityModifier", () => {
        it("should return 1 for an item with no upd", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "590c657e86f77412b013051d", // "Grizzly medical kit"
            };

            const result = itemHelper.getItemQualityModifier(item);

            expect(result).toBe(1);
        });

        it("should return 1 for an item with upd but no relevant fields", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "590c657e86f77412b013051d", // "Grizzly medical kit"
                upd: {},
            };

            const result = itemHelper.getItemQualityModifier(item);

            expect(result).toBe(1);
        });

        it("should return correct value for a medkit", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "590c657e86f77412b013051d", // "Grizzly medical kit"
                upd: {
                    MedKit: {
                        HpResource: 900, // 1800 total
                    },
                },
            };

            const result = itemHelper.getItemQualityModifier(item);

            expect(result).toBe(0.5);
        });

        it("should return correct value for a repairable helmet", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "5b40e1525acfc4771e1c6611",
                upd: { Repairable: { Durability: 19, MaxDurability: 38 } },
            };

            const getRepairableItemQualityValueSpt = vi
                .spyOn(itemHelper as any, "getRepairableItemQualityValue")
                .mockReturnValue(0.5);

            const result = itemHelper.getItemQualityModifier(item);

            expect(getRepairableItemQualityValueSpt).toHaveBeenCalled();
            expect(result).toBe(0.5);
        });

        it("should return correct value for a reparable weapon", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "5a38e6bac4a2826c6e06d79b", // "TOZ-106 20ga bolt-action shotgun"
                upd: { Repairable: { Durability: 20, MaxDurability: 100 } },
            };

            const result = itemHelper.getItemQualityModifier(item);

            expect(result).toBeCloseTo(0.447);
        });

        it("should return correct value for a food or drink item", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "5448fee04bdc2dbc018b4567", // "Bottle of water (0.6L)"
                upd: {
                    FoodDrink: {
                        HpPercent: 30, // Not actually a percentage, but value of max 60.
                    },
                },
            };

            const result = itemHelper.getItemQualityModifier(item);

            expect(result).toBe(0.5);
        });

        it("should return correct value for a key item", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "5780cf7f2459777de4559322", // "Dorm room 314 marked key"
                upd: { Key: { NumberOfUsages: 5 } },
            };

            const result = itemHelper.getItemQualityModifier(item);

            expect(result).toBe(0.5);
        });

        it("should return correct value for a resource item", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "5d1b36a186f7742523398433", // "Metal fuel tank"
                upd: {
                    Resource: {
                        Value: 50, // How much fuel is left in the tank.
                        UnitsConsumed: 50, // How much fuel has been used in the generator.
                    },
                },
            };

            const result = itemHelper.getItemQualityModifier(item);

            expect(result).toBe(0.5);
        });

        it("should return correct value for a repair kit item", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "591094e086f7747caa7bb2ef", // "Body armor repair kit"
                upd: { RepairKit: { Resource: 600 } },
            };

            const result = itemHelper.getItemQualityModifier(item);

            expect(result).toBe(0.5);
        });

        it("should return 0.01 for an item with upd but all relevant fields are 0", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "591094e086f7747caa7bb2ef", // "Body armor repair kit"
                upd: { RepairKit: { Resource: 0 } },
            };

            const result = itemHelper.getItemQualityModifier(item);

            expect(result).toBe(0.01);
        });
    });

    describe("getRepairableItemQualityValue", () => {
        it("should return the correct quality value", () => {
            const weapon = itemHelper.getItem("5a38e6bac4a2826c6e06d79b")[1]; // "TOZ-106 20ga bolt-action shotgun"
            const repairable: IUpdRepairable = { Durability: 50, MaxDurability: 100 };
            const item: IItem = { _id: "", _tpl: "" };

            // Cast the method to any to allow access to private/protected method.
            const result = (itemHelper as any).getRepairableItemQualityValue(weapon, repairable, item);

            expect(result).toBe(Math.sqrt(0.5));
        });

        it("should fall back to using Repairable MaxDurability", () => {
            const weapon = itemHelper.getItem("5a38e6bac4a2826c6e06d79b")[1]; // "TOZ-106 20ga bolt-action shotgun"
            weapon._props.MaxDurability = undefined; // Remove the MaxDurability property.
            const repairable: IUpdRepairable = {
                Durability: 50,
                MaxDurability: 200, // This should be used now.
            };
            const item: IItem = { _id: "", _tpl: "" };

            // Cast the method to any to allow access to private/protected method.
            const result = (itemHelper as any).getRepairableItemQualityValue(weapon, repairable, item);

            expect(result).toBe(Math.sqrt(0.25));
        });

        it("should return 1 if durability value is invalid", () => {
            const weapon = itemHelper.getItem("5a38e6bac4a2826c6e06d79b")[1]; // "TOZ-106 20ga bolt-action shotgun"
            weapon._props.MaxDurability = undefined; // Remove the MaxDurability property.
            const repairable: IUpdRepairable = {
                Durability: 50,
                MaxDurability: undefined, // Remove the MaxDurability property value... Technically an invalid Type.
            };
            const item: IItem = { _id: "", _tpl: "" };

            // Mock the logger's error method to prevent it from being actually called.
            const loggerErrorSpy = vi.spyOn((itemHelper as any).logger, "error").mockImplementation(() => {});

            // Cast the method to any to allow access to private/protected method.
            const result = (itemHelper as any).getRepairableItemQualityValue(weapon, repairable, item);

            expect(loggerErrorSpy).toHaveBeenCalled();
            expect(result).toBe(1);
        });

        it("should not divide by zero", () => {
            const weapon = itemHelper.getItem("5a38e6bac4a2826c6e06d79b")[1]; // "TOZ-106 20ga bolt-action shotgun"
            weapon._props.MaxDurability = undefined; // Remove the MaxDurability property.
            const repairable: IUpdRepairable = {
                Durability: 50,
                MaxDurability: 0, // This is a problem.
            };
            const item: IItem = { _id: "", _tpl: "" };

            // Cast the method to any to allow access to private/protected method.
            const result = (itemHelper as any).getRepairableItemQualityValue(weapon, repairable, item);

            expect(result).toBe(1);
        });

        it("should log an error if durability is invalid", () => {
            const weapon = itemHelper.getItem("5a38e6bac4a2826c6e06d79b")[1]; // "TOZ-106 20ga bolt-action shotgun"
            weapon._props.MaxDurability = undefined; // Remove the MaxDurability property.
            const repairable: IUpdRepairable = {
                Durability: 50,
                MaxDurability: undefined, // Remove the MaxDurability property value... Technically an invalid Type.
            };
            const item: IItem = { _id: "", _tpl: "" };

            const loggerErrorSpy = vi.spyOn((itemHelper as any).logger, "error");

            // Cast the method to any to allow access to private/protected method.
            (itemHelper as any).getRepairableItemQualityValue(weapon, repairable, item);

            expect(loggerErrorSpy).toBeCalled();
        });
    });

    describe("findAndReturnChildrenByItems", () => {
        it("should return an array containing only the parent ID when no children are found", () => {
            const items: IItem[] = [
                { _id: "1", _tpl: "", parentId: null },
                { _id: "2", _tpl: "", parentId: null },
                {
                    _id: "3",
                    _tpl: "",
                    parentId: "2",
                },
            ];
            const result = itemHelper.findAndReturnChildrenByItems(items, "1");
            expect(result).toEqual(["1"]);
        });

        it("should return array of child IDs when single-level children are found", () => {
            const items: IItem[] = [
                { _id: "1", _tpl: "", parentId: null },
                { _id: "2", _tpl: "", parentId: "1" },
                {
                    _id: "3",
                    _tpl: "",
                    parentId: "1",
                },
            ];
            const result = itemHelper.findAndReturnChildrenByItems(items, "1");
            expect(result).toEqual(["2", "3", "1"]);
        });

        it("should return array of child IDs when multi-level children are found", () => {
            const items: IItem[] = [
                { _id: "1", _tpl: "", parentId: null },
                { _id: "2", _tpl: "", parentId: "1" },
                {
                    _id: "3",
                    _tpl: "",
                    parentId: "2",
                },
                { _id: "4", _tpl: "", parentId: "3" },
            ];
            const result = itemHelper.findAndReturnChildrenByItems(items, "1");
            expect(result).toEqual(["4", "3", "2", "1"]);
        });

        it("should return an array containing only the parent ID when parent ID does not exist in items", () => {
            const items: IItem[] = [
                { _id: "1", _tpl: "", parentId: null },
                { _id: "2", _tpl: "", parentId: "1" },
            ];
            const result = itemHelper.findAndReturnChildrenByItems(items, "3");
            expect(result).toEqual(["3"]);
        });
    });

    describe("getItemStackSize", () => {
        it("should return 1 when item has no existing stack size", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "591094e086f7747caa7bb2ef", // "Body armor repair kit"
                upd: {},
            };
            const result = itemHelper.getItemStackSize(item);
            expect(result).toBe(1);
        });

        it("should return 1 when item has no upd property", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "591094e086f7747caa7bb2ef", // "Body armor repair kit"
            };
            const result = itemHelper.getItemStackSize(item);
            expect(result).toBe(1);
        });

        it("should return 5 when item has existing stack size of 5", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "591094e086f7747caa7bb2ef", // "Body armor repair kit"
                upd: { StackObjectsCount: 5 },
            };
            const result = itemHelper.getItemStackSize(item);
            expect(result).toBe(5);
        });
    });

    describe("hasBuyRestrictions", () => {
        it("should return true when item has buy restriction current and max properties", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "591094e086f7747caa7bb2ef", // "Body armor repair kit"
                upd: { BuyRestrictionCurrent: 0, BuyRestrictionMax: 1 },
            };
            const result = itemHelper.hasBuyRestrictions(item);
            expect(result).toBe(true);
        });

        it("should return false when item has no buy restriction current or max properties but does have upd property", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "591094e086f7747caa7bb2ef", // "Body armor repair kit"
                upd: {},
            };
            const result = itemHelper.hasBuyRestrictions(item);
            expect(result).toBe(false);
        });

        it("should return false when item has no buy restriction current, max or upd properties", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const item: IItem = {
                _id: itemId,
                _tpl: "591094e086f7747caa7bb2ef", // "Body armor repair kit"
            };
            const result = itemHelper.hasBuyRestrictions(item);
            expect(result).toBe(false);
        });
    });

    describe("isDogtag", () => {
        it("should return true when tpl is a dogtag", () => {
            const result = itemHelper.isDogtag("59f32bb586f774757e1e8442"); // "Bear dogtag"
            expect(result).toBe(true);
        });

        it("should return false when tpl is not a dogtag", () => {
            const result = itemHelper.isDogtag("591094e086f7747caa7bb2ef"); // "Body armor repair kit"
            expect(result).toBe(false);
        });

        it("should return false when tpl is invalid", () => {
            const result = itemHelper.isDogtag("invalidTpl");
            expect(result).toBe(false);
        });
    });

    describe("addCartridgesToAmmoBox", () => {
        it("should return an array with 1x ammoBox and 1x cartridge item", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const ammoBox: IItem[] = [
                {
                    _id: itemId,
                    _tpl: "5c12619186f7743f871c8a32", // "9x39mm SPP gs ammo pack (8 pcs)"
                },
            ];

            const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
            const ammoBoxDetails = databaseServer.getTables().templates.items["5c12619186f7743f871c8a32"];
            itemHelper.addCartridgesToAmmoBox(ammoBox, ammoBoxDetails);

            expect(ammoBox.length).toBe(2);
            expect(ammoBox[1].upd.StackObjectsCount).toBe(8);
        });

        it("should return an array with 1x ammoBox and 2x cartridge items", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const ammoBox: IItem[] = [
                {
                    _id: itemId,
                    _tpl: "5737292724597765e5728562", // "5.45x39mm BP gs ammo pack (120 pcs)""
                },
            ];

            const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
            const ammoBoxDetails = databaseServer.getTables().templates.items["5737292724597765e5728562"];
            itemHelper.addCartridgesToAmmoBox(ammoBox, ammoBoxDetails);

            expect(ammoBox.length).toBe(3);
            expect(ammoBox[1].upd.StackObjectsCount).toBe(60);
            expect(ammoBox[2].upd.StackObjectsCount).toBe(60);
        });

        it("should keep original ammo box provided", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const ammoBox: IItem[] = [
                {
                    _id: itemId,
                    _tpl: "5737292724597765e5728562", // "5.45x39mm BP gs ammo pack (120 pcs)""
                },
            ];

            const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
            const ammoBoxDetails = databaseServer.getTables().templates.items["5737292724597765e5728562"];
            itemHelper.addCartridgesToAmmoBox(ammoBox, ammoBoxDetails);

            expect(ammoBox[0]._tpl).toBe("5737292724597765e5728562");
        });

        it("should return specific cartridge type for the given ammo box provided", () => {
            const itemId = container.resolve<HashUtil>("HashUtil").generate();
            const ammoBox: IItem[] = [
                {
                    _id: itemId,
                    _tpl: "5737292724597765e5728562", // "5.45x39mm BP gs ammo pack (120 pcs)""
                },
            ];

            const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
            const ammoBoxDetails = databaseServer.getTables().templates.items["5737292724597765e5728562"];
            itemHelper.addCartridgesToAmmoBox(ammoBox, ammoBoxDetails);

            expect(ammoBox[1]._tpl).toBe("56dfef82d2720bbd668b4567");
        });
    });

    describe("isItemTplStackable", () => {
        it("should return true for a stackable item", () => {
            const result = itemHelper.isItemTplStackable("5449016a4bdc2d6f028b456f"); // Roubles

            expect(result).toBe(true);
        });

        it("should return false for an unstackable item", () => {
            const result = itemHelper.isItemTplStackable("591094e086f7747caa7bb2ef"); // "Body armor repair kit"

            expect(result).toBe(false);
        });

        it("should return undefined for an unknown item", () => {
            const result = itemHelper.isItemTplStackable("fakeTpl");

            expect(result).toBe(undefined);
        });

        it("should return undefined for an empty input", () => {
            const result = itemHelper.isItemTplStackable("");

            expect(result).toBe(undefined);
        });
    });

    describe("getItemName", () => {
        it("should return item name for a valid item", () => {
            const result = itemHelper.getItemName("5449016a4bdc2d6f028b456f"); // "Roubles"

            expect(result).toBe("Roubles");
        });

        it("should return item short name for a valid item with empty full name", () => {
            const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
            databaseServer.getTables().locales.global.en["5449016a4bdc2d6f028b456f Name"] = "";
            const result = itemHelper.getItemName("5449016a4bdc2d6f028b456f"); // "Roubles"

            expect(result).toBe("RUB");
        });

        it("should return item short name for a valid item with undefined full name", () => {
            const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
            databaseServer.getTables().locales.global.en["5449016a4bdc2d6f028b456f Name"] = undefined;
            const result = itemHelper.getItemName("5449016a4bdc2d6f028b456f"); // "Roubles"

            expect(result).toBe("RUB");
        });

        it("should return undefined for invalid item", () => {
            const result = itemHelper.getItemName("fake tpl");

            expect(result).toBe(undefined);
        });

        it("should return undefined for empty string", () => {
            const result = itemHelper.getItemName("");

            expect(result).toBe(undefined);
        });

        it("should return undefined for undefined", () => {
            const result = itemHelper.getItemName(undefined);

            expect(result).toBe(undefined);
        });
    });

    describe("adoptOrphanedItems", () => {
        it("should adopt orphaned items by resetting them as base-level items", () => {
            const rootId = "root-id";
            const items = [
                { _id: "first-id", _tpl: "anything1", parentId: "does-not-exist", slotId: "main" },
                { _id: "second-id", _tpl: "anything2", parentId: "first-id", slotId: "slot-id" },
                { _id: "third-id", _tpl: "anything3", parentId: "second-id", slotId: "slot-id" },
                { _id: "forth-id", _tpl: "anything4", parentId: "third-id", slotId: "slot-id" },
            ];

            // Iterate over the items and find the individual orphaned item.
            const orphanedItem = items.find((item) => !items.some((parent) => parent._id === item.parentId));

            // Setup tests to verify that the orphaned item is in fact orphaned.
            expect(orphanedItem.parentId).toBe(items[0].parentId);
            expect(orphanedItem.slotId).toBe(items[0].slotId);

            // Execute the method.
            (itemHelper as any).adoptOrphanedItems(rootId, items);

            // Verify that the orphaned items have been adopted.
            expect(orphanedItem.parentId).toBe(rootId);
            expect(orphanedItem.slotId).toBe("hideout");
        });

        it("should not adopt items that are not orphaned", () => {
            const rootId = "root-id";
            const items = [
                { _id: "first-id", _tpl: "anything1", parentId: rootId, slotId: "hideout" },
                { _id: "second-id", _tpl: "anything2", parentId: "first-id", slotId: "slot-id" },
                { _id: "third-id", _tpl: "anything3", parentId: "second-id", slotId: "slot-id" },
                { _id: "forth-id", _tpl: "anything4", parentId: "third-id", slotId: "slot-id" },
            ];

            // Execute the method.
            const adopted = (itemHelper as any).adoptOrphanedItems(rootId, items);

            // Verify that the orphaned items have been adopted.
            expect(adopted).toStrictEqual(items);
        });

        it("should remove location data from adopted items", () => {
            const rootId = "root-id";
            const items = [
                {
                    _id: "first-id",
                    _tpl: "anything1",
                    parentId: "does-not-exist",
                    slotId: "main",
                    location: { x: 1, y: 2, r: 3, isSearched: true }, // Should be removed.
                },
                { _id: "second-id", _tpl: "anything2", parentId: "first-id", slotId: "slot-id" },
                { _id: "third-id", _tpl: "anything3", parentId: "second-id", slotId: "slot-id" },
                { _id: "forth-id", _tpl: "anything4", parentId: "third-id", slotId: "slot-id" },
            ];

            // Execute the method.
            (itemHelper as any).adoptOrphanedItems(rootId, items);

            // Verify that the location property has been removed.
            expect(items).not.toHaveProperty("location");
        });
    });

    describe("splitStack", () => {
        it("should return array of two items when provided item over its natural stack size limit", () => {
            const stackableItem: IItem = {
                _id: container.resolve<HashUtil>("HashUtil").generate(),
                _tpl: "59e690b686f7746c9f75e848", // m995
                upd: {
                    StackObjectsCount: 80, // Default is 60
                },
            };
            const result = itemHelper.splitStack(stackableItem); // "Roubles"

            expect(result.length).toBe(2);
        });

        it("should return same count of items passed in when provided is natural stack size limit", () => {
            const stackableItem: IItem = {
                _id: container.resolve<HashUtil>("HashUtil").generate(),
                _tpl: "59e690b686f7746c9f75e848", // m995
                upd: {
                    StackObjectsCount: 80, // Default is 60
                },
            };
            const result = itemHelper.splitStack(stackableItem); // "Roubles"
            const itemCount = result.reduce((sum, curr) => sum + curr.upd.StackObjectsCount, 0);
            expect(itemCount).toBe(80);
        });

        it("should return same item if below max stack size", () => {
            const stackableItem: IItem = {
                _id: container.resolve<HashUtil>("HashUtil").generate(),
                _tpl: "59e690b686f7746c9f75e848", // m995
                upd: {
                    StackObjectsCount: 60, // Default is 60
                },
            };
            const result = itemHelper.splitStack(stackableItem); // "Roubles"
            const itemCount = result.reduce((sum, curr) => sum + curr.upd.StackObjectsCount, 0);
            expect(itemCount).toBe(60);
            expect(result.length).toBe(1);
        });

        it("should return same item if item has no StackObjectsCount property", () => {
            const stackableItem: IItem = {
                _id: container.resolve<HashUtil>("HashUtil").generate(),
                _tpl: "59e690b686f7746c9f75e848", // m995
                upd: {},
            };
            const result = itemHelper.splitStack(stackableItem); // "Roubles"
            expect(result.length).toBe(1);
        });

        it("should return same item if item has no upd object", () => {
            const stackableItem: IItem = {
                _id: container.resolve<HashUtil>("HashUtil").generate(),
                _tpl: "59e690b686f7746c9f75e848", // m995
            };
            const result = itemHelper.splitStack(stackableItem); // "Roubles"
            expect(result.length).toBe(1);
        });
    });

    describe("getRandomCompatibleCaliberTemplateId", () => {
        it("should return an item from the passed template's cartridge filter array", () => {
            const validAmmoItems = [
                "5735ff5c245977640e39ba7e",
                "573601b42459776410737435",
                "573602322459776445391df1",
                "5736026a245977644601dc61",
                "573603562459776430731618",
                "573603c924597764442bd9cb",
                "5735fdcd2459776445391d61",
            ];
            const mockTemplateItem = {
                _id: "571a29dc2459771fb2755a6a",
                _name: "mag_tt_toz_std_762x25tt_8",
                _props: { Cartridges: [{ _props: { filters: [{ Filter: validAmmoItems }] } }] },
            };

            vi.spyOn((itemHelper as any).randomUtil, "getArrayValue").mockReturnValue(validAmmoItems[0]);

            const result = itemHelper.getRandomCompatibleCaliberTemplateId(mockTemplateItem as ITemplateItem);

            expect(validAmmoItems).toContain(result);
        });

        it("should return null when passed template has empty cartridge property", () => {
            const fakeTemplateItem = { _props: { Cartridges: [{}] } };
            const result = itemHelper.getRandomCompatibleCaliberTemplateId(fakeTemplateItem as ITemplateItem);

            expect(result).toBe(undefined);
        });

        it("should return null when undefined passed in", () => {
            const result = itemHelper.getRandomCompatibleCaliberTemplateId(undefined as ITemplateItem);

            expect(result).toBe(undefined);
        });

        it("should log a warning when the template cartridge can not be found", () => {
            const mockLoggerWarning = vi.spyOn((itemHelper as any).logger, "warning");

            itemHelper.getRandomCompatibleCaliberTemplateId(undefined as ITemplateItem);

            expect(mockLoggerWarning).toHaveBeenCalled();
        });
    });
});
