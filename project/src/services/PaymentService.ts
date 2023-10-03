import { inject, injectable } from "tsyringe";

import { HandbookHelper } from "../helpers/HandbookHelper";
import { InventoryHelper } from "../helpers/InventoryHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { PaymentHelper } from "../helpers/PaymentHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Item } from "../models/eft/common/tables/IItem";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBuyTradeRequestData } from "../models/eft/trade/IProcessBuyTradeRequestData";
import { IProcessSellTradeRequestData } from "../models/eft/trade/IProcessSellTradeRequestData";
import { BackendErrorCodes } from "../models/enums/BackendErrorCodes";
import { ILogger } from "../models/spt/utils/ILogger";
import { DatabaseServer } from "../servers/DatabaseServer";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { LocalisationService } from "./LocalisationService";

@injectable()
export class PaymentService
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper
    )
    { }

    /**
     * Take money and insert items into return to server request
     * @param {IPmcData} pmcData Player profile
     * @param {IProcessBuyTradeRequestData} request
     * @param {string} sessionID
     * @returns IItemEventRouterResponse
     */
    public payMoney(pmcData: IPmcData, request: IProcessBuyTradeRequestData, sessionID: string, output: IItemEventRouterResponse):  IItemEventRouterResponse
    {
        const trader = this.traderHelper.getTrader(request.tid, sessionID);
        let currencyTpl = this.paymentHelper.getCurrency(trader.currency);

        // Delete barter items(not money) from inventory
        if (request.Action === "TradingConfirm")
        {
            for (const index in request.scheme_items)
            {
                const item = pmcData.Inventory.items.find(i => i._id === request.scheme_items[index].id);
                if (item !== undefined)
                {
                    if (!this.paymentHelper.isMoneyTpl(item._tpl))
                    {
                        output = this.inventoryHelper.removeItem(pmcData, item._id, sessionID, output);
                        request.scheme_items[index].count = 0;
                    }
                    else
                    {
                        currencyTpl = item._tpl;
                        break;
                    }
                }
            }
        }

        // prepare a price for barter
        let barterPrice = 0;
        barterPrice = request.scheme_items.reduce((accumulator, item) => accumulator + item.count, 0);

        // Nothing to do here, since we dont need to pay money.
        if (barterPrice === 0)
        {
            this.logger.debug(this.localisationService.getText("payment-zero_price_no_payment"));
        }

        // Only perform if paying with currency (not barters)
        if (barterPrice > 0)
        {
            output = this.addPaymentToOutput(pmcData, currencyTpl, barterPrice, sessionID, output);
            if (output.warnings.length > 0)
            {
                // Something failed
                return output;
            }
        }

        // set current sale sum
        // convert barterPrice itemTpl into RUB then convert RUB into trader currency
        const costOfPurchaseInCurrency = (barterPrice === 0)
            ? this.handbookHelper.fromRUB(this.getTraderItemHandbookPriceRouble(request.item_id, request.tid), this.paymentHelper.getCurrency(trader.currency))
            : this.handbookHelper.fromRUB(this.handbookHelper.inRUB(barterPrice, currencyTpl), this.paymentHelper.getCurrency(trader.currency));

        pmcData.TradersInfo[request.tid].salesSum += costOfPurchaseInCurrency;
        this.traderHelper.lvlUp(request.tid, pmcData);
        Object.assign(output.profileChanges[sessionID].traderRelations, { [request.tid]: pmcData.TradersInfo[request.tid] });

        this.logger.debug("Item(s) taken. Status OK.");
        return output;
    }

    /**
     * Get the item price of a specific traders assort
     * @param traderAssortId Id of assort to look up
     * @param traderId Id of trader with assort
     * @returns Handbook rouble price of item
     */
    protected getTraderItemHandbookPriceRouble(traderAssortId: string, traderId: string): number
    {
        const purchasedAssortItem = this.traderHelper.getTraderAssortItemByAssortId(traderId, traderAssortId);
        if (!purchasedAssortItem)
        {
            return 1;
        }

        const assortItemPriceRouble = this.handbookHelper.getTemplatePrice(purchasedAssortItem._tpl);
        if (!assortItemPriceRouble)
        {
            this.logger.debug(`No item price found for ${purchasedAssortItem._tpl} on trader: ${traderId} in assort: ${traderAssortId}`);
            
            return 1;
        }

        return assortItemPriceRouble;
    }

    /**
     * Receive money back after selling
     * @param {IPmcData} pmcData
     * @param {number} amount
     * @param {IProcessSellTradeRequestData} body
     * @param {IItemEventRouterResponse} output
     * @param {string} sessionID
     * @returns IItemEventRouterResponse
     */
    public getMoney(pmcData: IPmcData, amount: number, body: IProcessSellTradeRequestData, output: IItemEventRouterResponse, sessionID: string): IItemEventRouterResponse
    {
        const trader = this.traderHelper.getTrader(body.tid, sessionID);
        const currency = this.paymentHelper.getCurrency(trader.currency);
        let calcAmount = this.handbookHelper.fromRUB(this.handbookHelper.inRUB(amount, currency), currency);
        const maxStackSize = this.databaseServer.getTables().templates.items[currency]._props.StackMaxSize;
        let skip = false;

        for (const item of pmcData.Inventory.items)
        {
            // item is not currency
            if (item._tpl !== currency)
            {
                continue;
            }

            // item is not in the stash
            if (!this.isItemInStash(pmcData, item))
            {
                continue;
            }

            if (item.upd.StackObjectsCount < maxStackSize)
            {

                if (item.upd.StackObjectsCount + calcAmount > maxStackSize)
                {
                    // calculate difference
                    calcAmount -= maxStackSize - item.upd.StackObjectsCount;
                    item.upd.StackObjectsCount = maxStackSize;
                }
                else
                {
                    skip = true;
                    item.upd.StackObjectsCount = item.upd.StackObjectsCount + calcAmount;
                }

                output.profileChanges[sessionID].items.change.push(item);

                if (skip)
                {
                    break;
                }
            }
        }

        if (!skip)
        {
            const request = {
                items: [{
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    item_id: currency,
                    count: calcAmount
                }],
                tid: body.tid
            };

            output = this.inventoryHelper.addItem(pmcData, request, output, sessionID, null, false, null, true);
        }

        // set current sale sum
        const saleSum = pmcData.TradersInfo[body.tid].salesSum + amount;

        pmcData.TradersInfo[body.tid].salesSum = saleSum;
        this.traderHelper.lvlUp(body.tid, pmcData);
        Object.assign(output.profileChanges[sessionID].traderRelations, { [body.tid]: { "salesSum": saleSum } });

        return output;
    }

    /**
   * Recursively checks if the given item is
   * inside the stash, that is it has the stash as
   * ancestor with slotId=hideout
   */
    protected isItemInStash(pmcData: IPmcData, item: Item): boolean
    {
        let container = item;
     
        while ("parentId" in container)
        {
            if (container.parentId === pmcData.Inventory.stash && container.slotId === "hideout")
            {
                return true;
            }
     
            container = pmcData.Inventory.items.find(i => i._id === container.parentId);
            if (!container)
            {
                break;
            }
        }
        return false;
    }

    /**
     * Remove currency from player stash/inventory
     * @param pmcData Player profile to find and remove currency from
     * @param currencyTpl Type of currency to pay
     * @param amountToPay money value to pay
     * @param sessionID Session id
     * @param output output object to send to client
     * @returns IItemEventRouterResponse
     */
    public addPaymentToOutput(pmcData: IPmcData, currencyTpl: string, amountToPay: number, sessionID: string, output: IItemEventRouterResponse): IItemEventRouterResponse
    {
        const moneyItemsInInventory = this.getSortedMoneyItemsInInventory(pmcData, currencyTpl, pmcData.Inventory.stash);
        const amountAvailable = moneyItemsInInventory.reduce((accumulator, item) => accumulator + item.upd.StackObjectsCount, 0);

        // If no money in inventory or amount is not enough we return false
        if (moneyItemsInInventory.length <= 0 || amountAvailable < amountToPay)
        {
            this.logger.error(this.localisationService.getText("payment-not_enough_money_to_complete_transation", {amountToPay: amountToPay, amountAvailable: amountAvailable}));
            output = this.httpResponse.appendErrorToOutput(output, this.localisationService.getText("payment-not_enough_money_to_complete_transation_short"), BackendErrorCodes.UNKNOWN_TRADING_ERROR);

            return output;
        }

        let leftToPay = amountToPay;
        for (const moneyItem of moneyItemsInInventory)
        {
            const itemAmount = moneyItem.upd.StackObjectsCount;
            if (leftToPay >= itemAmount)
            {
                leftToPay -= itemAmount;
                output = this.inventoryHelper.removeItem(pmcData, moneyItem._id, sessionID, output);
            }
            else
            {
                moneyItem.upd.StackObjectsCount -= leftToPay;
                leftToPay = 0;
                output.profileChanges[sessionID].items.change.push(moneyItem);
            }

            if (leftToPay === 0)
            {
                break;
            }
        }

        return output;
    }

    /**
     * Get all money stacks in inventory and prioritse items in stash
     * @param pmcData 
     * @param currencyTpl 
     * @param playerStashId Players stash id
     * @returns Sorting money items
     */
    protected getSortedMoneyItemsInInventory(pmcData: IPmcData, currencyTpl: string, playerStashId: string): Item[]
    {
        const moneyItemsInInventory = this.itemHelper.findBarterItems("tpl", pmcData.Inventory.items, currencyTpl);

        // Prioritise items in stash to top of array
        moneyItemsInInventory.sort((a, b) => this.prioritiseStashSort(a, b, pmcData.Inventory.items, playerStashId));

        return moneyItemsInInventory;
    }

    /**
     * Prioritise player stash first over player inventory
     * Post-raid healing would often take money out of the players pockets/secure container
     * @param a First money stack item
     * @param b Second money stack item
     * @param inventoryItems players inventory items
     * @param playerStashId Players stash id
     * @returns sort order
     */
    protected prioritiseStashSort(a: Item, b: Item, inventoryItems: Item[], playerStashId: string): number
    {
        // a in stash, prioritise
        if (a.slotId === "hideout" && b.slotId !== "hideout")
        {
            return -1;
        }

        // b in stash, prioritise
        if (a.slotId !== "hideout" && b.slotId === "hideout")
        {
            return 1;
        }

        // both in containers
        if (a.slotId === "main" && b.slotId === "main")
        {
            // Item is in inventory, not stash, deprioritise
            const aInStash = this.isInStash(a.parentId, inventoryItems, playerStashId);
            const bInStash = this.isInStash(b.parentId, inventoryItems, playerStashId);

            // a in stash, prioritise
            if (aInStash && !bInStash)
            {
                return -1;
            }

            // b in stash, prioritise
            if (!aInStash && bInStash)
            {
                return 1;
            }
        }

        // they match
        return 0;
    }

    /**
     * Recursivly check items parents to see if it is inside the players inventory, not stash
     * @param itemId item id to check
     * @param inventoryItems player inventory
     * @param playerStashId Players stash id
     * @returns true if its in inventory
     */
    protected isInStash(itemId: string, inventoryItems: Item[], playerStashId: string): boolean
    {
        const itemParent = inventoryItems.find(x => x._id === itemId);

        if (itemParent)
        {
            if (itemParent.slotId === "hideout")
            {
                return true;
            }

            if (itemParent._id === playerStashId)
            {
                return true;
            }

            return this.isInStash(itemParent.parentId, inventoryItems, playerStashId);
        }

        return false;
    }
}