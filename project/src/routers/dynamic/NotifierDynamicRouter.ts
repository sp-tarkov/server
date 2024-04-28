import { inject, injectable } from "tsyringe";

import { NotifierCallbacks } from "@spt-aki/callbacks/NotifierCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";

@injectable()
export class NotifierDynamicRouter extends DynamicRouter
{
    constructor(@inject("NotifierCallbacks") protected notifierCallbacks: NotifierCallbacks)
    {
        super([
            new RouteAction(
                "/?last_id",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.notifierCallbacks.notify(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/notifierServer",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.notifierCallbacks.notify(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/push/notifier/get/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> =>
                {
                    return this.notifierCallbacks.getNotifier(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/push/notifier/getwebsocket/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> =>
                {
                    return this.notifierCallbacks.getNotifier(url, info, sessionID);
                },
            ),
        ]);
    }
}
