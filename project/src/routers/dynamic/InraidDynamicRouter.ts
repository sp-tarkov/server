import { inject, injectable } from "tsyringe";

import { InraidCallbacks } from "@spt-aki/callbacks/InraidCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";
import { INullResponseData } from "@spt-aki/models/eft/httpResponse/INullResponseData";

@injectable()
export class InraidDynamicRouter extends DynamicRouter
{
    constructor(@inject("InraidCallbacks") protected inraidCallbacks: InraidCallbacks)
    {
        super([
            new RouteAction(
                "/client/location/getLocalloot",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.inraidCallbacks.registerPlayer(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/traderServices/getTraderServices/",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.inraidCallbacks.getTraderServices(url, info, sessionID);
                },
            ),
        ]);
    }

    public override getTopLevelRoute(): string
    {
        return "aki-name";
    }
}
