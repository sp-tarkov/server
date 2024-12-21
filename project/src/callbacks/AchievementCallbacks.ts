import { AchievementController } from "@spt/controllers/AchievementController";
import { ProfileController } from "@spt/controllers/ProfileController";
import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { ICompletedAchievementsResponse } from "@spt/models/eft/profile/ICompletedAchievementsResponse";
import type { IGetAchievementsResponse } from "@spt/models/eft/profile/IGetAchievementsResponse";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class AchievementCallbacks {
    constructor(
        @inject("AchievementController") protected achievementController: AchievementController,
        @inject("ProfileController") protected profileController: ProfileController,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
    ) {}

    /**
     * Handle client/achievement/list
     */
    public getAchievements(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetAchievementsResponse> {
        return this.httpResponse.getBody(this.achievementController.getAchievements(sessionID));
    }

    /**
     * Handle client/achievement/statistic
     */
    public statistic(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ICompletedAchievementsResponse> {
        return this.httpResponse.getBody(this.achievementController.getAchievementStatistics(sessionID));
    }
}
