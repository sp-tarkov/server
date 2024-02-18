import { inject, injectable } from "tsyringe";

import { ContainerHelper } from "@spt-aki/helpers/ContainerHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { IContainerMinMax, IStaticContainer } from "@spt-aki/models/eft/common/ILocation";
import { ILocationBase } from "@spt-aki/models/eft/common/ILocationBase";
import { ILooseLoot, Spawnpoint, SpawnpointTemplate, SpawnpointsForced } from "@spt-aki/models/eft/common/ILooseLoot";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import {
    IStaticAmmoDetails,
    IStaticContainerData,
    IStaticForcedProps,
    IStaticLootDetails,
} from "@spt-aki/models/eft/common/tables/ILootBase";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Money } from "@spt-aki/models/enums/Money";
import { ILocationConfig } from "@spt-aki/models/spt/config/ILocationConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { SeasonalEventService } from "@spt-aki/services/SeasonalEventService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { MathUtil } from "@spt-aki/utils/MathUtil";
import { ObjectId } from "@spt-aki/utils/ObjectId";
import { ProbabilityObject, ProbabilityObjectArray, RandomUtil } from "@spt-aki/utils/RandomUtil";

export interface IContainerItem
{
    items: Item[];
    width: number;
    height: number;
}

export interface IContainerGroupCount
{
    /** Containers this group has + probabilty to spawn */
    containerIdsWithProbability: Record<string, number>;
    /** How many containers the map should spawn with this group id */
    chosenCount: number;
}

