import "reflect-metadata";

import { beforeEach, describe, expect, it } from "@jest/globals";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { Money } from "@spt-aki/models/enums/Money";
import { TestHelper } from "../common/TestHelper";

let testHelper: TestHelper;

describe("test text", () =>
{
    beforeAll(async () => {
        testHelper = await TestHelper.fetchTestHelper();
    })
    
    let itemHelper: ItemHelper;
    beforeEach(() =>
    {
        itemHelper = testHelper.getTestItemHelper();
    });

    it("ItemHelper type check", () =>
    {
        expect(itemHelper).toBeInstanceOf(ItemHelper);
    });

    it("isDogtag() usec", () =>
    {
        expect(itemHelper.isDogtag("59f32c3b86f77472a31742f0")).toBe(true);
    });

    it("isDogtag() bear", () =>
    {
        expect(itemHelper.isDogtag("59f32bb586f774757e1e8442")).toBe(true);
    });

    it("isValidItem() valid item screwdriver", () =>
    {
        expect(itemHelper.isValidItem("590c2d8786f774245b1f03f3")).toBe(true); // screwdriver
    });

    it("isValidItem() invalid item tool base item", () =>
    {
        expect(itemHelper.isValidItem("57864bb7245977548b3b66c2")).toBe(false); // tool base item
    });

    it("isValidItem() invalid item tpl", () =>
    {
        expect(itemHelper.isValidItem("fakeitem")).toBe(false);
    });

    it("isValidItem() valid item with base type in blacklist", () =>
    {
        expect(itemHelper.isValidItem("5b3f3af486f774679e752c1f", [BaseClasses.ARMBAND])).toBe(false);
    });

    it("getItemPrice() valid screwdriver item", () =>
    {
        expect(itemHelper.getItemPrice("590c2d8786f774245b1f03f3")).toBe(3500); // screwdriver
    });

    it("getItemPrice() invalid tpl forces return of 0 price", () =>
    {
        expect(itemHelper.getItemPrice("fakeitem")).toBe(0);
    });

    it("fixItemStackCount() item with no upd object", () =>
    {
        const itemWithNoUpd: Item = {
            _id: "test",
            _tpl: "123456789"
        };
        const result = itemHelper.fixItemStackCount(itemWithNoUpd);
        expect(result.upd?.StackObjectsCount).toBe(1);
    });

    it("fixItemStackCount() item with upd object no StackObjectsCount property", () =>
    {
        const itemWithUpdNoStack: Item = {
            _id: "test",
            _tpl: "123456789",
            upd: {}
        };
        const result = itemHelper.fixItemStackCount(itemWithUpdNoStack);
        expect(result.upd?.StackObjectsCount).toBe(1);
    });

    it("fixItemStackCount() item with upd object and custom stack count", () =>
    {
        const itemWithUpdAndStack: Item = {
            _id: "test",
            _tpl: "123456789",
            upd: { StackObjectsCount: 2 }
        };
        const result = itemHelper.fixItemStackCount(itemWithUpdAndStack);
        expect(result.upd?.StackObjectsCount).toBe(2);
    });

    it("isNotSellable() non-sellable item (dollars money tpl)", () =>
    {
        expect(itemHelper.isNotSellable(Money.DOLLARS)).toBe(true);
    });

    it("isNotSellable() sellable item (screwdriver)", () =>
    {
        expect(itemHelper.isNotSellable("590c2d8786f774245b1f03f3")).toBe(false); // screwdriver
    });

    it("getItemStackSize() stack size of 4", () =>
    {
        const itemWithStackSizeOf4: Item = {
            _id: "",
            _tpl: "",
            upd: { StackObjectsCount: 4}
        };
        const result = itemHelper.getItemStackSize(itemWithStackSizeOf4);
        expect(result).toBe(4);
    });

    it("getItemStackSize() upd object no stack property", () =>
    {
        const itemWithUpdNoStack: Item = {
            _id: "",
            _tpl: "",
            upd: {}
        };
        const result = itemHelper.getItemStackSize(itemWithUpdNoStack);
        expect(result).toBe(1);
    });

    it("getItemStackSize() no upd object", () =>
    {
        const itemWithNoUpdObject: Item = {
            _id: "",
            _tpl: ""
        };
        const result = itemHelper.getItemStackSize(itemWithNoUpdObject);
        expect(result).toBe(1);
    });

    it("getItemQualityModifier() no upd object", () =>
    {
        const itemWithNoUpdObject: Item = {
            _id: "",
            _tpl: ""
        };
        const result = itemHelper.getItemQualityModifier(itemWithNoUpdObject);
        expect(result).toBe(1);
    });

    it("getItemQualityModifier() grizzly medkit with full hp", () =>
    {
        const medkitItem: Item = {
            _id: "",
            _tpl: "590c657e86f77412b013051d",
            upd: {
                MedKit: { 
                    HpResource: 1800
                }
            }
        };
        const result = itemHelper.getItemQualityModifier(medkitItem);
        expect(result).toBe(1);
    });

    it("getItemQualityModifier() grizzly medkit with 0 hp", () =>
    {
        const medkitItem: Item = {
            _id: "",
            _tpl: "590c657e86f77412b013051d",
            upd: {
                MedKit: { 
                    HpResource: 0
                }
            }
        };
        const result = itemHelper.getItemQualityModifier(medkitItem);
        expect(result).toBe(0.01);
    });

    it("getItemQualityModifier() repairable slick with full hp", () =>
    {
        const medkitItem: Item = {
            _id: "",
            _tpl: "5e4abb5086f77406975c9342",
            upd: {
                Repairable: { 
                    Durability: 80,
                    MaxDurability: 80
                }
            }
        };
        const result = itemHelper.getItemQualityModifier(medkitItem);
        expect(result).toBe(1);
    });

    it("getItemQualityModifier() repairable slick with 0 hp", () =>
    {
        const medkitItem: Item = {
            _id: "",
            _tpl: "5e4abb5086f77406975c9342",
            upd: {
                Repairable: { 
                    Durability: 0,
                    MaxDurability: 80
                }
            }
        };
        const result = itemHelper.getItemQualityModifier(medkitItem);
        expect(result).toBe(0.01);
    });

    it("getRepairableItemQualityValue() repairable MDR weapon with max durability", () =>
    {
        const mdrItem: Item = {
            _id: "",
            _tpl: "5c488a752e221602b412af63",
            upd: {
                Repairable: { 
                    Durability: 100,
                    MaxDurability: 100
                }
            }
        };

        const result = itemHelper.getItemQualityModifier(mdrItem);
        expect(result).toBe(1);
    });

    it("hasBuyRestrictions() item with restrictions, not reached", () =>
    {
        const item: Item = {
            _id: "",
            _tpl: "",
            upd: {
                BuyRestrictionCurrent: 0,
                BuyRestrictionMax: 5
            }
        };

        const result = itemHelper.hasBuyRestrictions(item);
        expect(result).toBe(true);
    });

    it("hasBuyRestrictions() item no restrictions defined", () =>
    {
        const item: Item = {
            _id: "",
            _tpl: "",
            upd: { }
        };

        const result = itemHelper.hasBuyRestrictions(item);
        expect(result).toBe(false);
    });

    it("doesItemOrParentsIdMatch() item doesnt exist", () =>
    {
        const result = itemHelper.doesItemOrParentsIdMatch("fakeTpl", []);
        expect(result).toBe(false);
    });

    it("isQuestItem() item is quest item", () =>
    {
        const result = itemHelper.isQuestItem("5ae9a3f586f7740aab00e4e6");
        expect(result).toBe(true);
    });

    it("isQuestItem() item is not quest item", () =>
    {
        const result = itemHelper.isQuestItem("590c392f86f77444754deb29");
        expect(result).toBe(false);
    });

    it("isQuestItem() invalid item tpl", () =>
    {
        const result = itemHelper.isQuestItem("faketpl");
        expect(result).toBe(false);
    });
});