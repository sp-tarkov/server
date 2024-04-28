import { inject, injectable } from "tsyringe";

import { ClientLogCallbacks } from "@spt-aki/callbacks/ClientLogCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { INullResponseData } from "@spt-aki/models/eft/httpResponse/INullResponseData";

@injectable()
export class ClientLogStaticRouter extends StaticRouter
{
    constructor(@inject("ClientLogCallbacks") protected clientLogCallbacks: ClientLogCallbacks)
    {
        super([
            new RouteAction(
                "/singleplayer/log",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.clientLogCallbacks.clientLog(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/release",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.clientLogCallbacks.releaseNotes();
                },
            ),
            new RouteAction(
                "/singleplayer/enableBSGlogging",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.clientLogCallbacks.bsgLogging();
                },
            ),
        ]);
    }
}
