import { inject, injectable } from "tsyringe";

import { ClientLogCallbacks } from "@spt-aki/callbacks/ClientLogCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class ClientLogStaticRouter extends StaticRouter
{
    constructor(
        @inject("ClientLogCallbacks") protected clientLogCallbacks: ClientLogCallbacks
    )
    {
        super(
            [
                new RouteAction(
                    "/singleplayer/log",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.clientLogCallbacks.clientLog(url, info, sessionID);
                    }
                )
            ]
        );
    }
}