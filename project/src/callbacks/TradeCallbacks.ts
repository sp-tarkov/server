import { TradeController } from "@spt/controllers/TradeController";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import type { IProcessBaseTradeRequestData } from "@spt/models/eft/trade/IProcessBaseTradeRequestData";
import type { IProcessRagfairTradeRequestData } from "@spt/models/eft/trade/IProcessRagfairTradeRequestData";
import type { ISellScavItemsToFenceRequestData } from "@spt/models/eft/trade/ISellScavItemsToFenceRequestData";
import { inject, injectable } from "tsyringe";

@injectable()
export class TradeCallbacks {
    constructor(@inject("TradeController") protected tradeController: TradeController) {}

    /**
     * Handle client/game/profile/items/moving TradingConfirm event
     */
    public processTrade(
        pmcData: IPmcData,
        body: IProcessBaseTradeRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        // body can be IProcessBuyTradeRequestData or IProcessSellTradeRequestData
        return this.tradeController.confirmTrading(pmcData, body, sessionID);
    }

    /** Handle RagFairBuyOffer event */
    public processRagfairTrade(
        pmcData: IPmcData,
        body: IProcessRagfairTradeRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.tradeController.confirmRagfairTrading(pmcData, body, sessionID);
    }

    /** Handle SellAllFromSavage event */
    public sellAllFromSavage(
        pmcData: IPmcData,
        body: ISellScavItemsToFenceRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.tradeController.sellScavItemsToFence(pmcData, body, sessionID);
    }
}
