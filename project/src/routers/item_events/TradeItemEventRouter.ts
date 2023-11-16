import { inject, injectable } from "tsyringe";

import { TradeCallbacks } from "@spt-aki/callbacks/TradeCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt-aki/di/Router";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";

@injectable()
export class TradeItemEventRouter extends ItemEventRouterDefinition
{
    constructor(@inject("TradeCallbacks") protected tradeCallbacks: TradeCallbacks)
    {
        super();
    }

    public override getHandledRoutes(): HandledRoute[]
    {
        return [
            new HandledRoute("TradingConfirm", false),
            new HandledRoute("RagFairBuyOffer", false),
            new HandledRoute("SellAllFromSavage", false),
        ];
    }

    public override handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
    ): IItemEventRouterResponse
    {
        switch (url)
        {
            case "TradingConfirm":
                return this.tradeCallbacks.processTrade(pmcData, body, sessionID);
            case "RagFairBuyOffer":
                return this.tradeCallbacks.processRagfairTrade(pmcData, body, sessionID);
            case "SellAllFromSavage":
                return this.tradeCallbacks.sellAllFromSavage(pmcData, body, sessionID);
        }
    }
}
