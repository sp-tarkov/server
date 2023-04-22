import { inject, injectable } from "tsyringe";

import { ApplicationContext } from "../context/ApplicationContext";
import { ContextVariableType } from "../context/ContextVariableType";
import { BotGenerator } from "../generators/BotGenerator";
import { BotDifficultyHelper } from "../helpers/BotDifficultyHelper";
import { BotHelper } from "../helpers/BotHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { IGenerateBotsRequestData } from "../models/eft/bot/IGenerateBotsRequestData";
import { IBotBase } from "../models/eft/common/tables/IBotBase";
import { IBotCore } from "../models/eft/common/tables/IBotCore";
import { Difficulty } from "../models/eft/common/tables/IBotType";
import {
    IGetRaidConfigurationRequestData
} from "../models/eft/match/IGetRaidConfigurationRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { BotGenerationDetails } from "../models/spt/bots/BotGenerationDetails";
import { IBotConfig } from "../models/spt/config/IBotConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { BotGenerationCacheService } from "../services/BotGenerationCacheService";
import { LocalisationService } from "../services/LocalisationService";
import { MatchBotDetailsCacheService } from "../services/MatchBotDetailsCacheService";
import { JsonUtil } from "../utils/JsonUtil";

@injectable()
export class BotController
{
    protected botConfig: IBotConfig;
    public static readonly pmcTypeLabel = "PMC";

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("BotGenerator") protected botGenerator: BotGenerator,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("BotDifficultyHelper") protected botDifficultyHelper: BotDifficultyHelper,
        @inject("BotGenerationCacheService") protected botGenerationCacheService: BotGenerationCacheService,
        @inject("MatchBotDetailsCacheService") protected matchBotDetailsCacheService: MatchBotDetailsCacheService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("JsonUtil") protected jsonUtil: JsonUtil
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Return the number of bot loadout varieties to be generated
     * @param type bot Type we want the loadout gen count for
     * @returns number of bots to generate
     */
    public getBotPresetGenerationLimit(type: string): number
    {
        return this.botConfig.presetBatch[(type === "assaultGroup")
            ? "assault"
            : type];
    }

    /**
     * Get the core.json difficulty settings from database\bots
     * @returns IBotCore
     */
    public getBotCoreDifficulty(): IBotCore
    {
        return this.databaseServer.getTables().bots.core;
    }

    /**
     * Get bot difficulty settings
     * adjust PMC settings to ensure they engage the correct bot types
     * @param type what bot the server is requesting settings for
     * @param difficulty difficulty level server requested settings for
     * @returns Difficulty object
     */
    public getBotDifficulty(type: string, difficulty: string): Difficulty
    {
        const raidConfig = this.applicationContext.getLatestValue(ContextVariableType.RAID_CONFIGURATION).getValue<IGetRaidConfigurationRequestData>();

        // Check value chosen in pre-raid difficulty dropdown
        // If value is not 'asonline', change requested difficulty to be what was chosen in dropdown
        const botDifficultyDropDownValue = raidConfig.wavesSettings.botDifficulty.toLowerCase();
        if (botDifficultyDropDownValue !== "asonline")
        {
            difficulty = this.botDifficultyHelper.convertBotDifficultyDropdownToBotDifficulty(botDifficultyDropDownValue);
        }

        let difficultySettings: Difficulty;
        const lowercasedBotType = type.toLowerCase();
        switch (lowercasedBotType)
        {
            case this.botConfig.pmc.bearType.toLowerCase():
                difficultySettings = this.botDifficultyHelper.getPmcDifficultySettings("bear", difficulty, this.botConfig.pmc.usecType, this.botConfig.pmc.bearType);
                break;
            case this.botConfig.pmc.usecType.toLowerCase():
                difficultySettings = this.botDifficultyHelper.getPmcDifficultySettings("usec", difficulty, this.botConfig.pmc.usecType, this.botConfig.pmc.bearType);
                break;
            default:
                difficultySettings = this.botDifficultyHelper.getBotDifficultySettings(type, difficulty);
                // Don't add pmcs to gifter enemy list
                if (type.toLowerCase() !== "gifter")
                {
                    this.botHelper.addBotToEnemyList(difficultySettings, [this.botConfig.pmc.bearType, this.botConfig.pmc.usecType], lowercasedBotType);
                }
                
                break;
        }

        return difficultySettings;
    }

