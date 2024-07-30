import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { BotGenerator } from "@spt/generators/BotGenerator";
import { BotDifficultyHelper } from "@spt/helpers/BotDifficultyHelper";
import { BotHelper } from "@spt/helpers/BotHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { MinMax } from "@spt/models/common/MinMax";
import { Condition, IGenerateBotsRequestData } from "@spt/models/eft/bot/IGenerateBotsRequestData";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IBotBase } from "@spt/models/eft/common/tables/IBotBase";
import { IBotCore } from "@spt/models/eft/common/tables/IBotCore";
import { Difficulty } from "@spt/models/eft/common/tables/IBotType";
import { IGetRaidConfigurationRequestData } from "@spt/models/eft/match/IGetRaidConfigurationRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { SideType } from "@spt/models/enums/SideType";
import { WildSpawnTypeNumber } from "@spt/models/enums/WildSpawnTypeNumber";
import { BotGenerationDetails } from "@spt/models/spt/bots/BotGenerationDetails";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { BotGenerationCacheService } from "@spt/services/BotGenerationCacheService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MatchBotDetailsCacheService } from "@spt/services/MatchBotDetailsCacheService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotController {
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("BotGenerator") protected botGenerator: BotGenerator,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("BotDifficultyHelper") protected botDifficultyHelper: BotDifficultyHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("BotGenerationCacheService") protected botGenerationCacheService: BotGenerationCacheService,
        @inject("MatchBotDetailsCacheService") protected matchBotDetailsCacheService: MatchBotDetailsCacheService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Return the number of bot load-out varieties to be generated
     * @param type bot Type we want the load-out gen count for
     * @returns number of bots to generate
     */
    public getBotPresetGenerationLimit(type: string): number {
        const value = this.botConfig.presetBatch[type === "assaultGroup" ? "assault" : type];

        if (!value) {
            this.logger.warning(this.localisationService.getText("bot-bot_preset_count_value_missing", type));

            return 30;
        }

        return value;
    }

    /**
     * Handle singleplayer/settings/bot/difficulty
     * Get the core.json difficulty settings from database/bots
     * @returns IBotCore
     */
    public getBotCoreDifficulty(): IBotCore {
        return this.databaseService.getBots().core;
    }

    /**
     * Get bot difficulty settings
     * Adjust PMC settings to ensure they engage the correct bot types
     * @param type what bot the server is requesting settings for
     * @param diffLevel difficulty level server requested settings for
     * @param ignoreRaidSettings should raid settings chosen pre-raid be ignored
     * @returns Difficulty object
     */
    public getBotDifficulty(type: string, diffLevel: string, ignoreRaidSettings = false): Difficulty {
        let difficulty = diffLevel.toLowerCase();

        const raidConfig = this.applicationContext
            .getLatestValue(ContextVariableType.RAID_CONFIGURATION)
            ?.getValue<IGetRaidConfigurationRequestData>();
        if (!(raidConfig || ignoreRaidSettings)) {
            this.logger.error(
                this.localisationService.getText("bot-missing_application_context", "RAID_CONFIGURATION"),
            );
        }

        // Check value chosen in pre-raid difficulty dropdown
        // If value is not 'asonline', change requested difficulty to be what was chosen in dropdown
        const botDifficultyDropDownValue = raidConfig?.wavesSettings.botDifficulty.toLowerCase() ?? "asonline";
        if (botDifficultyDropDownValue !== "asonline") {
            difficulty =
                this.botDifficultyHelper.convertBotDifficultyDropdownToBotDifficulty(botDifficultyDropDownValue);
        }

        let difficultySettings: Difficulty;
        const lowercasedBotType = type.toLowerCase();
        switch (lowercasedBotType) {
            case this.pmcConfig.bearType.toLowerCase():
                difficultySettings = this.botDifficultyHelper.getPmcDifficultySettings(
                    "bear",
                    difficulty,
                    this.pmcConfig.usecType,
                    this.pmcConfig.bearType,
                );
                break;
            case this.pmcConfig.usecType.toLowerCase():
                difficultySettings = this.botDifficultyHelper.getPmcDifficultySettings(
                    "usec",
                    difficulty,
                    this.pmcConfig.usecType,
                    this.pmcConfig.bearType,
                );
                break;
            default:
                difficultySettings = this.botDifficultyHelper.getBotDifficultySettings(type, difficulty);
                break;
        }

        return difficultySettings;
    }

    public getAllBotDifficulties(): Record<string, any> {
        const result = {};

        const botTypesDb = this.databaseService.getBots().types;
        const botTypes = Object.keys(WildSpawnTypeNumber).filter((v) => Number.isNaN(Number(v)));
        for (let botType of botTypes) {
            const enumType = botType.toLowerCase();
            // pmcBEAR/pmcUSEC need to be converted into `usec`/`bear` so we can read difficulty settings from bots/types
            botType = this.botHelper.isBotPmc(botType)
                ? this.botHelper.getPmcSideByRole(botType).toLowerCase()
                : botType.toLowerCase();

            const botDetails = botTypesDb[botType];
            if (!botDetails?.difficulty) {
                continue;
            }

            const botDifficulties = Object.keys(botDetails.difficulty);
            result[enumType] = {};
            for (const difficulty of botDifficulties) {
                result[enumType][difficulty] = this.getBotDifficulty(enumType, difficulty, true);
            }
        }

        return result;
    }

    /**
     * Generate bot profiles and store in cache
     * @param sessionId Session id
     * @param info bot generation request info
     * @returns IBotBase array
     */
    public async generate(sessionId: string, info: IGenerateBotsRequestData): Promise<IBotBase[]> {
        const pmcProfile = this.profileHelper.getPmcProfile(sessionId);

        // If there's more than 1 condition, this is the first time client has requested bots
        // Client sends every bot type it will need in raid
        // Use this opportunity to create and cache bots for later retreval
        const isFirstGen = info.conditions.length > 1;
        if (isFirstGen) {
            return this.generateBotsFirstTime(info, pmcProfile, sessionId);
        }

        return this.returnSingleBotFromCache(sessionId, info);
    }

    /**
     * On first bot generation bots are generated and stored inside a cache, ready to be used later
     * @param request Bot generation request object
     * @param pmcProfile Player profile
     * @param sessionId Session id
     * @returns
     */
    public async generateBotsFirstTime(
        request: IGenerateBotsRequestData,
        pmcProfile: IPmcData,
        sessionId: string,
    ): Promise<IBotBase[]> {
        // Clear bot cache before any work starts
        this.botGenerationCacheService.clearStoredBots();

        const raidSettings = this.applicationContext
            .getLatestValue(ContextVariableType.RAID_CONFIGURATION)
            ?.getValue<IGetRaidConfigurationRequestData>();

        if (raidSettings === undefined) {
            throw new Error(this.localisationService.getText("bot-unable_to_load_raid_settings_from_appcontext"));
        }
        const pmcLevelRangeForMap =
            this.pmcConfig.locationSpecificPmcLevelOverride[raidSettings.location.toLowerCase()];

        const allPmcsHaveSameNameAsPlayer = this.randomUtil.getChance100(
            this.pmcConfig.allPMCsHavePlayerNameWithRandomPrefixChance,
        );

        const conditionPromises: Promise<void>[] = [];
        for (const condition of request.conditions) {
            const botGenerationDetails = this.getBotGenerationDetailsForWave(
                condition,
                pmcProfile,
                allPmcsHaveSameNameAsPlayer,
                pmcLevelRangeForMap,
                this.botConfig.presetBatch[condition.Role],
                false,
            );

            conditionPromises.push(this.generateWithBotDetails(condition, botGenerationDetails, sessionId));
        }

        await Promise.all(conditionPromises).then((p) => Promise.all(p)).catch((ex) => {
            this.logger.error(ex);
        });
        return [];
    }

    /**
     * Create a BotGenerationDetails for the bot generator to use
     * @param condition Client data defining bot type and difficulty
     * @param pmcProfile Player who is generating bots
     * @param allPmcsHaveSameNameAsPlayer Should all PMCs have same name as player
     * @param pmcLevelRangeForMap Min/max levels for PMCs to generate within
     * @param botCountToGenerate How many bots to generate
     * @param generateAsPmc Force bot being generated a PMC
     * @returns BotGenerationDetails
     */
    protected getBotGenerationDetailsForWave(
        condition: Condition,
        pmcProfile: IPmcData,
        allPmcsHaveSameNameAsPlayer: boolean,
        pmcLevelRangeForMap: MinMax,
        botCountToGenerate: number,
        generateAsPmc: boolean,
    ): BotGenerationDetails {
        return {
            isPmc: generateAsPmc,
            side: SideType.SAVAGE,
            role: condition.Role,
            playerLevel: this.getPlayerLevelFromProfile(pmcProfile),
            playerName: pmcProfile.Info.Nickname,
            botRelativeLevelDeltaMax: this.pmcConfig.botRelativeLevelDeltaMax,
            botRelativeLevelDeltaMin: this.pmcConfig.botRelativeLevelDeltaMin,
            botCountToGenerate: botCountToGenerate,
            botDifficulty: condition.Difficulty,
            locationSpecificPmcLevelOverride: pmcLevelRangeForMap,
            isPlayerScav: false,
            allPmcsHaveSameNameAsPlayer: allPmcsHaveSameNameAsPlayer,
        };
    }

    /**
     * Get players profile level
     * @param pmcProfile Profile to get level from
     * @returns Level as number
     */
    protected getPlayerLevelFromProfile(pmcProfile: IPmcData): number {
        return pmcProfile.Info.Level;
    }

    /**
     * Generate many bots and store then on the cache
     * @param condition the condition details to generate the bots with
     * @param botGenerationDetails the bot details to generate the bot with
     * @param sessionId Session id
     * @returns A promise for the bots to be done generating
     */
    protected async generateWithBotDetails(
        condition: Condition,
        botGenerationDetails: BotGenerationDetails,
        sessionId: string,
    ): Promise<void> {
        const isEventBot = condition.Role.toLowerCase().includes("event");
        if (isEventBot) {
            // Add eventRole data + reassign role property to be base type
            botGenerationDetails.eventRole = condition.Role;
            botGenerationDetails.role = this.seasonalEventService.getBaseRoleForEventBot(
                botGenerationDetails.eventRole,
            );
        }

        // Custom map waves can have spt roles in them
        // Is bot type pmcUSEC/pmcBEAR, set is pmc true and set side
        if (this.botHelper.botRoleIsPmc(condition.Role)) {
            botGenerationDetails.isPmc = true;
            botGenerationDetails.side = this.botHelper.getPmcSideByRole(condition.Role);
        }

        // Loop over and make x bots for this bot wave
        const cacheKey = `${
            botGenerationDetails.eventRole ?? botGenerationDetails.role
        }${botGenerationDetails.botDifficulty}`;
        const botPromises: Promise<void>[] = [];
        for (let i = 0; i < botGenerationDetails.botCountToGenerate; i++) {
            const detailsClone = this.cloner.clone(botGenerationDetails);
            botPromises.push(this.generateSingleBotAndStoreInCache(detailsClone, sessionId, cacheKey));
        }
        return Promise.all(botPromises).then(() => {
            this.logger.debug(
                `Generated ${botGenerationDetails.botCountToGenerate} ${botGenerationDetails.role} (${
                    botGenerationDetails.eventRole ?? ""
                }) ${botGenerationDetails.botDifficulty} bots`,
            );
        });
    }

    /**
     * Generate a single bot and store in the cache
     * @param botGenerationDetails the bot details to generate the bot with
     * @param sessionId Session id
     * @param cacheKey the cache key to store the bot with
     * @returns A promise for the bot to be stored
     */
    protected async generateSingleBotAndStoreInCache(
        botGenerationDetails: BotGenerationDetails,
        sessionId: string,
        cacheKey: string,
    ): Promise<void> {
        const botToCache = this.botGenerator.prepareAndGenerateBot(sessionId, botGenerationDetails);
        this.botGenerationCacheService.storeBots(cacheKey, [botToCache]);

        // Store bot details in cache so post-raid PMC messages can use data
        this.matchBotDetailsCacheService.cacheBot(botToCache);
    }

    /**
     * Pull a single bot out of cache and return, if cache is empty add bots to it and then return
     * @param sessionId Session id
     * @param request Bot generation request object
     * @returns Single IBotBase object
     */
    public async returnSingleBotFromCache(sessionId: string, request: IGenerateBotsRequestData): Promise<IBotBase[]> {
        const pmcProfile = this.profileHelper.getPmcProfile(sessionId);
        const requestedBot = request.conditions[0];

        const raidSettings = this.applicationContext
            .getLatestValue(ContextVariableType.RAID_CONFIGURATION)
            ?.getValue<IGetRaidConfigurationRequestData>();

        if (raidSettings === undefined) {
            throw new Error(this.localisationService.getText("bot-unable_to_load_raid_settings_from_appcontext"));
        }
        const pmcLevelRangeForMap =
            this.pmcConfig.locationSpecificPmcLevelOverride[raidSettings.location.toLowerCase()];

        // Create gen request for when cache is empty
        const condition: Condition = {
            Role: requestedBot.Role,
            Limit: 5,
            Difficulty: requestedBot.Difficulty,
        };
        const botGenerationDetails = this.getBotGenerationDetailsForWave(
            condition,
            pmcProfile,
            false,
            pmcLevelRangeForMap,
            this.botConfig.presetBatch[requestedBot.Role],
            false,
        );

        // Event bots need special actions to occur, set data up for them
        const isEventBot = requestedBot.Role.toLowerCase().includes("event");
        if (isEventBot) {
            // Add eventRole data + reassign role property
            botGenerationDetails.eventRole = requestedBot.Role;
            botGenerationDetails.role = this.seasonalEventService.getBaseRoleForEventBot(
                botGenerationDetails.eventRole,
            );
        }

        if (this.botHelper.isBotPmc(botGenerationDetails.role)) {
            botGenerationDetails.isPmc = true;
            botGenerationDetails.side = this.botHelper.getPmcSideByRole(requestedBot.Role);
        }

        // Roll chance to be pmc if type is allowed to be one
        const botConvertRateMinMax = this.pmcConfig.convertIntoPmcChance[requestedBot.Role.toLowerCase()];
        if (botConvertRateMinMax) {
            // Should bot become PMC
            const convertToPmc = this.botHelper.rollChanceToBePmc(requestedBot.Role, botConvertRateMinMax);
            if (convertToPmc) {
                botGenerationDetails.isPmc = true;
                botGenerationDetails.role = this.botHelper.getRandomizedPmcRole();
                botGenerationDetails.side = this.botHelper.getPmcSideByRole(botGenerationDetails.role);
                botGenerationDetails.botDifficulty = this.getPMCDifficulty(requestedBot.Difficulty);
                botGenerationDetails.botCountToGenerate = this.botConfig.presetBatch[botGenerationDetails.role];
            }
        }
        // Only convert to boss when not already converted to PMC & Boss Convert is enabled
        const { bossConvertEnabled, bossConvertMinMax, bossesToConvertToWeights } =
            this.botConfig.assaultToBossConversion;
        if (bossConvertEnabled && !botGenerationDetails.isPmc) {
            const bossConvertPercent = bossConvertMinMax[requestedBot.Role.toLowerCase()];
            if (bossConvertPercent) {
                // Roll a percentage check if we should convert scav to boss
                if (
                    this.randomUtil.getChance100(this.randomUtil.getInt(bossConvertPercent.min, bossConvertPercent.max))
                ) {
                    this.updateBotGenerationDetailsToRandomBoss(botGenerationDetails, bossesToConvertToWeights);
                }
            }
        }

        // Construct cache key
        const cacheKey = `${
            botGenerationDetails.eventRole ?? botGenerationDetails.role
        }${botGenerationDetails.botDifficulty}`;

        // Check cache for bot using above key
        if (!this.botGenerationCacheService.cacheHasBotOfRole(cacheKey)) {
            const botPromises: Promise<void>[] = [];
            // No bot in cache, generate new and return one
            for (let i = 0; i < botGenerationDetails.botCountToGenerate; i++) {
                botPromises.push(this.generateSingleBotAndStoreInCache(botGenerationDetails, sessionId, cacheKey));
            }

            await Promise.all(botPromises).then(() => {
                this.logger.debug(
                    `Generated ${botGenerationDetails.botCountToGenerate} ${botGenerationDetails.role} (${
                        botGenerationDetails.eventRole ?? ""
                    }) ${botGenerationDetails.botDifficulty} bots`,
                );
            });
        }

        const desiredBot = this.botGenerationCacheService.getBot(cacheKey);
        this.botGenerationCacheService.storeUsedBot(desiredBot);

        return [desiredBot];
    }

    protected updateBotGenerationDetailsToRandomBoss(
        botGenerationDetails: BotGenerationDetails,
        possibleBossTypeWeights: Record<string, number>,
    ): void {
        // Seems Actual bosses have the same Brain issues like PMC gaining Boss Brains We cant use all bosses
        botGenerationDetails.role = this.weightedRandomHelper.getWeightedValue(possibleBossTypeWeights);

        // Bosses are only ever 'normal'
        botGenerationDetails.botDifficulty = "normal";
        botGenerationDetails.botCountToGenerate = this.botConfig.presetBatch[botGenerationDetails.role];
    }

    /**
     * Get the difficulty passed in, if its not "asonline", get selected difficulty from config
     * @param requestedDifficulty
     * @returns
     */
    public getPMCDifficulty(requestedDifficulty: string): string {
        // Maybe return a random difficulty...
        if (this.pmcConfig.difficulty.toLowerCase() === "asonline") {
            return requestedDifficulty;
        }

        if (this.pmcConfig.difficulty.toLowerCase() === "random") {
            return this.botDifficultyHelper.chooseRandomDifficulty();
        }

        return this.pmcConfig.difficulty;
    }

    /**
     * Get the max number of bots allowed on a map
     * Looks up location player is entering when getting cap value
     * @param location The map location cap was requested for
     * @returns cap number
     */
    public getBotCap(location: string): number {
        const botCap = this.botConfig.maxBotCap[location.toLowerCase()];
        if (location === "default") {
            this.logger.warning(
                this.localisationService.getText("bot-no_bot_cap_found_for_location", location.toLowerCase()),
            );
        }

        return botCap;
    }

    public getAiBotBrainTypes(): any {
        return {
            pmc: this.pmcConfig.pmcType,
            assault: this.botConfig.assaultBrainType,
            playerScav: this.botConfig.playerScavBrainType,
        };
    }
}
