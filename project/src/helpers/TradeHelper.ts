import { inject, injectable } from "tsyringe";

import { InventoryHelper } from "@spt-aki/helpers/InventoryHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Item, Upd } from "@spt-aki/models/eft/common/tables/IItem";
import { IAddItemDirectRequest } from "@spt-aki/models/eft/inventory/IAddItemDirectRequest";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBuyTradeRequestData } from "@spt-aki/models/eft/trade/IProcessBuyTradeRequestData";
import { IProcessSellTradeRequestData } from "@spt-aki/models/eft/trade/IProcessSellTradeRequestData";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IInventoryConfig } from "@spt-aki/models/spt/config/IInventoryConfig";
import { ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { RagfairServer } from "@spt-aki/servers/RagfairServer";
import { FenceService } from "@spt-aki/services/FenceService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { PaymentService } from "@spt-aki/services/PaymentService";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class TradeHelper
{
    protected traderConfig: ITraderConfig;
    protected inventoryConfig: IInventoryConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("RagfairServer") protected ragfairServer: RagfairServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
        this.inventoryConfig = this.configServer.getConfig(ConfigTypes.INVENTORY);
    }

    /**
     * Buy item from flea or trader
     * @param pmcData Player profile
     * @param buyRequestData data from client
     * @param sessionID Session id
     * @param foundInRaid Should item be found in raid
     * @param upd optional item details used when buying from flea
     * @returns
     */
    public buyItem(
        pmcData: IPmcData,
        buyRequestData: IProcessBuyTradeRequestData,
        sessionID: string,
        foundInRaid: boolean,
        upd: Upd,
    ): IItemEventRouterResponse
    {
        let output = this.eventOutputHolder.getOutput(sessionID);

        const newReq = {
            items: [{
                // eslint-disable-next-line @typescript-eslint/naming-convention
                item_id: buyRequestData.item_id,
                count: buyRequestData.count,
            }],
            tid: buyRequestData.tid,
        };

        const callback = () =>
        {
            // Update assort/flea item values
            const traderAssorts = this.traderHelper.getTraderAssortsByTraderId(buyRequestData.tid).items;
            const itemPurchased = traderAssorts.find((x) => x._id === buyRequestData.item_id);


            // Ensure purchase does not exceed trader item limit
            const hasBuyRestrictions = this.itemHelper.hasBuyRestrictions(itemPurchased);
            if (hasBuyRestrictions)
            {
                this.checkPurchaseIsWithinTraderItemLimit(itemPurchased, buyRequestData.item_id, buyRequestData.count);
            }

            // Decrement trader item count
            itemPurchased.upd.StackObjectsCount -= buyRequestData.count;

            if (this.traderConfig.persistPurchaseDataInProfile && hasBuyRestrictions)
            {
                this.traderHelper.addTraderPurchasesToPlayerProfile(sessionID, newReq);
            }

            /// Pay for item
            output = this.paymentService.payMoney(pmcData, buyRequestData, sessionID, output);
            if (output.warnings.length > 0)
            {
                throw new Error(`Transaction failed: ${output.warnings[0].errmsg}`);
            }

            if (hasBuyRestrictions)
            {
                // Increment non-fence trader item buy count
                this.incrementAssortBuyCount(itemPurchased, buyRequestData.count);
            }
        };

        // Handle normal traders old way...for now
        if (buyRequestData.tid.toLocaleLowerCase() !== "ragfair" && buyRequestData.tid.toLocaleLowerCase() !== Traders.FENCE)
        {
            return this.inventoryHelper.addItem(pmcData, newReq, output, sessionID, callback, foundInRaid, upd);
        }

        let offerItems: Item[] = [];
        let buyCallback;
        if (buyRequestData.tid.toLocaleLowerCase() === "ragfair")
        {
            buyCallback = () =>
            {
                const allOffers = this.ragfairServer.getOffers();

                // We store ragfair offerid in buyRequestData.item_id
                const offerWithItem = allOffers.find((x) => x._id === buyRequestData.item_id);
                const itemPurchased = offerWithItem.items[0];
    
                // Ensure purchase does not exceed trader item limit
                const hasBuyRestrictions = this.itemHelper.hasBuyRestrictions(itemPurchased);
                if (hasBuyRestrictions)
                {
                    this.checkPurchaseIsWithinTraderItemLimit(itemPurchased, buyRequestData.item_id, buyRequestData.count);
                }
    
                // Decrement trader item count
    
                if (this.traderConfig.persistPurchaseDataInProfile && hasBuyRestrictions)
                {
                    this.traderHelper.addTraderPurchasesToPlayerProfile(sessionID, newReq);
                }
    
                /// Pay for item
                output = this.paymentService.payMoney(pmcData, buyRequestData, sessionID, output);
                if (output.warnings.length > 0)
                {
                    throw new Error(`Transaction failed: ${output.warnings[0].errmsg}`);
                }

                if (hasBuyRestrictions)
                {
                    // Increment non-fence trader item buy count
                    this.incrementAssortBuyCount(itemPurchased, buyRequestData.count);
                }
            };

            // Get raw offer from ragfair, clone to prevent altering offer itself
            const allOffers = this.ragfairServer.getOffers();
            const offerWithItemCloned = this.jsonUtil.clone(allOffers.find((x) => x._id === buyRequestData.item_id));
            offerItems = offerWithItemCloned.items;
        }
        else if (buyRequestData.tid === Traders.FENCE)
        {
            buyCallback = () =>
            {
                // Update assort/flea item values
                const traderAssorts = this.traderHelper.getTraderAssortsByTraderId(buyRequestData.tid).items;
                const itemPurchased = traderAssorts.find((x) => x._id === buyRequestData.item_id);
    
                // Decrement trader item count
                itemPurchased.upd.StackObjectsCount -= buyRequestData.count;
    
                /// Pay for item
                output = this.paymentService.payMoney(pmcData, buyRequestData, sessionID, output);
                if (output.warnings.length > 0)
                {
                    throw new Error(`Transaction failed: ${output.warnings[0].errmsg}`);
                }
    
                this.fenceService.removeFenceOffer(buyRequestData.item_id);
            };

            const fenceItems = this.fenceService.getRawFenceAssorts().items;
            const rootItemIndex = fenceItems.findIndex((item) => item._id === buyRequestData.item_id);
            if (rootItemIndex === -1)
            {
                this.logger.debug(`Tried to buy item ${buyRequestData.item_id} from fence that no longer exists`);
                const message = this.localisationService.getText("ragfair-offer_no_longer_exists");
                return this.httpResponse.appendErrorToOutput(output, message);
            }

            offerItems = this.itemHelper.findAndReturnChildrenAsItems(fenceItems, buyRequestData.item_id);
        }

        // Get item details from db
        const itemDbDetails = this.itemHelper.getItem(offerItems[0]._tpl)[1];
        const itemMaxStackSize = itemDbDetails._props.StackMaxSize;
        const itemsToSendTotalCount = buyRequestData.count;
        let itemsToSendRemaining = itemsToSendTotalCount;
        while (itemsToSendRemaining > 0)
        {
            // Handle edge case when remaining items to send < max stack size
            const itemCountToSend = Math.min(itemMaxStackSize, itemsToSendRemaining);
            offerItems[0].upd.StackObjectsCount = itemCountToSend;

            // Prevent any collisions
            this.itemHelper.remapRootItemId(offerItems);

            // Construct request
            const request: IAddItemDirectRequest = {
                itemWithModsToAdd: this.itemHelper.reparentItemAndChildren(offerItems[0], offerItems),
                foundInRaid: this.inventoryConfig.newItemsMarkedFound,
                callback: buyCallback,
                useSortingTable: true
            };

            // Add item + children to stash
            this.inventoryHelper.addItemToStash(sessionID, request, pmcData, output);

            // Remove amount of items added to player stash
            itemsToSendRemaining -= itemCountToSend;
        }  

        // TODO - handle traders
        return output;
    }

    /**
     * Sell item to trader
     * @param profileWithItemsToSell Profile to remove items from
     * @param profileToReceiveMoney Profile to accept the money for selling item
     * @param sellRequest Request data
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public sellItem(
        profileWithItemsToSell: IPmcData,
        profileToReceiveMoney: IPmcData,
        sellRequest: IProcessSellTradeRequestData,
        sessionID: string,
    ): IItemEventRouterResponse
    {
        let output = this.eventOutputHolder.getOutput(sessionID);

        // Find item in inventory and remove it
        for (const itemToBeRemoved of sellRequest.items)
        {
            const itemIdToFind = itemToBeRemoved.id.replace(/\s+/g, ""); // Strip out whitespace

            // Find item in player inventory, or show error to player if not found
            const matchingItemInInventory = profileWithItemsToSell.Inventory.items.find((x) => x._id === itemIdToFind);
            if (!matchingItemInInventory)
            {
                const errorMessage = `Unable to sell item ${itemToBeRemoved.id}, cannot be found in player inventory`;
                this.logger.error(errorMessage);

                return this.httpResponse.appendErrorToOutput(output, errorMessage);
            }

            this.logger.debug(`Selling: id: ${matchingItemInInventory._id} tpl: ${matchingItemInInventory._tpl}`);

            // Also removes children
            output = this.inventoryHelper.removeItem(profileWithItemsToSell, itemToBeRemoved.id, sessionID, output);
        }

        // Give player money for sold item(s)
        return this.paymentService.getMoney(profileToReceiveMoney, sellRequest.price, sellRequest, output, sessionID);
    }

    /**
     * Increment the assorts buy count by number of items purchased
     * Show error on screen if player attempts to buy more than what the buy max allows
     * @param assortBeingPurchased assort being bought
     * @param itemsPurchasedCount number of items being bought
     */
    protected incrementAssortBuyCount(assortBeingPurchased: Item, itemsPurchasedCount: number): void
    {
        assortBeingPurchased.upd.BuyRestrictionCurrent += itemsPurchasedCount;

        if (assortBeingPurchased.upd.BuyRestrictionCurrent > assortBeingPurchased.upd.BuyRestrictionMax)
        {
            throw new Error("Unable to purchase item, Purchase limit reached");
        }
    }

    /**
     * Traders allow a limited number of purchases per refresh cycle (default 60 mins)
     * @param assortBeingPurchased the item from trader being bought
     * @param assortId Id of assort being purchased
     * @param count How many are being bought
     */
    protected checkPurchaseIsWithinTraderItemLimit(assortBeingPurchased: Item, assortId: string, count: number): void
    {
        if ((assortBeingPurchased.upd.BuyRestrictionCurrent + count) > assortBeingPurchased.upd?.BuyRestrictionMax)
        {
            throw new Error(
                `Unable to purchase ${count} items, this would exceed your purchase limit of ${assortBeingPurchased.upd.BuyRestrictionMax} from the traders assort: ${assortId} this refresh`,
            );
        }
    }
}
