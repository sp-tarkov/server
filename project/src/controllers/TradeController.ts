import { inject, injectable } from "tsyringe";

import { ItemHelper } from "../helpers/ItemHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { TradeHelper } from "../helpers/TradeHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Upd } from "../models/eft/common/tables/IItem";
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
     * DOES NOT DELETE ITEMS FROM INVENTORY
     * @param sessionId Session id
     * @param profileWithItemsToSell Profile with items to be sold to trader 
     * @param profileThatGetsMoney Profile that gets the money after selling items
     * @param trader Trader to sell items to
     * @returns IItemEventRouterResponse
     */
    protected sellInventoryToTrader(sessionId: string, profileWithItemsToSell: IPmcData, profileThatGetsMoney: IPmcData, trader: Traders): IItemEventRouterResponse
    {
        // Move to more permanent location
        const inventoryContainerTpls = ["55d7217a4bdc2d86028b456d", "5963866286f7747bf429b572", "602543c13fee350cd564d032", "566abbc34bdc2d92178b4576", "5963866b86f7747bfa1c4462"];
        const inventoryContainerIds = profileWithItemsToSell.Inventory.items.filter(x => inventoryContainerTpls.includes(x._tpl)).map(x => x._id);
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

        // Add items that trader will buy (only sell items that have the container as parent) to request object
        for (const itemToSell of profileWithItemsToSell.Inventory.items.filter(x => inventoryContainerIds.includes(x.parentId))) // Only get 'root' items
        {
            // Skip default items (stashes/inventory object etc)
            if (inventoryContainerTpls.includes(itemToSell._tpl))
            {
                continue;
            }

            // Get item details to check later
            const itemDetails = this.itemHelper.getItem(itemToSell._tpl);
            // Skip if tpl isnt item OR item doesnt fulfill one of the traders buy categories
            if (!(itemDetails[0] && this.itemHelper.isOfBaseclasses(itemDetails[1]._id, traderDetails.items_buy.category)))
            {
                continue;
            }

            // Skip item if no price
            const handbookPrice = handbookPrices[itemToSell._tpl];
            if (!handbookPrice)
            {
                continue;
            }

            // Increment sell price in request
            sellRequest.price += handbookPrice;

            // Add item details to request
            // eslint-disable-next-line @typescript-eslint/naming-convention
            sellRequest.items.push({id: itemToSell._id, count: 1, scheme_id: 0});
        }

        return this.tradeHelper.sellItem(profileWithItemsToSell, profileThatGetsMoney, sellRequest, sessionId);
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

