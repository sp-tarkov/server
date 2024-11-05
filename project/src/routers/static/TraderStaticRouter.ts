import { TraderCallbacks } from "@spt/callbacks/TraderCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { ITraderBase } from "@spt/models/eft/common/tables/ITrader";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { IModdedTraders } from "@spt/models/spt/config/ITraderConfig";
import { inject, injectable } from "tsyringe";

@injectable()
export class TraderStaticRouter extends StaticRouter {
    constructor(@inject("TraderCallbacks") protected traderCallbacks: TraderCallbacks) {
        super([
            new RouteAction(
                "/client/trading/api/traderSettings",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ITraderBase[]>> => {
                    return this.traderCallbacks.getTraderSettings(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/moddedTraders",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IModdedTraders>> => {
                    return this.traderCallbacks.getModdedTraderData(url, info, sessionID);
                },
            ),
        ]);
    }
}
