import { inject, injectable } from "tsyringe";

import { NotifierCallbacks } from "@spt-aki/callbacks/NotifierCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";

@injectable()
export class NotifierDynamicRouter extends DynamicRouter 
{
    constructor(
        @inject("NotifierCallbacks") protected notifierCallbacks: NotifierCallbacks
    ) 
    {
        super(
            [
                new RouteAction(
                    "/?last_id",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.notifierCallbacks.notify(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/notifierServer",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.notifierCallbacks.notify(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/push/notifier/get/",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.notifierCallbacks.getNotifier(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/push/notifier/getwebsocket/",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.notifierCallbacks.getNotifier(url, info, sessionID);
                    }
                )
            ]
        );

    }
}