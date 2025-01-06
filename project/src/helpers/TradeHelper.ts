import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { TraderAssortHelper } from "@spt/helpers/TraderAssortHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IAddItemsDirectRequest } from "@spt/models/eft/inventory/IAddItemsDirectRequest";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBuyTradeRequestData } from "@spt/models/eft/trade/IProcessBuyTradeRequestData";
import { IProcessSellTradeRequestData } from "@spt/models/eft/trade/IProcessSellTradeRequestData";
import { BackendErrorCodes } from "@spt/models/enums/BackendErrorCodes";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { Traders } from "@spt/models/enums/Traders";
import { IInventoryConfig } from "@spt/models/spt/config/IInventoryConfig";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { RagfairServer } from "@spt/servers/RagfairServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { FenceService } from "@spt/services/FenceService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { PaymentService } from "@spt/services/PaymentService";
import { TraderPurchasePersisterService } from "@spt/services/TraderPurchasePersisterService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class TradeHelper {
    protected traderConfig: ITraderConfig;
    protected inventoryConfig: IInventoryConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("RagfairServer") protected ragfairServer: RagfairServer,
        @inject("TraderAssortHelper") protected traderAssortHelper: TraderAssortHelper,
        @inject("TraderPurchasePersisterService")
        protected traderPurchasePersisterService: TraderPurchasePersisterService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
        this.inventoryConfig = this.configServer.getConfig(ConfigTypes.INVENTORY);
    }

    /**
     * Buy item from flea or trader
     * @param pmcData Player profile
     * @param buyRequestData data from client
     * @param sessionID Session id
     * @param foundInRaid Should item be found in raid
     * @param output IItemEventRouterResponse
     * @returns IItemEventRouterResponse
     */
    public buyItem(
        pmcData: IPmcData,
        buyRequestData: IProcessBuyTradeRequestData,
        sessionID: string,
        foundInRaid: boolean,
        output: IItemEventRouterResponse,
    ): void {
        let offerItems: IItem[] = [];
        let buyCallback: (buyCount: number) => void;
        if (buyRequestData.tid.toLocaleLowerCase() === "ragfair") {
            buyCallback = (buyCount: number) => {
                const allOffers = this.ragfairServer.getOffers();

                // We store ragfair offerid in buyRequestData.item_id
                const offerWithItem = allOffers.find((x) => x._id === buyRequestData.item_id);
                const itemPurchased = offerWithItem.items[0];

                // Ensure purchase does not exceed trader item limit
                const assortHasBuyRestrictions = this.itemHelper.hasBuyRestrictions(itemPurchased);
                if (assortHasBuyRestrictions) {
                    this.checkPurchaseIsWithinTraderItemLimit(
                        sessionID,
                        pmcData,
                        buyRequestData.tid,
                        itemPurchased,
                        buyRequestData.item_id,
                        buyCount,
                    );

                    // Decrement trader item count
                    const itemPurchaseDetails = {
                        items: [{ itemId: buyRequestData.item_id, count: buyCount }],
                        traderId: buyRequestData.tid,
                    };
                    this.traderHelper.addTraderPurchasesToPlayerProfile(sessionID, itemPurchaseDetails, itemPurchased);
                }
            };

            // Get raw offer from ragfair, clone to prevent altering offer itself
            const allOffers = this.ragfairServer.getOffers();
            const offerWithItemCloned = this.cloner.clone(allOffers.find((x) => x._id === buyRequestData.item_id));
            offerItems = offerWithItemCloned.items;
        } else if (buyRequestData.tid === Traders.FENCE) {
            buyCallback = (buyCount: number) => {
                // Update assort/flea item values
                const traderAssorts = this.traderHelper.getTraderAssortsByTraderId(buyRequestData.tid).items;
                const itemPurchased = traderAssorts.find((assort) => assort._id === buyRequestData.item_id);

                // Decrement trader item count
                itemPurchased.upd.StackObjectsCount -= buyCount;

                this.fenceService.amendOrRemoveFenceOffer(buyRequestData.item_id, buyCount);
            };

            const fenceItems = this.fenceService.getRawFenceAssorts().items;
            const rootItemIndex = fenceItems.findIndex((item) => item._id === buyRequestData.item_id);
            if (rootItemIndex === -1) {
                this.logger.debug(`Tried to buy item ${buyRequestData.item_id} from fence that no longer exists`);
                const message = this.localisationService.getText("ragfair-offer_no_longer_exists");
                this.httpResponse.appendErrorToOutput(output, message);

                return;
            }

            offerItems = this.itemHelper.findAndReturnChildrenAsItems(fenceItems, buyRequestData.item_id);
        } else {
            // Non-fence trader
            buyCallback = (buyCount: number) => {
                // Update assort/flea item values
                const traderAssorts = this.traderHelper.getTraderAssortsByTraderId(buyRequestData.tid).items;
                const itemPurchased = traderAssorts.find((item) => item._id === buyRequestData.item_id);

                // Ensure purchase does not exceed trader item limit
                const assortHasBuyRestrictions = this.itemHelper.hasBuyRestrictions(itemPurchased);
                if (assortHasBuyRestrictions) {
                    // Will throw error if check fails
                    this.checkPurchaseIsWithinTraderItemLimit(
                        sessionID,
                        pmcData,
                        buyRequestData.tid,
                        itemPurchased,
                        buyRequestData.item_id,
                        buyCount,
                    );
                }

                // Check if trader has enough stock
                if (itemPurchased.upd.StackObjectsCount < buyCount) {
                    throw new Error(
                        `Unable to purchase ${buyCount} items, this would exceed the remaining stock left ${itemPurchased.upd.StackObjectsCount} from the traders assort: ${buyRequestData.tid} this refresh`,
                    );
                }

                // Decrement trader item count
                itemPurchased.upd.StackObjectsCount -= buyCount;

                if (assortHasBuyRestrictions) {
                    const itemPurchaseDat = {
                        items: [{ itemId: buyRequestData.item_id, count: buyCount }],
                        traderId: buyRequestData.tid,
                    };
                    this.traderHelper.addTraderPurchasesToPlayerProfile(sessionID, itemPurchaseDat, itemPurchased);
                }
            };

            // Get all trader assort items
            const traderItems = this.traderAssortHelper.getAssort(sessionID, buyRequestData.tid).items;

            // Get item + children for purchase
            const relevantItems = this.itemHelper.findAndReturnChildrenAsItems(traderItems, buyRequestData.item_id);
            if (relevantItems.length === 0) {
                this.logger.error(
                    `Purchased trader: ${buyRequestData.tid} offer: ${buyRequestData.item_id} has no items`,
                );
            }
            offerItems.push(...relevantItems);
        }

        // Get item details from db
        const itemDbDetails = this.itemHelper.getItem(offerItems[0]._tpl)[1];
        const itemMaxStackSize = itemDbDetails._props.StackMaxSize;
        const itemsToSendTotalCount = buyRequestData.count;
        let itemsToSendRemaining = itemsToSendTotalCount;

        // Construct array of items to send to player
        const itemsToSendToPlayer: IItem[][] = [];
        while (itemsToSendRemaining > 0) {
            const offerClone = this.cloner.clone(offerItems);
            // Handle stackable items that have a max stack size limit
            const itemCountToSend = Math.min(itemMaxStackSize, itemsToSendRemaining);
            offerClone[0].upd.StackObjectsCount = itemCountToSend;

            // Prevent any collisions
            this.itemHelper.remapRootItemId(offerClone);
            if (offerClone.length > 1) {
                this.itemHelper.reparentItemAndChildren(offerClone[0], offerClone);
            }

            itemsToSendToPlayer.push(offerClone);

            // Remove amount of items added to player stash
            itemsToSendRemaining -= itemCountToSend;
        }

        // Construct request
        const request: IAddItemsDirectRequest = {
            itemsWithModsToAdd: itemsToSendToPlayer,
            foundInRaid: foundInRaid,
            callback: buyCallback,
            useSortingTable: false,
        };

        // Add items + their children to stash
        this.inventoryHelper.addItemsToStash(sessionID, request, pmcData, output);
        if (output.warnings.length > 0) {
            return;
        }

        /// Pay for purchase
        this.paymentService.payMoney(pmcData, buyRequestData, sessionID, output);
        if (output.warnings.length > 0) {
            const errorMessage = `Transaction failed: ${output.warnings[0].errmsg}`;
            this.httpResponse.appendErrorToOutput(output, errorMessage, BackendErrorCodes.UNKNOWN_TRADING_ERROR);
        }
    }

    /**
     * Sell item to trader
     * @param profileWithItemsToSell Profile to remove items from
     * @param profileToReceiveMoney Profile to accept the money for selling item
     * @param sellRequest Request data
     * @param sessionID Session id
     * @param output IItemEventRouterResponse
     */
    public sellItem(
        profileWithItemsToSell: IPmcData,
        profileToReceiveMoney: IPmcData,
        sellRequest: IProcessSellTradeRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void {
        // TODO - make more generic to support all quests that have this condition type
        // Try to reduce perf hit as this is expensive to do every sale
        // MUST OCCUR PRIOR TO ITEMS BEING REMOVED FROM INVENTORY
        if (sellRequest.tid === Traders.RAGMAN) {
            // Edge case, `Circulate` quest needs to track when certain items are sold to him
            this.incrementCirculateSoldToTraderCounter(profileWithItemsToSell, profileToReceiveMoney, sellRequest);
        }

        // Find item in inventory and remove it
        for (const itemToBeRemoved of sellRequest.items) {
            const itemIdToFind = itemToBeRemoved.id.replace(/\s+/g, ""); // Strip out whitespace

            // Find item in player inventory, or show error to player if not found
            const matchingItemInInventory = profileWithItemsToSell.Inventory.items.find((x) => x._id === itemIdToFind);
            if (!matchingItemInInventory) {
                const errorMessage = `Unable to sell item ${itemToBeRemoved.id}, cannot be found in player inventory`;
                this.logger.error(errorMessage);

                this.httpResponse.appendErrorToOutput(output, errorMessage);

                return;
            }

            this.logger.debug(`Selling: id: ${matchingItemInInventory._id} tpl: ${matchingItemInInventory._tpl}`);

            if (sellRequest.tid === Traders.FENCE) {
                this.fenceService.addItemsToFenceAssort(
                    profileWithItemsToSell.Inventory.items,
                    matchingItemInInventory,
                );
            }

            // Remove item from inventory + any child items it has
            this.inventoryHelper.removeItem(profileWithItemsToSell, itemToBeRemoved.id, sessionID, output);
        }

        // Give player money for sold item(s)
        this.paymentService.giveProfileMoney(profileToReceiveMoney, sellRequest.price, sellRequest, output, sessionID);
    }

    protected incrementCirculateSoldToTraderCounter(
        profileWithItemsToSell: IPmcData,
        profileToReceiveMoney: IPmcData,
        sellRequest: IProcessSellTradeRequestData,
    ) {
        const circulateQuestId = "6663149f1d3ec95634095e75";
        const activeCirculateQuest = profileToReceiveMoney.Quests.find(
            (quest) => quest.qid === circulateQuestId && quest.status === QuestStatus.Started,
        );

        // Player not on Circulate quest ,exit
        if (!activeCirculateQuest) {
            return;
        }

        // Find related task condition
        const taskCondition = Object.values(profileToReceiveMoney.TaskConditionCounters).find(
            (condition) => condition.sourceId === circulateQuestId && condition.type === "SellItemToTrader",
        );

        // No relevant condtion in profile, nothing to increment
        if (!taskCondition) {
            this.logger.error("Unable to find `sellToTrader` task counter for Circulate quest in profile, skipping");

            return;
        }

        // Condition exists in profile
        const circulateQuestDb = this.databaseService.getQuests()[circulateQuestId];
        if (!circulateQuestDb) {
            this.logger.error(`Unable to find quest: ${circulateQuestId} in db, skipping`);

            return;
        }

        // Get sellToTrader condition from quest
        const sellItemToTraderCondition = circulateQuestDb.conditions.AvailableForFinish.find(
            (condition) => condition.conditionType === "SellItemToTrader",
        );

        // Quest doesnt have a sellItemToTrader condition, nothing to do
        if (!sellItemToTraderCondition) {
            this.logger.error("Unable to find `sellToTrader` counter for Circulate quest in db, skipping");

            return;
        }

        // Iterate over items sold to trader
        const itemsTplsThatIncrement = sellItemToTraderCondition.target;
        for (const itemSoldToTrader of sellRequest.items) {
            // Get sold items' details from profile
            const itemDetails = profileWithItemsToSell.Inventory.items.find(
                (inventoryItem) => inventoryItem._id === itemSoldToTrader.id,
            );
            if (!itemDetails) {
                this.logger.error(
                    `Unable to find item in inventory to sell to trader with id: ${itemSoldToTrader.id}, cannot increment counter, skipping`,
                );

                continue;
            }

            // Is sold item on the increment list
            if (itemsTplsThatIncrement.includes(itemDetails._tpl)) {
                taskCondition.value += itemSoldToTrader.count;
            }
        }
    }

    /**
     * Traders allow a limited number of purchases per refresh cycle (default 60 mins)
     * @param sessionId Session id
     * @param pmcData Profile making the purchase
     * @param traderId Trader assort is purchased from
     * @param assortBeingPurchased the item from trader being bought
     * @param assortId Id of assort being purchased
     * @param count How many of the item are being bought
     */
    protected checkPurchaseIsWithinTraderItemLimit(
        sessionId: string,
        pmcData: IPmcData,
        traderId: string,
        assortBeingPurchased: IItem,
        assortId: string,
        count: number,
    ): void {
        const traderPurchaseData = this.traderPurchasePersisterService.getProfileTraderPurchase(
            sessionId,
            traderId,
            assortBeingPurchased._id,
        );
        const traderItemPurchaseLimit = this.traderHelper.getAccountTypeAdjustedTraderPurchaseLimit(
            assortBeingPurchased.upd?.BuyRestrictionMax,
            pmcData.Info.GameVersion,
        );
        if ((traderPurchaseData?.count ?? 0 + count) > traderItemPurchaseLimit) {
            throw new Error(
                `Unable to purchase: ${count} items, this would exceed your purchase limit of ${traderItemPurchaseLimit} from the trader: ${traderId} assort: ${assortId} this refresh`,
            );
        }
    }
}
