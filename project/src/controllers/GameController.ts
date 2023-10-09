import { inject, injectable } from "tsyringe";

import { ApplicationContext } from "../context/ApplicationContext";
import { ContextVariableType } from "../context/ContextVariableType";
import { HideoutHelper } from "../helpers/HideoutHelper";
import { HttpServerHelper } from "../helpers/HttpServerHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { PreAkiModLoader } from "../loaders/PreAkiModLoader";
import { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";
import { ILooseLoot } from "../models/eft/common/ILooseLoot";
import { IPmcData } from "../models/eft/common/IPmcData";
import { BodyPartHealth } from "../models/eft/common/tables/IBotBase";
import { ICheckVersionResponse } from "../models/eft/game/ICheckVersionResponse";
import { ICurrentGroupResponse } from "../models/eft/game/ICurrentGroupResponse";
import { IGameConfigResponse } from "../models/eft/game/IGameConfigResponse";
import { IGameKeepAliveResponse } from "../models/eft/game/IGameKeepAliveResponse";
import { IServerDetails } from "../models/eft/game/IServerDetails";
import { IAkiProfile } from "../models/eft/profile/IAkiProfile";
import { AccountTypes } from "../models/enums/AccountTypes";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Traders } from "../models/enums/Traders";
import { ICoreConfig } from "../models/spt/config/ICoreConfig";
import { IHttpConfig } from "../models/spt/config/IHttpConfig";
import { ILocationConfig } from "../models/spt/config/ILocationConfig";
import { ILootConfig } from "../models/spt/config/ILootConfig";
import { IPmcConfig } from "../models/spt/config/IPmcConfig";
import { IRagfairConfig } from "../models/spt/config/IRagfairConfig";
import { ILocationData } from "../models/spt/server/ILocations";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { CustomLocationWaveService } from "../services/CustomLocationWaveService";
import { GiftService } from "../services/GiftService";
import { ItemBaseClassService } from "../services/ItemBaseClassService";
import { LocalisationService } from "../services/LocalisationService";
import { OpenZoneService } from "../services/OpenZoneService";
import { ProfileFixerService } from "../services/ProfileFixerService";
import { SeasonalEventService } from "../services/SeasonalEventService";
import { JsonUtil } from "../utils/JsonUtil";
import { RandomUtil } from "../utils/RandomUtil";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class GameController
{
    protected os = require("os");

    protected httpConfig: IHttpConfig;
    protected coreConfig: ICoreConfig;
    protected locationConfig: ILocationConfig;
    protected ragfairConfig: IRagfairConfig;
    protected pmcConfig: IPmcConfig;
    protected lootConfig: ILootConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("PreAkiModLoader") protected preAkiModLoader: PreAkiModLoader,
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
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
        this.lootConfig = this.configServer.getConfig(ConfigTypes.LOOT);
    }

    public load(): void
    {
        // Regenerate basecache now mods are loaded and game is starting
        // Mods that add items and use the baseclass service generate the cache including their items, the next mod that add items gets left out,causing warnings
        this.itemBaseClassService.hydrateItemBaseClassCache();

        this.addCustomLooseLootPositions();
    }

    /**
     * Handle client/game/start
     */
    public gameStart(_url: string, _info: IEmptyRequestData, sessionID: string, startTimeStampMS: number): void
    {
        // Store start time in app context
        this.applicationContext.addValue(ContextVariableType.CLIENT_START_TIMESTAMP, startTimeStampMS);

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

        // repeatableQuests are stored by in profile.Quests due to the responses of the client (e.g. Quests in offraidData)
        // Since we don't want to clutter the Quests list, we need to remove all completed (failed / successful) repeatable quests.
        // We also have to remove the Counters from the repeatableQuests
        if (sessionID)
        {
            const fullProfile = this.profileHelper.getFullProfile(sessionID);
            const pmcProfile = fullProfile.characters.pmc;

            this.logger.debug(`Started game with sessionId: ${sessionID} ${pmcProfile.Info?.Nickname}`);

            if (pmcProfile.Health)
            {
                this.updateProfileHealthValues(pmcProfile);
            }

            if (fullProfile.info.edition.toLowerCase().startsWith(AccountTypes.SPT_DEVELOPER))
            {
                this.setHideoutAreasAndCraftsTo40Secs();
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

            this.profileFixerService.addMissingAkiVersionTagToProfile(fullProfile);

            if (pmcProfile.Hideout)
            {
                this.profileFixerService.addMissingHideoutBonusesToProfile(pmcProfile);
                this.profileFixerService.addMissingUpgradesPropertyToHideout(pmcProfile);
                this.hideoutHelper.setHideoutImprovementsToCompleted(pmcProfile);
                this.hideoutHelper.unlockHideoutWallInProfile(pmcProfile);
                this.profileFixerService.addMissingIdsToBonuses(pmcProfile);
            }
            
            this.logProfileDetails(fullProfile);

            this.adjustLabsRaiderSpawnRate();

            this.removePraporTestMessage();

            this.saveActiveModsToProfile(fullProfile);

            this.validateQuestAssortUnlocksExist();

            if (pmcProfile.Info)
            {
                this.addPlayerToPMCNames(pmcProfile);

                if (this.randomUtil.getChance100(this.pmcConfig.allPMCsHavePlayerNameWithRandomPrefixChance))
                {
                    this.pmcConfig.addPrefixToSameNamePMCAsPlayerChance = 100;
                    if (pmcProfile?.Info?.Nickname)
                    {
                        this.databaseServer.getTables().bots.types.bear.firstName = [pmcProfile.Info.Nickname];
                        this.databaseServer.getTables().bots.types.usec.firstName = [pmcProfile.Info.Nickname];
                    }
                }

                this.checkForAndRemoveUndefinedDialogs(fullProfile);
            }

            if (this.seasonalEventService.isAutomaticEventDetectionEnabled())
            {
                this.seasonalEventService.checkForAndEnableSeasonalEvents(sessionID);
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

    protected addCustomLooseLootPositions(): void
    {
        const looseLootPositionsToAdd = this.lootConfig.looseLoot;
        for (const mapId in looseLootPositionsToAdd)
        {
            if (!mapId)
            {
                this.logger.warning(`Unable to add loot positions to map: ${mapId}, skipping`);
                continue;
            }
            const mapLooseLoot: ILooseLoot = this.databaseServer.getTables().locations[mapId]?.looseLoot;
            if (!mapLooseLoot)
            {
                this.logger.warning(`Map: ${mapId} has no loose loot data, skipping`);
                continue;
            }
            const positionsToAdd = looseLootPositionsToAdd[mapId];
            for (const positionToAdd of positionsToAdd)
            {
                // Exists already, add new items to existing positions pool
                const existingLootPosition = mapLooseLoot.spawnpoints.find(x => x.template.Id === positionToAdd.template.Id);
                if (existingLootPosition)
                {
                    existingLootPosition.template.Items.push(...positionToAdd.template.Items);
                    existingLootPosition.itemDistribution.push(...positionToAdd.itemDistribution);

                    continue;
                }

                // new postion, add entire object
                mapLooseLoot.spawnpoints.push(positionToAdd);
            }
        }
    }

    protected adjustLooseLootSpawnProbabilities(): void
    {
        const adjustments = this.lootConfig.looseLootSpawnPointAdjustments;
        for (const mapId in adjustments)
        {
            const mapLooseLootData: ILooseLoot = this.databaseServer.getTables().locations[mapId]?.looseLoot;
            if (!mapLooseLootData)
            {
                this.logger.warning(`Unable to adjust loot positions on map: ${mapId}`);
                continue;
            }
            const mapLootAdjustmentsDict = adjustments[mapId];
            for (const lootKey in mapLootAdjustmentsDict)
            {
                const lootPostionToAdjust = mapLooseLootData.spawnpoints.find(x => x.template.Id === lootKey);
                if (!lootPostionToAdjust)
                {
                    this.logger.warning(`Unable to adjust loot position: ${lootKey} on map: ${mapId}`);
                    continue;
                }

                lootPostionToAdjust.probability = mapLootAdjustmentsDict[lootKey];
            }
        }
    }
    
    protected setHideoutAreasAndCraftsTo40Secs(): void
    {
        for (const hideoutProd of this.databaseServer.getTables().hideout.production) 
        {
            if (hideoutProd.productionTime > 40) 
            {
                hideoutProd.productionTime = 40;
            }
        }
        this.logger.warning("DEVELOPER: SETTING ALL HIDEOUT PRODUCTIONS TO 40 SECONDS");

        for (const hideoutArea of this.databaseServer.getTables().hideout.areas) 
        {
            for (const stageKey in hideoutArea.stages) 
            {
                const stage = hideoutArea.stages[stageKey];
                if (stage.constructionTime > 40) 
                {
                    stage.constructionTime = 40;
                }
            }
        }
        this.logger.warning("DEVELOPER: SETTING ALL HIDEOUT AREAS TO 40 SECOND UPGRADES");

        for (const scavCaseCraft of this.databaseServer.getTables().hideout.scavcase) 
        {
            if (scavCaseCraft.ProductionTime > 40) 
            {
                scavCaseCraft.ProductionTime = 40;
            }
        }
        this.logger.warning("DEVELOPER: SETTING ALL SCAV CASES TO 40 SECONDS");
    }

    /** Apply custom limits on bot types as defined in configs/location.json/botTypeLimits */
    protected adjustMapBotLimits(): void
    {
        const mapsDb = this.databaseServer.getTables().locations;
        if (!this.locationConfig.botTypeLimits)
        {
            return;
        }

        for (const mapId in this.locationConfig.botTypeLimits)
        {
            const map: ILocationData = mapsDb[mapId];
            if (!map)
            {
                this.logger.warning(this.localisationService.getText("bot-unable_to_edit_limits_of_unknown_map", mapId));
            }

            for (const botToLimit of this.locationConfig.botTypeLimits[mapId])
            {
                const index = map.base.MinMaxBots.findIndex(x => x.WildSpawnType === botToLimit.type);
                if (index !== -1)
                {
                    // Existing bot type found in MinMaxBots array, edit
                    const limitObjectToUpdate = map.base.MinMaxBots[index];
                    limitObjectToUpdate.min = botToLimit.min;
                    limitObjectToUpdate.max = botToLimit.max;
                }
                else
                {
                    map.base.MinMaxBots.push(
                        {
                            // Bot type not found, add new object
                            WildSpawnType: botToLimit.type,
                            min: botToLimit.min,
                            max: botToLimit.max
                        }
                    );
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

        const config: IGameConfigResponse = {
            languages: this.databaseServer.getTables().locales.languages,
            ndaFree: false,
            reportAvailable: false,
            twitchEventMember: false,
            lang: "en",
            aid: profile.aid,
            taxonomy: 6,
            activeProfileId: `pmc${sessionID}`,
            backend: {
                Lobby: this.httpServerHelper.getBackendUrl(),
                Trading: this.httpServerHelper.getBackendUrl(),
                Messaging: this.httpServerHelper.getBackendUrl(),
                Main: this.httpServerHelper.getBackendUrl(),
                RagFair: this.httpServerHelper.getBackendUrl()
            },
            useProtobuf: false,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            utc_time: new Date().getTime() / 1000,
            totalInGame: profile.Stats?.Eft?.TotalInGameTime ?? 0
        };

        return config;
    }

    /**
     * Handle client/server/list
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getServer(sessionId: string): IServerDetails[]
    {
        return [
            {
                ip: this.httpConfig.ip,
                port: this.httpConfig.port
            }
        ];
    }

    /**
     * Handle client/match/group/current
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getCurrentGroup(sessionId: string): ICurrentGroupResponse
    {
        return {
            squad: []
        };
    }

    /**
     * Handle client/checkVersion
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getValidGameVersion(sessionId: string): ICheckVersionResponse
    {
        return {
            isvalid: true,
            latestVersion: this.coreConfig.compatibleTarkovVersion
        };
    }

    /**
     * Handle client/game/keepalive
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getKeepAlive(sessionId: string): IGameKeepAliveResponse
    {
        return {
            msg: "OK",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            utc_time: new Date().getTime() / 1000
        };
    }

    /**
     * BSG have two values for shotgun dispersion, we make sure both have the same value
     */
    protected fixShotgunDispersions(): void
    {
        const itemDb = this.databaseServer.getTables().templates.items;

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
        const botReloadSkill = pmcProfile.Skills.Common.find(x => x.Id === "BotReload");
        if (botReloadSkill?.Progress > 0)
        {
            this.logger.warning(this.localisationService.getText("server_start_player_active_botreload_skill"));
        }
    }

    protected flagAllItemsInDbAsSellableOnFlea(): void
    {
        const dbItems = Object.values(this.databaseServer.getTables().templates.items);
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
     * TODO - add body part HP regen
     * @param pmcProfile 
     */
    protected updateProfileHealthValues(pmcProfile: IPmcData): void
    {
        const healthLastUpdated = pmcProfile.Health.UpdateTime;
        const currentTimeStamp = this.timeUtil.getTimestamp();
        const diffSeconds = currentTimeStamp - healthLastUpdated;

        // last update is in past
        if (healthLastUpdated < currentTimeStamp)
        {
            // Base values
            let energyRegenPerHour = 60;
            let hydrationRegenPerHour = 60;
            let hpRegenPerHour = 456.6;

            // Set new values, whatever is smallest
            energyRegenPerHour += pmcProfile.Bonuses.filter(x => x.type === "EnergyRegeneration").reduce((sum, curr) => sum + curr.value, 0);
            hydrationRegenPerHour += pmcProfile.Bonuses.filter(x => x.type === "HydrationRegeneration").reduce((sum, curr) => sum + curr.value, 0);
            hpRegenPerHour += pmcProfile.Bonuses.filter(x => x.type === "HealthRegeneration").reduce((sum, curr) => sum + curr.value, 0);

            if (pmcProfile.Health.Energy.Current !== pmcProfile.Health.Energy.Maximum)
            {
                // Set new value, whatever is smallest
                pmcProfile.Health.Energy.Current += Math.round((energyRegenPerHour * (diffSeconds / 3600)));
                if (pmcProfile.Health.Energy.Current > pmcProfile.Health.Energy.Maximum)
                {
                    pmcProfile.Health.Energy.Current = pmcProfile.Health.Energy.Maximum;
                }
            }

            if (pmcProfile.Health.Hydration.Current !== pmcProfile.Health.Hydration.Maximum)
            {
                pmcProfile.Health.Hydration.Current += Math.round((hydrationRegenPerHour * (diffSeconds / 3600)));
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
                    bodyPart.Health.Current += Math.round((hpRegenPerHour * (diffSeconds / 3600)));
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
                        // Skip effects below 1, .e.g. bleeds at -1
                        if (bodyPart.Effects[effectKey].Time < 1)
                        {
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
        for (const locationKey in this.databaseServer.getTables().locations)
        {
            // Skip ignored maps
            if (this.locationConfig.fixEmptyBotWavesSettings.ignoreMaps.includes(locationKey))
            {
                continue;
            }

            // Loop over all of the locations waves and look for waves with identical min and max slots
            const location: ILocationData = this.databaseServer.getTables().locations[locationKey];
            if (!location.base)
            {
                this.logger.warning(this.localisationService.getText("location-unable_to_fix_broken_waves_missing_base", locationKey));
                continue;
            }

            for (const wave of location.base.waves ?? [])
            {
                if ((wave.slots_max - wave.slots_min === 0))
                {
                    this.logger.debug(`Fixed ${wave.WildSpawnType} Spawn: ${locationKey} wave: ${wave.number} of type: ${wave.WildSpawnType} in zone: ${wave.SpawnPoints} with Max Slots of ${wave.slots_max}`);
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
        const lighthouse = this.databaseServer.getTables().locations["lighthouse"].base;
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
        if (currentTimeStamp > (timeStampProfileCreated + oneDaySeconds))
        {
            this.giftService.sendPraporStartingGift(pmcProfile.sessionId, 1);
        }

        // Two day post-profile creation
        if (currentTimeStamp > (timeStampProfileCreated + (oneDaySeconds * 2)))
        {
            this.giftService.sendPraporStartingGift(pmcProfile.sessionId, 2);
        }
    }

    /**
     * Find and split waves with large numbers of bots into smaller waves - BSG appears to reduce the size of these waves to one bot when they're waiting to spawn for too long
     */
    protected splitBotWavesIntoSingleWaves(): void
    {
        for (const locationKey in this.databaseServer.getTables().locations)
        {
            if (this.locationConfig.splitWaveIntoSingleSpawnsSettings.ignoreMaps.includes(locationKey))
            {
                continue;
            }

            // Iterate over all maps
            const location: ILocationData = this.databaseServer.getTables().locations[locationKey];
            for (const wave of location.base.waves)
            {
                // Wave has size that makes it candidate for splitting
                if (wave.slots_max - wave.slots_min >= this.locationConfig.splitWaveIntoSingleSpawnsSettings.waveSizeThreshold)
                {
                    // Get count of bots to be spawned in wave
                    const waveSize = wave.slots_max - wave.slots_min;
                    
                    // Update wave to spawn single bot
                    wave.slots_min = 1;
                    wave.slots_max = 2;
                    
                    // Get index of wave
                    const indexOfWaveToSplit = location.base.waves.indexOf(wave);
                    this.logger.debug(`Splitting map: ${location.base.Id} wave: ${indexOfWaveToSplit} with ${waveSize} bots`);

                    // Add new waves to fill gap from bots we removed in above wave
                    let wavesAddedCount = 0;
                    for (let index = indexOfWaveToSplit + 1; index < indexOfWaveToSplit + waveSize; index++)
                    {
                        // Clone wave ready to insert into array
                        const waveToAdd = this.jsonUtil.clone(wave);

                        // Some waves have value of 0 for some reason, preserve
                        if (waveToAdd.number !== 0)
                        {
                            // Update wave number to new location in array
                            waveToAdd.number = index;
                        }

                        // Place wave into array in just-edited postion + 1
                        location.base.waves.splice(index, 0, waveToAdd);
                        wavesAddedCount++;
                    }

                    // Update subsequent wave number property to accomodate the new waves
                    for (let index = indexOfWaveToSplit + wavesAddedCount + 1; index < location.base.waves.length; index++)
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
    protected saveActiveModsToProfile(fullProfile: IAkiProfile): void
    {
        // Add empty mod array if undefined
        if (!fullProfile.aki.mods)
        {
            fullProfile.aki.mods = [];
        }

        // Get active mods
        const activeMods = this.preAkiModLoader.getImportedModDetails();
        for (const modKey in activeMods)
        {
            const modDetails = activeMods[modKey];
            if (fullProfile.aki.mods.some(x => x.author === modDetails.author
                && x.name === modDetails.name
                && x.version === modDetails.version))
            {
                // Exists already, skip
                continue;
            }

            fullProfile.aki.mods.push({
                author: modDetails.author,
                dateAdded: Date.now(),
                name: modDetails.name,
                version: modDetails.version
            });
        }
    }

    /**
     * Check for any missing assorts inside each traders assort.json data, checking against traders qeustassort.json
     */
    protected validateQuestAssortUnlocksExist(): void
    {
        const db = this.databaseServer.getTables();
        const traders = db.traders;
        const quests = db.templates.quests;
        for (const traderId of Object.values(Traders))
        {
            const traderData = traders[traderId];
            const traderAssorts = traderData?.assort;
            if (!traderAssorts)
            {
                continue;
            }

            // Merge started/success/fail quest assorts into one dictionary
            const mergedQuestAssorts = { ...traderData.questassort["started"], ...traderData.questassort["success"], ...traderData.questassort["fail"]};

            // loop over all assorts for trader
            for (const [assortKey, questKey] of Object.entries(mergedQuestAssorts))
            {
                // Does assort key exist in trader assort file
                if (!traderAssorts.loyal_level_items[assortKey])
                {
                    // reverse lookup of enum key by value 
                    this.logger.debug(this.localisationService.getText("assort-missing_quest_assort_unlock", {traderName: Object.keys(Traders)[Object.values(Traders).indexOf(traderId)], questName: quests[questKey]?.QuestName ?? "UNKNOWN"}));
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
            const bots = this.databaseServer.getTables().bots.types;

            if (bots["bear"])
            {
                bots["bear"].firstName.push(playerName);
            }
            
            if (bots["usec"])
            {
                bots["usec"].firstName.push(playerName);
            } 
        }
    }

    /**
     * Check for a dialog with the key 'undefined', and remove it
     * @param fullProfile Profile to check for dialog in
     */
    protected checkForAndRemoveUndefinedDialogs(fullProfile: IAkiProfile): void
    {
        const undefinedDialog = fullProfile.dialogues["undefined"];
        if (undefinedDialog)
        {
            delete fullProfile.dialogues["undefined"];
        }
    }

    /**
     * Blank out the "test" mail message from prapor
     */
    protected removePraporTestMessage(): void
    {
        // Iterate over all langauges (e.g. "en", "fr")
        for (const localeKey in this.databaseServer.getTables().locales.global)
        {
            this.databaseServer.getTables().locales.global[localeKey]["61687e2c3e526901fa76baf9"] = "";
        }
    }

    /**
     * Make non-trigger-spawned raiders spawn earlier + always
     */
    protected adjustLabsRaiderSpawnRate(): void
    {
        const labsBase = this.databaseServer.getTables().locations.laboratory.base;
        const nonTriggerLabsBossSpawns = labsBase.BossLocationSpawn.filter(x => x.TriggerId === "" && x.TriggerName === "");
        if (nonTriggerLabsBossSpawns)
        {
            for (const boss of nonTriggerLabsBossSpawns)
            {
                boss.BossChance = 100;
                boss.Time /= 10;
            }
        }
    }

    protected logProfileDetails(fullProfile: IAkiProfile): void
    {
        this.logger.debug(`Profile made with: ${fullProfile.aki.version}`);
        this.logger.debug(`Server version: ${this.coreConfig.akiVersion}`);
        this.logger.debug(`Debug enabled: ${globalThis.G_DEBUG_CONFIGURATION}`);
        this.logger.debug(`Mods enabled: ${globalThis.G_MODS_ENABLED}`);
    }
}