import { inject, injectable } from "tsyringe";

import { ContainerHelper } from "../helpers/ContainerHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { PresetHelper } from "../helpers/PresetHelper";
import { RagfairServerHelper } from "../helpers/RagfairServerHelper";
import {
    ILooseLoot, Spawnpoint, SpawnpointsForced, SpawnpointTemplate
} from "../models/eft/common/ILooseLoot";
import { Item } from "../models/eft/common/tables/IItem";
import {
    IStaticAmmoDetails, IStaticContainerProps, IStaticForcedProps, IStaticLootDetails
} from "../models/eft/common/tables/ILootBase";
import { BaseClasses } from "../models/enums/BaseClasses";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Money } from "../models/enums/Money";
import { ILocationConfig } from "../models/spt/config/ILocationConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { LocalisationService } from "../services/LocalisationService";
import { SeasonalEventService } from "../services/SeasonalEventService";
import { JsonUtil } from "../utils/JsonUtil";
import { MathUtil } from "../utils/MathUtil";
import { ObjectId } from "../utils/ObjectId";
import { ProbabilityObject, ProbabilityObjectArray, RandomUtil } from "../utils/RandomUtil";

export interface IContainerItem
{
    items: Item[]
    width: number
    height: number
}

@injectable()
export class LocationGenerator
{
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ObjectId") protected objectId: ObjectId,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ContainerHelper") protected containerHelper: ContainerHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    /**
     * Choose loot to put into a static container
     * @param containerIn 
     * @param staticForced 
     * @param staticLootDist 
     * @param staticAmmoDist 
     * @param locationName Name of the map to generate static loot for
     * @returns IStaticContainerProps
     */
    public generateContainerLoot(
        containerIn: IStaticContainerProps,
        staticForced: IStaticForcedProps[],
        staticLootDist: Record<string, IStaticLootDetails>,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
        locationName: string): IStaticContainerProps
    {
        const container = this.jsonUtil.clone(containerIn);
        const containerTypeId = container.Items[0]._tpl;
        const parentId = this.objectId.generate();
        container.Root = parentId;
        container.Items[0]._id = parentId;

        const containerTemplate = this.itemHelper.getItem(containerTypeId)[1];
        const height = containerTemplate._props.Grids[0]._props.cellsV;
        const width = containerTemplate._props.Grids[0]._props.cellsH;
        let container2D: number[][] = Array(height).fill(0).map(() => Array(width).fill(0));

        const itemCountArray = new ProbabilityObjectArray<number>(this.mathUtil);
        for (const icd of staticLootDist[containerTypeId].itemcountDistribution)
        {
            itemCountArray.push(
                new ProbabilityObject(icd.count, icd.relativeProbability)
            );
        }
        const numberItems = Math.round(this.getStaticLootMultiplerForLocation(locationName) * itemCountArray.draw()[0]);

        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getSeasonalEventItemsToBlock();
        const itemDistribution = new ProbabilityObjectArray<string>(this.mathUtil);
        for (const icd of staticLootDist[containerTypeId].itemDistribution)
        {
            if (!seasonalEventActive && seasonalItemTplBlacklist.includes(icd.tpl))
            {
                // Skip seasonal event items if they're not enabled
                continue;
            }

            itemDistribution.push(
                new ProbabilityObject(icd.tpl, icd.relativeProbability)
            );
        }

        // Get forced container loot tpls
        const tplsForced = staticForced.filter(x => x.containerId === container.Id).map(x => x.itemTpl);

        // Draw random loot
        // money spawn more than once in container
        let failedToFitCount = 0;
        const locklist = [Money.ROUBLES, Money.DOLLARS, Money.EUROS];
        const tplsDraw = itemDistribution.draw(numberItems, false, locklist);
        const tpls = tplsForced.concat(tplsDraw);
        for (const tpl of tpls)
        {
            const chosenItemWithChildren = this.createStaticLootItem(tpl, staticAmmoDist, parentId);
            const items = chosenItemWithChildren.items;
            const width = chosenItemWithChildren.width;
            const height = chosenItemWithChildren.height;

            // look for open slot to put chosen item into
            const result = this.containerHelper.findSlotForItem(container2D, width, height);
            if (!result.success)
            {
                // 2 attempts to fit an item, container is probably full, stop trying to add more
                if (failedToFitCount >= this.locationConfig.fitLootIntoContainerAttempts)
                {
                    break;
                }

                // Can't fit item, skip
                failedToFitCount++;
                continue;
                
            }

            container2D = this.containerHelper.fillContainerMapWithItem(container2D, result.x, result.y, width, height, result.rotation);
            const rot = result.rotation ? 1 : 0;

            items[0].slotId = "main";
            items[0].location = { "x": result.x, "y": result.y, "r": rot };


            for (const item of items)
            {
                container.Items.push(item);
            }
        }

        return container;
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
    public generateDynamicLoot(dynamicLootDist: ILooseLoot, staticAmmoDist: Record<string, IStaticAmmoDetails[]>, locationName: string): SpawnpointTemplate[]
    {
        const loot: SpawnpointTemplate[] = [];

        this.addForcedLoot(loot, this.jsonUtil.clone(dynamicLootDist.spawnpointsForced), locationName);

        const dynamicSpawnPoints = this.jsonUtil.clone(dynamicLootDist.spawnpoints);
        //draw from random distribution
        const numSpawnpoints = Math.round(
            this.getLooseLootMultiplerForLocation(locationName) *
            this.randomUtil.randn(
                dynamicLootDist.spawnpointCount.mean,
                dynamicLootDist.spawnpointCount.std
            )
        );

        const spawnpointArray = new ProbabilityObjectArray<string, Spawnpoint>(this.mathUtil);
        for (const si of dynamicSpawnPoints)
        {
            spawnpointArray.push(
                new ProbabilityObject(si.template.Id, si.probability, si)
            );
        }

        // Select a number of spawn points to add loot to
        let spawnPoints: Spawnpoint[] = [];
        for (const si of spawnpointArray.draw(numSpawnpoints, false))
        {
            spawnPoints.push(spawnpointArray.data(si));
        }

        // Filter out duplicate locationIds
        spawnPoints = [...new Map(spawnPoints.map(x => [x.locationId, x])).values()];
        const numberTooManyRequested = numSpawnpoints - spawnPoints.length;
        if (numberTooManyRequested > 0)
        {
            this.logger.info(this.localisationService.getText("location-spawn_point_count_requested_vs_found", {requested: numSpawnpoints, found: spawnPoints.length, mapName: locationName}));
        }

        // iterate over spawnpoints
        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getSeasonalEventItemsToBlock();
        for (const spawnPoint of spawnPoints)
        {
            const itemArray = new ProbabilityObjectArray<string>(this.mathUtil);
            for (const itemDist of spawnPoint.itemDistribution)
            {
                if (!seasonalEventActive && seasonalItemTplBlacklist.includes(spawnPoint.template.Items.find(x => x._id === itemDist.composedKey.key)._tpl))
                {
                    // Skip seasonal event items if they're not enabled
                    continue;
                }

                itemArray.push(
                    new ProbabilityObject(itemDist.composedKey.key, itemDist.relativeProbability)
                );
            }

            // Draw a random item from spawn points possible items
            const chosenComposedKey = itemArray.draw(1)[0];
            const createItemResult = this.createDynamicLootItem(chosenComposedKey, spawnPoint);

            // Root id can change when generating a weapon
            spawnPoint.template.Root = createItemResult.items[0]._id;
            spawnPoint.template.Items = createItemResult.items;

            loot.push(spawnPoint.template);
        }

        return loot;
    }

    /**
     * Add forced spawn point loot into loot parameter array
     * @param loot array to add forced loot to
     * @param forcedSpawnPoints forced loot to add
     * @param name of map currently generating forced loot for
     */
    protected addForcedLoot(loot: SpawnpointTemplate[], forcedSpawnPoints: SpawnpointsForced[], locationName: string): void
    {
        const lootToForceSingleAmountOnMap = this.locationConfig.forcedLootSingleSpawnById[locationName];
        if (lootToForceSingleAmountOnMap)
        {
            // Process loot items defined as requiring only 1 spawn position as they appear in multiple positions on the map
            for (const itemTpl of lootToForceSingleAmountOnMap)
            {
                // Get all spawn positions for item tpl in forced loot array
                const items = forcedSpawnPoints.filter(x => x.template.Items[0]._tpl === itemTpl);
                if (!items || items.length === 0)
                {
                    this.logger.debug(`Unable to adjust loot item ${itemTpl} as it does not exist inside ${locationName} forced loot.`);
                    continue;
                }

                // Create probability array of all spawn positions for this spawn id
                const spawnpointArray = new ProbabilityObjectArray<string, SpawnpointsForced>(this.mathUtil);
                for (const si of items)
                {
                    // use locationId as template.Id is the same across all items
                    spawnpointArray.push(
                        new ProbabilityObject(si.locationId, si.probability, si)
                    );
                }
        
                // Choose 1 out of all found spawn positions for spawn id and add to loot array
                for (const spawnPointLocationId of spawnpointArray.draw(1, false))
                {
                    const itemToAdd = items.find(x => x.locationId === spawnPointLocationId);
                    const lootItem = itemToAdd.template;
                    lootItem.Root = this.objectId.generate();
                    lootItem.Items[0]._id = lootItem.Root;
                    loot.push(lootItem);
                }
            }
        }

        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getSeasonalEventItemsToBlock();
        // Add remaining forced loot to array
        for (const forcedLootItem of forcedSpawnPoints)
        {
            // Skip spawn positions processed above
            if (lootToForceSingleAmountOnMap?.includes(forcedLootItem.template.Items[0]._tpl))
            {
                continue;
            }

            // Skip seasonal items when seasonal event is active
            if (!seasonalEventActive && seasonalItemTplBlacklist.includes(forcedLootItem.template.Items[0]._tpl))
            {
                continue;
            }

            const li = forcedLootItem.template;
            li.Root = this.objectId.generate();
            li.Items[0]._id = li.Root;
            loot.push(li);
        }
    }

    /**
     * Create array of item (with child items) and return
     * @param chosenComposedKey Key we want to look up items for
     * @param spawnPoint Dynamic spawn point item we want will be placed in
     * @returns IContainerItem
     */
    protected createDynamicLootItem(chosenComposedKey: string, spawnPoint: Spawnpoint): IContainerItem
    {
        const chosenItem = spawnPoint.template.Items.find(x => x._id === chosenComposedKey);
        const chosenTpl = chosenItem._tpl;

        // Item array to return
        const itemWithMods: Item[] = [];
        
        // Money/Ammo - don't rely on items in spawnPoint.template.Items so we can randomise it ourselves
        if (this.itemHelper.isOfBaseclass(chosenTpl, BaseClasses.MONEY) || this.itemHelper.isOfBaseclass(chosenTpl, BaseClasses.AMMO))
        {
            const itemTemplate = this.itemHelper.getItem(chosenTpl)[1];
            const stackCount = this.randomUtil.getInt(itemTemplate._props.StackMinRandom, itemTemplate._props.StackMaxRandom);
            itemWithMods.push(
                {
                    _id: this.objectId.generate(),
                    _tpl: chosenTpl,
                    upd: { "StackObjectsCount": stackCount }
                }
            );
        }
        else
        {
            // Get item + children and add into array we return
            const itemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(spawnPoint.template.Items, chosenItem._id);

            // We need to reparent to ensure ids are unique
            this.reparentItemAndChildren(itemWithChildren);

            itemWithMods.push(...itemWithChildren);
        }

        // Get inventory size of item
        const size = this.itemHelper.getItemSize(itemWithMods, itemWithMods[0]._id);

        return {
            items: itemWithMods,
            width: size.width,
            height: size.height
        };
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
            return items.find(v => v._tpl === chosenTpl && v.parentId === undefined);
        }

        return items.find(x => x._tpl === chosenTpl);
    }

    // TODO: rewrite, BIG yikes
    protected createStaticLootItem(tpl: string, staticAmmoDist: Record<string, IStaticAmmoDetails[]>, parentId: string = undefined): IContainerItem
    {
        const itemTemplate = this.itemHelper.getItem(tpl)[1];
        let width = itemTemplate._props.Width;
        let height = itemTemplate._props.Height;
        let items: Item[] = [
            {
                _id: this.objectId.generate(),
                _tpl: tpl
            }
        ];

        // Use passed in parentId as override for new item
        if (parentId)
        {
            items[0].parentId = parentId;
        }

        if (this.itemHelper.isOfBaseclass(tpl, BaseClasses.MONEY) || this.itemHelper.isOfBaseclass(tpl, BaseClasses.AMMO))
        {
            const stackCount = this.randomUtil.getInt(itemTemplate._props.StackMinRandom, itemTemplate._props.StackMaxRandom);
            items[0].upd = { "StackObjectsCount": stackCount };
        }
        // No spawn point, use default template
        else if (this.itemHelper.isOfBaseclass(tpl, BaseClasses.WEAPON))
        {
            let children: Item[] = [];
            const defaultPreset = this.jsonUtil.clone(this.presetHelper.getDefaultPreset(tpl));
            if (defaultPreset)
            {
                try
                {
                    children = this.ragfairServerHelper.reparentPresets(defaultPreset._items[0], defaultPreset._items);
                }
                catch (error)
                {
                    // this item already broke it once without being reproducible tpl = "5839a40f24597726f856b511"; AKS-74UB Default
                    // 5ea03f7400685063ec28bfa8 // ppsh default
                    // 5ba26383d4351e00334c93d9 //mp7_devgru
                    this.logger.warning(this.localisationService.getText("location-preset_not_found", {tpl: tpl, defaultId: defaultPreset._id, defaultName: defaultPreset._name, parentId: parentId}));

                    throw error;
                }
            }
            else
            {
                // RSP30 (62178be9d0050232da3485d9/624c0b3340357b5f566e8766) doesnt have any default presets and kills this code below as it has no chidren to reparent
                this.logger.debug(`createItem() No preset found for weapon: ${tpl}`);
            }

            const rootItem = items[0];
            if (!rootItem)
            {
                this.logger.error(this.localisationService.getText("location-missing_root_item", {tpl: tpl, parentId: parentId}));

                throw new Error(this.localisationService.getText("location-critical_error_see_log"));
            }

            try
            {
                if (children?.length > 0)
                {
                    items = this.ragfairServerHelper.reparentPresets(rootItem, children);
                }                
            }
            catch (error)
            {
                this.logger.error(this.localisationService.getText("location-unable_to_reparent_item", {tpl: tpl, parentId: parentId}));

                throw error;
            }
            

            // Here we should use generalized BotGenerators functions e.g. fillExistingMagazines in the future since
            // it can handle revolver ammo (it's not restructured to be used here yet.)
            // General: Make a WeaponController for Ragfair preset stuff and the generating weapons and ammo stuff from
            // BotGenerator
            const magazine = items.filter(x => x.slotId === "mod_magazine")[0];
            // some weapon presets come without magazine; only fill the mag if it exists
            if (magazine)
            {
                const magTemplate = this.itemHelper.getItem(magazine._tpl)[1];
                const weaponTemplate = this.itemHelper.getItem(tpl)[1];

                // Edge case for the Klin pp-9, it has a typo in its ammo caliber
                const ammoCaliber = (weaponTemplate._props.ammoCaliber === "Caliber9x18PMM")
                    ? "Caliber9x18PM"
                    : weaponTemplate._props.ammoCaliber;

                // Create array with just magazine
                const magazineWithCartridges = [magazine];
                this.itemHelper.fillMagazineWithRandomCartridge(magazineWithCartridges, magTemplate, staticAmmoDist, ammoCaliber);

                // Replace existing magazine with above array
                items.splice(items.indexOf(magazine), 1, ...magazineWithCartridges);
            }

            const size = this.itemHelper.getItemSize(items, rootItem._id);
            width = size.width;
            height = size.height;
        }
        // No spawnpoint to fall back on, generate manually
        else if (this.itemHelper.isOfBaseclass(tpl, BaseClasses.AMMO_BOX))
        {
            this.itemHelper.addCartridgesToAmmoBox(items, itemTemplate);
        }
        else if (this.itemHelper.isOfBaseclass(tpl, BaseClasses.MAGAZINE))
        {
            // Create array with just magazine
            const magazineWithCartridges = [items[0]];
            this.itemHelper.fillMagazineWithRandomCartridge(magazineWithCartridges, itemTemplate, staticAmmoDist);

            // Replace existing magazine with above array
            items.splice(items.indexOf(items[0]), 1, ...magazineWithCartridges);
        }

        return {
            items: items,
            width: width,
            height: height
        };
    }
}