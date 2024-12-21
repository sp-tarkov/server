import { NotifierCallbacks } from "@spt/callbacks/NotifierCallbacks";
import { DynamicRouter, RouteAction } from "@spt/di/Router";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class NotifierDynamicRouter extends DynamicRouter {
    constructor(@inject("NotifierCallbacks") protected notifierCallbacks: NotifierCallbacks) {
        super([
            new RouteAction(
                "/?last_id",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.notifierCallbacks.notify(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/notifierServer",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
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
                ): Promise<IGetBodyResponseData<any[]>> => {
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
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.notifierCallbacks.getNotifier(url, info, sessionID);
                },
            ),
        ]);
    }
}