    /**
     * Generate bot profiles and store in cache
     * @param sessionId Session id
     * @param info bot generation request info
     * @returns IBotBase array
     */
    public generate(sessionId: string, info: IGenerateBotsRequestData): IBotBase[]
    {
        const pmcProfile = this.profileHelper.getPmcProfile(sessionId);

        const botsToReturn: IBotBase[] = [];
        for (const condition of info.conditions)
        {
            const botGenerationDetails: BotGenerationDetails = {
                isPmc: false,
                side: "Savage",
                role: condition.Role,
                playerLevel: pmcProfile.Info.Level,
                botRelativeLevelDeltaMax: this.botConfig.pmc.botRelativeLevelDeltaMax,
                botCountToGenerate: this.botConfig.botGenerationBatchSizePerType,
                botDifficulty: condition.Difficulty,
                isPlayerScav: false
            };

            // Custom map waves can have spt roles in them
            // Is bot type sptusec/sptbear, set is pmc true and set side
            if (this.botHelper.botRoleIsPmc(condition.Role))
            {
                botGenerationDetails.isPmc = true;
                botGenerationDetails.side = this.botHelper.getPmcSideByRole(condition.Role);
            }

            // Loop over and make x bots for this condition
            let cacheKey = "";
            for (let i = 0; i < botGenerationDetails.botCountToGenerate; i ++)
            {
                const details = this.jsonUtil.clone(botGenerationDetails);

                // If ispmc not true, roll chance to be pmc if type is allowed to be one
                const botConvertRateMinMax = this.botConfig.pmc.convertIntoPmcChance[details.role.toLowerCase()];
                if (botConvertRateMinMax)
                {
                    // Should bot become PMC
                    const convertToPmc = this.botHelper.rollChanceToBePmc(details.role, botConvertRateMinMax);
                    if (convertToPmc)
                    {
                        details.isPmc = true;
                        details.role = this.botHelper.getRandomizedPmcRole();
                        details.side = this.botHelper.getPmcSideByRole(details.role);
                        details.botDifficulty = this.getPMCDifficulty(details.botDifficulty);
                    }
                }

                cacheKey = `${details.role}${details.botDifficulty}`;
                // Check for bot in cache, add if not
                if (!this.botGenerationCacheService.cacheHasBotOfRole(cacheKey))
                {
                    // Generate and add x bots to cache
                    const botsToAddToCache = this.botGenerator.prepareAndGenerateBots(sessionId, details);
                    this.botGenerationCacheService.storeBots(cacheKey, botsToAddToCache);
                }
            }
            // Get bot from cache, add to return array
            const botToReturn = this.botGenerationCacheService.getBot(cacheKey);

            if (info.conditions.length === 1)
            {
                // Cache bot when we're returning 1 bot, this indicated the bot is being requested to be spawned
                this.matchBotDetailsCacheService.cacheBot(botToReturn);
            }

            botsToReturn.push(botToReturn);
        }

        return botsToReturn;
    }

    /**
     * Get the difficulty passed in, if its not "asoline", get selected difficulty from config
     * @param requestedDifficulty 
     * @returns 
     */
    public getPMCDifficulty(requestedDifficulty: string): string
    {
        // maybe retrun a random difficulty...
        if (this.botConfig.pmc.difficulty.toLowerCase() === "asonline")
        {
            return requestedDifficulty;
        }

        if (this.botConfig.pmc.difficulty.toLowerCase() === "random")
        {
            return this.botDifficultyHelper.chooseRandomDifficulty();
        }

        return this.botConfig.pmc.difficulty;
    }

    /**
     * Get the max number of bots allowed on a map
     * Looks up location player is entering when getting cap value
     * @returns cap number
     */
    public getBotCap(): number
    {
        const defaultMapCapId = "default";
        const raidConfig = this.applicationContext.getLatestValue(ContextVariableType.RAID_CONFIGURATION).getValue<IGetRaidConfigurationRequestData>();
        if (!raidConfig)
        {
            this.logger.warning(this.localisationService.getText("bot-missing_saved_match_info"));
        }

        const mapName = (raidConfig)
            ? raidConfig.location
            : defaultMapCapId;

        let botCap = this.botConfig.maxBotCap[mapName.toLowerCase()];
        if (!botCap)
        {
            this.logger.warning(this.localisationService.getText("bot-no_bot_cap_found_for_location", raidConfig.location.toLowerCase()));
            botCap = this.botConfig.maxBotCap[defaultMapCapId];
        }

        return botCap;
    }

    public getPmcBotTypes(): Record<string, Record<string, Record<string, number>>>
    {
        return this.botConfig.pmc.pmcType;
    }
}
