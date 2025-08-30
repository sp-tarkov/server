import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { LocationLootGenerator } from "@spt/generators/LocationLootGenerator";
import { LootGenerator } from "@spt/generators/LootGenerator";
import { PlayerScavGenerator } from "@spt/generators/PlayerScavGenerator";
import { PmcWaveGenerator } from "@spt/generators/PmcWaveGenerator";
import { HealthHelper } from "@spt/helpers/HealthHelper";
import { InRaidHelper } from "@spt/helpers/InRaidHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { RewardHelper } from "@spt/helpers/RewardHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { Common, IQuestStatus, ITraderInfo } from "@spt/models/eft/common/tables/IBotBase";
import { CustomisationSource } from "@spt/models/eft/common/tables/ICustomisationStorage";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import {
    IEndLocalRaidRequestData,
    IEndRaidResult,
    ILocationTransit,
} from "@spt/models/eft/match/IEndLocalRaidRequestData";
import { IStartLocalRaidRequestData } from "@spt/models/eft/match/IStartLocalRaidRequestData";
import { IStartLocalRaidResponseData } from "@spt/models/eft/match/IStartLocalRaidResponseData";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ExitStatus } from "@spt/models/enums/ExitStatis";
import { MessageType } from "@spt/models/enums/MessageType";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { Traders } from "@spt/models/enums/Traders";
import { TransitionType } from "@spt/models/enums/TransitionType";
import { IHideoutConfig } from "@spt/models/spt/config/IHideoutConfig";
import { IInRaidConfig } from "@spt/models/spt/config/IInRaidConfig";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { IRaidChanges } from "@spt/models/spt/location/IRaidChanges";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { BotGenerationCacheService } from "@spt/services/BotGenerationCacheService";
import { BotLootCacheService } from "@spt/services/BotLootCacheService";
import { BotNameService } from "@spt/services/BotNameService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { InsuranceService } from "@spt/services/InsuranceService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { MatchBotDetailsCacheService } from "@spt/services/MatchBotDetailsCacheService";
import { PmcChatResponseService } from "@spt/services/PmcChatResponseService";
import { RaidTimeAdjustmentService } from "@spt/services/RaidTimeAdjustmentService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class LocationLifecycleService {
    protected inRaidConfig: IInRaidConfig;
    protected traderConfig: ITraderConfig;
    protected ragfairConfig: IRagfairConfig;
    protected hideoutConfig: IHideoutConfig;
    protected locationConfig: ILocationConfig;
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("InRaidHelper") protected inRaidHelper: InRaidHelper,
        @inject("HealthHelper") protected healthHelper: HealthHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("RewardHelper") protected rewardHelper: RewardHelper,
        @inject("MatchBotDetailsCacheService") protected matchBotDetailsCacheService: MatchBotDetailsCacheService,
        @inject("PmcChatResponseService") protected pmcChatResponseService: PmcChatResponseService,
        @inject("PlayerScavGenerator") protected playerScavGenerator: PlayerScavGenerator,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("InsuranceService") protected insuranceService: InsuranceService,
        @inject("BotLootCacheService") protected botLootCacheService: BotLootCacheService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("BotGenerationCacheService") protected botGenerationCacheService: BotGenerationCacheService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("RaidTimeAdjustmentService") protected raidTimeAdjustmentService: RaidTimeAdjustmentService,
        @inject("BotNameService") protected botNameService: BotNameService,
        @inject("LootGenerator") protected lootGenerator: LootGenerator,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("LocationLootGenerator") protected locationLootGenerator: LocationLootGenerator,
        @inject("PmcWaveGenerator") protected pmcWaveGenerator: PmcWaveGenerator,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.inRaidConfig = this.configServer.getConfig(ConfigTypes.IN_RAID);
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /** Handle client/match/local/start */
    public startLocalRaid(sessionId: string, request: IStartLocalRaidRequestData): IStartLocalRaidResponseData {
        this.logger.debug(`Starting: ${request.location}`);

        const playerProfile = this.profileHelper.getFullProfile(sessionId);

        // Remove skill fatigue values
        if (request.playerSide.toLowerCase() === "pmc") {
            this.resetSkillPointsEarnedDuringRaid(playerProfile.characters.pmc.Skills.Common);
        } else {
            this.resetSkillPointsEarnedDuringRaid(playerProfile.characters.scav.Skills.Common);
        }

        // Set interval times to in-raid value
        this.ragfairConfig.runIntervalSeconds = this.ragfairConfig.runIntervalValues.inRaid;
        this.hideoutConfig.runIntervalSeconds = this.hideoutConfig.runIntervalValues.inRaid;

        const result: IStartLocalRaidResponseData = {
            serverId: `${request.location}.${request.playerSide}.${this.timeUtil.getTimestamp()}`, // TODO - does this need to be more verbose - investigate client?
            serverSettings: this.databaseService.getLocationServices(), // TODO - is this per map or global?
            profile: { insuredItems: playerProfile.characters.pmc.InsuredItems },
            locationLoot: this.generateLocationAndLoot(request.location, !request.sptSkipLootGeneration),
            transitionType: TransitionType.None,
            transition: {
                transitionType: TransitionType.None,
                transitionRaidId: this.hashUtil.generate(),
                transitionCount: 0,
                visitedLocations: [],
            },
        };

        // Only has value when transitioning into map from previous one
        if (request.transition) {
            // TODO - why doesnt the raid after transit have any transit data?
            result.transition = request.transition;
        }

        // Get data stored at end of previous raid (if any)
        const transitionData = this.applicationContext
            .getLatestValue(ContextVariableType.TRANSIT_INFO)
            ?.getValue<ILocationTransit>();
        if (transitionData) {
            this.logger.success(`Player: ${sessionId} is in transit to ${request.location}`);
            result.transition.transitionType = TransitionType.Common;
            result.transition.transitionRaidId = transitionData.transitionRaidId;
            result.transition.transitionCount += 1;

            // Used by client to determine infil location) - client adds the map player is transiting to later
            result.transition.visitedLocations.push(transitionData.sptLastVisitedLocation);

            // Complete, clean up as no longer needed
            this.applicationContext.clearValues(ContextVariableType.TRANSIT_INFO);
        }

        // Apply changes from pmcConfig to bot hostility values
        this.adjustBotHostilitySettings(result.locationLoot);

        this.adjustExtracts(request.playerSide, request.location, result.locationLoot);

        // Clear bot cache ready for a fresh raid
        this.botGenerationCacheService.clearStoredBots();
        this.botNameService.clearNameCache();

        return result;
    }

    /**
     * Replace map exits with scav exits when player is scavving
     * @param playerSide Playders side (savage/usec/bear)
     * @param location id of map being loaded
     * @param locationData Maps locationbase data
     */
    protected adjustExtracts(playerSide: string, location: string, locationData: ILocationBase): void {
        const playerIsScav = playerSide.toLowerCase() === "savage";
        if (playerIsScav) {
            // Get relevant extract data for map
            const mapExtracts = this.databaseService.getLocation(location)?.allExtracts;
            if (!mapExtracts) {
                this.logger.warning(`Unable to find map: ${location} extract data, no adjustments made`);

                return;
            }

            // Find only scav extracts and overwrite existing exits with them
            const scavExtracts = mapExtracts.filter((extract) => ["scav"].includes(extract.Side.toLowerCase()));
            if (scavExtracts.length > 0) {
                // Scav extracts found, use them
                locationData.exits.push(...scavExtracts);
            }
        }
    }

    /**
     * Adjust the bot hostility values prior to entering a raid
     * @param location map to adjust values of
     */
    protected adjustBotHostilitySettings(location: ILocationBase): void {
        for (const botId in this.pmcConfig.hostilitySettings) {
            const configHostilityChanges = this.pmcConfig.hostilitySettings[botId];
            const locationBotHostilityDetails = location.BotLocationModifier.AdditionalHostilitySettings.find(
                (botSettings) => botSettings.BotRole.toLowerCase() === botId,
            );

            // No matching bot in config, skip
            if (!locationBotHostilityDetails) {
                this.logger.warning(
                    `No bot: ${botId} hostility values found on: ${location.Id}, can only edit existing. Skipping`,
                );

                continue;
            }

            // Add new permanent enemies if they don't already exist
            if (configHostilityChanges.additionalEnemyTypes) {
                for (const enemyTypeToAdd of configHostilityChanges.additionalEnemyTypes) {
                    if (!locationBotHostilityDetails.AlwaysEnemies.includes(enemyTypeToAdd)) {
                        locationBotHostilityDetails.AlwaysEnemies.push(enemyTypeToAdd);
                    }
                }
            }

            // Add/edit chance settings
            if (configHostilityChanges.chancedEnemies) {
                locationBotHostilityDetails.ChancedEnemies ||= [];
                for (const chanceDetailsToApply of configHostilityChanges.chancedEnemies) {
                    const locationBotDetails = locationBotHostilityDetails.ChancedEnemies.find(
                        (botChance) => botChance.Role === chanceDetailsToApply.Role,
                    );
                    if (locationBotDetails) {
                        // Existing
                        locationBotDetails.EnemyChance = chanceDetailsToApply.EnemyChance;
                    } else {
                        // Add new
                        locationBotHostilityDetails.ChancedEnemies.push(chanceDetailsToApply);
                    }
                }
            }

            // Add new permanent friends if they don't already exist
            if (configHostilityChanges.additionalFriendlyTypes) {
                locationBotHostilityDetails.AlwaysFriends ||= [];
                for (const friendlyTypeToAdd of configHostilityChanges.additionalFriendlyTypes) {
                    if (!locationBotHostilityDetails.AlwaysFriends.includes(friendlyTypeToAdd)) {
                        locationBotHostilityDetails.AlwaysFriends.push(friendlyTypeToAdd);
                    }
                }
            }

            // Adjust vs bear hostility chance
            if (typeof configHostilityChanges.bearEnemyChance !== "undefined") {
                locationBotHostilityDetails.BearEnemyChance = configHostilityChanges.bearEnemyChance;
            }

            // Adjust vs usec hostility chance
            if (typeof configHostilityChanges.usecEnemyChance !== "undefined") {
                locationBotHostilityDetails.UsecEnemyChance = configHostilityChanges.usecEnemyChance;
            }

            // Adjust vs savage hostility chance
            if (typeof configHostilityChanges.savageEnemyChance !== "undefined") {
                locationBotHostilityDetails.SavageEnemyChance = configHostilityChanges.savageEnemyChance;
            }

            // Adjust vs scav hostility behaviour
            if (typeof configHostilityChanges.savagePlayerBehaviour !== "undefined") {
                locationBotHostilityDetails.SavagePlayerBehaviour = configHostilityChanges.savagePlayerBehaviour;
            }
        }
    }

    /**
     * Generate a maps base location (cloned) and loot
     * @param name Map name
     * @param generateLoot OPTIONAL - Should loot be generated for the map before being returned
     * @returns ILocationBase
     */
    protected generateLocationAndLoot(name: string, generateLoot = true): ILocationBase {
        const location = this.databaseService.getLocation(name);
        const locationBaseClone = this.cloner.clone(location.base);

        // Update datetime property to now
        locationBaseClone.UnixDateTime = this.timeUtil.getTimestamp();

        // Don't generate loot for hideout
        if (name === "hideout") {
            return locationBaseClone;
        }

        // Only requested base data, not loot
        if (!generateLoot) {
            return locationBaseClone;
        }

        // Add cusom pmcs to map every time its run
        this.pmcWaveGenerator.applyWaveChangesToMap(locationBaseClone);

        // Adjust raid based on whether this is a scav run
        let locationConfigClone: ILocationConfig | undefined;
        const raidAdjustments = this.applicationContext
            .getLatestValue(ContextVariableType.RAID_ADJUSTMENTS)
            ?.getValue<IRaidChanges>();
        if (raidAdjustments) {
            locationConfigClone = this.cloner.clone(this.locationConfig); // Clone values so they can be used to reset originals later
            this.raidTimeAdjustmentService.makeAdjustmentsToMap(raidAdjustments, locationBaseClone);
        }

        const staticAmmoDist = this.cloner.clone(location.staticAmmo);

        // Create containers and add loot to them
        const staticLoot = this.locationLootGenerator.generateStaticContainers(locationBaseClone, staticAmmoDist);
        locationBaseClone.Loot.push(...staticLoot);

        // Add dynamic loot to output loot
        const dynamicLootDistClone = this.cloner.clone(location.looseLoot);
        const dynamicSpawnPoints = this.locationLootGenerator.generateDynamicLoot(
            dynamicLootDistClone,
            staticAmmoDist,
            name.toLowerCase(),
        );

        // Push chosen spawn points into returned object
        for (const spawnPoint of dynamicSpawnPoints) {
            locationBaseClone.Loot.push(spawnPoint);
        }

        // Done generating, log results
        this.logger.success(
            this.localisationService.getText("location-dynamic_items_spawned_success", dynamicSpawnPoints.length),
        );
        this.logger.success(this.localisationService.getText("location-generated_success", name));

        // Reset loot multipliers back to original values
        if (raidAdjustments && locationConfigClone) {
            this.logger.debug("Resetting loot multipliers back to their original values");
            this.locationConfig.staticLootMultiplier = locationConfigClone.staticLootMultiplier;
            this.locationConfig.looseLootMultiplier = locationConfigClone.looseLootMultiplier;

            this.applicationContext.clearValues(ContextVariableType.RAID_ADJUSTMENTS);
        }

        return locationBaseClone;
    }

    /** Handle client/match/local/end */
    public endLocalRaid(sessionId: string, request: IEndLocalRaidRequestData): void {
        // Clear bot loot cache
        this.botLootCacheService.clearCache();

        const fullProfile = this.profileHelper.getFullProfile(sessionId);
        const pmcProfile = fullProfile.characters.pmc;
        const scavProfile = fullProfile.characters.scav;

        // TODO:
        // Quest status?
        // stats/eft/aggressor - weird values (EFT.IProfileDataContainer.Nickname)

        this.logger.debug(`Raid: ${request.serverId} outcome: ${request.results.result}`);

        // Reset flea interval time to out-of-raid value
        this.ragfairConfig.runIntervalSeconds = this.ragfairConfig.runIntervalValues.outOfRaid;
        this.hideoutConfig.runIntervalSeconds = this.hideoutConfig.runIntervalValues.outOfRaid;

        // ServerId has various info stored in it, delimited by a period
        const serverDetails = request.serverId.split(".");

        const locationName = serverDetails[0].toLowerCase();
        const isPmc = serverDetails[1].toLowerCase() === "pmc";
        const mapBase = this.databaseService.getLocation(locationName).base;
        const isDead = this.isPlayerDead(request.results);
        const isTransfer = this.isMapToMapTransfer(request.results);
        const isSurvived = this.isPlayerSurvived(request.results);

        // Handle items transferred via BTR or transit to player mailbox
        this.handleItemTransferEvent(sessionId, request);

        // Player is moving between maps
        if (isTransfer && request.locationTransit) {
            // Manually store the map player just left
            request.locationTransit.sptLastVisitedLocation = locationName;
            // TODO - Persist each players last visited location history over multiple transits, e.g using InMemoryCacheService, need to take care to not let data get stored forever
            // Store transfer data for later use in `startLocalRaid()` when next raid starts
            request.locationTransit.sptExitName = request.results.exitName;
            this.applicationContext.addValue(ContextVariableType.TRANSIT_INFO, request.locationTransit);
        }

        if (!isPmc) {
            this.handlePostRaidPlayerScav(sessionId, pmcProfile, scavProfile, isDead, isTransfer, request);

            return;
        }

        this.handlePostRaidPmc(
            sessionId,
            fullProfile,
            scavProfile,
            isDead,
            isSurvived,
            isTransfer,
            request,
            locationName,
        );

        // Handle car extracts
        if (this.extractWasViaCar(request.results.exitName)) {
            this.handleCarExtract(request.results.exitName, pmcProfile, sessionId);
        }

        // Handle coop exit
        if (
            request.results.exitName &&
            this.extractTakenWasCoop(request.results.exitName) &&
            this.traderConfig.fence.coopExtractGift.sendGift
        ) {
            this.handleCoopExtract(sessionId, pmcProfile, request.results.exitName);
            this.sendCoopTakenFenceMessage(sessionId);
        }
    }

    /**
     * Was extract by car
     * @param extractName name of extract
     * @returns True if extract was by car
     */
    protected extractWasViaCar(extractName: string): boolean {
        // exit name is undefined on death
        if (!extractName) {
            return false;
        }

        if (extractName.toLowerCase().includes("v-ex")) {
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
    protected handleCarExtract(extractName: string, pmcData: IPmcData, sessionId: string): void {
        // Ensure key exists for extract
        if (!(extractName in pmcData.CarExtractCounts)) {
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

        // Copy updated fence rep values into scav profile to ensure consistency
        const scavData: IPmcData = this.profileHelper.getScavProfile(sessionId);
        scavData.TradersInfo[fenceId].standing = pmcData.TradersInfo[fenceId].standing;
        scavData.TradersInfo[fenceId].loyaltyLevel = pmcData.TradersInfo[fenceId].loyaltyLevel;
    }

    /**
     * Handle when a player extracts using a coop extract - add rep to fence
     * @param sessionId Session/player id
     * @param pmcData Profile
     * @param extractName Name of extract taken
     */
    protected handleCoopExtract(sessionId: string, pmcData: IPmcData, extractName: string): void {
        pmcData.CoopExtractCounts ||= {};

        // Ensure key exists for extract
        if (!(extractName in pmcData.CoopExtractCounts)) {
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

        // Copy updated fence rep values into scav profile to ensure consistency
        const scavData: IPmcData = this.profileHelper.getScavProfile(sessionId);
        scavData.TradersInfo[fenceId].standing = pmcData.TradersInfo[fenceId].standing;
        scavData.TradersInfo[fenceId].loyaltyLevel = pmcData.TradersInfo[fenceId].loyaltyLevel;
    }

    /**
     * Get the fence rep gain from using a car or coop extract
     * @param pmcData Profile
     * @param baseGain amount gained for the first extract
     * @param extractCount Number of times extract was taken
     * @returns Fence standing after taking extract
     */
    protected getFenceStandingAfterExtract(pmcData: IPmcData, baseGain: number, extractCount: number): number {
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

    protected sendCoopTakenFenceMessage(sessionId: string): void {
        // Generate reward for taking coop extract
        const loot = this.lootGenerator.createRandomLoot(this.traderConfig.fence.coopExtractGift);
        const mailableLoot: IItem[] = [];

        const parentId = this.hashUtil.generate();
        for (const item of loot) {
            item.parentId = parentId;
            mailableLoot.push(item);
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
     * Did player take a COOP extract
     * @param extractName Name of extract player took
     * @returns True if coop extract
     */
    protected extractTakenWasCoop(extractName: string): boolean {
        // No extract name, not a coop extract
        if (!extractName) {
            return false;
        }

        return this.inRaidConfig.coopExtracts.includes(extractName.trim());
    }

    protected handlePostRaidPlayerScav(
        sessionId: string,
        pmcProfile: IPmcData,
        scavProfile: IPmcData,
        isDead: boolean,
        isTransfer: boolean,
        request: IEndLocalRaidRequestData,
    ): void {
        const postRaidProfile = request.results.profile;

        if (isTransfer) {
            // We want scav inventory to persist into next raid when pscav is moving between maps
            this.inRaidHelper.setInventory(sessionId, scavProfile, postRaidProfile, true, isTransfer);
        }

        scavProfile.Info.Level = request.results.profile.Info.Level;
        scavProfile.Skills = request.results.profile.Skills;
        scavProfile.Stats = request.results.profile.Stats;
        scavProfile.Encyclopedia = request.results.profile.Encyclopedia;
        scavProfile.TaskConditionCounters = request.results.profile.TaskConditionCounters;
        scavProfile.SurvivorClass = request.results.profile.SurvivorClass;

        // Scavs dont have achievements, but copy anyway
        scavProfile.Achievements = request.results.profile.Achievements;

        scavProfile.Info.Experience = request.results.profile.Info.Experience;

        // Must occur after experience is set and stats copied over
        scavProfile.Stats.Eft.TotalSessionExperience = 0;

        this.applyTraderStandingAdjustments(scavProfile.TradersInfo, request.results.profile.TradersInfo);

        // Clamp fence standing within -7 to 15 range
        const fenceMax = this.traderConfig.fence.playerRepMax; // 15
        const fenceMin = this.traderConfig.fence.playerRepMin; //-7
        const currentFenceStanding = request.results.profile.TradersInfo[Traders.FENCE].standing;
        scavProfile.TradersInfo[Traders.FENCE].standing = Math.min(Math.max(currentFenceStanding, fenceMin), fenceMax);

        // Successful extract as scav, give some rep
        if (this.isPlayerSurvived(request.results) && scavProfile.TradersInfo[Traders.FENCE].standing < fenceMax) {
            scavProfile.TradersInfo[Traders.FENCE].standing += this.inRaidConfig.scavExtractStandingGain;
        }

        // Copy scav fence values to PMC profile
        pmcProfile.TradersInfo[Traders.FENCE] = scavProfile.TradersInfo[Traders.FENCE];

        if (this.profileHasConditionCounters(scavProfile)) {
            // Scav quest progress needs to be moved to pmc so player can see it in menu / hand them in
            this.migrateScavQuestProgressToPmcProfile(scavProfile, pmcProfile);
        }

        // Must occur after encyclopedia updated
        this.mergePmcAndScavEncyclopedias(scavProfile, pmcProfile);

        // Scav died, regen scav loadout and reset timer
        if (isDead) {
            this.playerScavGenerator.generate(sessionId);
        }

        // Update last played property
        pmcProfile.Info.LastTimePlayedAsSavage = this.timeUtil.getTimestamp();

        // Force a profile save
        this.saveServer.saveProfile(sessionId);
    }

    /**
     *
     * @param sessionId Player id
     * @param fullProfile Full player profile
     * @param scavProfile Scav profile
     * @param isDead Player died/got left behind in raid
     * @param isSurvived Not same as opposite of `isDead`, specific status
     * @param request Client request
     * @param locationName name of location exited
     */
    protected handlePostRaidPmc(
        sessionId: string,
        fullProfile: ISptProfile,
        scavProfile: IPmcData,
        isDead: boolean,
        isSurvived: boolean,
        isTransfer: boolean,
        request: IEndLocalRaidRequestData,
        locationName: string,
    ): void {
        const pmcProfile = fullProfile.characters.pmc;
        const postRaidProfile = request.results.profile;
        const preRaidProfileQuestDataClone = this.cloner.clone(pmcProfile.Quests);

        // MUST occur BEFORE inventory actions (setInventory()) occur
        // Player died, get quest items they lost for use later
        const lostQuestItems = this.profileHelper.getQuestItemsInProfile(postRaidProfile);

        // Update inventory
        this.inRaidHelper.setInventory(sessionId, pmcProfile, postRaidProfile, isSurvived, isTransfer);

        pmcProfile.Info.Level = postRaidProfile.Info.Level;
        pmcProfile.Skills = postRaidProfile.Skills;
        pmcProfile.Stats.Eft = postRaidProfile.Stats.Eft;
        pmcProfile.Encyclopedia = postRaidProfile.Encyclopedia;
        pmcProfile.TaskConditionCounters = postRaidProfile.TaskConditionCounters;
        pmcProfile.SurvivorClass = postRaidProfile.SurvivorClass;

        // MUST occur prior to profile achievements being overwritten by post-raid achievements
        this.processAchievementRewards(fullProfile, postRaidProfile.Achievements);

        pmcProfile.Achievements = postRaidProfile.Achievements;
        pmcProfile.Quests = this.processPostRaidQuests(postRaidProfile.Quests);

        // Handle edge case - must occur AFTER processPostRaidQuests()
        this.lightkeeperQuestWorkaround(sessionId, postRaidProfile.Quests, preRaidProfileQuestDataClone, pmcProfile);

        pmcProfile.WishList = postRaidProfile.WishList;

        pmcProfile.Info.Experience = postRaidProfile.Info.Experience;

        this.applyTraderStandingAdjustments(pmcProfile.TradersInfo, postRaidProfile.TradersInfo);

        // Must occur AFTER experience is set and stats copied over
        pmcProfile.Stats.Eft.TotalSessionExperience = 0;

        const fenceId = Traders.FENCE;

        // Clamp fence standing
        const currentFenceStanding = postRaidProfile.TradersInfo[fenceId].standing;
        pmcProfile.TradersInfo[fenceId].standing = Math.min(Math.max(currentFenceStanding, -7), 15); // Ensure it stays between -7 and 15

        // Copy fence values to Scav
        scavProfile.TradersInfo[fenceId] = pmcProfile.TradersInfo[fenceId];

        // MUST occur AFTER encyclopedia updated
        this.mergePmcAndScavEncyclopedias(pmcProfile, scavProfile);

        // Handle temp, hydration, limb hp/effects
        this.healthHelper.updateProfileHealthPostRaid(pmcProfile, postRaidProfile.Health, sessionId, isDead);

        // This must occur _BEFORE_ `deleteInventory`, as that method clears insured items
        this.handleInsuredItemLostEvent(sessionId, pmcProfile, request, locationName);

        if (isDead) {
            if (lostQuestItems.length > 0) {
                // MUST occur AFTER quests have post raid quest data has been merged "processPostRaidQuests()"
                // Player is dead + had quest items, check and fix any broken find item quests
                this.checkForAndFixPickupQuestsAfterDeath(sessionId, lostQuestItems, pmcProfile.Quests);
            }

            this.pmcChatResponseService.sendKillerResponse(sessionId, pmcProfile, postRaidProfile.Stats.Eft.Aggressor);

            this.inRaidHelper.deleteInventory(pmcProfile, sessionId);

            this.inRaidHelper.removeFiRStatusFromItemsInContainer(sessionId, pmcProfile, "SecuredContainer");
        }

        // Must occur AFTER killer messages have been sent
        this.matchBotDetailsCacheService.clearCache();

        const victims = postRaidProfile.Stats.Eft.Victims.filter(
            (victim) => ["pmcbear", "pmcusec"].includes(victim.Role.toLowerCase()), // TODO replace with enum
        );
        if (victims?.length > 0) {
            // Player killed PMCs, send some mail responses to them
            this.pmcChatResponseService.sendVictimResponse(sessionId, victims, pmcProfile);
        }
    }

    /**
     * Check for and add any rewards found via the gained achievements this raid
     * @param fullProfile Profile to add customisations to
     * @param postRaidAchievements All profile achievements at the end of the raid
     */
    protected processAchievementRewards(fullProfile: ISptProfile, postRaidAchievements: Record<string, number>): void {
        const sessionId = fullProfile.info.id;
        const pmcProfile = fullProfile.characters.pmc;
        const preRaidAchievementIds = Object.keys(fullProfile.characters.pmc.Achievements);
        const postRaidAchievementIds = Object.keys(postRaidAchievements);
        const achievementIdsAcquiredThisRaid = postRaidAchievementIds.filter(
            (id) => !preRaidAchievementIds.includes(id),
        );

        // Get achievement data from db
        const achievementsDb = this.databaseService.getTemplates().achievements;

        // Map the achievement ids player obtained in raid with matching achievement data from db
        const achievements = achievementIdsAcquiredThisRaid.map((achievementId) =>
            achievementsDb.find((achievementDb) => achievementDb.id === achievementId),
        );
        if (!achievements) {
            // No achievements found
            return;
        }

        for (const achievement of achievements) {
            const rewardItems = this.rewardHelper.applyRewards(
                achievement.rewards,
                CustomisationSource.ACHIEVEMENT,
                fullProfile,
                pmcProfile,
                achievement.id,
            );
            if (rewardItems?.length > 0) {
                this.mailSendService.sendLocalisedSystemMessageToPlayer(
                    sessionId,
                    "670547bb5fa0b1a7c30d5836 0",
                    rewardItems,
                    [],
                    this.timeUtil.getHoursAsSeconds(24 * 7),
                );
            }
        }
    }

    /**
     * On death Quest items are lost, the client does not clean up completed conditions for picking up those quest items,
     * If the completed conditions remain in the profile the player is unable to pick the item up again
     * @param sessionId Session id
     * @param lostQuestItems Quest items lost on player death
     * @param profileQuests Quest status data from player profile
     */
    protected checkForAndFixPickupQuestsAfterDeath(
        sessionId: string,
        lostQuestItems: IItem[],
        profileQuests: IQuestStatus[],
    ) {
        // Exclude completed quests
        const activeQuestIdsInProfile = profileQuests
            .filter((quest) => ![QuestStatus.Success, QuestStatus.AvailableForStart].includes(quest.status))
            .map((status) => status.qid);

        // Get db details of quests we found above
        const questDb = Object.values(this.databaseService.getQuests()).filter((quest) =>
            activeQuestIdsInProfile.includes(quest._id),
        );

        for (const lostItem of lostQuestItems) {
            let matchingConditionId: string;
            // Find a quest that has a FindItem condition that has the list items tpl as a target
            const matchingQuests = questDb.filter((quest) => {
                const matchingCondition = quest.conditions.AvailableForFinish.find(
                    (questCondition) =>
                        questCondition.conditionType === "FindItem" && questCondition.target.includes(lostItem._tpl),
                );
                if (!matchingCondition) {
                    // Quest doesnt have a matching condition
                    return false;
                }

                // We found a condition, save id for later
                matchingConditionId = matchingCondition.id;
                return true;
            });

            // Fail if multiple were found
            if (matchingQuests.length !== 1) {
                this.logger.error(
                    `Unable to fix quest item: ${lostItem}, ${matchingQuests.length} matching quests found, expected 1`,
                );

                continue;
            }

            const matchingQuest = matchingQuests[0];
            // We have a match, remove the condition id from profile to reset progress and let player pick item up again
            const profileQuestToUpdate = profileQuests.find((questStatus) => questStatus.qid === matchingQuest._id);
            if (!profileQuestToUpdate) {
                // Profile doesnt have a matching quest
                continue;
            }

            // Filter out the matching condition we found
            profileQuestToUpdate.completedConditions = profileQuestToUpdate.completedConditions.filter(
                (conditionId) => conditionId !== matchingConditionId,
            );
        }
    }

    /**
     * In 0.15 Lightkeeper quests do not give rewards in PvE, this issue also occurs in spt
     * We check for newly completed Lk quests and run them through the servers `CompleteQuest` process
     * This rewards players with items + craft unlocks + new trader assorts
     * @param sessionId Session id
     * @param postRaidQuests Quest statuses post-raid
     * @param preRaidQuests Quest statuses pre-raid
     * @param pmcProfile Players profile
     */
    protected lightkeeperQuestWorkaround(
        sessionId: string,
        postRaidQuests: IQuestStatus[],
        preRaidQuests: IQuestStatus[],
        pmcProfile: IPmcData,
    ): void {
        // LK quests that were not completed before raid but now are
        const newlyCompletedLightkeeperQuests = postRaidQuests.filter(
            (postRaidQuest) =>
                postRaidQuest.status === QuestStatus.Success &&
                preRaidQuests.find(
                    (preRaidQuest) =>
                        preRaidQuest.qid === postRaidQuest.qid && preRaidQuest.status !== QuestStatus.Success,
                ) &&
                this.databaseService.getQuests()[postRaidQuest.qid]?.traderId === Traders.LIGHTHOUSEKEEPER,
        );

        // Run server complete quest process to ensure player gets rewards
        for (const questToComplete of newlyCompletedLightkeeperQuests) {
            this.questHelper.completeQuest(
                pmcProfile,
                { Action: "CompleteQuest", qid: questToComplete.qid, removeExcessItems: false },
                sessionId,
            );
        }
    }

    /**
     * Convert post-raid quests into correct format
     * Quest status comes back as a string version of the enum `Success`, not the expected value of 1
     * @param questsToProcess quests data from client
     * @param preRaidQuestStatuses quest data from before raid
     * @returns IQuestStatus
     */
    protected processPostRaidQuests(questsToProcess: IQuestStatus[]): IQuestStatus[] {
        for (const quest of questsToProcess) {
            quest.status = Number(QuestStatus[quest.status]);

            // Iterate over each status timer key and convert from a string into the enums number value
            for (const statusTimerKey in quest.statusTimers) {
                if (Number.isNaN(Number.parseInt(statusTimerKey))) {
                    // Is a string, convert
                    quest.statusTimers[QuestStatus[statusTimerKey]] = quest.statusTimers[statusTimerKey];

                    // Delete the old string key/value
                    quest.statusTimers[statusTimerKey] = undefined;
                }
            }
        }

        // Find marked as failed quests + flagged as restartable and re-status them as 'failed' so they can be restarted by player
        const failedQuests = questsToProcess.filter((quest) => quest.status === QuestStatus.MarkedAsFailed);
        for (const failedQuest of failedQuests) {
            const dbQuest = this.databaseService.getQuests()[failedQuest.qid];
            if (!dbQuest) {
                continue;
            }

            if (dbQuest.restartable) {
                failedQuest.status = QuestStatus.Fail;
            }
        }

        return questsToProcess;
    }

    /**
     * Adjust server trader settings if they differ from data sent by client
     * @param tradersServerProfile Server
     * @param tradersClientProfile Client
     */
    protected applyTraderStandingAdjustments(
        tradersServerProfile: Record<string, ITraderInfo>,
        tradersClientProfile: Record<string, ITraderInfo>,
    ): void {
        for (const traderId in tradersClientProfile) {
            const serverProfileTrader = tradersServerProfile[traderId];
            const clientProfileTrader = tradersClientProfile[traderId];
            if (!(serverProfileTrader && clientProfileTrader)) {
                continue;
            }

            if (clientProfileTrader.standing !== serverProfileTrader.standing) {
                // Difference found, update server profile with values from client profile
                tradersServerProfile[traderId].standing = clientProfileTrader.standing;
            }
        }
    }

    /**
     * Check if player used BTR or transit item sending service and send items to player via mail if found
     * @param sessionId Session id
     * @param request End raid request
     */
    protected handleItemTransferEvent(sessionId: string, request: IEndLocalRaidRequestData): void {
        const transferTypes = ["btr", "transit"];

        for (const trasferType of transferTypes) {
            const rootId = `${Traders.BTR}_${trasferType}`;
            let itemsToSend = request.transferItems[rootId] ?? [];

            // Filter out the btr container item from transferred items before delivering
            itemsToSend = itemsToSend.filter((item) => item._id !== Traders.BTR);
            if (itemsToSend.length === 0) {
                continue;
            }

            this.transferItemDelivery(sessionId, Traders.BTR, itemsToSend);
        }
    }

    protected transferItemDelivery(sessionId: string, traderId: string, items: IItem[]): void {
        const serverProfile = this.saveServer.getProfile(sessionId);
        const pmcData = serverProfile.characters.pmc;

        const dialogueTemplates = this.databaseService.getTrader(traderId).dialogue;
        if (!dialogueTemplates) {
            this.logger.error(
                this.localisationService.getText("inraid-unable_to_deliver_item_no_trader_found", traderId),
            );

            return;
        }
        const messageId = this.randomUtil.getArrayValue(dialogueTemplates.itemsDelivered);
        const messageStoreTime = this.timeUtil.getHoursAsSeconds(this.traderConfig.fence.btrDeliveryExpireHours);

        // Remove any items that were returned by the item delivery, but also insured, from the player's insurance list
        // This is to stop items being duplicated by being returned from both item delivery and insurance
        const deliveredItemIds = items.map((item) => item._id);
        pmcData.InsuredItems = pmcData.InsuredItems.filter(
            (insuredItem) => !deliveredItemIds.includes(insuredItem.itemId),
        );

        // Send the items to the player
        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionId,
            this.traderHelper.getTraderById(traderId),
            MessageType.BTR_ITEMS_DELIVERY,
            messageId,
            items,
            messageStoreTime,
        );
    }

    protected handleInsuredItemLostEvent(
        sessionId: string,
        preRaidPmcProfile: IPmcData,
        request: IEndLocalRaidRequestData,
        locationName: string,
    ): void {
        if (request.lostInsuredItems?.length > 0) {
            const mappedItems = this.insuranceService.mapInsuredItemsToTrader(
                sessionId,
                request.lostInsuredItems,
                preRaidPmcProfile,
            );

            // Is possible to have items in lostInsuredItems but removed before reaching mappedItems
            if (mappedItems.length === 0) {
                return;
            }

            this.insuranceService.storeGearLostInRaidToSendLater(sessionId, mappedItems);

            this.insuranceService.startPostRaidInsuranceLostProcess(preRaidPmcProfile, sessionId, locationName);
        }
    }

    /**
     * Return the equipped items from a players inventory
     * @param items Players inventory to search through
     * @returns an array of equipped items
     */
    protected getEquippedGear(items: IItem[]): IItem[] {
        // Player Slots we care about
        const inventorySlots = [
            "FirstPrimaryWeapon",
            "SecondPrimaryWeapon",
            "Holster",
            "Scabbard",
            "Compass",
            "Headwear",
            "Earpiece",
            "Eyewear",
            "FaceCover",
            "ArmBand",
            "ArmorVest",
            "TacticalVest",
            "Backpack",
            "pocket1",
            "pocket2",
            "pocket3",
            "pocket4",
            "SpecialSlot1",
            "SpecialSlot2",
            "SpecialSlot3",
        ];

        let inventoryItems: IItem[] = [];

        // Get an array of root player items
        for (const item of items) {
            if (inventorySlots.includes(item.slotId)) {
                inventoryItems.push(item);
            }
        }

        // Loop through these items and get all of their children
        let newItems = inventoryItems;
        while (newItems.length > 0) {
            const foundItems = [];

            for (const item of newItems) {
                // Find children of this item
                for (const newItem of items) {
                    if (newItem.parentId === item._id) {
                        foundItems.push(newItem);
                    }
                }
            }

            // Add these new found items to our list of inventory items
            inventoryItems = [...inventoryItems, ...foundItems];

            // Now find the children of these items
            newItems = foundItems;
        }

        return inventoryItems;
    }

    /**
     * Checks to see if player survives. run through will return false
     * @param statusOnExit Exit value from offraidData object
     * @returns true if Survived
     */
    protected isPlayerSurvived(results: IEndRaidResult): boolean {
        return results.result === ExitStatus.SURVIVED;
    }

    /**
     * Is the player dead after a raid - dead = anything other than "survived" / "runner"
     * @param results Post raid request
     * @returns true if dead
     */
    protected isPlayerDead(results: IEndRaidResult): boolean {
        return [ExitStatus.KILLED, ExitStatus.MISSINGINACTION, ExitStatus.LEFT].includes(results.result);
    }

    /**
     * Has the player moved from one map to another
     * @param results Post raid request
     * @returns True if players transfered
     */
    protected isMapToMapTransfer(results: IEndRaidResult) {
        return results.result === ExitStatus.TRANSIT;
    }

    /**
     * Reset the skill points earned in a raid to 0, ready for next raid
     * @param commonSkills Profile common skills to update
     */
    protected resetSkillPointsEarnedDuringRaid(commonSkills: Common[]): void {
        for (const skill of commonSkills) {
            skill.PointsEarnedDuringSession = 0.0;
        }
    }

    /**
     * merge two dictionaries together
     * Prioritise pair that has true as a value
     * @param primary main dictionary
     * @param secondary Secondary dictionary
     */
    protected mergePmcAndScavEncyclopedias(primary: IPmcData, secondary: IPmcData): void {
        function extend(target: { [key: string]: boolean }, source: Record<string, boolean>) {
            for (const key in source) {
                if (Object.hasOwn(source, key)) {
                    target[key] = source[key];
                }
            }
            return target;
        }

        const merged = extend(extend({}, primary.Encyclopedia), secondary.Encyclopedia);
        primary.Encyclopedia = merged;
        secondary.Encyclopedia = merged;
    }

    /**
     * Does provided profile contain any condition counters
     * @param profile Profile to check for condition counters
     * @returns Profile has condition counters
     */
    protected profileHasConditionCounters(profile: IPmcData): boolean {
        if (!profile.TaskConditionCounters) {
            return false;
        }

        return Object.keys(profile.TaskConditionCounters).length > 0;
    }

    /**
     * Scav quest progress isnt transferred automatically from scav to pmc, we do this manually
     * @param scavProfile Scav profile with quest progress post-raid
     * @param pmcProfile Server pmc profile to copy scav quest progress into
     */
    protected migrateScavQuestProgressToPmcProfile(scavProfile: IPmcData, pmcProfile: IPmcData): void {
        for (const scavQuest of scavProfile.Quests) {
            const pmcQuest = pmcProfile.Quests.find((quest) => quest.qid === scavQuest.qid);
            if (!pmcQuest) {
                this.logger.warning(
                    this.localisationService.getText(
                        "inraid-unable_to_migrate_pmc_quest_not_found_in_profile",
                        scavQuest.qid,
                    ),
                );
                continue;
            }

            // Get counters related to scav quest
            const matchingCounters = Object.values(scavProfile.TaskConditionCounters).filter(
                (counter) => counter.sourceId === scavQuest.qid,
            );

            if (!matchingCounters) {
                continue;
            }

            // insert scav quest counters into pmc profile
            for (const counter of matchingCounters) {
                pmcProfile.TaskConditionCounters[counter.id] = counter;
            }

            // Find Matching PMC Quest
            // Update Status and StatusTimer properties
            pmcQuest.status = scavQuest.status;
            pmcQuest.statusTimers = scavQuest.statusTimers;
        }
    }
}
