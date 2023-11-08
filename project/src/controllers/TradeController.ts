import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { TradeHelper } from "@spt-aki/helpers/TradeHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Item, Upd } from "@spt-aki/models/eft/common/tables/IItem";
import { ITraderBase } from "@spt-aki/models/eft/common/tables/ITrader";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBaseTradeRequestData } from "@spt-aki/models/eft/trade/IProcessBaseTradeRequestData";
import { IProcessBuyTradeRequestData } from "@spt-aki/models/eft/trade/IProcessBuyTradeRequestData";
import { IProcessRagfairTradeRequestData } from "@spt-aki/models/eft/trade/IProcessRagfairTradeRequestData";
import { IProcessSellTradeRequestData } from "@spt-aki/models/eft/trade/IProcessSellTradeRequestData";
import { ISellScavItemsToFenceRequestData } from "@spt-aki/models/eft/trade/ISellScavItemsToFenceRequestData";
import { BackendErrorCodes } from "@spt-aki/models/enums/BackendErrorCodes";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { MemberCategory } from "@spt-aki/models/enums/MemberCategory";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { RagfairServer } from "@spt-aki/servers/RagfairServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { RagfairPriceService } from "@spt-aki/services/RagfairPriceService";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
class TradeController {
    protected ragfairConfig: IRagfairConfig;
    protected traderConfig: ITraderConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("TradeHelper") protected tradeHelper: TradeHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("RagfairServer") protected ragfairServer: RagfairServer,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("ConfigServer") protected configServer: ConfigServer
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /** Handle TradingConfirm event */
    public confirmTrading(
        pmcData: IPmcData,
        request: IProcessBaseTradeRequestData,
        sessionID: string
    ): IItemEventRouterResponse {
        return this.confirmTradingInternal(pmcData, request, sessionID, this.traderConfig.purchasesAreFoundInRaid);
    }

    /** Handle RagFairBuyOffer event */
    public confirmRagfairTrading(
        pmcData: IPmcData,
        body: IProcessRagfairTradeRequestData,
        sessionID: string
    ): IItemEventRouterResponse {
        let output = this.eventOutputHolder.getOutput(sessionID);

        for (const offer of body.offers) {
            const fleaOffer = this.ragfairServer.getOffer(offer.id);
            if (!fleaOffer) {
                return this.httpResponse.appendErrorToOutput(
                    output,
                    `Offer with ID ${offer.id} not found`,
                    BackendErrorCodes.OFFERNOTFOUND
                );
            }

            if (offer.count === 0) {
                const errorMessage = this.localisationService.getText(
                    "ragfair-unable_to_purchase_0_count_item",
                    this.itemHelper.getItem(fleaOffer.items[0]._tpl)[1]._name
                );
                return this.httpResponse.appendErrorToOutput(output, errorMessage, BackendErrorCodes.OFFEROUTOFSTOCK);
            }

            // Skip buying items when player doesn't have necessary loyalty
            if (
                fleaOffer.user.memberType === MemberCategory.TRADER &&
                fleaOffer.loyaltyLevel > pmcData.TradersInfo[fleaOffer.user.id].loyaltyLevel
            ) {
                this.logger.debug(
                    `Unable to buy item: ${fleaOffer.items[0]._tpl} from trader: ${fleaOffer.user.id} as loyalty level too low, skipping`
                );
                continue;
            }

            this.logger.debug(this.jsonUtil.serializeAdvanced(offer, null, 2));

            const buyData: IProcessBuyTradeRequestData = {
                Action: "TradingConfirm",
                type: "buy_from_trader",
                tid: fleaOffer.user.memberType !== MemberCategory.TRADER ? "ragfair" : fleaOffer.user.id,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                item_id: fleaOffer.root,
                count: offer.count,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                scheme_id: 0,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                scheme_items: offer.items,
            };

            // confirmTrading() must occur prior to removing the offer stack, otherwise item inside offer doesn't exist for confirmTrading() to use
            output = this.confirmTradingInternal(
                pmcData,
                buyData,
                sessionID,
                this.ragfairConfig.dynamic.purchasesAreFoundInRaid,
                fleaOffer.items[0].upd
            );
            if (fleaOffer.user.memberType !== MemberCategory.TRADER) {
                // remove player item offer stack
                this.ragfairServer.removeOfferStack(fleaOffer._id, offer.count);
            }
        }

        return output;
    }

