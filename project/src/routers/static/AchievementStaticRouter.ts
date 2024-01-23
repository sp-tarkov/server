import { inject, injectable } from "tsyringe";

import { AchievementCallbacks } from "@spt-aki/callbacks/AchievementCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class AchievementStaticRouter extends StaticRouter
{
    constructor(@inject("AchievementCallbacks") protected achievementCallbacks: AchievementCallbacks)
    {
        super([
            new RouteAction(
                "/client/achievement/list",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.achievementCallbacks.getAchievements(url, info, sessionID);
                },
            ),

            new RouteAction(
                "/client/achievement/statistic",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.achievementCallbacks.statistic(url, info, sessionID);
                },
            ),
        ]);
    }
}
