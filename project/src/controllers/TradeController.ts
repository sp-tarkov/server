import { inject, injectable } from "tsyringe";

import { ItemHelper } from "../helpers/ItemHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { TradeHelper } from "../helpers/TradeHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Item, Upd } from "../models/eft/common/tables/IItem";
import { ITraderBase } from "../models/eft/common/tables/ITrader";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBaseTradeRequestData } from "../models/eft/trade/IProcessBaseTradeRequestData";
import { IProcessBuyTradeRequestData } from "../models/eft/trade/IProcessBuyTradeRequestData";
import {
    IProcessRagfairTradeRequestData
} from "../models/eft/trade/IProcessRagfairTradeRequestData";
import { IProcessSellTradeRequestData } from "../models/eft/trade/IProcessSellTradeRequestData";
import { ISellScavItemsToFenceRequestData } from "../models/eft/trade/ISellScavItemsToFenceRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MemberCategory } from "../models/enums/MemberCategory";
import { Traders } from "../models/enums/Traders";
import { IRagfairConfig } from "../models/spt/config/IRagfairConfig";
import { ITraderConfig } from "../models/spt/config/ITraderConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { RagfairServer } from "../servers/RagfairServer";
import { LocalisationService } from "../services/LocalisationService";
import { RagfairPriceService } from "../services/RagfairPriceService";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { JsonUtil } from "../utils/JsonUtil";

@injectable()
class TradeController
{
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
    )
    {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /** Handle TradingConfirm event */
    public confirmTrading(pmcData: IPmcData, request: IProcessBaseTradeRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.confirmTradingInternal(pmcData, request, sessionID, this.traderConfig.purchasesAreFoundInRaid);
    }

    /** Handle RagFairBuyOffer event */
    public confirmRagfairTrading(pmcData: IPmcData, body: IProcessRagfairTradeRequestData, sessionID: string): IItemEventRouterResponse
    {
        let output = this.eventOutputHolder.getOutput(sessionID);

        for (const offer of body.offers)
        {
            const fleaOffer = this.ragfairServer.getOffer(offer.id);
            if (!fleaOffer) 
            {
                return this.httpResponse.appendErrorToOutput(output, `Offer with ID ${offer.id} not found`);
            }

            if (offer.count === 0)
            {
                const errorMessage = this.localisationService.getText("ragfair-unable_to_purchase_0_count_item", this.itemHelper.getItem(fleaOffer.items[0]._tpl)[1]._name);
                return this.httpResponse.appendErrorToOutput(output, errorMessage);
            }

            this.logger.debug(this.jsonUtil.serializeAdvanced(offer, null, 2));

            const buyData: IProcessBuyTradeRequestData = {
                Action: "TradingConfirm",
                type: "buy_from_trader",
                tid: (fleaOffer.user.memberType !== MemberCategory.TRADER) ? "ragfair" : fleaOffer.user.id,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                item_id: fleaOffer.root,
                count: offer.count,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                scheme_id: 0,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                scheme_items: offer.items
            };

            // confirmTrading() must occur prior to removing the offer stack, otherwise item inside offer doesn't exist for confirmTrading() to use
            output = this.confirmTradingInternal(pmcData, buyData, sessionID, this.ragfairConfig.dynamic.purchasesAreFoundInRaid, fleaOffer.items[0].upd);
            if (fleaOffer.user.memberType !== MemberCategory.TRADER)
            {
                // remove player item offer stack
                this.ragfairServer.removeOfferStack(fleaOffer._id, offer.count);
            }
        }

        return output;
    }

    /** Handle SellAllFromSavage event */
    public sellScavItemsToFence(pmcData: IPmcData, body: ISellScavItemsToFenceRequestData, sessionId: string): IItemEventRouterResponse
    {
        const scavProfile = this.profileHelper.getFullProfile(sessionId)?.characters?.scav;
        if (!scavProfile)
        {
            return this.httpResponse.appendErrorToOutput(this.eventOutputHolder.getOutput(sessionId), `Profile ${body.fromOwner.id} has no scav account`);
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
    protected sellInventoryToTrader(sessionId: string, profileWithItemsToSell: IPmcData, profileThatGetsMoney: IPmcData, trader: Traders): IItemEventRouterResponse
    {
        const handbookPrices = this.ragfairPriceService.getAllStaticPrices();
        // TODO, apply trader sell bonuses?
        const traderDetails = this.traderHelper.getTrader(trader, sessionId);

        // Prep request object
        const sellRequest: IProcessSellTradeRequestData = {
            Action: "sell_to_trader",
            type: "sell_to_trader",
            tid: trader,
            price: 0,
            items: []
        };

        // Get all base items that scav has (primaryweapon/backpack/pockets etc)
        // Add items that trader will buy (only sell items that have the container as parent) to request object
        const containerAndEquipmentItems = profileWithItemsToSell.Inventory.items.filter(x => x.parentId === profileWithItemsToSell.Inventory.equipment);
        for (const itemToSell of containerAndEquipmentItems)
        {
            // Increment sell price in request
            sellRequest.price += this.getPriceOfItemAndChildren(itemToSell._id, profileWithItemsToSell.Inventory.items, handbookPrices, traderDetails);

            // Add item details to request
            // eslint-disable-next-line @typescript-eslint/naming-convention
            sellRequest.items.push({id: itemToSell._id, count: itemToSell?.upd?.StackObjectsCount ?? 1, scheme_id: 0});
        }

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
    protected getPriceOfItemAndChildren(parentItemId: string, items: Item[], handbookPrices: Record<string, number>, traderDetails: ITraderBase): number
    {
        const itemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(items, parentItemId);

        let totalPrice = 0;
        for (const itemToSell of itemWithChildren)
        {
            const itemDetails = this.itemHelper.getItem(itemToSell._tpl);
            if (!(itemDetails[0] && this.itemHelper.isOfBaseclasses(itemDetails[1]._id, traderDetails.items_buy.category)))
            {
                // Skip if tpl isnt item OR item doesn't fulfill match traders buy categories
                continue;
            }

            // Get price of item multiplied by how many are in stack
            totalPrice += (handbookPrices[itemToSell._tpl] ?? 0) * (itemToSell.upd?.StackObjectsCount ?? 1);
        }

        return totalPrice;
    }

    protected confirmTradingInternal(pmcData: IPmcData, body: IProcessBaseTradeRequestData, sessionID: string, foundInRaid = false, upd: Upd = null): IItemEventRouterResponse
    {
        // buying
        if (body.type === "buy_from_trader")
        {
            const buyData = <IProcessBuyTradeRequestData>body;
            return this.tradeHelper.buyItem(pmcData, buyData, sessionID, foundInRaid, upd);
        }

        // selling
        if (body.type === "sell_to_trader")
        {
            const sellData = <IProcessSellTradeRequestData>body;
            return this.tradeHelper.sellItem(pmcData, pmcData, sellData, sessionID);
        }

        return null;
    }
}

export { TradeController };

