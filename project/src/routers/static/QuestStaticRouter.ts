import { inject, injectable } from "tsyringe";

import { QuestCallbacks } from "@spt-aki/callbacks/QuestCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class QuestStaticRouter extends StaticRouter {
    constructor(@inject("QuestCallbacks") protected questCallbacks: QuestCallbacks) {
        super([
            new RouteAction(
                "/client/quest/list",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.questCallbacks.listQuests(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/repeatalbeQuests/activityPeriods",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.questCallbacks.activityPeriods(url, info, sessionID);
                }
            ),
        ]);
    }
}