    /** Handle SellAllFromSavage event */
    public sellScavItemsToFence(
        pmcData: IPmcData,
        body: ISellScavItemsToFenceRequestData,
        sessionId: string
    ): IItemEventRouterResponse {
        const scavProfile = this.profileHelper.getFullProfile(sessionId)?.characters?.scav;
        if (!scavProfile) {
            return this.httpResponse.appendErrorToOutput(
                this.eventOutputHolder.getOutput(sessionId),
                `Profile ${body.fromOwner.id} has no scav account`
            );
        }

        return this.sellInventoryToTrader(sessionId, scavProfile, pmcData, Traders.FENCE);
    }

    /**
     * Sell all sellable items to a trader from inventory
     * WILL DELETE ITEMS FROM INVENTORY + CHILDREN OF ITEMS SOLD
     * @param sessionId Session id
     * @param profileWithItemsToSell Profile with items to be sold to trader
     * @param profileThatGetsMoney Profile that gets the money after selling items
     * @param trader Trader to sell items to
     * @returns IItemEventRouterResponse
     */
    protected sellInventoryToTrader(
        sessionId: string,
        profileWithItemsToSell: IPmcData,
        profileThatGetsMoney: IPmcData,
        trader: Traders
    ): IItemEventRouterResponse {
        const handbookPrices = this.ragfairPriceService.getAllStaticPrices();
        // TODO, apply trader sell bonuses?
        const traderDetails = this.traderHelper.getTrader(trader, sessionId);

        // Prep request object
        const sellRequest: IProcessSellTradeRequestData = {
            Action: "sell_to_trader",
            type: "sell_to_trader",
            tid: trader,
            price: 0,
            items: [],
        };

        // Get all base items that scav has (primaryweapon/backpack/pockets etc)
        // Add items that trader will buy (only sell items that have the container as parent) to request object
        const containerAndEquipmentItems = profileWithItemsToSell.Inventory.items.filter(
            (x) => x.parentId === profileWithItemsToSell.Inventory.equipment
        );
        for (const itemToSell of containerAndEquipmentItems) {
            // Increment sell price in request
            sellRequest.price += this.getPriceOfItemAndChildren(
                itemToSell._id,
                profileWithItemsToSell.Inventory.items,
                handbookPrices,
                traderDetails
            );

            // Add item details to request
            // eslint-disable-next-line @typescript-eslint/naming-convention
            sellRequest.items.push({
                id: itemToSell._id,
                count: itemToSell?.upd?.StackObjectsCount ?? 1,
                scheme_id: 0,
            });
        }
        this.logger.debug(`Selling scav items to fence for ${sellRequest.price} roubles`);
        return this.tradeHelper.sellItem(profileWithItemsToSell, profileThatGetsMoney, sellRequest, sessionId);
    }

    /**
     * Looks up an items children and gets total handbook price for them
     * @param parentItemId parent item that has children we want to sum price of
     * @param items All items (parent + children)
     * @param handbookPrices Prices of items from handbook
     * @param traderDetails Trader being sold to to perform buy category check against
     * @returns Rouble price
     */
    protected getPriceOfItemAndChildren(
        parentItemId: string,
        items: Item[],
        handbookPrices: Record<string, number>,
        traderDetails: ITraderBase
    ): number {
        const itemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(items, parentItemId);

        let totalPrice = 0;
        for (const itemToSell of itemWithChildren) {
            const itemDetails = this.itemHelper.getItem(itemToSell._tpl);
            if (
                !(
                    itemDetails[0] &&
                    this.itemHelper.isOfBaseclasses(itemDetails[1]._id, traderDetails.items_buy.category)
                )
            ) {
                // Skip if tpl isnt item OR item doesn't fulfill match traders buy categories
                continue;
            }

            // Get price of item multiplied by how many are in stack
            totalPrice += (handbookPrices[itemToSell._tpl] ?? 0) * (itemToSell.upd?.StackObjectsCount ?? 1);
        }

        return totalPrice;
    }

    protected confirmTradingInternal(
        pmcData: IPmcData,
        body: IProcessBaseTradeRequestData,
        sessionID: string,
        foundInRaid = false,
        upd: Upd = null
    ): IItemEventRouterResponse {
        // buying
        if (body.type === "buy_from_trader") {
            const buyData = <IProcessBuyTradeRequestData>body;
            return this.tradeHelper.buyItem(pmcData, buyData, sessionID, foundInRaid, upd);
        }

        // selling
        if (body.type === "sell_to_trader") {
            const sellData = <IProcessSellTradeRequestData>body;
            return this.tradeHelper.sellItem(pmcData, pmcData, sellData, sessionID);
        }

        return null;
    }
}

export { TradeController };
