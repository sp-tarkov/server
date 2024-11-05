import { AchievementCallbacks } from "@spt/callbacks/AchievementCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { ICompletedAchievementsResponse } from "@spt/models/eft/profile/ICompletedAchievementsResponse";
import { IGetAchievementsResponse } from "@spt/models/eft/profile/IGetAchievementsResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class AchievementStaticRouter extends StaticRouter {
    constructor(@inject("AchievementCallbacks") protected achievementCallbacks: AchievementCallbacks) {
        super([
            new RouteAction(
                "/client/achievement/list",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetAchievementsResponse>> => {
                    return this.achievementCallbacks.getAchievements(url, info, sessionID);
                },
            ),

            new RouteAction(
                "/client/achievement/statistic",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ICompletedAchievementsResponse>> => {
                    return this.achievementCallbacks.statistic(url, info, sessionID);
                },
            ),
        ]);
    }
}
