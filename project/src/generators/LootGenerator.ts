import { inject, injectable } from "tsyringe";

import { ItemHelper } from "../helpers/ItemHelper";
import { Preset } from "../models/eft/common/IGlobals";
import { ITemplateItem } from "../models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "../models/enums/BaseClasses";
import { LootItem } from "../models/spt/services/LootItem";
import { LootRequest } from "../models/spt/services/LootRequest";
import { ILogger } from "../models/spt/utils/ILogger";
import { DatabaseServer } from "../servers/DatabaseServer";
import { ItemFilterService } from "../services/ItemFilterService";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { RandomUtil } from "../utils/RandomUtil";

type ItemLimit = {
    current: number,
    max: number
};

@injectable()
export class LootGenerator
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService
    )
    {}

    /**
     * Generate a list of items based on configuration options parameter
     * @param options parameters to adjust how loot is generated
     * @returns An array of loot items
     */
    public createRandomLoot(options: LootRequest): LootItem[]
    {
        const result: LootItem[] = [];

        const itemTypeCounts = this.initItemLimitCounter(options.itemLimits);

        const tables = this.databaseServer.getTables();
        const itemBlacklist = this.itemFilterService.getBlacklistedItems();
        itemBlacklist.push(...options.itemBlacklist);

        // Get items from items.json that have a type of item + not in global blacklist + basetype is in whitelist
        const items = Object.entries(tables.templates.items).filter(x => !itemBlacklist.includes(x[1]._id) 
            && x[1]._type.toLowerCase() === "item" 
            && !x[1]._props.QuestItem
            && options.itemTypeWhitelist.includes(x[1]._parent));

        const randomisedItemCount = this.randomUtil.getInt(options.itemCount.min, options.itemCount.max);
        for (let index = 0; index < randomisedItemCount; index++)
        {
            if (!this.findAndAddRandomItemToLoot(items, itemTypeCounts, options, result))
            {
                index--;
            }   
        }

        const globalDefaultPresets = Object.entries(tables.globals.ItemPresets).filter(x => x[1]._encyclopedia !== undefined);
        const randomisedPresetCount = this.randomUtil.getInt(options.presetCount.min, options.presetCount.max);
        for (let index = 0; index < randomisedPresetCount; index++)
        {
            if (!this.findAndAddRandomPresetToLoot(globalDefaultPresets, itemTypeCounts, itemBlacklist, result))
            {
                index--;
            }
        }

        return result;
    }

    /**
     * Construct item limit record to hold max and current item count for each item type
     * @param limits limits as defined in config
     * @returns record, key: item tplId, value: current/max item count allowed
     */
    protected initItemLimitCounter(limits: Record<string, number>): Record<string, ItemLimit>
    {
        const itemTypeCounts: Record<string, ItemLimit> = {};
        for (const itemTypeId in limits)
        {
            itemTypeCounts[itemTypeId] = {
                current: 0,
                max: limits[itemTypeId]
            };
        }

        return itemTypeCounts;
    }

    /**
     * Find a random item in items.json and add to result array
     * @param items items to choose from
     * @param itemTypeCounts item limit counts
     * @param options item filters
     * @param result array to add found item to
     * @returns true if item was valid and added to pool
     */
    protected findAndAddRandomItemToLoot(
        items: [string, ITemplateItem][],
        itemTypeCounts: Record<string, { current: number; max: number; }>,
        options: LootRequest,
        result: LootItem[]): boolean
    {
        const randomItem = this.randomUtil.getArrayValue(items)[1];

        const itemLimitCount = itemTypeCounts[randomItem._parent];
        if (itemLimitCount && itemLimitCount.current > itemLimitCount.max)
        {
            return false;
        }

        const newLootItem: LootItem = {
            id: this.hashUtil.generate(),
            tpl: randomItem._id,
            isPreset: false,
            stackCount: 1
        };

        // Check if armor has level in allowed whitelist
        if (randomItem._parent === BaseClasses.ARMOR 
            || randomItem._parent === BaseClasses.VEST)
        {
            if (!options.armorLevelWhitelist.includes(Number(randomItem._props.armorClass)))
            {
                return false; 
            }
        }

        // Special case - handle items that need a stackcount > 1
        if (randomItem._props.StackMaxSize > 1)
        {
            newLootItem.stackCount = this.getRandomisedStackCount(randomItem, options);
        }
        
        newLootItem.tpl = randomItem._id;
        result.push(newLootItem);

        if (itemLimitCount)
        {
            // Increment item count as it's in limit array
            itemLimitCount.current++;
        }

        // Item added okay
        return true;
    }

    /**
     * Get a randomised stack count for an item between its StackMinRandom and StackMaxSize values
     * @param item item to get stack count of
     * @param options loot options
     * @returns stack count
     */
    protected getRandomisedStackCount(item: ITemplateItem, options: LootRequest): number
    {
        let min = item._props.StackMinRandom;
        let max = item._props.StackMaxSize;

        if (options.itemStackLimits[item._id])
        {
            min = options.itemStackLimits[item._id].min;
            max = options.itemStackLimits[item._id].max;
        }

        return this.randomUtil.getInt(min, max);
    }

    /**
     * Find a random item in items.json and add to result array
     * @param globalDefaultPresets presets to choose from
     * @param itemTypeCounts item limit counts
     * @param itemBlacklist items to skip
     * @param result array to add found preset to
     * @returns true if preset was valid and added to pool
     */
    protected findAndAddRandomPresetToLoot(
        globalDefaultPresets: [string, Preset][],
        itemTypeCounts: Record<string, { current: number; max: number; }>,
        itemBlacklist: string[],
        result: LootItem[]): boolean
    {
        // Choose random preset and get details from item.json using encyclopedia value (encyclopedia === tplId)
        const randomPreset = this.randomUtil.getArrayValue(globalDefaultPresets)[1];
        const itemDetails = this.databaseServer.getTables().templates.items[randomPreset._encyclopedia];

        // Skip blacklisted items
        if (itemBlacklist.includes(randomPreset._items[0]._tpl))
        {
            return false;
        }

        // Some custom mod items are lacking a parent property
        if (!itemDetails._parent)
        {
            this.logger.error(this.localisationService.getText("loot-item_missing_parentid", itemDetails._name));

            return false;
        }

        // Check picked preset hasn't exceeded spawn limit
        const itemLimitCount = itemTypeCounts[itemDetails._parent];
        if (itemLimitCount && itemLimitCount.current > itemLimitCount.max)
        {
            return false;
        }

        const newLootItem: LootItem = {
            tpl: randomPreset._items[0]._tpl,
            isPreset: true,
            stackCount: 1
        };
    
        result.push(newLootItem);

        if (itemLimitCount)
        {
            // increment item count as its in limit array
            itemLimitCount.current++;
        }
        
        // item added okay
        return true;
    }
}