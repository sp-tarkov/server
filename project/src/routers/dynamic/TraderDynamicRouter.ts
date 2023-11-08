import { inject, injectable } from "tsyringe";

import { TraderCallbacks } from "@spt-aki/callbacks/TraderCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";

@injectable()
export class TraderDynamicRouter extends DynamicRouter {
    constructor(@inject("TraderCallbacks") protected traderCallbacks: TraderCallbacks) {
        super([
            new RouteAction(
                "/client/trading/api/getTrader/",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.traderCallbacks.getTrader(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/trading/api/getTraderAssort/",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.traderCallbacks.getAssort(url, info, sessionID);
                }
            ),
        ]);
    }
}