@injectable()
export class LocationGenerator
{
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ObjectId") protected objectId: ObjectId,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ContainerHelper") protected containerHelper: ContainerHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    /**
     * Create an array of container objects with randomised loot
     * @param locationBase Map base to generate containers for
     * @param staticAmmoDist Static ammo distribution - database.loot.staticAmmo
     * @returns Array of container objects
     */
    public generateStaticContainers(
        locationBase: ILocationBase,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
    ): SpawnpointTemplate[]
    {
        let staticLootItemCount = 0;
        const result: SpawnpointTemplate[] = [];
        const locationId = locationBase.Id.toLowerCase();

        const db = this.databaseServer.getTables();

        const staticWeaponsOnMapClone = this.jsonUtil.clone(db.loot.staticContainers[locationBase.Name]?.staticWeapons);
        if (!staticWeaponsOnMapClone)
        {
            this.logger.error(`Unable to find static weapon data for map: ${locationBase.Name}`);
        }

        // Add mounted weapons to output loot
        result.push(...staticWeaponsOnMapClone ?? []);

        const allStaticContainersOnMapClone = this.jsonUtil.clone(
            db.loot.staticContainers[locationBase.Name]?.staticContainers,
        );
        if (!allStaticContainersOnMapClone)
        {
            this.logger.error(`Unable to find static container data for map: ${locationBase.Name}`);
        }
        const staticRandomisableContainersOnMap = this.getRandomisableContainersOnMap(allStaticContainersOnMapClone);

        // Containers that MUST be added to map (quest containers etc)
        const staticForcedOnMapClone = this.jsonUtil.clone(db.loot.staticContainers[locationBase.Name]?.staticForced);
        if (!staticForcedOnMapClone)
        {
            this.logger.error(`Unable to find forced static data for map: ${locationBase.Name}`);
        }

        // Keep track of static loot count
        let staticContainerCount = 0;

        // Find all 100% spawn containers
        const staticLootDist = db.loot.staticLoot;
        const guaranteedContainers = this.getGuaranteedContainers(allStaticContainersOnMapClone);
        staticContainerCount += guaranteedContainers.length;

        // Add loot to guaranteed containers and add to result
        for (const container of guaranteedContainers)
        {
            const containerWithLoot = this.addLootToContainer(
                container,
                staticForcedOnMapClone,
                staticLootDist,
                staticAmmoDist,
                locationId,
            );
            result.push(containerWithLoot.template);

            staticLootItemCount += containerWithLoot.template.Items.length;
        }

        this.logger.debug(`Added ${guaranteedContainers.length} guaranteed containers`);

        // Randomisation is turned off globally or just turned off for this map
        if (
            !(this.locationConfig.containerRandomisationSettings.enabled
                && this.locationConfig.containerRandomisationSettings.maps[locationId])
        )
        {
            this.logger.debug(
                `Container randomisation disabled, Adding ${staticRandomisableContainersOnMap.length} containers to ${locationBase.Name}`,
            );
            for (const container of staticRandomisableContainersOnMap)
            {
                const containerWithLoot = this.addLootToContainer(
                    container,
                    staticForcedOnMapClone,
                    staticLootDist,
                    staticAmmoDist,
                    locationId,
                );
                result.push(containerWithLoot.template);

                staticLootItemCount += containerWithLoot.template.Items.length;
            }

            this.logger.success(`A total of ${staticLootItemCount} static items spawned`);

            return result;
        }

        // Group containers by their groupId
        const staticContainerGroupData: IStaticContainer = db.locations[locationId].statics;
        if (!staticContainerGroupData)
        {
            this.logger.warning(`Map: ${locationId} lacks a statics file, skipping container generation.`);

            return result;
        }
        const mapping = this.getGroupIdToContainerMappings(staticContainerGroupData, staticRandomisableContainersOnMap);

        // For each of the container groups, choose from the pool of containers, hydrate container with loot and add to result array
        for (const groupId in mapping)
        {
            const data = mapping[groupId];

            // Count chosen was 0, skip
            if (data.chosenCount === 0)
            {
                continue;
            }

            if (Object.keys(data.containerIdsWithProbability).length === 0)
            {
                this.logger.debug(
                    `Group: ${groupId} has no containers with < 100% spawn chance to choose from, skipping`,
                );
                continue;
            }

            // EDGE CASE: These are containers without a group and have a probability < 100%
            if (groupId === "")
            {
                const containerIdsCopy = this.jsonUtil.clone(data.containerIdsWithProbability);
                // Roll each containers probability, if it passes, it gets added
                data.containerIdsWithProbability = {};
                for (const containerId in containerIdsCopy)
                {
                    if (this.randomUtil.getChance100(containerIdsCopy[containerId] * 100))
                    {
                        data.containerIdsWithProbability[containerId] = containerIdsCopy[containerId];
                    }
                }

                // Set desired count to size of array (we want all containers chosen)
                data.chosenCount = Object.keys(data.containerIdsWithProbability).length;

                // EDGE CASE: chosen container count could be 0
                if (data.chosenCount === 0)
                {
                    continue;
                }
            }

            // Pass possible containers into function to choose some
            const chosenContainerIds = this.getContainersByProbabilty(groupId, data);
            for (const chosenContainerId of chosenContainerIds)
            {
                // Look up container object from full list of containers on map
                const containerObject = staticRandomisableContainersOnMap.find((x) =>
                    x.template.Id === chosenContainerId
                );
                if (!containerObject)
                {
                    this.logger.debug(
                        `Container: ${
                            chosenContainerIds[chosenContainerId]
                        } not found in staticRandomisableContainersOnMap, this is bad`,
                    );
                    continue;
                }

                // Add loot to container and push into result object
                const containerWithLoot = this.addLootToContainer(
                    containerObject,
                    staticForcedOnMapClone,
                    staticLootDist,
                    staticAmmoDist,
                    locationId,
                );
                result.push(containerWithLoot.template);
                staticContainerCount++;

                staticLootItemCount += containerWithLoot.template.Items.length;
            }
        }

        this.logger.success(`A total of ${staticLootItemCount} static items spawned`);

        this.logger.success(
            this.localisationService.getText("location-containers_generated_success", staticContainerCount),
        );

        return result;
    }

    /**
     * Get containers with a non-100% chance to spawn OR are NOT on the container type randomistion blacklist
     * @param staticContainers
     * @returns IStaticContainerData array
     */
    protected getRandomisableContainersOnMap(staticContainers: IStaticContainerData[]): IStaticContainerData[]
    {
        return staticContainers.filter((x) =>
            x.probability !== 1 && !x.template.IsAlwaysSpawn
            && !this.locationConfig.containerRandomisationSettings.containerTypesToNotRandomise.includes(
                x.template.Items[0]._tpl,
            )
        );
    }

    /**
     * Get containers with 100% spawn rate or have a type on the randomistion ignore list
     * @param staticContainersOnMap
     * @returns IStaticContainerData array
     */
    protected getGuaranteedContainers(staticContainersOnMap: IStaticContainerData[]): IStaticContainerData[]
    {
        return staticContainersOnMap.filter((x) =>
            x.probability === 1 || x.template.IsAlwaysSpawn
            || this.locationConfig.containerRandomisationSettings.containerTypesToNotRandomise.includes(
                x.template.Items[0]._tpl,
            )
        );
    }

    /**
     * Choose a number of containers based on their probabilty value to fulfil the desired count in containerData.chosenCount
     * @param groupId Name of the group the containers are being collected for
     * @param containerData Containers and probability values for a groupId
     * @returns List of chosen container Ids
     */
    protected getContainersByProbabilty(groupId: string, containerData: IContainerGroupCount): string[]
    {
        const chosenContainerIds: string[] = [];

        const containerIds = Object.keys(containerData.containerIdsWithProbability);
        if (containerData.chosenCount > containerIds.length)
        {
            this.logger.debug(
                `Group: ${groupId} wants ${containerData.chosenCount} containers but pool only has ${containerIds.length}, add what's available`,
            );
            return containerIds;
        }

        // Create probability array with all possible container ids in this group and their relataive probability of spawning
        const containerDistribution = new ProbabilityObjectArray<string>(this.mathUtil, this.jsonUtil);
        for (const x of containerIds)
        {
            containerDistribution.push(new ProbabilityObject(x, containerData.containerIdsWithProbability[x]));
        }

        chosenContainerIds.push(...containerDistribution.draw(containerData.chosenCount));

        return chosenContainerIds;
    }

    /**
     * Get a mapping of each groupid and the containers in that group + count of containers to spawn on map
     * @param containersGroups Container group values
     * @returns dictionary keyed by groupId
     */
    protected getGroupIdToContainerMappings(
        staticContainerGroupData: IStaticContainer | Record<string, IContainerMinMax>,
        staticContainersOnMap: IStaticContainerData[],
    ): Record<string, IContainerGroupCount>
    {
        // Create dictionary of all group ids and choose a count of containers the map will spawn of that group
        const mapping: Record<string, IContainerGroupCount> = {};
        for (const groupId in staticContainerGroupData.containersGroups)
        {
            const groupData = staticContainerGroupData.containersGroups[groupId];
            if (!mapping[groupId])
            {
                mapping[groupId] = {
                    containerIdsWithProbability: {},
                    chosenCount: this.randomUtil.getInt(
                        Math.round(
                            groupData.minContainers
                                * this.locationConfig.containerRandomisationSettings.containerGroupMinSizeMultiplier,
                        ),
                        Math.round(
                            groupData.maxContainers
                                * this.locationConfig.containerRandomisationSettings.containerGroupMaxSizeMultiplier,
                        ),
                    ),
                };
            }
        }

        // Add an empty group for containers without a group id but still have a < 100% chance to spawn
        // Likely bad BSG data, will be fixed...eventually, example of the groupids: `NEED_TO_BE_FIXED1`,`NEED_TO_BE_FIXED_SE02`, `NEED_TO_BE_FIXED_NW_01`
        mapping[""] = { containerIdsWithProbability: {}, chosenCount: -1 };

        // Iterate over all containers and add to group keyed by groupId
        // Containers without a group go into a group with empty key ""
        for (const container of staticContainersOnMap)
        {
            const groupData = staticContainerGroupData.containers[container.template.Id];
            if (!groupData)
            {
                this.logger.error(`Container ${container.template.Id} not found in statics.json, this is bad`);
                continue;
            }

            if (container.probability === 1)
            {
                this.logger.debug(
                    `Container ${container.template.Id} with group ${groupData.groupId} had 100% chance to spawn was picked as random container, skipping`,
                );
                continue;
            }
            mapping[groupData.groupId].containerIdsWithProbability[container.template.Id] = container.probability;
        }

        return mapping;
    }

    /**
     * Choose loot to put into a static container based on weighting
     * Handle forced items + seasonal item removal when not in season
     * @param staticContainer The container itself we will add loot to
     * @param staticForced Loot we need to force into the container
     * @param staticLootDist staticLoot.json
     * @param staticAmmoDist staticAmmo.json
     * @param locationName Name of the map to generate static loot for
     * @returns IStaticContainerProps
     */
    protected addLootToContainer(
        staticContainer: IStaticContainerData,
        staticForced: IStaticForcedProps[],
        staticLootDist: Record<string, IStaticLootDetails>,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
        locationName: string,
    ): IStaticContainerData
    {
        const containerClone = this.jsonUtil.clone(staticContainer);
        const containerTpl = containerClone.template.Items[0]._tpl;

        // Create new unique parent id to prevent any collisions
        const parentId = this.objectId.generate();
        containerClone.template.Root = parentId;
        containerClone.template.Items[0]._id = parentId;

        const containerMap = this.getContainerMapping(containerTpl);

        // Choose count of items to add to container
        const itemCountToAdd = this.getWeightedCountOfContainerItems(containerTpl, staticLootDist, locationName);

        // Get all possible loot items for container
        const containerLootPool = this.getPossibleLootItemsForContainer(containerTpl, staticLootDist);

        // Some containers need to have items forced into it (quest keys etc)
        const tplsForced = staticForced.filter((forcedStaticProp) =>
            forcedStaticProp.containerId === containerClone.template.Id
        ).map((x) => x.itemTpl);

        // Draw random loot
        // Money spawn more than once in container
        let failedToFitCount = 0;
        const locklist = [Money.ROUBLES, Money.DOLLARS, Money.EUROS];

        // Choose items to add to container, factor in weighting + lock money down
        // Filter out items picked that're already in the above `tplsForced` array
        const chosenTpls = containerLootPool.draw(
            itemCountToAdd,
            this.locationConfig.allowDuplicateItemsInStaticContainers,
            locklist,
        ).filter((tpl) => !tplsForced.includes(tpl));

        // Add forced loot to chosen item pool
        const tplsToAddToContainer = tplsForced.concat(chosenTpls);
        for (const tplToAdd of tplsToAddToContainer)
        {
            const chosenItemWithChildren = this.createStaticLootItem(tplToAdd, staticAmmoDist, parentId);
            const items = chosenItemWithChildren.items;
            const width = chosenItemWithChildren.width;
            const height = chosenItemWithChildren.height;

            // look for open slot to put chosen item into
            const result = this.containerHelper.findSlotForItem(containerMap, width, height);
            if (!result.success)
            {
                if (failedToFitCount >= this.locationConfig.fitLootIntoContainerAttempts)
                {
                    // x attempts to fit an item, container is probably full, stop trying to add more
                    break;
                }

                // Can't fit item, skip
                failedToFitCount++;

                continue;
            }

            this.containerHelper.fillContainerMapWithItem(
                containerMap,
                result.x,
                result.y,
                width,
                height,
                result.rotation,
            );
            const rotation = result.rotation ? 1 : 0;

            items[0].slotId = "main";
            items[0].location = { x: result.x, y: result.y, r: rotation };

            // Add loot to container before returning
            for (const item of items)
            {
                containerClone.template.Items.push(item);
            }
        }

        return containerClone;
    }

    /**
     * Get a 2d grid of a containers item slots
     * @param containerTpl Tpl id of the container
     * @returns number[][]
     */
    protected getContainerMapping(containerTpl: string): number[][]
    {
        // Get template from db
        const containerTemplate = this.itemHelper.getItem(containerTpl)[1];

        // Get height/width
        const height = containerTemplate._props.Grids[0]._props.cellsV;
        const width = containerTemplate._props.Grids[0]._props.cellsH;

        // Calcualte 2d array and return
        return Array(height).fill(0).map(() => Array(width).fill(0));
    }

    /**
     * Look up a containers itemcountDistribution data and choose an item count based on the found weights
     * @param containerTypeId Container to get item count for
     * @param staticLootDist staticLoot.json
     * @param locationName Map name (to get per-map multiplier for from config)
     * @returns item count
     */
    protected getWeightedCountOfContainerItems(
        containerTypeId: string,
        staticLootDist: Record<string, IStaticLootDetails>,
        locationName: string,
    ): number
    {
        // Create probability array to calcualte the total count of lootable items inside container
        const itemCountArray = new ProbabilityObjectArray<number>(this.mathUtil, this.jsonUtil);
        const countDistribution = staticLootDist[containerTypeId]?.itemcountDistribution;
        if (!countDistribution)
        {
            this.logger.warning(
                `Unable to acquire count distrubution for container:  ${containerTypeId} on: ${locationName}. defaulting to 0`,
            );

            return 0;
        }

        for (const itemCountDistribution of countDistribution)
        {
            // Add each count of items into array
            itemCountArray.push(
                new ProbabilityObject(itemCountDistribution.count, itemCountDistribution.relativeProbability),
            );
        }

        return Math.round(this.getStaticLootMultiplerForLocation(locationName) * itemCountArray.draw()[0]);
    }

    /**
     * Get all possible loot items that can be placed into a container
     * Do not add seasonal items if found + current date is inside seasonal event
     * @param containerTypeId Contianer to get possible loot for
     * @param staticLootDist staticLoot.json
     * @returns ProbabilityObjectArray of item tpls + probabilty
     */
    protected getPossibleLootItemsForContainer(
        containerTypeId: string,
        staticLootDist: Record<string, IStaticLootDetails>,
    ): ProbabilityObjectArray<string, number>
    {
        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getInactiveSeasonalEventItems();

        const itemDistribution = new ProbabilityObjectArray<string>(this.mathUtil, this.jsonUtil);

        const itemContainerDistribution = staticLootDist[containerTypeId]?.itemDistribution;
        if (!itemContainerDistribution)
        {
            this.logger.warning(`Unable to acquire item distrubution for container:  ${containerTypeId}`);

            return itemDistribution;
        }
        for (const icd of itemContainerDistribution)
        {
            if (!seasonalEventActive && seasonalItemTplBlacklist.includes(icd.tpl))
            {
                // Skip seasonal event items if they're not enabled
                continue;
            }

            itemDistribution.push(new ProbabilityObject(icd.tpl, icd.relativeProbability));
        }

        return itemDistribution;
    }

    protected getLooseLootMultiplerForLocation(location: string): number
    {
        return this.locationConfig.looseLootMultiplier[location];
    }

    protected getStaticLootMultiplerForLocation(location: string): number
    {
        return this.locationConfig.staticLootMultiplier[location];
    }

    /**
     * Create array of loose + forced loot using probability system
     * @param dynamicLootDist
     * @param staticAmmoDist
     * @param locationName Location to generate loot for
     * @returns Array of spawn points with loot in them
     */
    public generateDynamicLoot(
        dynamicLootDist: ILooseLoot,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
        locationName: string,
    ): SpawnpointTemplate[]
    {
        const loot: SpawnpointTemplate[] = [];
        const dynamicForcedSpawnPoints: SpawnpointsForced[] = [];

        // Build the list of forced loot from both `spawnpointsForced` and any point marked `IsAlwaysSpawn`
        dynamicForcedSpawnPoints.push(...dynamicLootDist.spawnpointsForced);
        dynamicForcedSpawnPoints.push(...dynamicLootDist.spawnpoints.filter(point => point.template.IsAlwaysSpawn));

        // Add forced loot
        this.addForcedLoot(loot, dynamicForcedSpawnPoints, locationName);

        const allDynamicSpawnpoints = dynamicLootDist.spawnpoints;

        // Draw from random distribution
        const desiredSpawnpointCount = Math.round(
            this.getLooseLootMultiplerForLocation(locationName)
                * this.randomUtil.getNormallyDistributedRandomNumber(
                    dynamicLootDist.spawnpointCount.mean,
                    dynamicLootDist.spawnpointCount.std,
                ),
        );

        // Positions not in forced but have 100% chance to spawn
        const guaranteedLoosePoints: Spawnpoint[] = [];

        const blacklistedSpawnpoints = this.locationConfig.looseLootBlacklist[locationName];
        const spawnpointArray = new ProbabilityObjectArray<string, Spawnpoint>(this.mathUtil, this.jsonUtil);

        for (const spawnpoint of allDynamicSpawnpoints)
        {
            // Point is blacklsited, skip
            if (blacklistedSpawnpoints?.includes(spawnpoint.template.Id))
            {
                this.logger.debug(`Ignoring loose loot location: ${spawnpoint.template.Id}`);
                continue;
            }

            // We've handled IsAlwaysSpawn above, so skip them
            if (spawnpoint.template.IsAlwaysSpawn)
            {
                continue;
            }

            if (spawnpoint.probability === 1)
            {
                guaranteedLoosePoints.push(spawnpoint);
                continue;
            }

            spawnpointArray.push(new ProbabilityObject(spawnpoint.template.Id, spawnpoint.probability, spawnpoint));
        }

        // Select a number of spawn points to add loot to
        // Add ALL loose loot with 100% chance to pool
        let chosenSpawnpoints: Spawnpoint[] = [...guaranteedLoosePoints];

        const randomSpawnpointCount = desiredSpawnpointCount - chosenSpawnpoints.length
        // only draw random spawn points if needed
        if (randomSpawnpointCount > 0 && spawnpointArray.length > 0)
        {
            // Add randomly chosen spawn points
            for (const si of spawnpointArray.draw(randomSpawnpointCount, false))
            {
                chosenSpawnpoints.push(spawnpointArray.data(si));
            }
        }

        // Filter out duplicate locationIds
        chosenSpawnpoints = [...new Map(chosenSpawnpoints.map((x) => [x.locationId, x])).values()];

        // Do we have enough items in pool to fulfill requirement
        const tooManySpawnPointsRequested = (desiredSpawnpointCount - chosenSpawnpoints.length) > 0;
        if (tooManySpawnPointsRequested)
        {
            this.logger.debug(
                this.localisationService.getText("location-spawn_point_count_requested_vs_found", {
                    requested: desiredSpawnpointCount + guaranteedLoosePoints.length,
                    found: chosenSpawnpoints.length,
                    mapName: locationName,
                }),
            );
        }

        // Iterate over spawnpoints
        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getInactiveSeasonalEventItems();
        for (const spawnPoint of chosenSpawnpoints)
        {
            if (!spawnPoint.template)
            {
                this.logger.warning(
                    this.localisationService.getText("location-missing_dynamic_template", spawnPoint.locationId),
                );

                continue;
            }

            if (!spawnPoint.template.Items || spawnPoint.template.Items.length === 0)
            {
                this.logger.error(
                    this.localisationService.getText("location-spawnpoint_missing_items", spawnPoint.template.Id),
                );

                continue;
            }

            const itemArray = new ProbabilityObjectArray<string>(this.mathUtil, this.jsonUtil);
            for (const itemDist of spawnPoint.itemDistribution)
            {
                if (
                    !seasonalEventActive && seasonalItemTplBlacklist.includes(
                        spawnPoint.template.Items.find((x) => x._id === itemDist.composedKey.key)._tpl,
                    )
                )
                {
                    // Skip seasonal event items if they're not enabled
                    continue;
                }

                itemArray.push(new ProbabilityObject(itemDist.composedKey.key, itemDist.relativeProbability));
            }

            if (itemArray.length === 0)
            {
                this.logger.warning(`Loot pool for position: ${spawnPoint.template.Id} is empty. Skipping`);

                continue;
            }

            // Draw a random item from spawn points possible items
            const chosenComposedKey = itemArray.draw(1)[0];
            const createItemResult = this.createDynamicLootItem(chosenComposedKey, spawnPoint, staticAmmoDist);

            // Root id can change when generating a weapon
            spawnPoint.template.Root = createItemResult.items[0]._id;
            spawnPoint.template.Items = createItemResult.items;

            loot.push(spawnPoint.template);
        }

        return loot;
    }

    /**
     * Add forced spawn point loot into loot parameter array
     * @param lootLocationTemplates array to add forced loot spawn locations to
     * @param forcedSpawnPoints forced Forced loot locations that must be added
     * @param locationName Name of map currently having force loot created for
     */
    protected addForcedLoot(
        lootLocationTemplates: SpawnpointTemplate[],
        forcedSpawnPoints: SpawnpointsForced[],
        locationName: string,
    ): void
    {
        const lootToForceSingleAmountOnMap = this.locationConfig.forcedLootSingleSpawnById[locationName];
        if (lootToForceSingleAmountOnMap)
        {
            // Process loot items defined as requiring only 1 spawn position as they appear in multiple positions on the map
            for (const itemTpl of lootToForceSingleAmountOnMap)
            {
                // Get all spawn positions for item tpl in forced loot array
                const items = forcedSpawnPoints.filter((x) => x.template.Items[0]._tpl === itemTpl);
                if (!items || items.length === 0)
                {
                    this.logger.debug(
                        `Unable to adjust loot item ${itemTpl} as it does not exist inside ${locationName} forced loot.`,
                    );
                    continue;
                }

                // Create probability array of all spawn positions for this spawn id
                const spawnpointArray = new ProbabilityObjectArray<string, SpawnpointsForced>(
                    this.mathUtil,
                    this.jsonUtil,
                );
                for (const si of items)
                {
                    // use locationId as template.Id is the same across all items
                    spawnpointArray.push(new ProbabilityObject(si.locationId, si.probability, si));
                }

                // Choose 1 out of all found spawn positions for spawn id and add to loot array
                for (const spawnPointLocationId of spawnpointArray.draw(1, false))
                {
                    const itemToAdd = items.find((x) => x.locationId === spawnPointLocationId);
                    const lootItem = itemToAdd.template;
                    lootItem.Root = this.objectId.generate();
                    lootItem.Items[0]._id = lootItem.Root;
                    lootLocationTemplates.push(lootItem);
                }
            }
        }

        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getInactiveSeasonalEventItems();

        // Add remaining forced loot to array
        for (const forcedLootLocation of forcedSpawnPoints)
        {
            const firstLootItemTpl = forcedLootLocation.template.Items[0]._tpl;

            // Skip spawn positions processed already
            if (lootToForceSingleAmountOnMap?.includes(firstLootItemTpl))
            {
                continue;
            }

            // Skip adding seasonal items when seasonal event is not active
            if (!seasonalEventActive && seasonalItemTplBlacklist.includes(firstLootItemTpl))
            {
                continue;
            }

            const locationTemplateToAdd = forcedLootLocation.template;

            // Ensure root id matches the first items id
            locationTemplateToAdd.Root = this.objectId.generate();
            locationTemplateToAdd.Items[0]._id = locationTemplateToAdd.Root;

            // Push forced location into array as long as it doesnt exist already
            const existingLocation = lootLocationTemplates.find((x) => x.Id === locationTemplateToAdd.Id);
            if (!existingLocation)
            {
                lootLocationTemplates.push(locationTemplateToAdd);
            }
            else
            {
                this.logger.debug(
                    `Attempted to add a forced loot location with Id: ${locationTemplateToAdd.Id} to map ${locationName} that already has that id in use, skipping`,
                );
            }
        }
    }

    /**
     * Create array of item (with child items) and return
     * @param chosenComposedKey Key we want to look up items for
     * @param spawnPoint Dynamic spawn point item we want will be placed in
     * @param staticAmmoDist ammo distributions
     * @returns IContainerItem
     */
    protected createDynamicLootItem(
        chosenComposedKey: string,
        spawnPoint: Spawnpoint,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
    ): IContainerItem
    {
        const chosenItem = spawnPoint.template.Items.find((x) => x._id === chosenComposedKey);
        const chosenTpl = chosenItem._tpl;
        const itemTemplate = this.itemHelper.getItem(chosenTpl)[1];

        // Item array to return
        const itemWithMods: Item[] = [];

        // Money/Ammo - don't rely on items in spawnPoint.template.Items so we can randomise it ourselves
        if (this.itemHelper.isOfBaseclasses(chosenTpl, [BaseClasses.MONEY, BaseClasses.AMMO]))
        {
            const stackCount = itemTemplate._props.StackMaxSize === 1
                ? 1
                : this.randomUtil.getInt(itemTemplate._props.StackMinRandom, itemTemplate._props.StackMaxRandom);

            itemWithMods.push({
                _id: this.objectId.generate(),
                _tpl: chosenTpl,
                upd: { StackObjectsCount: stackCount },
            });
        }
        else if (this.itemHelper.isOfBaseclass(chosenTpl, BaseClasses.AMMO_BOX))
        {
            // Fill with cartridges
            const ammoBoxItem: Item[] = [{ _id: this.objectId.generate(), _tpl: chosenTpl }];
            this.itemHelper.addCartridgesToAmmoBox(ammoBoxItem, itemTemplate);
            itemWithMods.push(...ammoBoxItem);
        }
        else if (this.itemHelper.isOfBaseclass(chosenTpl, BaseClasses.MAGAZINE))
        {
            // Create array with just magazine
            const magazineItem: Item[] = [{ _id: this.objectId.generate(), _tpl: chosenTpl }];

            if (this.randomUtil.getChance100(this.locationConfig.magazineLootHasAmmoChancePercent))
            {
                // Add randomised amount of cartridges
                this.itemHelper.fillMagazineWithRandomCartridge(
                    magazineItem,
                    itemTemplate, // Magazine template
                    staticAmmoDist,
                    null,
                    this.locationConfig.minFillLooseMagazinePercent / 100,
                );
            }

            itemWithMods.push(...magazineItem);
        }
        else
        {
            // Also used by armors to get child mods
            // Get item + children and add into array we return
            const itemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(
                spawnPoint.template.Items,
                chosenItem._id,
            );

            // We need to reparent to ensure ids are unique
            this.reparentItemAndChildren(itemWithChildren);

            itemWithMods.push(...itemWithChildren);
        }

        // Get inventory size of item
        const size = this.itemHelper.getItemSize(itemWithMods, itemWithMods[0]._id);

        return { items: itemWithMods, width: size.width, height: size.height };
    }

    /**
     * Replace the _id value for base item + all children items parentid value
     * @param itemWithChildren Item with mods to update
     * @param newId new id to add on chidren of base item
     */
    protected reparentItemAndChildren(itemWithChildren: Item[], newId = this.objectId.generate()): void
    {
        // original id on base item
        const oldId = itemWithChildren[0]._id;

        // Update base item to use new id
        itemWithChildren[0]._id = newId;

        // Update all parentIds of items attached to base item to use new id
        for (const item of itemWithChildren)
        {
            if (item.parentId === oldId)
            {
                item.parentId = newId;
            }
        }
    }

    /**
     * Find an item in array by its _tpl, handle differently if chosenTpl is a weapon
     * @param items Items array to search
     * @param chosenTpl Tpl we want to get item with
     * @returns Item object
     */
    protected getItemInArray(items: Item[], chosenTpl: string): Item
    {
        if (this.itemHelper.isOfBaseclass(chosenTpl, BaseClasses.WEAPON))
        {
            return items.find((v) => v._tpl === chosenTpl && v.parentId === undefined);
        }

        return items.find((x) => x._tpl === chosenTpl);
    }

    // TODO: rewrite, BIG yikes
    protected createStaticLootItem(
        chosenTpl: string,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
        parentId: string = undefined,
    ): IContainerItem
    {
        const itemTemplate = this.itemHelper.getItem(chosenTpl)[1];
        let width = itemTemplate._props.Width;
        let height = itemTemplate._props.Height;
        let items: Item[] = [{ _id: this.objectId.generate(), _tpl: chosenTpl }];
        const rootItem = items[0];

        // Use passed in parentId as override for new item
        if (parentId)
        {
            rootItem.parentId = parentId;
        }

        if (
            this.itemHelper.isOfBaseclass(chosenTpl, BaseClasses.MONEY)
            || this.itemHelper.isOfBaseclass(chosenTpl, BaseClasses.AMMO)
        )
        {
            // Edge case - some ammos e.g. flares or M406 grenades shouldn't be stacked
            const stackCount = itemTemplate._props.StackMaxSize === 1
                ? 1
                : this.randomUtil.getInt(itemTemplate._props.StackMinRandom, itemTemplate._props.StackMaxRandom);

            rootItem.upd = { StackObjectsCount: stackCount };
        }
        // No spawn point, use default template
        else if (this.itemHelper.isOfBaseclass(chosenTpl, BaseClasses.WEAPON))
        {
            let children: Item[] = [];
            const defaultPreset = this.jsonUtil.clone(this.presetHelper.getDefaultPreset(chosenTpl));
            if (defaultPreset)
            {
                try
                {
                    children = this.itemHelper.reparentItemAndChildren(defaultPreset._items[0], defaultPreset._items);
                }
                catch (error)
                {
                    // this item already broke it once without being reproducible tpl = "5839a40f24597726f856b511"; AKS-74UB Default
                    // 5ea03f7400685063ec28bfa8 // ppsh default
                    // 5ba26383d4351e00334c93d9 //mp7_devgru
                    this.logger.warning(
                        this.localisationService.getText("location-preset_not_found", {
                            tpl: chosenTpl,
                            defaultId: defaultPreset._id,
                            defaultName: defaultPreset._name,
                            parentId: parentId,
                        }),
                    );

                    throw error;
                }
            }
            else
            {
                // RSP30 (62178be9d0050232da3485d9/624c0b3340357b5f566e8766/6217726288ed9f0845317459) doesnt have any default presets and kills this code below as it has no chidren to reparent
                this.logger.debug(`createItem() No preset found for weapon: ${chosenTpl}`);
            }

            const rootItem = items[0];
            if (!rootItem)
            {
                this.logger.error(
                    this.localisationService.getText("location-missing_root_item", {
                        tpl: chosenTpl,
                        parentId: parentId,
                    }),
                );

                throw new Error(this.localisationService.getText("location-critical_error_see_log"));
            }

            try
            {
                if (children?.length > 0)
                {
                    items = this.itemHelper.reparentItemAndChildren(rootItem, children);
                }
            }
            catch (error)
            {
                this.logger.error(
                    this.localisationService.getText("location-unable_to_reparent_item", {
                        tpl: chosenTpl,
                        parentId: parentId,
                    }),
                );

                throw error;
            }

            // Here we should use generalized BotGenerators functions e.g. fillExistingMagazines in the future since
            // it can handle revolver ammo (it's not restructured to be used here yet.)
            // General: Make a WeaponController for Ragfair preset stuff and the generating weapons and ammo stuff from
            // BotGenerator
            const magazine = items.filter((item) => item.slotId === "mod_magazine")[0];
            // some weapon presets come without magazine; only fill the mag if it exists
            if (magazine)
            {
                const magTemplate = this.itemHelper.getItem(magazine._tpl)[1];
                const weaponTemplate = this.itemHelper.getItem(chosenTpl)[1];

                // Create array with just magazine
                const magazineWithCartridges = [magazine];
                this.itemHelper.fillMagazineWithRandomCartridge(
                    magazineWithCartridges,
                    magTemplate,
                    staticAmmoDist,
                    weaponTemplate._props.ammoCaliber,
                    0.25,
                    this.itemHelper.getItem(rootItem._tpl)[1],
                );

                // Replace existing magazine with above array
                items.splice(items.indexOf(magazine), 1, ...magazineWithCartridges);
            }

            const size = this.itemHelper.getItemSize(items, rootItem._id);
            width = size.width;
            height = size.height;
        }
        // No spawnpoint to fall back on, generate manually
        else if (this.itemHelper.isOfBaseclass(chosenTpl, BaseClasses.AMMO_BOX))
        {
            this.itemHelper.addCartridgesToAmmoBox(items, itemTemplate);
        }
        else if (this.itemHelper.isOfBaseclass(chosenTpl, BaseClasses.MAGAZINE))
        {
            if (this.randomUtil.getChance100(this.locationConfig.magazineLootHasAmmoChancePercent))
            {
                // Create array with just magazine
                const magazineWithCartridges = [rootItem];
                this.itemHelper.fillMagazineWithRandomCartridge(
                    magazineWithCartridges,
                    itemTemplate,
                    staticAmmoDist,
                    null,
                    this.locationConfig.minFillStaticMagazinePercent / 100,
                );

                // Replace existing magazine with above array
                items.splice(items.indexOf(rootItem), 1, ...magazineWithCartridges);
            }
        }
        else if (this.itemHelper.armorItemCanHoldMods(chosenTpl))
        {
            const defaultPreset = this.presetHelper.getDefaultPreset(chosenTpl);
            if (defaultPreset)
            {
                const presetAndMods: Item[] = this.itemHelper.replaceIDs(defaultPreset._items);
                this.itemHelper.remapRootItemId(presetAndMods);

                // Use original items parentId otherwise item doesnt get added to container correctly
                presetAndMods[0].parentId = rootItem.parentId;
                items = presetAndMods;
            }
            else
            {
                // We make base item above, at start of function, no need to do it here
                if (itemTemplate._props.Slots?.length > 0)
                {
                    items = this.itemHelper.addChildSlotItems(
                        items,
                        itemTemplate,
                        this.locationConfig.equipmentLootSettings.modSpawnChancePercent,
                    );
                }
            }
        }

        return { items: items, width: width, height: height };
    }
}
