import "reflect-metadata";

import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITraderBase } from "@spt/models/eft/common/tables/ITrader";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBuyTradeRequestData } from "@spt/models/eft/trade/IProcessBuyTradeRequestData";
import { PaymentService } from "@spt/services/PaymentService";
import { HashUtil } from "@spt/utils/HashUtil";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("PaymentService", () => {
    let paymentService: any; // Using "any" to access private/protected methods without type errors.

    beforeEach(() => {
        paymentService = container.resolve<PaymentService>("PaymentService");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("payMoney", () => {
        it("should output a currency change when a single non-barter item is purchased from a trader", () => {
            const hashUtil = container.resolve<HashUtil>("HashUtil");

            const traderId = "54cb57776803fa99248b456e"; // Therapist
            const purchaseItemId = hashUtil.generate(); // Inconsequential ID
            const purchaseQuantity = 1; // The amount of the items that the player is purchasing.
            const costItemId = hashUtil.generate(); // Inconsequential ID
            const costItemTpl = "5449016a4bdc2d6f028b456f"; // Roubles
            const costAmount = 17896; // The amount of roubles that the item costs.

            // Object representing a money item.
            const moneyItem = {
                _id: costItemId,
                _tpl: costItemTpl,
                upd: {
                    StackObjectsCount: costAmount * 4, // More than enough.
                },
            } as IItem;

            // Object representing the player's PMC inventory.
            const pmcData = {
                TradersInfo: { [traderId]: { salesSum: 0, unlocked: true, disabled: false } },
                Inventory: { items: [moneyItem] },
            } as unknown as IPmcData;

            // Buy a factory map from Therapist... although it doesn't really matter what the item is as there's no
            // template ID provided in the request data, just the ID.
            const processBuyTradeRequestData = {
                Action: "TradingConfirm",
                type: "buy_from_trader",
                tid: traderId,
                item_id: purchaseItemId,
                count: purchaseQuantity,
                scheme_id: 0,
                scheme_items: [{ id: costItemId, count: costAmount }],
            } as IProcessBuyTradeRequestData;

            // Inconsequential profile ID
            const sessionID = hashUtil.generate();

            const itemEventRouterResponse = {
                warnings: [],
                profileChanges: { [sessionID]: { _id: sessionID, items: { new: [], change: [], del: [] } } },
            } as unknown as IItemEventRouterResponse;

            // Mock the logger debug method to return void.
            vi.spyOn((paymentService as any).logger, "debug").mockResolvedValue(undefined);

            // Mock the trader helper to return a trader with the currency of Roubles.
            const getTraderSpy = vi
                .spyOn((paymentService as any).traderHelper, "getTrader")
                .mockReturnValue({ tid: traderId, currency: "RUB" } as unknown as ITraderBase);

            // Mock the addPaymentToOutput method to subtract the item cost from the money stack.
            const addPaymentToOutputSpy = vi
                .spyOn(paymentService as any, "addPaymentToOutput")
                .mockImplementation(
                    (
                        pmcData: IPmcData,
                        currencyTpl: string,
                        amountToPay: number,
                        sessionIdentifier: string,
                        output: IItemEventRouterResponse,
                    ) => {
                        moneyItem.upd.StackObjectsCount -= costAmount;
                        output.profileChanges[sessionIdentifier].items.change.push(moneyItem);
                    },
                );

            // Mock the traderHelper lvlUp method to return void.
            const lvlUpSpy = vi.spyOn((paymentService as any).traderHelper, "lvlUp").mockResolvedValue(undefined);

            paymentService.payMoney(pmcData, processBuyTradeRequestData, sessionID, itemEventRouterResponse);

            // Check for absence of output warnings.
            expect(itemEventRouterResponse.warnings).toHaveLength(0);

            // Check that the currency change was correctly handled.
            expect(itemEventRouterResponse.profileChanges[sessionID].items.change).toHaveLength(1);
            expect(itemEventRouterResponse.profileChanges[sessionID].items.change[0]._id).toBe(costItemId);
            expect(itemEventRouterResponse.profileChanges[sessionID].items.change[0]._tpl).toBe(costItemTpl);
            expect(itemEventRouterResponse.profileChanges[sessionID].items.change[0].upd.StackObjectsCount).toBe(
                costAmount * 3,
            );

            // Check if mocked methods were called as expected.
            expect(getTraderSpy).toBeCalledTimes(1);
            expect(addPaymentToOutputSpy).toBeCalledWith(
                expect.anything(),
                costItemTpl,
                costAmount,
                sessionID,
                expect.anything(),
            );
            expect(lvlUpSpy).toBeCalledTimes(1);
        });
    });

    describe("isInStash", () => {
        it("should return true when item is direct parent of stash", () => {
            const hashUtil = container.resolve<HashUtil>("HashUtil");
            const stashItem: IItem = {
                _id: "stashid",
                _tpl: "55d7217a4bdc2d86028b456d", // standard stash id
            };

            const inventoryItemToFind: IItem = {
                _id: hashUtil.generate(),
                _tpl: "544fb6cc4bdc2d34748b456e", // Slickers chocolate bar
                parentId: stashItem._id,
                slotId: "hideout",
            };
            const playerInventory = [stashItem, inventoryItemToFind];

            const result = paymentService.isInStash(inventoryItemToFind._id, playerInventory, stashItem._id);

            expect(result).toBe(true);
        });

        it("should return true when item is indirect parent of inventory", () => {
            const hashUtil = container.resolve<HashUtil>("HashUtil");
            const stashItem: IItem = {
                _id: "stashId",
                _tpl: "55d7217a4bdc2d86028b456d", // standard stash id
            };

            const foodBagToHoldItemToFind: IItem = {
                _id: hashUtil.generate(),
                _tpl: "5c093db286f7740a1b2617e3",
                parentId: stashItem._id,
                slotId: "hideout",
            };

            const inventoryItemToFind: IItem = {
                _id: hashUtil.generate(),
                _tpl: "544fb6cc4bdc2d34748b456e", // Slickers chocolate bar
                parentId: foodBagToHoldItemToFind._id,
            };
            const playerInventory = [stashItem, foodBagToHoldItemToFind, inventoryItemToFind];

            const result = paymentService.isInStash(inventoryItemToFind._id, playerInventory, stashItem._id);

            expect(result).toBe(true);
        });

        it("should return false when desired item is not in inventory", () => {
            const hashUtil = container.resolve<HashUtil>("HashUtil");
            const stashItem: IItem = {
                _id: "stashId",
                _tpl: "55d7217a4bdc2d86028b456d", // standard stash id
            };

            const inventoryItemToFind: IItem = {
                _id: hashUtil.generate(),
                _tpl: "544fb6cc4bdc2d34748b456e", // Slickers chocolate bar
                parentId: stashItem._id,
                slotId: "hideout",
            };
            const playerInventory = [stashItem, inventoryItemToFind];

            const result = paymentService.isInStash("notCorrectId", playerInventory, stashItem._id);

            expect(result).toBe(false);
        });

        it("should return false when player inventory array has no inventory item", () => {
            const hashUtil = container.resolve<HashUtil>("HashUtil");
            const stashItem: IItem = {
                _id: "stashId",
                _tpl: "55d7217a4bdc2d86028b456d", // standard stash id
            };

            const inventoryItemToFind: IItem = {
                _id: hashUtil.generate(),
                _tpl: "544fb6cc4bdc2d34748b456e", // Slickers chocolate bar
                parentId: stashItem._id,
                slotId: "hideout",
            };
            const playerInventory = [inventoryItemToFind];

            const result = paymentService.isInStash("notCorrectId", playerInventory, stashItem._id);

            expect(result).toBe(false);
        });
    });
});
