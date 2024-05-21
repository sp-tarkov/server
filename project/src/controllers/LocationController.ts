import { inject, injectable } from "tsyringe";
import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { LocationGenerator } from "@spt/generators/LocationGenerator";
import { LootGenerator } from "@spt/generators/LootGenerator";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { ILocation } from "@spt/models/eft/common/ILocation";
import { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { ILocationsGenerateAllResponse } from "@spt/models/eft/common/ILocationsSourceDestinationBase";
import { ILooseLoot, SpawnpointTemplate } from "@spt/models/eft/common/ILooseLoot";
import { IAirdropLootResult } from "@spt/models/eft/location/IAirdropLootResult";
import { IGetLocationRequestData } from "@spt/models/eft/location/IGetLocationRequestData";
import { AirdropTypeEnum } from "@spt/models/enums/AirdropType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IAirdropConfig } from "@spt/models/spt/config/IAirdropConfig";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import { IRaidChanges } from "@spt/models/spt/location/IRaidChanges";
import { ILocations } from "@spt/models/spt/server/ILocations";
import { LootRequest } from "@spt/models/spt/services/LootRequest";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RaidTimeAdjustmentService } from "@spt/services/RaidTimeAdjustmentService";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";

@injectable()
export class LocationController
{
    protected airdropConfig: IAirdropConfig;
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("LocationGenerator") protected locationGenerator: LocationGenerator,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("RaidTimeAdjustmentService") protected raidTimeAdjustmentService: RaidTimeAdjustmentService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("LootGenerator") protected lootGenerator: LootGenerator,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("RecursiveCloner") protected cloner: ICloner,
    )
    {
        this.airdropConfig = this.configServer.getConfig(ConfigTypes.AIRDROP);
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    /*  */

    /**
     * Handle client/location/getLocalloot
     * Get a location (map) with generated loot data
     * @param sessionId Player id
     * @param request Map request to generate
     * @returns ILocationBase
     */
    public get(sessionId: string, request: IGetLocationRequestData): ILocationBase
    {
        this.logger.debug(`Generating data for: ${request.locationId}, variant: ${request.variantId}`);
        const name = request.locationId.toLowerCase().replace(" ", "");
        return this.generate(name);
    }

    /**
     * Generate a maps base location with loot
     * @param name Map name
     * @returns ILocationBase
     */
    protected generate(name: string): ILocationBase
    {
        const db = this.databaseServer.getTables();
        const location: ILocation = db.locations[name];
        const locationBaseClone: ILocationBase = this.cloner.clone(location.base);

        locationBaseClone.UnixDateTime = this.timeUtil.getTimestamp();

        // Don't generate loot for hideout
        if (name === "hideout")
        {
            return locationBaseClone;
        }

        // Check for a loot multipler adjustment in app context and apply if one is found
        let locationConfigCopy: ILocationConfig;
        const raidAdjustments = this.applicationContext
            .getLatestValue(ContextVariableType.RAID_ADJUSTMENTS)
            ?.getValue<IRaidChanges>();
        if (raidAdjustments)
        {
            locationConfigCopy = this.cloner.clone(this.locationConfig); // Clone values so they can be used to reset originals later
            this.raidTimeAdjustmentService.makeAdjustmentsToMap(raidAdjustments, locationBaseClone);
        }

        const staticAmmoDist = this.cloner.clone(location.staticAmmo);

        // Create containers and add loot to them
        const staticLoot = this.locationGenerator.generateStaticContainers(locationBaseClone, staticAmmoDist);
        locationBaseClone.Loot.push(...staticLoot);

        // Add dynamic loot to output loot
        const dynamicLootDistClone: ILooseLoot = this.cloner.clone(location.looseLoot);
        const dynamicSpawnPoints: SpawnpointTemplate[] = this.locationGenerator.generateDynamicLoot(
            dynamicLootDistClone,
            staticAmmoDist,
            name,
        );
        for (const spawnPoint of dynamicSpawnPoints)
        {
            locationBaseClone.Loot.push(spawnPoint);
        }

        // Done generating, log results
        this.logger.success(
            this.localisationService.getText("location-dynamic_items_spawned_success", dynamicSpawnPoints.length),
        );
        this.logger.success(this.localisationService.getText("location-generated_success", name));

        // Reset loot multipliers back to original values
        if (raidAdjustments)
        {
            this.logger.debug("Resetting loot multipliers back to their original values");
            this.locationConfig.staticLootMultiplier = locationConfigCopy.staticLootMultiplier;
            this.locationConfig.looseLootMultiplier = locationConfigCopy.looseLootMultiplier;

            this.applicationContext.clearValues(ContextVariableType.RAID_ADJUSTMENTS);
        }

        return locationBaseClone;
    }

    /**
     * Handle client/locations
     * Get all maps base location properties without loot data
     * @param sessionId Players Id
     * @returns ILocationsGenerateAllResponse
     */
    public generateAll(sessionId: string): ILocationsGenerateAllResponse
    {
        const locationsFromDb = this.databaseServer.getTables().locations;
        const locations: ILocations = {};
        for (const mapName in locationsFromDb)
        {
            const mapBase = locationsFromDb[mapName]?.base;
            if (!mapBase)
            {
                this.logger.debug(`Map: ${mapName} has no base json file, skipping generation`);
                continue;
            }

            // Clear out loot array
            mapBase.Loot = [];
            // Add map base data to dictionary
            locations[mapBase._Id] = mapBase;
        }

        return { locations: locations, paths: locationsFromDb.base.paths };
    }

    /**
     * Handle client/location/getAirdropLoot
     * Get loot for an airdrop container
     * Generates it randomly based on config/airdrop.json values
     * @returns Array of LootItem objects
     */
    public getAirdropLoot(): IAirdropLootResult
    {
        const airdropType = this.chooseAirdropType();

        this.logger.debug(`Chose ${airdropType} for airdrop loot`);

        const airdropConfig = this.getAirdropLootConfigByType(airdropType);

        return { dropType: airdropType, loot: this.lootGenerator.createRandomLoot(airdropConfig) };
    }

    /**
     * Randomly pick a type of airdrop loot using weighted values from config
     * @returns airdrop type value
     */
    protected chooseAirdropType(): AirdropTypeEnum
    {
        const possibleAirdropTypes = this.airdropConfig.airdropTypeWeightings;

        return this.weightedRandomHelper.getWeightedValue(possibleAirdropTypes);
    }

    /**
     * Get the configuration for a specific type of airdrop
     * @param airdropType Type of airdrop to get settings for
     * @returns LootRequest
     */
    protected getAirdropLootConfigByType(airdropType: AirdropTypeEnum): LootRequest
    {
        let lootSettingsByType = this.airdropConfig.loot[airdropType];
        if (!lootSettingsByType)
        {
            this.logger.error(
                this.localisationService.getText("location-unable_to_find_airdrop_drop_config_of_type", airdropType),
            );
            lootSettingsByType = this.airdropConfig.loot[AirdropTypeEnum.MIXED];
        }

        return {
            weaponPresetCount: lootSettingsByType.weaponPresetCount,
            armorPresetCount: lootSettingsByType.armorPresetCount,
            itemCount: lootSettingsByType.itemCount,
            weaponCrateCount: lootSettingsByType.weaponCrateCount,
            itemBlacklist: [
                ...lootSettingsByType.itemBlacklist,
                ...this.itemFilterService.getItemRewardBlacklist(),
                ...this.itemFilterService.getBossItems(),
            ],
            itemTypeWhitelist: lootSettingsByType.itemTypeWhitelist,
            itemLimits: lootSettingsByType.itemLimits,
            itemStackLimits: lootSettingsByType.itemStackLimits,
            armorLevelWhitelist: lootSettingsByType.armorLevelWhitelist,
            allowBossItems: lootSettingsByType.allowBossItems,
        };
    }
}
