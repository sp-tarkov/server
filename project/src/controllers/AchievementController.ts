import { ICompletedAchievementsResponse } from "@spt/models/eft/profile/ICompletedAchievementsResponse";
import { IGetAchievementsResponse } from "@spt/models/eft/profile/IGetAchievementsResponse";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { inject, injectable } from "tsyringe";

/**
 * Logic for handling In Raid callbacks
 */
@injectable()
export class AchievementController {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
    ) {}

    /**
     * Get base achievements
     * @param sessionID Session id
     */
    public getAchievements(sessionID: string): IGetAchievementsResponse {
        return { elements: this.databaseService.getAchievements() };
    }

    /**
     * Shows % of 'other' players who've completed each achievement
     * @param sessionId Session id
     * @returns ICompletedAchievementsResponse
     */
    public getAchievementStatistics(sessionId: string): ICompletedAchievementsResponse {
        const achievements = this.databaseService.getAchievements();
        const stats = {};

        for (const achievement of achievements) {
            stats[achievement.id] = 0;
        }

        return { elements: stats };
    }
}
