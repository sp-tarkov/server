import { inject, injectable } from "tsyringe";

import { NotifierCallbacks } from "@spt-aki/callbacks/NotifierCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class NotifierStaticRouter extends StaticRouter {
    constructor(@inject("NotifierCallbacks") protected notifierCallbacks: NotifierCallbacks) {
        super([
            new RouteAction(
                "/client/notifier/channel/create",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.notifierCallbacks.createNotifierChannel(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/game/profile/select",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.notifierCallbacks.selectProfile(url, info, sessionID);
                }
            ),
        ]);
    }
}
