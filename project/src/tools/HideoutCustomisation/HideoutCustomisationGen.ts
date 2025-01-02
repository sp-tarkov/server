/**
 * Hydrate customisationStorage.json with data scraped together from other sources
 *
 * Usage:
 * - Run this script using npm: `npm run gen:customisationstorage`
 *
 */
import { dirname, join, resolve } from "node:path";
import { OnLoad } from "@spt/di/OnLoad";
import { IQuestReward } from "@spt/models/eft/common/tables/IQuest";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { FileSystem } from "@spt/utils/FileSystem";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class HideoutCustomisationGen {
    private questCustomisationReward: Record<string, IQuestReward[]> = {};
    private achievementCustomisationReward: Record<string, IQuestReward[]> = {};

    constructor(
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("FileSystem") protected fileSystem: FileSystem,
        @injectAll("OnLoad") protected onLoadComponents: OnLoad[],
    ) {}

    async run(): Promise<void> {
        // Load all of the onload components, this gives us access to most of SPTs injections
        for (const onLoad of this.onLoadComponents) {
            await onLoad.onLoad();
        }

        // Build up our dataset
        this.buildQuestCustomisationList();
        this.buildAchievementRewardCustomisationList();
        this.updateCustomisationStorage();

        // Dump the new data to disk
        const currentDir = dirname(__filename);
        const projectDir = resolve(currentDir, "..", "..", "..");
        const templatesDir = join(projectDir, "assets", "database", "templates");
        const customisationStorageOutPath = join(templatesDir, "customisationStorage.json");
        await this.fileSystem.write(
            customisationStorageOutPath,
            JSON.stringify(this.databaseServer.getTables().templates?.customisationStorage, null, 2),
        );
    }

    private updateCustomisationStorage(): void {
        const customisationStoageDb = this.databaseServer.getTables().templates?.customisationStorage;
        if (!customisationStoageDb) {
            // no customisation storage in templates, nothing to do
            return;
        }
        for (const globalCustomisationDb of this.databaseServer.getTables().hideout?.customisation.globals) {
            // Look for customisations that have a quest unlock condition
            const questOrAchievementRequirement = globalCustomisationDb.conditions.find((condition) =>
                ["Quest", "Block"].includes(condition.conditionType),
            );

            if (!questOrAchievementRequirement) {
                // Customisation doesnt have a requirement, skip
                continue;
            }

            if (customisationStoageDb.some((custStorageItem) => custStorageItem.id === globalCustomisationDb.id)) {
                // Exists already in output destination file, skip
                continue;
            }

            const matchingQuest = this.questCustomisationReward[questOrAchievementRequirement.target as string];
            const matchingAchievement =
                this.achievementCustomisationReward[questOrAchievementRequirement.target as string];

            let source = null;
            if (matchingQuest) {
                source = "unlockedInGame";
            } else if (matchingAchievement) {
                source = "achievement";
            }
            if (!source) {
                this.logger.error(
                    `Found customisation to add but unable to establish source. Id: ${globalCustomisationDb.id} type: ${globalCustomisationDb.type}`,
                );
                continue;
            }

            this.logger.success(
                `Adding Id: ${globalCustomisationDb.id} Source: ${source} type: ${globalCustomisationDb.type}`,
            );
            customisationStoageDb.push({
                id: globalCustomisationDb.id,
                source: source,
                type: globalCustomisationDb.type,
            });
        }
    }

    // Build a dictionary of all quests with a `CustomizationDirect` reward
    private buildQuestCustomisationList(): void {
        for (const quest of Object.values(this.databaseServer.getTables().templates.quests)) {
            const allRewards: IQuestReward[] = [
                ...quest.rewards.Fail,
                ...quest.rewards.Success,
                ...quest.rewards.Started,
            ];
            const customisationDirectRewards = allRewards.filter((reward) => reward.type === "CustomizationDirect");
            for (const directReward of customisationDirectRewards) {
                if (!this.questCustomisationReward[quest._id]) {
                    this.questCustomisationReward[quest._id] = [];
                }
                this.questCustomisationReward[quest._id].push(directReward);
            }
        }
    }

    // Build a dictionary of all achievements with a `CustomizationDirect` reward
    private buildAchievementRewardCustomisationList(): void {
        for (const achievement of Object.values(this.databaseServer.getTables().templates?.achievements)) {
            const allRewards: IQuestReward[] = Object.values(achievement.rewards);
            const customisationDirectRewards = allRewards.filter((reward) => reward.type === "CustomizationDirect");
            for (const directReward of customisationDirectRewards) {
                if (!this.achievementCustomisationReward[achievement.id]) {
                    this.achievementCustomisationReward[achievement.id] = [];
                }
                this.achievementCustomisationReward[achievement.id].push(directReward);
            }
        }
    }
}
