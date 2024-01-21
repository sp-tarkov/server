import { inject, injectable } from "tsyringe";

import { ApplicationContext } from "@spt-aki/context/ApplicationContext";
import { ContextVariableType } from "@spt-aki/context/ContextVariableType";
import { LootGenerator } from "@spt-aki/generators/LootGenerator";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ICreateGroupRequestData } from "@spt-aki/models/eft/match/ICreateGroupRequestData";
import { IEndOfflineRaidRequestData } from "@spt-aki/models/eft/match/IEndOfflineRaidRequestData";
import { IGetGroupStatusRequestData } from "@spt-aki/models/eft/match/IGetGroupStatusRequestData";
import { IGetGroupStatusResponse } from "@spt-aki/models/eft/match/IGetGroupStatusResponse";
import { IGetProfileRequestData } from "@spt-aki/models/eft/match/IGetProfileRequestData";
import { IGetRaidConfigurationRequestData } from "@spt-aki/models/eft/match/IGetRaidConfigurationRequestData";
import { IJoinMatchRequestData } from "@spt-aki/models/eft/match/IJoinMatchRequestData";
import { IJoinMatchResult } from "@spt-aki/models/eft/match/IJoinMatchResult";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { MessageType } from "@spt-aki/models/enums/MessageType";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IInRaidConfig } from "@spt-aki/models/spt/config/IInRaidConfig";
import { IMatchConfig } from "@spt-aki/models/spt/config/IMatchConfig";
import { IPmcConfig } from "@spt-aki/models/spt/config/IPmcConfig";
import { ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { BotGenerationCacheService } from "@spt-aki/services/BotGenerationCacheService";
import { BotLootCacheService } from "@spt-aki/services/BotLootCacheService";
import { MailSendService } from "@spt-aki/services/MailSendService";
import { MatchLocationService } from "@spt-aki/services/MatchLocationService";
import { ProfileSnapshotService } from "@spt-aki/services/ProfileSnapshotService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class MatchController
{
    protected matchConfig: IMatchConfig;
    protected inRaidConfig: IInRaidConfig;
    protected traderConfig: ITraderConfig;
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("MatchLocationService") protected matchLocationService: MatchLocationService,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("BotLootCacheService") protected botLootCacheService: BotLootCacheService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ProfileSnapshotService") protected profileSnapshotService: ProfileSnapshotService,
        @inject("BotGenerationCacheService") protected botGenerationCacheService: BotGenerationCacheService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("LootGenerator") protected lootGenerator: LootGenerator,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
    )
    {
        this.matchConfig = this.configServer.getConfig(ConfigTypes.MATCH);
        this.inRaidConfig = this.configServer.getConfig(ConfigTypes.IN_RAID);
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    public getEnabled(): boolean
    {
        return this.matchConfig.enabled;
    }

    /** Handle raid/profile/list */
    public getProfile(info: IGetProfileRequestData): IPmcData[]
    {
        if (info.profileId.includes("pmcAID"))
        {
            return this.profileHelper.getCompleteProfile(info.profileId.replace("pmcAID", "AID"));
        }

        if (info.profileId.includes("scavAID"))
        {
            return this.profileHelper.getCompleteProfile(info.profileId.replace("scavAID", "AID"));
        }

        return [];
    }

    /** Handle client/match/group/create */
    public createGroup(sessionID: string, info: ICreateGroupRequestData): any
    {
        return this.matchLocationService.createGroup(sessionID, info);
    }

    /** Handle client/match/group/delete */
    public deleteGroup(info: any): void
    {
        this.matchLocationService.deleteGroup(info);
    }

    /** Handle match/group/start_game */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public joinMatch(info: IJoinMatchRequestData, sessionId: string): IJoinMatchResult
    {
        const output: IJoinMatchResult = { maxPveCountExceeded: false, profiles: [] };

        // get list of players joining into the match
        output.profiles.push({
            profileid: "TODO",
            profileToken: "TODO",
            status: "MatchWait",
            sid: "",
            ip: "",
            port: 0,
            version: "live",
            location: "TODO get location",
            raidMode: "Online",
            mode: "deathmatch",
            shortid: null,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            additional_info: null,
        });

        return output;
    }

    /** Handle client/match/group/status */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getGroupStatus(info: IGetGroupStatusRequestData): IGetGroupStatusResponse
    {
        return { players: [], maxPveCountExceeded: false };
    }

    /**
     * Handle /client/raid/configuration
     * @param request Raid config request
     * @param sessionID Session id
     */
    public startOfflineRaid(request: IGetRaidConfigurationRequestData, sessionID: string): void
    {
        // Store request data for access during bot generation
        this.applicationContext.addValue(ContextVariableType.RAID_CONFIGURATION, request);

        // TODO: add code to strip PMC of equipment now they've started the raid

        // Set pmcs to difficulty set in pre-raid screen if override in bot config isnt enabled
        if (!this.pmcConfig.useDifficultyOverride)
        {
            this.pmcConfig.difficulty = this.convertDifficultyDropdownIntoBotDifficulty(
                request.wavesSettings.botDifficulty,
            );
        }

        // Store the profile as-is for later use on the post-raid exp screen
        const currentProfile = this.saveServer.getProfile(sessionID);
        this.profileSnapshotService.storeProfileSnapshot(sessionID, currentProfile);
    }

    /**
     * Convert a difficulty value from pre-raid screen to a bot difficulty
     * @param botDifficulty dropdown difficulty value
     * @returns bot difficulty
     */
    protected convertDifficultyDropdownIntoBotDifficulty(botDifficulty: string): string
    {
        // Edge case medium - must be altered
        if (botDifficulty.toLowerCase() === "medium")
        {
            return "normal";
        }

        return botDifficulty;
    }

    /** Handle client/match/offline/end */
    public endOfflineRaid(info: IEndOfflineRaidRequestData, sessionId: string): void
    {
        const pmcData: IPmcData = this.profileHelper.getPmcProfile(sessionId);
        const extractName = info.exitName;

        // Save time spent in raid
        pmcData.Stats.Eft.TotalInGameTime += info.raidSeconds;

        // Clean up cached bots now raid is over
        this.botGenerationCacheService.clearStoredBots();

        // Clear bot loot cache
        this.botLootCacheService.clearCache();

        if (this.extractWasViaCar(extractName))
        {
            this.handleCarExtract(extractName, pmcData, sessionId);
        }

        if (extractName && this.extractWasViaCoop(extractName) && this.traderConfig.fence.coopExtractGift.sendGift)
        {
            this.handleCoopExtract(pmcData, extractName);
            this.sendCoopTakenFenceMessage(sessionId);
        }
    }

    /**
     * Did player take a COOP extract
     * @param extractName Name of extract player took
     * @returns True if coop extract
     */
    protected extractWasViaCoop(extractName: string): boolean
    {
        // No extract name, not a coop extract
        if (!extractName)
        {
            return false;
        }

        return (this.inRaidConfig.coopExtracts.includes(extractName.trim()));
    }

    protected sendCoopTakenFenceMessage(sessionId: string): void
    {
        // Generate reward for taking coop extract
        const loot = this.lootGenerator.createRandomLoot(this.traderConfig.fence.coopExtractGift);
        const mailableLoot: Item[] = [];

        const parentId = this.hashUtil.generate();
        for (const item of loot)
        {
            mailableLoot.push({
                _id: item.id,
                _tpl: item.tpl,
                slotId: "main",
                parentId: parentId,
                upd: { StackObjectsCount: item.stackCount, SpawnedInSession: true },
            });
        }

        // Send message from fence giving player reward generated above
        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionId,
            this.traderHelper.getTraderById(Traders.FENCE),
            MessageType.MESSAGE_WITH_ITEMS,
            this.randomUtil.getArrayValue(this.traderConfig.fence.coopExtractGift.messageLocaleIds),
            mailableLoot,
            this.timeUtil.getHoursAsSeconds(this.traderConfig.fence.coopExtractGift.giftExpiryHours),
        );
    }

    /**
     * Handle when a player extracts using a coop extract - add rep to fence
     * @param pmcData Profile
     * @param extractName Name of extract taken
     */
    protected handleCoopExtract(pmcData: IPmcData, extractName: string): void
    {
        if (!pmcData.CoopExtractCounts)
        {
            pmcData.CoopExtractCounts = {};
        }

        // Ensure key exists for extract
        if (!(extractName in pmcData.CoopExtractCounts))
        {
            pmcData.CoopExtractCounts[extractName] = 0;
        }

        // Increment extract count value
        pmcData.CoopExtractCounts[extractName] += 1;

        // Get new fence standing value
        const newFenceStanding = this.getFenceStandingAfterExtract(
            pmcData,
            this.inRaidConfig.coopExtractBaseStandingGain,
            pmcData.CoopExtractCounts[extractName],
        );
        const fenceId: string = Traders.FENCE;
        pmcData.TradersInfo[fenceId].standing = newFenceStanding;

        // Check if new standing has leveled up trader
        this.traderHelper.lvlUp(fenceId, pmcData);
        pmcData.TradersInfo[fenceId].loyaltyLevel = Math.max(pmcData.TradersInfo[fenceId].loyaltyLevel, 1);
    }

    /**
     * Was extract by car
     * @param extractName name of extract
     * @returns true if car extract
     */
    protected extractWasViaCar(extractName: string): boolean
    {
        // exit name is null on death
        if (!extractName)
        {
            return false;
        }

        if (extractName.toLowerCase().includes("v-ex"))
        {
            return true;
        }

        return this.inRaidConfig.carExtracts.includes(extractName.trim());
    }

    /**
     * Handle when a player extracts using a car - Add rep to fence
     * @param extractName name of the extract used
     * @param pmcData Player profile
     * @param sessionId Session id
     */
    protected handleCarExtract(extractName: string, pmcData: IPmcData, sessionId: string): void
    {
        // Ensure key exists for extract
        if (!(extractName in pmcData.CarExtractCounts))
        {
            pmcData.CarExtractCounts[extractName] = 0;
        }

        // Increment extract count value
        pmcData.CarExtractCounts[extractName] += 1;

        // Not exact replica of Live behaviour
        // Simplified for now, no real reason to do the whole (unconfirmed) extra 0.01 standing per day regeneration mechanic
        const newFenceStanding = this.getFenceStandingAfterExtract(
            pmcData,
            this.inRaidConfig.carExtractBaseStandingGain,
            pmcData.CarExtractCounts[extractName],
        );
        const fenceId: string = Traders.FENCE;
        pmcData.TradersInfo[fenceId].standing = newFenceStanding;

        // Check if new standing has leveled up trader
        this.traderHelper.lvlUp(fenceId, pmcData);
        pmcData.TradersInfo[fenceId].loyaltyLevel = Math.max(pmcData.TradersInfo[fenceId].loyaltyLevel, 1);

        this.logger.debug(
            `Car extract: ${extractName} used, total times taken: ${pmcData.CarExtractCounts[extractName]}`,
        );
    }

    /**
     * Get the fence rep gain from using a car or coop extract
     * @param pmcData Profile
     * @param baseGain amount gained for the first extract
     * @param extractCount Number of times extract was taken
     * @returns Fence standing after taking extract
     */
    protected getFenceStandingAfterExtract(pmcData: IPmcData, baseGain: number, extractCount: number): number
    {
        // Get current standing
        const fenceId: string = Traders.FENCE;
        let fenceStanding = Number(pmcData.TradersInfo[fenceId].standing);

        // get standing after taking extract x times, x.xx format, gain from extract can be no smaller than 0.01
        fenceStanding += Math.max(baseGain / extractCount, 0.01);

        // Ensure fence loyalty level is not above/below the range -7 to 15
        const newFenceStanding = Math.min(Math.max(fenceStanding, -7), 15);
        this.logger.debug(`Old vs new fence standing: ${pmcData.TradersInfo[fenceId].standing}, ${newFenceStanding}`);

        return Number(newFenceStanding.toFixed(2));
    }
}
