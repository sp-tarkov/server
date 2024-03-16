import { inject, injectable } from "tsyringe";

import { ClientLogCallbacks } from "@spt-aki/callbacks/ClientLogCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class ClientLogStaticRouter extends StaticRouter
{
    constructor(@inject("ClientLogCallbacks") protected clientLogCallbacks: ClientLogCallbacks)
    {
        super([
            new RouteAction("/singleplayer/log", (url: string, info: any, sessionID: string, output: string): any =>
            {
                return this.clientLogCallbacks.clientLog(url, info, sessionID);
            }),
            new RouteAction("/singleplayer/release", (url: string, info: any, sessionID: string, output: string) =>
            {
                return this.clientLogCallbacks.releaseNotes();
            }),
            new RouteAction(
                "/singleplayer/enableBSGlogging",
                (url: string, info: any, sessionID: string, output: string) =>
                {
                    return this.clientLogCallbacks.bsgLogging();
                },
            ),
        ]);
    }
}
