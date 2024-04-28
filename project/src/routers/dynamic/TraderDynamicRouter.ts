import { inject, injectable } from "tsyringe";

import { TraderCallbacks } from "@spt-aki/callbacks/TraderCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";
import { ITraderAssort, ITraderBase } from "@spt-aki/models/eft/common/tables/ITrader";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";

@injectable()
export class TraderDynamicRouter extends DynamicRouter
{
    constructor(@inject("TraderCallbacks") protected traderCallbacks: TraderCallbacks)
    {
        super([
            new RouteAction(
                "/client/trading/api/getTrader/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ITraderBase>> =>
                {
                    return this.traderCallbacks.getTrader(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/trading/api/getTraderAssort/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ITraderAssort>> =>
                {
                    return this.traderCallbacks.getAssort(url, info, sessionID);
                },
            ),
        ]);
    }
}
