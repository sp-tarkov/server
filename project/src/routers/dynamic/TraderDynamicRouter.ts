import { TraderCallbacks } from "@spt/callbacks/TraderCallbacks";
import { DynamicRouter, RouteAction } from "@spt/di/Router";
import type { ITraderAssort, ITraderBase } from "@spt/models/eft/common/tables/ITrader";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class TraderDynamicRouter extends DynamicRouter {
    constructor(@inject("TraderCallbacks") protected traderCallbacks: TraderCallbacks) {
        super([
            new RouteAction(
                "/client/trading/api/getTrader/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ITraderBase>> => {
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
                ): Promise<IGetBodyResponseData<ITraderAssort>> => {
                    return this.traderCallbacks.getAssort(url, info, sessionID);
                },
            ),
        ]);
    }
}
