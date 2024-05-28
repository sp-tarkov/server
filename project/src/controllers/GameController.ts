import { inject, injectable } from "tsyringe";
import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { HideoutHelper } from "@spt/helpers/HideoutHelper";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { ILocation } from "@spt/models/eft/common/ILocation";
import { ILooseLoot } from "@spt/models/eft/common/ILooseLoot";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { BodyPartHealth } from "@spt/models/eft/common/tables/IBotBase";
import { ICheckVersionResponse } from "@spt/models/eft/game/ICheckVersionResponse";
import { ICurrentGroupResponse } from "@spt/models/eft/game/ICurrentGroupResponse";
import { IGameConfigResponse } from "@spt/models/eft/game/IGameConfigResponse";
import { IGameKeepAliveResponse } from "@spt/models/eft/game/IGameKeepAliveResponse";
import { IGameModeRequestData } from "@spt/models/eft/game/IGameModeRequestData";
import { ESessionMode } from "@spt/models/eft/game/IGameModeResponse";
import { IGetRaidTimeRequest } from "@spt/models/eft/game/IGetRaidTimeRequest";
import { IGetRaidTimeResponse } from "@spt/models/eft/game/IGetRaidTimeResponse";
import { IServerDetails } from "@spt/models/eft/game/IServerDetails";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { BonusType } from "@spt/models/enums/BonusType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import { Traders } from "@spt/models/enums/Traders";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { IHideoutConfig } from "@spt/models/spt/config/IHideoutConfig";
import { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import { ILootConfig } from "@spt/models/spt/config/ILootConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { CustomLocationWaveService } from "@spt/services/CustomLocationWaveService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { GiftService } from "@spt/services/GiftService";
import { ItemBaseClassService } from "@spt/services/ItemBaseClassService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { OpenZoneService } from "@spt/services/OpenZoneService";
import { ProfileActivityService } from "@spt/services/ProfileActivityService";
import { ProfileFixerService } from "@spt/services/ProfileFixerService";
import { RaidTimeAdjustmentService } from "@spt/services/RaidTimeAdjustmentService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";

@injectable()
export class GameController
{
    protected httpConfig: IHttpConfig;
    protected coreConfig: ICoreConfig;
    protected locationConfig: ILocationConfig;
    protected ragfairConfig: IRagfairConfig;
    protected hideoutConfig: IHideoutConfig;
    protected pmcConfig: IPmcConfig;
    protected lootConfig: ILootConfig;
    protected botConfig: IBotConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("PreSptModLoader") protected preSptModLoader: PreSptModLoader,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HideoutHelper") protected hideoutHelper: HideoutHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("CustomLocationWaveService") protected customLocationWaveService: CustomLocationWaveService,
        @inject("OpenZoneService") protected openZoneService: OpenZoneService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ItemBaseClassService") protected itemBaseClassService: ItemBaseClassService,
        @inject("GiftService") protected giftService: GiftService,
        @inject("RaidTimeAdjustmentService") protected raidTimeAdjustmentService: RaidTimeAdjustmentService,
        @inject("ProfileActivityService") protected profileActivityService: ProfileActivityService,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    )
    {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
        this.lootConfig = this.configServer.getConfig(ConfigTypes.LOOT);
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    public load(): void
    {
        // Regenerate base cache now mods are loaded and game is starting
        // Mods that add items and use the baseClass service generate the cache including their items, the next mod that
        // add items gets left out,causing warnings
        this.itemBaseClassService.hydrateItemBaseClassCache();
        this.addCustomLooseLootPositions();
    }

    /**
     * Handle client/game/start
     */
    public gameStart(_url: string, _info: IEmptyRequestData, sessionID: string, startTimeStampMS: number): void
    {
        // Store client start time in app context
        this.applicationContext.addValue(ContextVariableType.CLIENT_START_TIMESTAMP, startTimeStampMS);

        this.profileActivityService.setActivityTimestamp(sessionID);

        if (this.coreConfig.fixes.fixShotgunDispersion)
        {
            this.fixShotgunDispersions();
        }

        if (this.locationConfig.addOpenZonesToAllMaps)
        {
            this.openZoneService.applyZoneChangesToAllMaps();
        }

        if (this.locationConfig.addCustomBotWavesToMaps)
        {
            this.customLocationWaveService.applyWaveChangesToAllMaps();
        }

        if (this.locationConfig.enableBotTypeLimits)
        {
            this.adjustMapBotLimits();
        }

        this.adjustLooseLootSpawnProbabilities();

        this.checkTraderRepairValuesExist();

        this.adjustLocationBotValues();

        // repeatableQuests are stored by in profile.Quests due to the responses of the client (e.g. Quests in
        // offraidData). Since we don't want to clutter the Quests list, we need to remove all completed (failed or
        // successful) repeatable quests. We also have to remove the Counters from the repeatableQuests
        if (sessionID)
        {
            const fullProfile = this.profileHelper.getFullProfile(sessionID);
            if (fullProfile.info.wipe)
            {
                // Don't bother doing any fixes, we're resetting profile
                return;
            }

            const pmcProfile = fullProfile.characters.pmc;

            this.logger.debug(`Started game with sessionId: ${sessionID} ${pmcProfile.Info?.Nickname}`);

            // Migrate aki object data into spt for 3.9.0 release
            if ((fullProfile as any).aki)
            {
                fullProfile.spt = this.cloner.clone((fullProfile as any).aki);
                delete (fullProfile as any).aki;
            }

            if (this.coreConfig.fixes.fixProfileBreakingInventoryItemIssues)
            {
                this.profileFixerService.fixProfileBreakingInventoryItemIssues(pmcProfile);
            }

            if (pmcProfile.Health)
            {
                this.updateProfileHealthValues(pmcProfile);
            }

            if (this.locationConfig.fixEmptyBotWavesSettings.enabled)
            {
                this.fixBrokenOfflineMapWaves();
            }

            if (this.locationConfig.rogueLighthouseSpawnTimeSettings.enabled)
            {
                this.fixRoguesSpawningInstantlyOnLighthouse();
            }

            if (this.locationConfig.splitWaveIntoSingleSpawnsSettings.enabled)
            {
                this.splitBotWavesIntoSingleWaves();
            }

            this.profileFixerService.removeLegacyScavCaseProductionCrafts(pmcProfile);

            this.profileFixerService.addMissingHideoutAreasToProfile(fullProfile);

            if (pmcProfile.Inventory)
            {
                // MUST occur prior to `profileFixerService.checkForAndFixPmcProfileIssues()`
                this.profileFixerService.fixIncorrectAidValue(fullProfile);

                this.profileFixerService.migrateStatsToNewStructure(fullProfile);

                this.sendPraporGiftsToNewProfiles(pmcProfile);

                this.profileFixerService.checkForOrphanedModdedItems(sessionID, fullProfile);
            }

            this.profileFixerService.checkForAndFixPmcProfileIssues(pmcProfile);

            this.profileFixerService.addMissingSptVersionTagToProfile(fullProfile);

            if (pmcProfile.Hideout)
            {
                this.profileFixerService.addMissingHideoutBonusesToProfile(pmcProfile);
                this.profileFixerService.addMissingUpgradesPropertyToHideout(pmcProfile);
                this.hideoutHelper.setHideoutImprovementsToCompleted(pmcProfile);
                this.hideoutHelper.unlockHideoutWallInProfile(pmcProfile);
                this.profileFixerService.addMissingIdsToBonuses(pmcProfile);
                this.profileFixerService.fixBitcoinProductionTime(pmcProfile);
            }

            this.logProfileDetails(fullProfile);

            this.adjustLabsRaiderSpawnRate();

            this.adjustHideoutCraftTimes();
            this.adjustHideoutBuildTimes();

            this.removePraporTestMessage();

            this.saveActiveModsToProfile(fullProfile);

            this.validateQuestAssortUnlocksExist();

            if (pmcProfile.Info)
            {
                this.addPlayerToPMCNames(pmcProfile);

                this.checkForAndRemoveUndefinedDialogs(fullProfile);
            }

            if (this.seasonalEventService.isAutomaticEventDetectionEnabled())
            {
                this.seasonalEventService.enableSeasonalEvents(sessionID);
            }

            if (pmcProfile?.Skills?.Common)
            {
                this.warnOnActiveBotReloadSkill(pmcProfile);
            }

            // Flea bsg blacklist is off
            if (!this.ragfairConfig.dynamic.blacklist.enableBsgList)
            {
                this.flagAllItemsInDbAsSellableOnFlea();
            }
        }
    }

    protected adjustHideoutCraftTimes(): void
    {
        const craftTimeOverrideSeconds = this.hideoutConfig.overrideCraftTimeSeconds;
        if (craftTimeOverrideSeconds === -1)
        {
            return;
        }

        for (const craft of this.databaseService.getHideout().production)
        {
            // Only adjust crafts ABOVE the override
            if (craft.productionTime > craftTimeOverrideSeconds)
            {
                craft.productionTime = craftTimeOverrideSeconds;
            }
        }
    }

    protected adjustHideoutBuildTimes(): void
    {
        const craftTimeOverrideSeconds = this.hideoutConfig.overrideBuildTimeSeconds;
        if (craftTimeOverrideSeconds === -1)
        {
            return;
        }

        for (const area of this.databaseService.getHideout().areas)
        {
            for (const stageKey of Object.keys(area.stages))
            {
                const stage = area.stages[stageKey];
                // Only adjust crafts ABOVE the override
                if (stage.constructionTime > craftTimeOverrideSeconds)
                {
                    stage.constructionTime = craftTimeOverrideSeconds;
                }
            }
        }
    }

    protected adjustLocationBotValues(): void
    {
        const mapsDb = this.databaseService.getLocations();

        for (const locationKey in this.botConfig.maxBotCap)
        {
            const map: ILocation = mapsDb[locationKey];
            if (!map)
            {
                continue;
            }

            map.base.BotMax = this.botConfig.maxBotCap[locationKey];

            // make values no larger than 30 secs
            map.base.BotStart = Math.min(map.base.BotStart, 30);
        }
    }

    /**
     * Out of date/incorrectly made trader mods forget this data
     */
    protected checkTraderRepairValuesExist(): void
    {
        const traders = this.databaseService.getTraders();
        for (const traderKey in traders)
        {
            const trader = traders[traderKey];
            if (!trader?.base?.repair)
            {
                this.logger.warning(this.localisationService.getText("trader-missing_repair_property_using_default",
                    { traderId: trader.base._id, nickname: trader.base.nickname }));
                trader.base.repair = this.cloner.clone(traders.ragfair.base.repair);

                return;
            }

            if (trader.base.repair?.quality === undefined)
            {
                this.logger.warning(this.localisationService.getText("trader-missing_repair_quality_property_using_default",
                    { traderId: trader.base._id, nickname: trader.base.nickname }));
                trader.base.repair.quality = this.cloner.clone(
                    traders.ragfair.base.repair.quality,
                );
                trader.base.repair.quality = traders.ragfair.base.repair.quality;
            }
        }
    }

    protected addCustomLooseLootPositions(): void
    {
        const looseLootPositionsToAdd = this.lootConfig.looseLoot;
        for (const mapId in looseLootPositionsToAdd)
        {
            if (!mapId)
            {
                this.logger.warning(this.localisationService.getText("location-unable_to_add_custom_loot_position", mapId));

                continue;
            }

            const mapLooseLoot: ILooseLoot = this.databaseService.getLocation(mapId).looseLoot;
            if (!mapLooseLoot)
            {
                this.logger.warning(this.localisationService.getText("location-map_has_no_loose_loot_data", mapId));

                continue;
            }

            const positionsToAdd = looseLootPositionsToAdd[mapId];
            for (const positionToAdd of positionsToAdd)
            {
                // Exists already, add new items to existing positions pool
                const existingLootPosition = mapLooseLoot.spawnpoints.find(
                    (x) => x.template.Id === positionToAdd.template.Id,
                );

                if (existingLootPosition)
                {
                    existingLootPosition.template.Items.push(...positionToAdd.template.Items);
                    existingLootPosition.itemDistribution.push(...positionToAdd.itemDistribution);

                    continue;
                }

                // New position, add entire object
                mapLooseLoot.spawnpoints.push(positionToAdd);
            }
        }
    }

    protected adjustLooseLootSpawnProbabilities(): void
    {
        const adjustments = this.lootConfig.looseLootSpawnPointAdjustments;
        for (const mapId in adjustments)
        {
            const mapLooseLootData: ILooseLoot = this.databaseService.getLocation(mapId).looseLoot;
            if (!mapLooseLootData)
            {
                this.logger.warning(this.localisationService.getText("location-map_has_no_loose_loot_data", mapId));

                continue;
            }
            const mapLootAdjustmentsDict = adjustments[mapId];
            for (const lootKey in mapLootAdjustmentsDict)
            {
                const lootPostionToAdjust = mapLooseLootData.spawnpoints
                    .find((spawnPoint) => spawnPoint.template.Id === lootKey);
                if (!lootPostionToAdjust)
                {
                    this.logger.warning(this.localisationService.getText("location-unable_to_adjust_loot_position_on_map", { lootKey: lootKey, mapId: mapId }));

                    continue;
                }

                lootPostionToAdjust.probability = mapLootAdjustmentsDict[lootKey];
            }
        }
    }

    /** Apply custom limits on bot types as defined in configs/location.json/botTypeLimits */
    protected adjustMapBotLimits(): void
    {
        const mapsDb = this.databaseService.getLocations();
        if (!this.locationConfig.botTypeLimits)
        {
            return;
        }

        for (const mapId in this.locationConfig.botTypeLimits)
        {
            const map: ILocation = mapsDb[mapId];
            if (!map)
            {
                this.logger.warning(
                    this.localisationService.getText("bot-unable_to_edit_limits_of_unknown_map", mapId),
                );
            }

            for (const botToLimit of this.locationConfig.botTypeLimits[mapId])
            {
                const index = map.base.MinMaxBots.findIndex((x) => x.WildSpawnType === botToLimit.type);
                if (index !== -1)
                {
                    // Existing bot type found in MinMaxBots array, edit
                    const limitObjectToUpdate = map.base.MinMaxBots[index];
                    limitObjectToUpdate.min = botToLimit.min;
                    limitObjectToUpdate.max = botToLimit.max;
                }
                else
                {
                    // Bot type not found, add new object
                    map.base.MinMaxBots.push({
                        // Bot type not found, add new object
                        WildSpawnType: botToLimit.type,
                        min: botToLimit.min,
                        max: botToLimit.max,
                    });
                }
            }
        }
    }

    /**
     * Handle client/game/config
     */
    public getGameConfig(sessionID: string): IGameConfigResponse
    {
        const profile = this.profileHelper.getPmcProfile(sessionID);
        const gameTime
            = profile.Stats?.Eft.OverallCounters.Items?.find(
                (counter) => counter.Key.includes("LifeTime") && counter.Key.includes("Pmc"),
            )?.Value ?? 0;

        const config: IGameConfigResponse = {
            languages: this.databaseService.getLocales().languages,
            ndaFree: false,
            reportAvailable: false,
            twitchEventMember: false,
            lang: "en",
            aid: profile.aid,
            taxonomy: 6,
            activeProfileId: sessionID,
            backend: {
                Lobby: this.httpServerHelper.getBackendUrl(),
                Trading: this.httpServerHelper.getBackendUrl(),
                Messaging: this.httpServerHelper.getBackendUrl(),
                Main: this.httpServerHelper.getBackendUrl(),
                RagFair: this.httpServerHelper.getBackendUrl(),
            },
            useProtobuf: false,
            utc_time: new Date().getTime() / 1000,
            totalInGame: gameTime,
        };

        return config;
    }

    /**
     * Handle client/game/mode
     */
    public getGameMode(sessionID: string, info: IGameModeRequestData): any
    {
        return { gameMode: ESessionMode.REGULAR, backendUrl: this.httpServerHelper.getBackendUrl() };
    }

    /**
     * Handle client/server/list
     */
    public getServer(sessionId: string): IServerDetails[]
    {
        return [{ ip: this.httpConfig.backendIp, port: Number.parseInt(this.httpConfig.backendPort) }];
    }

    /**
     * Handle client/match/group/current
     */
    public getCurrentGroup(sessionId: string): ICurrentGroupResponse
    {
        return { squad: [] };
    }

    /**
     * Handle client/checkVersion
     */
    public getValidGameVersion(sessionId: string): ICheckVersionResponse
    {
        return { isvalid: true, latestVersion: this.coreConfig.compatibleTarkovVersion };
    }

    /**
     * Handle client/game/keepalive
     */
    public getKeepAlive(sessionId: string): IGameKeepAliveResponse
    {
        this.profileActivityService.setActivityTimestamp(sessionId);
        return { msg: "OK", utc_time: new Date().getTime() / 1000 };
    }

    /**
     * Handle singleplayer/settings/getRaidTime
     */
    public getRaidTime(sessionId: string, request: IGetRaidTimeRequest): IGetRaidTimeResponse
    {
        // Set interval times to in-raid value
        this.ragfairConfig.runIntervalSeconds = this.ragfairConfig.runIntervalValues.inRaid;

        this.hideoutConfig.runIntervalSeconds = this.hideoutConfig.runIntervalValues.inRaid;

        return this.raidTimeAdjustmentService.getRaidAdjustments(sessionId, request);
    }

    /**
     * BSG have two values for shotgun dispersion, we make sure both have the same value
     */
    protected fixShotgunDispersions(): void
    {
        const itemDb = this.databaseService.getItems();

        // Saiga 12ga
        // Toz 106
        // Remington 870
        const shotguns = ["576165642459773c7a400233", "5a38e6bac4a2826c6e06d79b", "5a7828548dc32e5a9c28b516"];
        for (const shotgunId of shotguns)
        {
            if (itemDb[shotgunId]._props.ShotgunDispersion)
            {
                itemDb[shotgunId]._props.shotgunDispersion = itemDb[shotgunId]._props.ShotgunDispersion;
            }
        }
    }

    /**
     * Players set botReload to a high value and don't expect the crazy fast reload speeds, give them a warn about it
     * @param pmcProfile Player profile
     */
    protected warnOnActiveBotReloadSkill(pmcProfile: IPmcData): void
    {
        const botReloadSkill = this.profileHelper.getSkillFromProfile(pmcProfile, SkillTypes.BOT_RELOAD);
        if (botReloadSkill?.Progress > 0)
        {
            this.logger.warning(this.localisationService.getText("server_start_player_active_botreload_skill"));
        }
    }

    protected flagAllItemsInDbAsSellableOnFlea(): void
    {
        const dbItems = Object.values(this.databaseService.getItems());
        for (const item of dbItems)
        {
            if (item._type === "Item" && !item._props?.CanSellOnRagfair)
            {
                item._props.CanSellOnRagfair = true;
            }
        }
    }

    /**
     * When player logs in, iterate over all active effects and reduce timer
     * @param pmcProfile Profile to adjust values for
     */
    protected updateProfileHealthValues(pmcProfile: IPmcData): void
    {
        const healthLastUpdated = pmcProfile.Health.UpdateTime;
        const currentTimeStamp = this.timeUtil.getTimestamp();
        const diffSeconds = currentTimeStamp - healthLastUpdated;

        // Last update is in past
        if (healthLastUpdated < currentTimeStamp)
        {
            // Base values
            let energyRegenPerHour = 60;
            let hydrationRegenPerHour = 60;
            let hpRegenPerHour = 456.6;

            // Set new values, whatever is smallest
            energyRegenPerHour += pmcProfile.Bonuses.filter(
                (bonus) => bonus.type === BonusType.ENERGY_REGENERATION,
            ).reduce((sum, curr) => sum + (curr.value ?? 0), 0);
            hydrationRegenPerHour += pmcProfile.Bonuses.filter(
                (bonus) => bonus.type === BonusType.HYDRATION_REGENERATION,
            ).reduce((sum, curr) => sum + (curr.value ?? 0), 0);
            hpRegenPerHour += pmcProfile.Bonuses.filter((bonus) => bonus.type === BonusType.HEALTH_REGENERATION).reduce(
                (sum, curr) => sum + (curr.value ?? 0),
                0,
            );

            // Player has energy deficit
            if (pmcProfile.Health.Energy.Current !== pmcProfile.Health.Energy.Maximum)
            {
                // Set new value, whatever is smallest
                pmcProfile.Health.Energy.Current += Math.round(energyRegenPerHour * (diffSeconds / 3600));
                if (pmcProfile.Health.Energy.Current > pmcProfile.Health.Energy.Maximum)
                {
                    pmcProfile.Health.Energy.Current = pmcProfile.Health.Energy.Maximum;
                }
            }

            // Player has hydration deficit
            if (pmcProfile.Health.Hydration.Current !== pmcProfile.Health.Hydration.Maximum)
            {
                pmcProfile.Health.Hydration.Current += Math.round(hydrationRegenPerHour * (diffSeconds / 3600));
                if (pmcProfile.Health.Hydration.Current > pmcProfile.Health.Hydration.Maximum)
                {
                    pmcProfile.Health.Hydration.Current = pmcProfile.Health.Hydration.Maximum;
                }
            }

            // Check all body parts
            for (const bodyPartKey in pmcProfile.Health.BodyParts)
            {
                const bodyPart = pmcProfile.Health.BodyParts[bodyPartKey] as BodyPartHealth;

                // Check part hp
                if (bodyPart.Health.Current < bodyPart.Health.Maximum)
                {
                    bodyPart.Health.Current += Math.round(hpRegenPerHour * (diffSeconds / 3600));
                }
                if (bodyPart.Health.Current > bodyPart.Health.Maximum)
                {
                    bodyPart.Health.Current = bodyPart.Health.Maximum;
                }

                // Look for effects
                if (Object.keys(bodyPart.Effects ?? {}).length > 0)
                {
                    // Decrement effect time value by difference between current time and time health was last updated
                    for (const effectKey in bodyPart.Effects)
                    {
                        // remove effects below 1, .e.g. bleeds at -1
                        if (bodyPart.Effects[effectKey].Time < 1)
                        {
                            // More than 30 mins has passed
                            if (diffSeconds > 1800)
                            {
                                delete bodyPart.Effects[effectKey];
                            }

                            continue;
                        }

                        bodyPart.Effects[effectKey].Time -= diffSeconds;
                        if (bodyPart.Effects[effectKey].Time < 1)
                        {
                            // effect time was sub 1, set floor it can be
                            bodyPart.Effects[effectKey].Time = 1;
                        }
                    }
                }
            }
            pmcProfile.Health.UpdateTime = currentTimeStamp;
        }
    }

    /**
     * Waves with an identical min/max values spawn nothing, the number of bots that spawn is the difference between min and max
     */
    protected fixBrokenOfflineMapWaves(): void
    {
        const locations = this.databaseService.getLocations();
        for (const locationKey in locations)
        {
            // Skip ignored maps
            if (this.locationConfig.fixEmptyBotWavesSettings.ignoreMaps.includes(locationKey))
            {
                continue;
            }

            // Loop over all of the locations waves and look for waves with identical min and max slots
            const location: ILocation = locations[locationKey];
            if (!location.base)
            {
                this.logger.warning(
                    this.localisationService.getText("location-unable_to_fix_broken_waves_missing_base", locationKey),
                );
                continue;
            }

            for (const wave of location.base.waves ?? [])
            {
                if (wave.slots_max - wave.slots_min === 0)
                {
                    this.logger.debug(
                        `Fixed ${wave.WildSpawnType} Spawn: ${locationKey} wave: ${wave.number} of type: ${wave.WildSpawnType} in zone: ${wave.SpawnPoints} with Max Slots of ${wave.slots_max}`,
                    );
                    wave.slots_max++;
                }
            }
        }
    }

    /**
     * Make Rogues spawn later to allow for scavs to spawn first instead of rogues filling up all spawn positions
     */
    protected fixRoguesSpawningInstantlyOnLighthouse(): void
    {
        const lighthouse = this.databaseService.getLocations().lighthouse!.base;
        for (const wave of lighthouse.BossLocationSpawn)
        {
            // Find Rogues that spawn instantly
            if (wave.BossName === "exUsec" && wave.Time === -1)
            {
                wave.Time = this.locationConfig.rogueLighthouseSpawnTimeSettings.waitTimeSeconds;
            }
        }
    }

    /**
     * Send starting gifts to profile after x days
     * @param pmcProfile Profile to add gifts to
     */
    protected sendPraporGiftsToNewProfiles(pmcProfile: IPmcData): void
    {
        const timeStampProfileCreated = pmcProfile.Info.RegistrationDate;
        const oneDaySeconds = this.timeUtil.getHoursAsSeconds(24);
        const currentTimeStamp = this.timeUtil.getTimestamp();

        // One day post-profile creation
        if (currentTimeStamp > timeStampProfileCreated + oneDaySeconds)
        {
            this.giftService.sendPraporStartingGift(pmcProfile.sessionId, 1);
        }

        // Two day post-profile creation
        if (currentTimeStamp > timeStampProfileCreated + oneDaySeconds * 2)
        {
            this.giftService.sendPraporStartingGift(pmcProfile.sessionId, 2);
        }
    }

    /**
     * Find and split waves with large numbers of bots into smaller waves - BSG appears to reduce the size of these
     * waves to one bot when they're waiting to spawn for too long
     */
    protected splitBotWavesIntoSingleWaves(): void
    {
        const locations = this.databaseService.getLocations();
        for (const locationKey in locations)
        {
            if (this.locationConfig.splitWaveIntoSingleSpawnsSettings.ignoreMaps.includes(locationKey))
            {
                continue;
            }

            // Iterate over all maps
            const location: ILocation = locations[locationKey];
            for (const wave of location.base.waves)
            {
                // Wave has size that makes it candidate for splitting
                if (
                    wave.slots_max - wave.slots_min
                    >= this.locationConfig.splitWaveIntoSingleSpawnsSettings.waveSizeThreshold
                )
                {
                    // Get count of bots to be spawned in wave
                    const waveSize = wave.slots_max - wave.slots_min;

                    // Update wave to spawn single bot
                    wave.slots_min = 1;
                    wave.slots_max = 2;

                    // Get index of wave
                    const indexOfWaveToSplit = location.base.waves.indexOf(wave);
                    this.logger.debug(
                        `Splitting map: ${location.base.Id} wave: ${indexOfWaveToSplit} with ${waveSize} bots`,
                    );

                    // Add new waves to fill gap from bots we removed in above wave
                    let wavesAddedCount = 0;
                    for (let index = indexOfWaveToSplit + 1; index < indexOfWaveToSplit + waveSize; index++)
                    {
                        // Clone wave ready to insert into array
                        const waveToAddClone = this.cloner.clone(wave);

                        // Some waves have value of 0 for some reason, preserve
                        if (waveToAddClone.number !== 0)
                        {
                            // Update wave number to new location in array
                            waveToAddClone.number = index;
                        }

                        // Place wave into array in just-edited position + 1
                        location.base.waves.splice(index, 0, waveToAddClone);
                        wavesAddedCount++;
                    }

                    // Update subsequent wave number property to accommodate the new waves
                    for (
                        let index = indexOfWaveToSplit + wavesAddedCount + 1;
                        index < location.base.waves.length;
                        index++
                    )
                    {
                        // Some waves have value of 0, leave them as-is
                        if (location.base.waves[index].number !== 0)
                        {
                            location.base.waves[index].number += wavesAddedCount;
                        }
                    }
                }
            }
        }
    }

    /**
     * Get a list of installed mods and save their details to the profile being used
     * @param fullProfile Profile to add mod details to
     */
    protected saveActiveModsToProfile(fullProfile: ISptProfile): void
    {
        // Add empty mod array if undefined
        if (!fullProfile.spt.mods)
        {
            fullProfile.spt.mods = [];
        }

        // Get active mods
        const activeMods = this.preSptModLoader.getImportedModDetails();
        for (const modKey in activeMods)
        {
            const modDetails = activeMods[modKey];
            if (
                fullProfile.spt.mods.some(
                    (x) =>
                        x.author === modDetails.author
                        && x.name === modDetails.name
                        && x.version === modDetails.version,
                )
            )
            {
                // Exists already, skip
                continue;
            }

            fullProfile.spt.mods.push({
                author: modDetails.author,
                dateAdded: Date.now(),
                name: modDetails.name,
                version: modDetails.version,
                url: modDetails.url,
            });
        }
    }

    /**
     * Check for any missing assorts inside each traders assort.json data, checking against traders questassort.json
     */
    protected validateQuestAssortUnlocksExist(): void
    {
        const db = this.databaseService.getTables();
        const traders = db.traders!;
        const quests = db.templates!.quests;
        for (const traderId of Object.values(Traders))
        {
            const traderData = traders[traderId];
            const traderAssorts = traderData?.assort;
            if (!traderAssorts)
            {
                continue;
            }

            // Merge started/success/fail quest assorts into one dictionary
            const mergedQuestAssorts = {
                ...traderData.questassort?.started,
                ...traderData.questassort?.success,
                ...traderData.questassort?.fail,
            };

            // Loop over all assorts for trader
            for (const [assortKey, questKey] of Object.entries(mergedQuestAssorts))
            {
                // Does assort key exist in trader assort file
                if (!traderAssorts.loyal_level_items[assortKey])
                {
                    // Reverse lookup of enum key by value
                    const messageValues = {
                        traderName: Object.keys(Traders)[Object.values(Traders).indexOf(traderId)],
                        questName: quests[questKey]?.QuestName ?? "UNKNOWN",
                    };
                    this.logger.warning(
                        this.localisationService.getText("assort-missing_quest_assort_unlock", messageValues),
                    );
                }
            }
        }
    }

    /**
     * Add the logged in players name to PMC name pool
     * @param pmcProfile Profile of player to get name from
     */
    protected addPlayerToPMCNames(pmcProfile: IPmcData): void
    {
        const playerName = pmcProfile.Info.Nickname;
        if (playerName)
        {
            const bots = this.databaseService.getBots().types;

            if (bots.bear)
            {
                bots.bear.firstName.push(playerName);
            }

            if (bots.usec)
            {
                bots.usec.firstName.push(playerName);
            }
        }
    }

    /**
     * Check for a dialog with the key 'undefined', and remove it
     * @param fullProfile Profile to check for dialog in
     */
    protected checkForAndRemoveUndefinedDialogs(fullProfile: ISptProfile): void
    {
        const undefinedDialog = fullProfile.dialogues.undefined;
        if (undefinedDialog)
        {
            delete fullProfile.dialogues.undefined;
        }
    }

    /**
     * Blank out the "test" mail message from prapor
     */
    protected removePraporTestMessage(): void
    {
        // Iterate over all languages (e.g. "en", "fr")
        const locales = this.databaseService.getLocales();
        for (const localeKey in locales.global)
        {
            locales.global[localeKey]["61687e2c3e526901fa76baf9"] = "";
        }
    }

    /**
     * Make non-trigger-spawned raiders spawn earlier + always
     */
    protected adjustLabsRaiderSpawnRate(): void
    {
        const labsBase = this.databaseService.getLocations().laboratory!.base;
        const nonTriggerLabsBossSpawns = labsBase.BossLocationSpawn.filter(
            (x) => x.TriggerId === "" && x.TriggerName === "",
        );
        if (nonTriggerLabsBossSpawns)
        {
            for (const boss of nonTriggerLabsBossSpawns)
            {
                boss.BossChance = 100;
                boss.Time /= 10;
            }
        }
    }

    protected logProfileDetails(fullProfile: ISptProfile): void
    {
        this.logger.debug(`Profile made with: ${fullProfile.spt.version}`);
        this.logger.debug(
            `Server version: ${globalThis.G_SPTVERSION || this.coreConfig.sptVersion} ${globalThis.G_COMMIT}`,
        );
        this.logger.debug(`Debug enabled: ${globalThis.G_DEBUG_CONFIGURATION}`);
        this.logger.debug(`Mods enabled: ${globalThis.G_MODS_ENABLED}`);
    }
}
