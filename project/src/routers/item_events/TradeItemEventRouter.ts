import { TradeCallbacks } from "@spt/callbacks/TradeCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class TradeItemEventRouter extends ItemEventRouterDefinition {
    constructor(@inject("TradeCallbacks") protected tradeCallbacks: TradeCallbacks) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [
            new HandledRoute("TradingConfirm", false),
            new HandledRoute("RagFairBuyOffer", false),
            new HandledRoute("SellAllFromSavage", false),
        ];
    }

    public override async handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
    ): Promise<IItemEventRouterResponse> {
        switch (url) {
            case "TradingConfirm":
                return this.tradeCallbacks.processTrade(pmcData, body, sessionID);
            case "RagFairBuyOffer":
                return this.tradeCallbacks.processRagfairTrade(pmcData, body, sessionID);
            case "SellAllFromSavage":
                return this.tradeCallbacks.sellAllFromSavage(pmcData, body, sessionID);
        }
    }
}
