import { PmcWaveGenerator } from "@spt/generators/PmcWaveGenerator";
import { ILocation } from "@spt/models/eft/common/ILocation";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ELocationName } from "@spt/models/enums/ELocationName";
import { HideoutAreas } from "@spt/models/enums/HideoutAreas";
import { Traders } from "@spt/models/enums/Traders";
import { Weapons } from "@spt/models/enums/Weapons";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { IHideoutConfig } from "@spt/models/spt/config/IHideoutConfig";
import { IItemConfig } from "@spt/models/spt/config/IItemConfig";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import { ILootConfig } from "@spt/models/spt/config/ILootConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { CustomLocationWaveService } from "@spt/services/CustomLocationWaveService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemBaseClassService } from "@spt/services/ItemBaseClassService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { OpenZoneService } from "@spt/services/OpenZoneService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { HashUtil } from "@spt/utils/HashUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class PostDbLoadService {
    protected coreConfig: ICoreConfig;

    protected locationConfig: ILocationConfig;
    protected ragfairConfig: IRagfairConfig;
    protected hideoutConfig: IHideoutConfig;
    protected pmcConfig: IPmcConfig;
    protected lootConfig: ILootConfig;
    protected botConfig: IBotConfig;
    protected itemConfig: IItemConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("CustomLocationWaveService") protected customLocationWaveService: CustomLocationWaveService,
        @inject("OpenZoneService") protected openZoneService: OpenZoneService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ItemBaseClassService") protected itemBaseClassService: ItemBaseClassService,
        @inject("PmcWaveGenerator") protected pmcWaveGenerator: PmcWaveGenerator,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
        this.lootConfig = this.configServer.getConfig(ConfigTypes.LOOT);
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.itemConfig = this.configServer.getConfig(ConfigTypes.ITEM);
    }

    public performPostDbLoadActions(): void {
        // Regenerate base cache now mods are loaded and game is starting
        // Mods that add items and use the baseClass service generate the cache including their items, the next mod that
        // add items gets left out,causing warnings
        this.itemBaseClassService.hydrateItemBaseClassCache();

        // Validate that only mongoIds exist in items, quests, and traders
        // Kill the startup if not.
        // TODO: We can probably remove this in a couple versions
        this.databaseService.validateDatabase();
        if (!this.databaseService.isDatabaseValid()) {
            throw new Error("Server start failure");
        }

        this.addCustomLooseLootPositions();

        this.adjustMinReserveRaiderSpawnChance();

        if (this.coreConfig.fixes.fixShotgunDispersion) {
            this.fixShotgunDispersions();
        }

        if (this.locationConfig.addOpenZonesToAllMaps) {
            this.openZoneService.applyZoneChangesToAllMaps();
        }

        if (this.pmcConfig.removeExistingPmcWaves) {
            this.removeExistingPmcWaves();
        }

        if (this.locationConfig.addCustomBotWavesToMaps) {
            this.customLocationWaveService.applyWaveChangesToAllMaps();
        }

        if (this.locationConfig.enableBotTypeLimits) {
            this.adjustMapBotLimits();
        }

        this.adjustLooseLootSpawnProbabilities();

        this.adjustLocationBotValues();

        this.addChristmasTreeAreaIfMissing();

        if (this.locationConfig.rogueLighthouseSpawnTimeSettings.enabled) {
            this.fixRoguesSpawningInstantlyOnLighthouse();
        }

        if (this.locationConfig.splitWaveIntoSingleSpawnsSettings.enabled) {
            this.splitBotWavesIntoSingleWaves();
        }

        this.adjustLabsRaiderSpawnRate();

        this.adjustHideoutCraftTimes(this.hideoutConfig.overrideCraftTimeSeconds);
        this.adjustHideoutBuildTimes(this.hideoutConfig.overrideBuildTimeSeconds);

        this.unlockHideoutLootCrateCrafts();

        this.cloneExistingCraftsAndAddNew();

        this.removeNewBeginningRequirementFromPrestige();

        this.removePraporTestMessage();

        this.validateQuestAssortUnlocksExist();

        if (this.seasonalEventService.isAutomaticEventDetectionEnabled()) {
            this.seasonalEventService.enableSeasonalEvents();
        }

        // Flea bsg blacklist is off
        if (!this.ragfairConfig.dynamic.blacklist.enableBsgList) {
            this.setAllDbItemsAsSellableOnFlea();
        }

        this.addMissingTraderBuyRestrictionMaxValue();

        this.applyFleaPriceOverrides();

        this.addCustomItemPresetsToGlobals();
    }

    protected removeExistingPmcWaves() {
        const locations: ILocation[] = Object.values(this.databaseService.getLocations());

        for (const location of locations) {
            if (!location || !location?.base?.BossLocationSpawn) {
                continue;
            }

            location.base.BossLocationSpawn = location.base.BossLocationSpawn.filter(
                (x) => !["pmcUSEC", "pmcBEAR"].includes(x.BossName),
            );
        }
    }

    protected removeNewBeginningRequirementFromPrestige() {
        const newBeginningQuestIds = ["6761f28a022f60bb320f3e95", "6761ff17cdc36bd66102e9d0"];
        const prestigeDb = this.databaseService.getTemplates().prestige;
        for (const prestige of prestigeDb.elements) {
            prestige.conditions = prestige.conditions.filter(
                (condition) => !newBeginningQuestIds.includes(condition.target as string),
            );
        }
    }

    protected unlockHideoutLootCrateCrafts() {
        const hideoutLootBoxCraftIds = [
            "66582be04de4820934746cea",
            "6745925da9c9adf0450d5bca",
            "67449c79268737ef6908d636",
        ];

        for (const craftId of hideoutLootBoxCraftIds) {
            const recipe = this.databaseService.getHideout().production.recipes.find((craft) => craft._id === craftId);
            if (recipe) {
                recipe.locked = false;
            }
        }
    }

    protected cloneExistingCraftsAndAddNew() {
        const hideoutCraftDb = this.databaseService.getHideout().production;
        const craftsToAdd = this.hideoutConfig.hideoutCraftsToAdd;
        for (const craftToAdd of craftsToAdd) {
            const clonedCraft = this.cloner.clone(
                hideoutCraftDb.recipes.find((x) => x._id === craftToAdd.craftIdToCopy),
            );
            if (!clonedCraft) {
                this.logger.warning(`Unable to find hideout craft: ${craftToAdd.craftIdToCopy}, skipping`);
                continue;
            }

            clonedCraft._id = craftToAdd.newId;
            clonedCraft.requirements = craftToAdd.requirements;
            clonedCraft.endProduct = craftToAdd.craftOutputTpl;

            hideoutCraftDb.recipes.push(clonedCraft);
        }
    }

    protected adjustMinReserveRaiderSpawnChance(): void {
        // Get reserve base.json
        const reserveBase = this.databaseService.getLocation(ELocationName.RESERVE).base;

        // Raiders are bosses, get only those from boss spawn array
        for (const raiderSpawn of reserveBase.BossLocationSpawn.filter((boss) => boss.BossName === "pmcBot")) {
            const isTriggered = raiderSpawn.TriggerId.length > 0; // Empty string if not triggered
            const newSpawnChance = isTriggered
                ? this.locationConfig.reserveRaiderSpawnChanceOverrides.triggered
                : this.locationConfig.reserveRaiderSpawnChanceOverrides.nonTriggered;

            if (newSpawnChance === -1) {
                continue;
            }

            if (raiderSpawn.BossChance < newSpawnChance) {
                // Desired chance is bigger than existing, override it
                raiderSpawn.BossChance = newSpawnChance;
            }
        }
    }

    protected addCustomLooseLootPositions(): void {
        const looseLootPositionsToAdd = this.lootConfig.looseLoot;
        for (const [mapId, positionsToAdd] of Object.entries(looseLootPositionsToAdd)) {
            if (!mapId) {
                this.logger.warning(
                    this.localisationService.getText("location-unable_to_add_custom_loot_position", mapId),
                );

                continue;
            }

            const mapLooseLoot = this.databaseService.getLocation(mapId).looseLoot;
            if (!mapLooseLoot) {
                this.logger.warning(this.localisationService.getText("location-map_has_no_loose_loot_data", mapId));

                continue;
            }

            for (const positionToAdd of positionsToAdd) {
                // Exists already, add new items to existing positions pool
                const existingLootPosition = mapLooseLoot.spawnpoints.find(
                    (x) => x.template.Id === positionToAdd.template.Id,
                );

                if (existingLootPosition) {
                    existingLootPosition.template.Items.push(...positionToAdd.template.Items);
                    existingLootPosition.itemDistribution.push(...positionToAdd.itemDistribution);

                    continue;
                }

                // New position, add entire object
                mapLooseLoot.spawnpoints.push(positionToAdd);
            }
        }
    }

    /**
     * BSG have two values for shotgun dispersion, we make sure both have the same value
     */
    protected fixShotgunDispersions(): void {
        const itemDb = this.databaseService.getItems();

        const shotguns = [Weapons.SHOTGUN_12G_SAIGA_12K, Weapons.SHOTGUN_20G_TOZ_106, Weapons.SHOTGUN_12G_M870];
        for (const shotgunId of shotguns) {
            if (itemDb[shotgunId]._props.ShotgunDispersion) {
                itemDb[shotgunId]._props.shotgunDispersion = itemDb[shotgunId]._props.ShotgunDispersion;
            }
        }
    }

    /** Apply custom limits on bot types as defined in configs/location.json/botTypeLimits */
    protected adjustMapBotLimits(): void {
        const mapsDb = this.databaseService.getLocations();
        if (!this.locationConfig.botTypeLimits) {
            return;
        }

        for (const mapId in this.locationConfig.botTypeLimits) {
            const map: ILocation = mapsDb[mapId];
            if (!map) {
                this.logger.warning(
                    this.localisationService.getText("bot-unable_to_edit_limits_of_unknown_map", mapId),
                );

                continue;
            }

            for (const botToLimit of this.locationConfig.botTypeLimits[mapId]) {
                const index = map.base.MinMaxBots.findIndex((x) => x.WildSpawnType === botToLimit.type);
                if (index !== -1) {
                    // Existing bot type found in MinMaxBots array, edit
                    const limitObjectToUpdate = map.base.MinMaxBots[index];
                    limitObjectToUpdate.min = botToLimit.min;
                    limitObjectToUpdate.max = botToLimit.max;
                } else {
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

    protected adjustLooseLootSpawnProbabilities(): void {
        if (!this.lootConfig.looseLootSpawnPointAdjustments) {
            return;
        }

        for (const [mapId, mapAdjustments] of Object.entries(this.lootConfig.looseLootSpawnPointAdjustments)) {
            const mapLooseLootData = this.databaseService.getLocation(mapId).looseLoot;
            if (!mapLooseLootData) {
                this.logger.warning(this.localisationService.getText("location-map_has_no_loose_loot_data", mapId));

                continue;
            }

            for (const [lootKey, newChanceValue] of Object.entries(mapAdjustments)) {
                const lootPostionToAdjust = mapLooseLootData.spawnpoints.find(
                    (spawnPoint) => spawnPoint.template.Id === lootKey,
                );
                if (!lootPostionToAdjust) {
                    this.logger.warning(
                        this.localisationService.getText("location-unable_to_adjust_loot_position_on_map", {
                            lootKey: lootKey,
                            mapId: mapId,
                        }),
                    );

                    continue;
                }

                lootPostionToAdjust.probability = newChanceValue;
            }
        }
    }

    protected adjustLocationBotValues(): void {
        const mapsDb = this.databaseService.getLocations();

        for (const locationKey in this.botConfig.maxBotCap) {
            const map: ILocation = mapsDb[locationKey];
            if (!map) {
                continue;
            }

            map.base.BotMaxPvE = this.botConfig.maxBotCap[locationKey];
            map.base.BotMax = this.botConfig.maxBotCap[locationKey];

            // make values no larger than 30 secs
            map.base.BotStart = Math.min(map.base.BotStart, 30);
        }
    }

    protected addChristmasTreeAreaIfMissing() {
        const areas = this.databaseService.getHideout().areas;
        const treeArea = areas.find((area) => area.type === HideoutAreas.CHRISTMAS_TREE);
        if (!treeArea) {
            areas.push({
                _id: "5df8a81f8f77747fcf5f5702",
                type: HideoutAreas.CHRISTMAS_TREE,
                enabled: true,
                needsFuel: true,
                takeFromSlotLocked: false,
                craftGivesExp: true,
                displayLevel: true,
                requirements: [],
                stages: {
                    0: {
                        requirements: [],
                        bonuses: [],
                        slots: 0,
                        constructionTime: 0.0,
                        description: "",
                        container: "",
                        autoUpgrade: false,
                        displayInterface: true,
                        improvements: [],
                    },
                    1: {
                        requirements: [
                            {
                                areaType: 4,
                                requiredLevel: 1,
                                type: "Area",
                            },
                            {
                                templateId: "5449016a4bdc2d6f028b456f",
                                count: 10000,
                                isFunctional: false,
                                isEncoded: false,
                                type: "Item",
                            },
                            {
                                templateId: "5df8a77486f77412672a1e3f",
                                count: 1,
                                isFunctional: false,
                                isEncoded: false,
                                type: "Item",
                            },
                            {
                                templateId: "5df8a72c86f77412640e2e83",
                                count: 1,
                                isFunctional: false,
                                isEncoded: false,
                                type: "Item",
                            },
                            {
                                templateId: "5df8a6a186f77412640e2e80",
                                count: 1,
                                isFunctional: false,
                                isEncoded: false,
                                type: "Item",
                            },
                        ],
                        bonuses: [],
                        slots: 0,
                        constructionTime: 0.0,
                        description: "",
                        container: "",
                        autoUpgrade: false,
                        displayInterface: true,
                        improvements: [],
                    },
                },
                enableAreaRequirements: false,
                parentArea: undefined,
            });
        }
    }

    /**
     * Make Rogues spawn later to allow for scavs to spawn first instead of rogues filling up all spawn positions
     */
    protected fixRoguesSpawningInstantlyOnLighthouse(): void {
        const rogueSpawnDelaySeconds = this.locationConfig.rogueLighthouseSpawnTimeSettings.waitTimeSeconds;
        const lighthouse = this.databaseService.getLocations().lighthouse?.base;
        if (!lighthouse) {
            return;
        }

        // Find Rogues that spawn instantly
        const instantRogueBossSpawns = lighthouse.BossLocationSpawn.filter(
            (spawn) => spawn.BossName === "exUsec" && spawn.Time === -1,
        );
        for (const wave of instantRogueBossSpawns) {
            wave.Time = rogueSpawnDelaySeconds;
        }
    }

    /**
     * Find and split waves with large numbers of bots into smaller waves - BSG appears to reduce the size of these
     * waves to one bot when they're waiting to spawn for too long
     */
    protected splitBotWavesIntoSingleWaves(): void {
        const locations = this.databaseService.getLocations();
        for (const locationKey in locations) {
            if (this.locationConfig.splitWaveIntoSingleSpawnsSettings.ignoreMaps.includes(locationKey)) {
                continue;
            }

            // Iterate over all maps
            const location: ILocation = locations[locationKey];
            for (const wave of location.base.waves) {
                // Wave has size that makes it candidate for splitting
                if (
                    wave.slots_max - wave.slots_min >=
                    this.locationConfig.splitWaveIntoSingleSpawnsSettings.waveSizeThreshold
                ) {
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
                    for (let index = indexOfWaveToSplit + 1; index < indexOfWaveToSplit + waveSize; index++) {
                        // Clone wave ready to insert into array
                        const waveToAddClone = this.cloner.clone(wave);

                        // Some waves have value of 0 for some reason, preserve
                        if (waveToAddClone.number !== 0) {
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
                    ) {
                        // Some waves have value of 0, leave them as-is
                        if (location.base.waves[index].number !== 0) {
                            location.base.waves[index].number += wavesAddedCount;
                        }
                    }
                }
            }
        }
    }

    /**
     * Make non-trigger-spawned raiders spawn earlier + always
     */
    protected adjustLabsRaiderSpawnRate(): void {
        const labsBase = this.databaseService.getLocations().laboratory.base;

        // Find spawns with empty string for triggerId/TriggerName
        const nonTriggerLabsBossSpawns = labsBase.BossLocationSpawn.filter(
            (bossSpawn) => !bossSpawn.TriggerId && !bossSpawn.TriggerName,
        );

        for (const boss of nonTriggerLabsBossSpawns) {
            boss.BossChance = 100;
            boss.Time /= 10;
        }
    }

    protected adjustHideoutCraftTimes(overrideSeconds: number): void {
        if (overrideSeconds === -1) {
            return;
        }

        for (const craft of this.databaseService.getHideout().production.recipes) {
            // Only adjust crafts ABOVE the override
            craft.productionTime = Math.min(craft.productionTime, overrideSeconds);
        }
    }

    /**
     * Adjust all hideout craft times to be no higher than the override
     */
    protected adjustHideoutBuildTimes(overrideSeconds: number): void {
        if (overrideSeconds === -1) {
            return;
        }

        for (const area of this.databaseService.getHideout().areas) {
            for (const stage of Object.values(area.stages)) {
                // Only adjust crafts ABOVE the override
                stage.constructionTime = Math.min(stage.constructionTime, overrideSeconds);
            }
        }
    }

    /**
     * Blank out the "test" mail message from prapor
     */
    protected removePraporTestMessage(): void {
        // Iterate over all languages (e.g. "en", "fr")
        const locales = this.databaseService.getLocales();
        for (const localeKey in locales.global) {
            locales.global[localeKey]["61687e2c3e526901fa76baf9"] = "";
        }
    }

    /**
     * Check for any missing assorts inside each traders assort.json data, checking against traders questassort.json
     */
    protected validateQuestAssortUnlocksExist(): void {
        const db = this.databaseService.getTables();
        const traders = db.traders;
        const quests = db.templates.quests;
        for (const traderId of Object.values(Traders)) {
            const traderData = traders[traderId];
            const traderAssorts = traderData?.assort;
            if (!traderAssorts) {
                continue;
            }

            // Merge started/success/fail quest assorts into one dictionary
            const mergedQuestAssorts = {
                ...traderData.questassort?.started,
                ...traderData.questassort?.success,
                ...traderData.questassort?.fail,
            };

            // Loop over all assorts for trader
            for (const [assortKey, questKey] of Object.entries(mergedQuestAssorts)) {
                // Does assort key exist in trader assort file
                if (!traderAssorts.loyal_level_items[assortKey]) {
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

    protected setAllDbItemsAsSellableOnFlea(): void {
        const dbItems = Object.values(this.databaseService.getItems());
        for (const item of dbItems) {
            if (
                item._type === "Item" &&
                !item._props?.CanSellOnRagfair &&
                !this.ragfairConfig.dynamic.blacklist.custom.includes(item._id)
            ) {
                item._props.CanSellOnRagfair = true;
            }
        }
    }

    protected addMissingTraderBuyRestrictionMaxValue(): void {
        this.databaseService.getGlobals().config.TradingSettings.BuyRestrictionMaxBonus.unheard_edition = {
            multiplier:
                this.databaseService.getGlobals().config.TradingSettings.BuyRestrictionMaxBonus.edge_of_darkness
                    .multiplier,
        };
    }

    protected applyFleaPriceOverrides() {
        const fleaPrices = this.databaseService.getPrices();
        for (const [key, value] of Object.entries(this.ragfairConfig.dynamic.itemPriceOverrideRouble)) {
            fleaPrices[key] = value;
        }
    }

    protected addCustomItemPresetsToGlobals() {
        for (const presetToAdd of this.itemConfig.customItemGlobalPresets) {
            if (this.databaseService.getGlobals().ItemPresets[presetToAdd._id]) {
                this.logger.warning(
                    `Global ItemPreset with Id of: ${presetToAdd._id} already exists, unable to overwrite`,
                );
                continue;
            }
            this.databaseService.getGlobals().ItemPresets[presetToAdd._id] = presetToAdd;
        }
    }
}
