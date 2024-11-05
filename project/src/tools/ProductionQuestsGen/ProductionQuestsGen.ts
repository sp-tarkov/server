/**
 * Automatically update the `questId` property for production `QuestComplete` requirements in `assets/database/hideout/production.json`
 * Based on data from both `production.json` and `quests.json`.
 *
 * Usage:
 * - Run this script using npm: `npm run gen:productionquests`
 *
 * Notes:
 * - Some productions may output "Unable to find quest" if new quests or event quests haven't been dumped
 * - Some productions may output "Quest ... is already associated" if a quest unlocks multiple assorts, this can be ignored
 * - The list of "blacklistedProductions" is to stop spurious errors when we know a production is no longer necessary (Old events)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { OnLoad } from "@spt/di/OnLoad";
import { QuestRewardType } from "@spt/models/enums/QuestRewardType";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class ProductionQuestsGen {
    private questProductionOutputList: QuestProductionOutput[] = [];
    private questProductionMap: Record<string, string> = {};

    private blacklistedProductions = [
        "6617cdb6b24b0ea24505f618", // Old event quest production "Radio Repeater" alt recipe
        "66140c4a9688754de10dac07", // Old event quest production "Documents with decrypted data"
        "661e6c26750e453380391f55", // Old event quest production "Documents with decrypted data"
        "660c2dbaa2a92e70cc074863", // Old event quest production "Decrypted flash drive"
    ];

    constructor(
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("PrimaryLogger") protected logger: ILogger,
        @injectAll("OnLoad") protected onLoadComponents: OnLoad[],
    ) {}

    async run(): Promise<void> {
        // Load all of the onload components, this gives us access to most of SPTs injections
        for (const onLoad of this.onLoadComponents) {
            await onLoad.onLoad();
        }

        // Build up our dataset
        this.buildQuestProductionList();
        this.updateProductionQuests();

        // Dump the new data to disk
        const currentDir = path.dirname(__filename);
        const projectDir = path.resolve(currentDir, "..", "..", "..");
        const hideoutDir = path.join(projectDir, "assets", "database", "hideout");
        const productionOutPath = path.join(hideoutDir, "production.json");
        fs.writeFileSync(
            productionOutPath,
            JSON.stringify(this.databaseServer.getTables().hideout.production, null, 2),
            "utf-8",
        );
    }

    private updateProductionQuests(): void {
        // Loop through all productions, and try to associate any with a `QuestComplete` type with its quest
        for (const production of this.databaseServer.getTables().hideout.production.recipes) {
            // Skip blacklisted productions
            if (this.blacklistedProductions.includes(production._id)) continue;

            // If the production has no quest requirement, or more than 1, skip it
            const questCompleteList = production.requirements.filter((req) => req.type === "QuestComplete");
            if (questCompleteList.length === 0) continue;
            if (questCompleteList.length > 1) {
                this.logger.error(`Error, production ${production._id} contains multiple QuestComplete requirements`);
                continue;
            }

            // Try to find the quest that matches this production
            const questProductionOutputs = this.questProductionOutputList.filter(
                (output) => output.ItemTemplate === production.endProduct && output.Quantity === production.count,
            );

            // Make sure we found valid data
            if (!this.isValidQuestProduction(production, questProductionOutputs, questCompleteList[0])) continue;

            // Update the production quest ID
            this.questProductionMap[questProductionOutputs[0].QuestId] = production._id;
            questCompleteList[0].questId = questProductionOutputs[0].QuestId;
            this.logger.success(
                `Updated ${production._id}, ${production.endProduct} with quantity ${production.count} to target quest ${questProductionOutputs[0].QuestId}`,
            );
        }
    }

    private isValidQuestProduction(production, questProductionOutputs, questComplete): boolean {
        // A lot of error handling for edge cases
        if (questProductionOutputs.length === 0) {
            this.logger.error(
                `Unable to find quest for production ${production._id}, endProduct ${production.endProduct} with quantity ${production.count}. Potential new or removed quest`,
            );
            return false;
        }
        if (questProductionOutputs.length > 1) {
            this.logger.error(
                `Multiple quests match production ${production._id}, endProduct ${production.endProduct} with quantity ${production.count}`,
            );
            return false;
        }
        if (questComplete.questId && questComplete.questId !== questProductionOutputs[0].QuestId) {
            this.logger.error(
                `Multiple productions match quest. EndProduct ${production.endProduct} with quantity ${production.count}, existing quest ${questComplete.questId}`,
            );
            return false;
        }
        if (this.questProductionMap[questProductionOutputs[0].QuestId]) {
            this.logger.warning(
                `Quest ${questProductionOutputs[0].QuestId} is already associated with production ${this.questProductionMap[questProductionOutputs[0].QuestId]}. Potential conflict`,
            );
        }

        return true;
    }

    // Build a list of all quests and what production they unlock
    private buildQuestProductionList(): void {
        for (const quest of Object.values(this.databaseServer.getTables().templates.quests)) {
            for (const rewardState of Object.values(quest.rewards)) {
                for (const reward of rewardState) {
                    if (reward.type !== QuestRewardType.PRODUCTIONS_SCHEME) continue;

                    // Make the assumption all productions only output a single item template
                    const output: QuestProductionOutput = {
                        QuestId: quest._id,
                        ItemTemplate: reward.items[0]._tpl,
                        Quantity: 0,
                    };

                    for (const item of reward.items) {
                        // Skip any item that has a parent, we only care about the root item(s)
                        if (item.parentId) continue;
                        if (item._tpl !== output.ItemTemplate) {
                            this.logger.error(
                                `Production scheme has multiple output items. ${output.ItemTemplate} !== ${item._tpl}`,
                            );
                            continue;
                        }

                        output.Quantity += item.upd.StackObjectsCount;
                    }

                    this.questProductionOutputList.push(output);
                }
            }
        }
    }
}

class QuestProductionOutput {
    public QuestId: string;
    public ItemTemplate: string;
    public Quantity: number;
}
