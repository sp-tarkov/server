import { BotHelper } from "@spt/helpers/BotHelper";
import { IDifficultyCategories } from "@spt/models/eft/common/tables/IBotType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IBots } from "@spt/models/spt/bots/IBots";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotDifficultyHelper {
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Get difficulty settings for desired bot type, if not found use assault bot types
     * @param type bot type to retrieve difficulty of
     * @param difficulty difficulty to get settings for (easy/normal etc)
     * @param botDb bots from database
     * @returns Difficulty object
     */
    public getBotDifficultySettings(type: string, difficulty: string, botDb: IBots): IDifficultyCategories {
        const desiredType = type.toLowerCase();
        const bot = botDb.types[desiredType];
        if (!bot) {
            // No bot found, get fallback difficulty values
            this.logger.warning(this.localisationService.getText("bot-unable_to_get_bot_fallback_to_assault", type));
            botDb.types[desiredType] = this.cloner.clone(botDb.types.assault);
        }

        // Get settings from raw bot json template file
        const difficultySettings = this.botHelper.getBotTemplate(desiredType).difficulty[difficulty];
        if (!difficultySettings) {
            // No bot settings found, use 'assault' bot difficulty instead
            this.logger.warning(
                this.localisationService.getText("bot-unable_to_get_bot_difficulty_fallback_to_assault", {
                    botType: desiredType,
                    difficulty: difficulty,
                }),
            );
            botDb.types[desiredType].difficulty[difficulty] = this.cloner.clone(
                botDb.types.assault.difficulty[difficulty],
            );
        }

        return this.cloner.clone(difficultySettings);
    }

    /**
     * Get difficulty settings for a PMC
     * @param type "usec" / "bear"
     * @param difficulty what difficulty to retrieve
     * @returns Difficulty object
     */
    protected getDifficultySettings(type: string, difficulty: string): IDifficultyCategories {
        let difficultySetting =
            this.pmcConfig.difficulty.toLowerCase() === "asonline"
                ? difficulty
                : this.pmcConfig.difficulty.toLowerCase();

        difficultySetting = this.convertBotDifficultyDropdownToBotDifficulty(difficultySetting);

        return this.cloner.clone(this.databaseService.getBots().types[type].difficulty[difficultySetting]);
    }

    /**
     * Translate chosen value from pre-raid difficulty dropdown into bot difficulty value
     * @param dropDownDifficulty Dropdown difficulty value to convert
     * @returns bot difficulty
     */
    public convertBotDifficultyDropdownToBotDifficulty(dropDownDifficulty: string): string {
        switch (dropDownDifficulty.toLowerCase()) {
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
    public chooseRandomDifficulty(): string {
        return this.randomUtil.getArrayValue(["easy", "normal", "hard", "impossible"]);
    }
}
