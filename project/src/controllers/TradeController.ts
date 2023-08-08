import { inject, injectable } from "tsyringe";

import { ItemHelper } from "../helpers/ItemHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { TradeHelper } from "../helpers/TradeHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Upd } from "../models/eft/common/tables/IItem";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBaseTradeRequestData } from "../models/eft/trade/IProcessBaseTradeRequestData";
import { IProcessBuyTradeRequestData } from "../models/eft/trade/IProcessBuyTradeRequestData";
import {
    IProcessRagfairTradeRequestData
} from "../models/eft/trade/IProcessRagfairTradeRequestData";
import { IProcessSellTradeRequestData } from "../models/eft/trade/IProcessSellTradeRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MemberCategory } from "../models/enums/MemberCategory";
import { IRagfairConfig } from "../models/spt/config/IRagfairConfig";
import { ITraderConfig } from "../models/spt/config/ITraderConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { RagfairServer } from "../servers/RagfairServer";
import { LocalisationService } from "../services/LocalisationService";
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
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("RagfairServer") protected ragfairServer: RagfairServer,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
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
            return this.tradeHelper.sellItem(pmcData, sellData, sessionID);
        }

        return null;
    }
}

export { TradeController };

