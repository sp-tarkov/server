import { inject, injectable } from "tsyringe";
import { BotHelper } from "@spt/helpers/BotHelper";
import { Difficulty } from "@spt/models/eft/common/tables/IBotType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { RandomUtil } from "@spt/utils/RandomUtil";

@injectable()
export class BotDifficultyHelper
{
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    )
    {
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Get a difficulty object modified to handle fighting other PMCs
     * @param pmcType 'bear or 'usec'
     * @param difficulty easy / normal / hard / impossible
     * @param usecType pmcUSEC
     * @param bearType pmcBEAR
     * @returns Difficulty object
     */
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

        // Is PMC hostile to other PMC side
        const hostileToSameSide = this.randomUtil.getChance100(this.pmcConfig.chanceSameSideIsHostilePercent);

        // Add all non-PMC types to PMCs enemy list
        this.addBotToEnemyList(difficultySettings, this.pmcConfig.enemyTypes, friendlyType);

        // Add same/opposite side to enemy list
        const hostilePMCTypes = hostileToSameSide
            ? [enemyType, friendlyType]
            : [enemyType];
        this.addBotToEnemyList(difficultySettings, hostilePMCTypes);

        if (hostileToSameSide)
        {
            this.setDifficultyToHostileToBearAndUsec(difficultySettings);
        }

        return difficultySettings;
    }

    /**
     * Add bot types to ENEMY_BOT_TYPES array
     * @param difficultySettings Bot settings to alter
     * @param typesToAdd Bot types to add to enemy list
     * @param typeBeingEdited Bot type to ignore and not add to enemy list
     */
    protected addBotToEnemyList(difficultySettings: Difficulty, typesToAdd: string[], typeBeingEdited?: string): void
    {
        const enemyBotTypesKey = "ENEMY_BOT_TYPES";

        // Null guard
        if (!difficultySettings.Mind[enemyBotTypesKey])
        {
            difficultySettings.Mind[enemyBotTypesKey] = [];
        }

        const enemyArray = <string[]>difficultySettings.Mind[enemyBotTypesKey];
        for (const botTypeToAdd of typesToAdd)
        {
            if (typeBeingEdited?.toLowerCase() === botTypeToAdd.toLowerCase())
            {
                this.logger.debug(`unable to add enemy ${botTypeToAdd} to its own enemy list, skipping`);
                continue;
            }

            if (!enemyArray.includes(botTypeToAdd))
            {
                enemyArray.push(botTypeToAdd);
            }
        }
    }

    /**
     * Configure difficulty settings to be hostile to USEC and BEAR
     * Look up value in bot.json/chanceSameSideIsHostilePercent
     * @param difficultySettings pmc difficulty settings
     */
    protected setDifficultyToHostileToBearAndUsec(difficultySettings: Difficulty): void
    {
        difficultySettings.Mind.CAN_RECEIVE_PLAYER_REQUESTS_BEAR = false;
        difficultySettings.Mind.CAN_RECEIVE_PLAYER_REQUESTS_USEC = false;
        difficultySettings.Mind.DEFAULT_USEC_BEHAVIOUR = "Attack";
        difficultySettings.Mind.DEFAULT_BEAR_BEHAVIOUR = "Attack";
    }

    /**
     * Get difficulty settings for desired bot type, if not found use assault bot types
     * @param type bot type to retrieve difficulty of
     * @param difficulty difficulty to get settings for (easy/normal etc)
     * @returns Difficulty object
     */
    public getBotDifficultySettings(type: string, difficulty: string): Difficulty
    {
        const botDb = this.databaseService.getBots();

        const desiredType = type.toLowerCase();
        const bot = botDb.types[desiredType];
        if (!bot)
        {
            // No bot found, get fallback difficulty values
            this.logger.warning(this.localisationService.getText("bot-unable_to_get_bot_fallback_to_assault", type));
            botDb.types[desiredType] = this.cloner.clone(botDb.types.assault);
        }

        // Get settings from raw bot json template file
        const difficultySettings = this.botHelper.getBotTemplate(desiredType).difficulty[difficulty];
        if (!difficultySettings)
        {
            // No bot settings found, use 'assault' bot difficulty instead
            this.logger.warning(
                this.localisationService.getText("bot-unable_to_get_bot_difficulty_fallback_to_assault", {
                    botType: desiredType,
                    difficulty: difficulty,
                }),
            );
            botDb.types[desiredType].difficulty[difficulty]
                = this.cloner.clone(botDb.types.assault.difficulty[difficulty]);
        }

        return this.cloner.clone(difficultySettings);
    }

    /**
     * Get difficulty settings for a PMC
     * @param type "usec" / "bear"
     * @param difficulty what difficulty to retrieve
     * @returns Difficulty object
     */
    protected getDifficultySettings(type: string, difficulty: string): Difficulty
    {
        let difficultySetting
            = this.pmcConfig.difficulty.toLowerCase() === "asonline"
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
