import { inject, injectable } from "tsyringe";

import { BotHelper } from "@spt-aki/helpers/BotHelper";
import { Difficulty } from "@spt-aki/models/eft/common/tables/IBotType";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IPmcConfig } from "@spt-aki/models/spt/config/IPmcConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class BotDifficultyHelper
{
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    public getPmcDifficultySettings(
        pmcType: "bear" | "usec",
        difficulty: string,
        usecType: string,
        bearType: string,
    ): Difficulty
    {
        const difficultySettings = this.getDifficultySettings(pmcType, difficulty);

        const friendlyType = pmcType === "bear" ? bearType : usecType;
        const enemyType = pmcType === "bear" ? usecType : bearType;

        this.botHelper.addBotToEnemyList(difficultySettings, this.pmcConfig.enemyTypes, friendlyType); // Add generic bot types to enemy list
        this.botHelper.addBotToEnemyList(difficultySettings, [enemyType, friendlyType], ""); // add same/opposite side to enemy list

        this.botHelper.randomizePmcHostility(difficultySettings);

        return difficultySettings;
    }

    /**
     * Get difficulty settings for desired bot type, if not found use assault bot types
     * @param type bot type to retrieve difficulty of
     * @param difficulty difficulty to get settings for (easy/normal etc)
     * @returns Difficulty object
     */
    public getBotDifficultySettings(type: string, difficulty: string): Difficulty
    {
        const bot = this.databaseServer.getTables().bots.types[type];
        if (!bot)
        {
            // get fallback
            this.logger.warning(this.localisationService.getText("bot-unable_to_get_bot_fallback_to_assault", type));
            this.databaseServer.getTables().bots.types[type] = this.jsonUtil.clone(
                this.databaseServer.getTables().bots.types.assault,
            );
        }

        const difficultySettings = this.botHelper.getBotTemplate(type).difficulty[difficulty];
        if (!difficultySettings)
        {
            this.logger.warning(
                this.localisationService.getText("bot-unable_to_get_bot_difficulty_fallback_to_assault", {
                    botType: type,
                    difficulty: difficulty,
                }),
            );
            this.databaseServer.getTables().bots.types[type].difficulty[difficulty] = this.jsonUtil.clone(
                this.databaseServer.getTables().bots.types.assault.difficulty[difficulty],
            );
        }

        return this.jsonUtil.clone(difficultySettings);
    }

    /**
     * Get difficulty settings for a PMC
     * @param type "usec" / "bear"
     * @param difficulty what difficulty to retrieve
     * @returns Difficulty object
     */
    protected getDifficultySettings(type: string, difficulty: string): Difficulty
    {
        let difficultySetting = this.pmcConfig.difficulty.toLowerCase() === "asonline"
            ? difficulty
            : this.pmcConfig.difficulty.toLowerCase();

        difficultySetting = this.convertBotDifficultyDropdownToBotDifficulty(difficultySetting);

        return this.jsonUtil.clone(this.databaseServer.getTables().bots.types[type].difficulty[difficultySetting]);
    }

    /**
     * Translate chosen value from pre-raid difficulty dropdown into bot difficulty value
     * @param dropDownDifficulty Dropdown difficulty value to convert
     * @returns bot difficulty
     */
    public convertBotDifficultyDropdownToBotDifficulty(dropDownDifficulty: string): string
    {
        switch (dropDownDifficulty.toLowerCase())
        {
            case "medium":
                return "normal";
            case "random":
                return this.chooseRandomDifficulty();
            default:
                return dropDownDifficulty.toLowerCase();
        }
    }

    /**
     * Choose a random difficulty from - easy/normal/hard/impossible
     * @returns random difficulty
     */
    public chooseRandomDifficulty(): string
    {
        return this.randomUtil.getArrayValue(["easy", "normal", "hard", "impossible"]);
    }
}
