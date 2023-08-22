import { inject, injectable } from "tsyringe";

import { LocationGenerator } from "../generators/LocationGenerator";
import { LootGenerator } from "../generators/LootGenerator";
import { WeightedRandomHelper } from "../helpers/WeightedRandomHelper";
import { IContainerMinMax, ILocation, IStaticContainer } from "../models/eft/common/ILocation";
import { ILocationBase } from "../models/eft/common/ILocationBase";
import {
    ILocationsGenerateAllResponse
} from "../models/eft/common/ILocationsSourceDestinationBase";
import { ILooseLoot, SpawnpointTemplate } from "../models/eft/common/ILooseLoot";
import { IAirdropLootResult } from "../models/eft/location/IAirdropLootResult";
import { AirdropTypeEnum } from "../models/enums/AirdropType";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { IAirdropConfig } from "../models/spt/config/IAirdropConfig";
import { ILocationConfig } from "../models/spt/config/ILocationConfig";
import { ILocations } from "../models/spt/server/ILocations";
import { LootRequest } from "../models/spt/services/LootRequest";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { RandomUtil } from "../utils/RandomUtil";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class LocationController
{
    protected airdropConfig: IAirdropConfig;
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("LocationGenerator") protected locationGenerator: LocationGenerator,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("LootGenerator") protected lootGenerator: LootGenerator,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.airdropConfig = this.configServer.getConfig(ConfigTypes.AIRDROP);
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    /*  */

    /**
     * Handle client/location/getLocalloot
     * Get a location (map) with generated loot data
     * @param location Map to generate loot for
     * @returns ILocationBase
     */
    public get(location: string): ILocationBase
    {
        const name = location.toLowerCase().replace(" ", "");
        return this.generate(name);
    }

    /**
     * Generate a maps base location without loot
     * @param name Map name
     * @returns ILocationBase
     */
    protected generate(name: string): ILocationBase
    {
        const location: ILocation = this.databaseServer.getTables().locations[name];
        const output: ILocationBase = this.jsonUtil.clone(location.base);

        output.UnixDateTime = this.timeUtil.getTimestamp();

        // Don't generate loot for hideout
        if (name === "hideout")
        {
            return output;
        }

        const locationName = location.base.Name;
        const db = this.databaseServer.getTables();

        // Copy loot data to local properties
        const staticWeapons = this.jsonUtil.clone(db.loot.staticContainers[locationName]?.staticWeapons);
        if (!staticWeapons)
        {
            this.logger.error(`Unable to find static weapon data for map: ${locationName}`);
        }

        const staticContainers = this.jsonUtil.clone(db.loot.staticContainers[locationName]?.staticContainers);
        if (!staticContainers)
        {
            this.logger.error(`Unable to find static container data for map: ${locationName}`);
        }

        const staticForced = this.jsonUtil.clone(db.loot.staticContainers[locationName]?.staticForced);
        if (!staticForced)
        {
            this.logger.error(`Unable to find forced static data for map: ${locationName}`);
        }

        const staticLootDist = this.jsonUtil.clone(db.loot.staticLoot);
        const staticAmmoDist = this.jsonUtil.clone(db.loot.staticAmmo);

        // Init loot array for map
        output.Loot = [];

        // Add mounted weapons to output loot
        for (const mi of staticWeapons ?? [])
        {
            output.Loot.push(mi);
        }

        // Add static loot to output + pass in forced statics as param
        let staticContainerCount = 0;
        const staticContainerGroupData: IStaticContainer  = db.locations[name].statics;
        const containerGroupLimits = this.prepareContainerGroupLimitData(staticContainerGroupData.containersGroups);
        
        for (const staticContainer of staticContainers)
        {
            if (this.locationConfig.containerRandomisationSettings.enabled
                && !this.locationConfig.containerRandomisationSettings.containerTypesToNotRandomise.includes(staticContainer.template.Items[0]._tpl))
            {
                if (staticContainer.probability >= this.randomUtil.getFloat(0,1))
                {
                    // Find matching static container group data
                    const containerGroupData = staticContainerGroupData.containers[staticContainer.template.Id];
                    if (containerGroupData?.groupId.length > 0) // Check has a group id, some are empty strings
                    {
                        // Get container group limit values and check we're not at limit
                        const containerGroup = containerGroupLimits[containerGroupData.groupId];
                        if (containerGroup.current >= containerGroup.maxContainers)
                        {
                            // At max for this container group, skip
                            this.logger.warning(`Skipped adding container ${staticContainer.template.Id} as its group: ${containerGroupData.groupId} is already maxed at ${containerGroup.maxContainers}`);
                            continue;
                        }
                        
                        // Increment counter
                        containerGroup.current ++;
                    }
                    const container = this.locationGenerator.generateContainerLoot(staticContainer, staticForced, staticLootDist, staticAmmoDist, name);
                    output.Loot.push(container.template);
                    staticContainerCount++;
                }  
            }
        }

        this.logger.success(this.localisationService.getText("location-containers_generated_success", staticContainerCount));

        // Add dyanmic loot to output loot
        const dynamicLootDist: ILooseLoot = this.jsonUtil.clone(location.looseLoot);
        const dynamicLoot: SpawnpointTemplate[] = this.locationGenerator.generateDynamicLoot(dynamicLootDist, staticAmmoDist, name);
        for (const dli of dynamicLoot)
        {
            output.Loot.push(dli);
        }

        // Done generating, log results
        this.logger.success(this.localisationService.getText("location-dynamic_items_spawned_success", dynamicLoot.length));
        this.logger.success(this.localisationService.getText("location-generated_success", name));

        return output;
    }

    /**
     * Keyed by containerGroup key
     * Iterate over all container groups for a map and choose a random count between min and max to spawn for each container grouping
     * @param containersGroups Container group values
     * @returns Same as input
     */
    protected prepareContainerGroupLimitData(containersGroups: Record<string, IContainerMinMax>): Record<string, IContainerMinMax>
    {
        const groupData = this.jsonUtil.clone(containersGroups);
        for (const groupKey in groupData)
        {
            const data = groupData[groupKey];
            data.current = 0;
            data.chosenCount = this.randomUtil.getInt(data.minContainers, data.maxContainers);
        }

        return groupData;
    }

    /**
     * Handle client/locations
     * Get all maps base location properties without loot data
     * @param sessionId Players Id
     * @returns ILocationsGenerateAllResponse
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public generateAll(sessionId: string): ILocationsGenerateAllResponse
    {
        const locationsFromDb = this.jsonUtil.clone(this.databaseServer.getTables().locations);
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

        return  {
            locations: locations,
            paths: locationsFromDb.base.paths
        };
    }

    /**
     * Handle client/location/getAirdropLoot
     * Get loot for an airdop container
     * Generates it randomly based on config/airdrop.json values
     * @returns Array of LootItem objects
     */
    public getAirdropLoot(): IAirdropLootResult
    {
        const airdropType = this.chooseAirdropType();

        this.logger.debug(`Chose ${airdropType} for airdrop loot`);

        const airdropConfig = this.getAirdropLootConfigByType(airdropType);

        return {dropType: airdropType, loot: this.lootGenerator.createRandomLoot(airdropConfig)};
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
            this.logger.error(this.localisationService.getText("location-unable_to_find_airdrop_drop_config_of_type", airdropType));
            lootSettingsByType = this.airdropConfig.loot[AirdropTypeEnum.MIXED];
        }

        return {
            presetCount: lootSettingsByType.presetCount,
            itemCount: lootSettingsByType.itemCount,
            weaponCrateCount: lootSettingsByType.weaponCrateCount,
            itemBlacklist: lootSettingsByType.itemBlacklist,
            itemTypeWhitelist: lootSettingsByType.itemTypeWhitelist,
            itemLimits: lootSettingsByType.itemLimits,
            itemStackLimits: lootSettingsByType.itemStackLimits,
            armorLevelWhitelist: lootSettingsByType.armorLevelWhitelist
        };
    }
}