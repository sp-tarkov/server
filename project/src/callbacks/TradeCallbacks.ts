import { inject, injectable } from "tsyringe";

import { TradeController } from "../controllers/TradeController";
import { IPmcData } from "../models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBaseTradeRequestData } from "../models/eft/trade/IProcessBaseTradeRequestData";
import {
    IProcessRagfairTradeRequestData
} from "../models/eft/trade/IProcessRagfairTradeRequestData";

@injectable()
export class TradeCallbacks
{
    constructor(
        @inject("TradeController") protected tradeController: TradeController
    )
    { }

    /**
     * Handle client/game/profile/items/moving TradingConfirm event
     */
    public processTrade(pmcData: IPmcData, body: IProcessBaseTradeRequestData, sessionID: string): IItemEventRouterResponse
    {
        // body can be IProcessBuyTradeRequestData or IProcessSellTradeRequestData
        return this.tradeController.confirmTrading(pmcData, body, sessionID);
    }

    /** Handle RagFairBuyOffer event */
    public processRagfairTrade(pmcData: IPmcData, body: IProcessRagfairTradeRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.tradeController.confirmRagfairTrading(pmcData, body, sessionID);
    }

    /** Handle SellAllFromSavage event */
    public sellAllFromSavage(pmcData: IPmcData, body: any, sessionID: string): IItemEventRouterResponse
    {
        // TODO: Type the request body (if it is a new model).
        return this.tradeController.sellScavItemsToFence(pmcData, body, sessionID);
    }
}