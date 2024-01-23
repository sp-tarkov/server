import { inject, injectable } from "tsyringe";

import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { MinMax } from "@spt-aki/models/common/MinMax";
import { IFenceLevel } from "@spt-aki/models/eft/common/IGlobals";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Item, Repairable } from "@spt-aki/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { ITraderAssort } from "@spt-aki/models/eft/common/tables/ITrader";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Traders } from "@spt-aki/models/enums/Traders";
import { ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ItemFilterService } from "@spt-aki/services/ItemFilterService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

/**
 * Handle actions surrounding Fence
 * e.g. generating or refreshing assorts / get next refresh time
 */
@injectable()
export class FenceService
{
    /** Main assorts you see at all rep levels */
    protected fenceAssort: ITraderAssort = undefined;
    /** Assorts shown on a separate tab when you max out fence rep */
    protected fenceDiscountAssort: ITraderAssort = undefined;
    protected traderConfig: ITraderConfig;
    protected nextMiniRefreshTimestamp: number;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /**
     * Replace main fence assort with new assort
     * @param assort New assorts to replace old with
     */
    public setFenceAssort(assort: ITraderAssort): void
    {
        this.fenceAssort = assort;
    }

    /**
     * Replace high rep level fence assort with new assort
     * @param discountAssort New assorts to replace old with
     */
    public setFenceDiscountAssort(discountAssort: ITraderAssort): void
    {
        this.fenceDiscountAssort = discountAssort;
    }

    /**
     * Get assorts player can purchase
     * Adjust prices based on fence level of player
     * @param pmcProfile Player profile
     * @returns ITraderAssort
     */
    public getFenceAssorts(pmcProfile: IPmcData): ITraderAssort
    {
        if (this.traderConfig.fence.regenerateAssortsOnRefresh)
        {
            this.generateFenceAssorts();
        }

        // Clone assorts so we can adjust prices before sending to client
        const assort = this.jsonUtil.clone(this.fenceAssort);
        this.adjustAssortItemPrices(
            assort,
            this.getFenceInfo(pmcProfile).PriceModifier,
            this.traderConfig.fence.presetPriceMult,
        );

        // merge normal fence assorts + discount assorts if player standing is large enough
        if (pmcProfile.TradersInfo[Traders.FENCE].standing >= 6)
        {
            const discountAssort = this.jsonUtil.clone(this.fenceDiscountAssort);
            this.adjustAssortItemPrices(
                discountAssort,
                this.traderConfig.fence.discountOptions.itemPriceMult,
                this.traderConfig.fence.discountOptions.presetPriceMult,
            );
            const mergedAssorts = this.mergeAssorts(assort, discountAssort);

            return mergedAssorts;
        }

        return assort;
    }

    /**
     * Adjust all items contained inside an assort by a multiplier
     * @param assort (clone)Assort that contains items with prices to adjust
     * @param itemMultipler multipler to use on items
     * @param presetMultiplier preset multipler to use on presets
     */
    protected adjustAssortItemPrices(assort: ITraderAssort, itemMultipler: number, presetMultiplier: number): void
    {
        for (const item of assort.items)
        {
            // Skip sub-items when adjusting prices
            if (item.slotId !== "hideout")
            {
                continue;
            }

            this.adjustItemPriceByModifier(item, assort, itemMultipler, presetMultiplier);
        }
    }

    /**
     * Merge two trader assort files together
     * @param firstAssort assort 1#
     * @param secondAssort  assort #2
     * @returns merged assort
     */
    protected mergeAssorts(firstAssort: ITraderAssort, secondAssort: ITraderAssort): ITraderAssort
    {
        for (const itemId in secondAssort.barter_scheme)
        {
            firstAssort.barter_scheme[itemId] = secondAssort.barter_scheme[itemId];
        }

        for (const item of secondAssort.items)
        {
            firstAssort.items.push(item);
        }

        for (const itemId in secondAssort.loyal_level_items)
        {
            firstAssort.loyal_level_items[itemId] = secondAssort.loyal_level_items[itemId];
        }

        return firstAssort;
    }

    /**
     * Adjust assorts price by a modifier
     * @param item assort item details
     * @param assort assort to be modified
     * @param modifier value to multiply item price by
     * @param presetModifier value to multiply preset price by
     */
    protected adjustItemPriceByModifier(
        item: Item,
        assort: ITraderAssort,
        modifier: number,
        presetModifier: number,
    ): void
    {
        // Is preset
        if (item.upd.sptPresetId)
        {
            if (assort.barter_scheme[item._id])
            {
                assort.barter_scheme[item._id][0][0].count *= modifier + presetModifier;
            }
        }
        else if (assort.barter_scheme[item._id])
        {
            assort.barter_scheme[item._id][0][0].count *= modifier;
        }
        else
        {
            this.logger.warning(`adjustItemPriceByModifier() - no action taken for item: ${item._tpl}`);
        }
    }

    /**
     * Get fence assorts with no price adjustments based on fence rep
     * @returns ITraderAssort
     */
    public getRawFenceAssorts(): ITraderAssort
    {
        return this.mergeAssorts(this.jsonUtil.clone(this.fenceAssort), this.fenceDiscountAssort);
    }

    /**
     * Does fence need to perform a partial refresh because its passed the refresh timer defined in trader.json
     * @returns true if it needs a partial refresh
     */
    public needsPartialRefresh(): boolean
    {
        return this.timeUtil.getTimestamp() > this.nextMiniRefreshTimestamp;
    }

    /**
     * Replace a percentage of fence assorts with freshly generated items
     */
    public performPartialRefresh(): void
    {
        let itemCountToReplace = this.getCountOfItemsToReplace(this.traderConfig.fence.assortSize);
        const discountItemCountToReplace = this.getCountOfItemsToReplace(
            this.traderConfig.fence.discountOptions.assortSize,
        );

        // Iterate x times to remove items (only remove if assort has items)
        if (this.fenceAssort?.items?.length > 0)
        {
            for (let index = 0; index < itemCountToReplace; index++)
            {
                this.removeRandomItemFromAssorts(this.fenceAssort);
            }
        }

        // Iterate x times to remove items (only remove if assort has items)
        if (this.fenceDiscountAssort?.items?.length > 0)
        {
            for (let index = 0; index < discountItemCountToReplace; index++)
            {
                this.removeRandomItemFromAssorts(this.fenceDiscountAssort);
            }
        }

        itemCountToReplace = this.getCountOfItemsToGenerate(itemCountToReplace);

        const newItems = this.createFenceAssortSkeleton();
        const newDiscountItems = this.createFenceAssortSkeleton();
        this.createAssorts(itemCountToReplace, newItems, 1);
        this.createAssorts(discountItemCountToReplace, newDiscountItems, 2);

        // Add new items to fence assorts
        this.fenceAssort.items.push(...newItems.items);
        this.fenceDiscountAssort.items.push(...newDiscountItems.items);

        // Add new barter items to fence barter scheme
        for (const barterItemKey in newItems.barter_scheme)
        {
            this.fenceAssort.barter_scheme[barterItemKey] = newItems.barter_scheme[barterItemKey];
        }

        // Add loyalty items to fence assorts loyalty object
        for (const loyaltyItemKey in newItems.loyal_level_items)
        {
            this.fenceAssort.loyal_level_items[loyaltyItemKey] = newItems.loyal_level_items[loyaltyItemKey];
        }

        // Add new barter items to fence assorts discounted barter scheme
        for (const barterItemKey in newDiscountItems.barter_scheme)
        {
            this.fenceDiscountAssort.barter_scheme[barterItemKey] = newDiscountItems.barter_scheme[barterItemKey];
        }

        // Add loyalty items to fence discount assorts loyalty object
        for (const loyaltyItemKey in newDiscountItems.loyal_level_items)
        {
            this.fenceDiscountAssort.loyal_level_items[loyaltyItemKey] =
                newDiscountItems.loyal_level_items[loyaltyItemKey];
        }

        this.incrementPartialRefreshTime();
    }

    /**
     * Increment fence next refresh timestamp by current timestamp + partialRefreshTimeSeconds from config
     */
    protected incrementPartialRefreshTime(): void
    {
        this.nextMiniRefreshTimestamp = this.timeUtil.getTimestamp()
            + this.traderConfig.fence.partialRefreshTimeSeconds;
    }

    /**
     * Compare the current fence offer count to what the config wants it to be,
     * If value is lower add extra count to value to generate more items to fill gap
     * @param existingItemCountToReplace count of items to generate
     * @returns number of items to generate
     */
    protected getCountOfItemsToGenerate(existingItemCountToReplace: number): number
    {
        const desiredTotalCount = this.traderConfig.fence.assortSize;
        const actualTotalCount = this.fenceAssort.items.reduce((count, item) =>
        {
            return item.slotId === "hideout" ? count + 1 : count;
        }, 0);

        return actualTotalCount < desiredTotalCount
            ? (desiredTotalCount - actualTotalCount) + existingItemCountToReplace
            : existingItemCountToReplace;
    }

    /**
     * Choose an item (not mod) at random and remove from assorts
     * @param assort Items to remove from
     */
    protected removeRandomItemFromAssorts(assort: ITraderAssort): void
    {
        // Only remove if assort has items
        if (!assort.items.some((x) => x.slotId === "hideout"))
        {
            this.logger.warning(
                "Unable to remove random assort from trader as they have no assorts with a slotid of `hideout`",
            );

            return;
        }

        let itemToRemove: Item;
        while (!itemToRemove || itemToRemove.slotId !== "hideout")
        {
            itemToRemove = this.randomUtil.getArrayValue(assort.items);
        }

        const indexOfItemToRemove = assort.items.findIndex((item) => item._id === itemToRemove._id);
        assort.items.splice(indexOfItemToRemove, 1);

        // Clean up any mods if item removed was a weapon
        const itemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(assort.items, itemToRemove._id);
        for (const itemToDelete of itemWithChildren)
        {
            // Delete item from assort items array
            assort.items.splice(assort.items.indexOf(itemToDelete), 1);
        }

        delete assort.barter_scheme[itemToRemove._id];
        delete assort.loyal_level_items[itemToRemove._id];
    }

    /**
     * Get an integer rounded count of items to replace based on percentrage from traderConfig value
     * @param totalItemCount total item count
     * @returns rounded int of items to replace
     */
    protected getCountOfItemsToReplace(totalItemCount: number): number
    {
        return Math.round(totalItemCount * (this.traderConfig.fence.partialRefreshChangePercent / 100));
    }

    /**
     * Get the count of items fence offers
     * @returns number
     */
    public getOfferCount(): number
    {
        if (!this.fenceAssort?.items?.length)
        {
            return 0;
        }

        return this.fenceAssort.items.length;
    }

    /**
     * Create trader assorts for fence and store in fenceService cache
     * Uses fence base cache generatedon server start as a base
     */
    public generateFenceAssorts(): void
    {
        // Reset refresh time now assorts are being generated
        this.incrementPartialRefreshTime();

        const assorts = this.createFenceAssortSkeleton();
        const discountAssorts = this.createFenceAssortSkeleton();
        // Create basic fence assort
        this.createAssorts(this.traderConfig.fence.assortSize, assorts, 1);

        // Create level 2 assorts accessible at rep level 6
        this.createAssorts(this.traderConfig.fence.discountOptions.assortSize, discountAssorts, 2);

        // store in fenceAssort class properties
        this.setFenceAssort(assorts);
        this.setFenceDiscountAssort(discountAssorts);
    }

    /**
     * Create skeleton to hold assort items
     * @returns ITraderAssort object
     */
    protected createFenceAssortSkeleton(): ITraderAssort
    {
        return {
            items: [],
            barter_scheme: {},
            loyal_level_items: {},
            nextResupply: this.getNextFenceUpdateTimestamp(),
        };
    }

    /**
     * Hydrate assorts parameter object with generated assorts
     * @param assortCount Number of assorts to generate
     * @param assorts object to add created assorts to
     */
    protected createAssorts(assortCount: number, assorts: ITraderAssort, loyaltyLevel: number): void
    {
        const baseFenceAssort = this.databaseServer.getTables().traders[Traders.FENCE].assort;
        const itemTypeCounts = this.initItemLimitCounter(this.traderConfig.fence.itemTypeLimits);
        
        this.addItemAssorts(assortCount, assorts, baseFenceAssort, itemTypeCounts, loyaltyLevel);
        
        // Add presets
        const maxPresetCount = Math.round(assortCount * (this.traderConfig.fence.maxPresetsPercent / 100));
        const randomisedPresetCount = this.randomUtil.getInt(0, maxPresetCount);
        this.addPresetsToAssort(randomisedPresetCount, assorts, baseFenceAssort, loyaltyLevel);
    }

    protected addItemAssorts(
        assortCount: number,
        assorts: ITraderAssort,
        fenceAssort: ITraderAssort,
        itemTypeCounts: Record<string, { current: number; max: number; }>,
        loyaltyLevel: number,
    ): void
    {
        const priceLimits = this.traderConfig.fence.itemCategoryRoublePriceLimit;
        const assortRootItems = fenceAssort.items.filter(x => x.parentId === "hideout" && !x.upd?.sptPresetId);
        for (let i = 0; i < assortCount; i++)
        {
            const chosenAssortRoot = this.randomUtil.getArrayValue(assortRootItems);
            if (!chosenAssortRoot)
            {
                this.logger.error(this.localisationService.getText("fence-unable_to_find_assort_by_id", chosenAssortRoot._id));

                continue;
            }
            const desiredAssortItemAndChildrenClone = this.jsonUtil.clone(this.itemHelper.findAndReturnChildrenAsItems(fenceAssort.items, chosenAssortRoot._id));

            const itemDbDetails = this.itemHelper.getItem(chosenAssortRoot._tpl)[1];
            const itemLimitCount = itemTypeCounts[itemDbDetails._parent];
            if (itemLimitCount && itemLimitCount.current > itemLimitCount.max)
            {
                // Skip adding item as assort as limit reached, decrement i counter so we still get another item
                i--;
                continue;
            }
            
            const itemIsPreset = this.presetHelper.isPreset(chosenAssortRoot._id);

            const price = fenceAssort.barter_scheme[chosenAssortRoot._id][0][0].count;
            if (price === 0 || (price === 1 && !itemIsPreset) || price === 100)
            {
                // Don't allow "special" items
                i--;
                continue;
            }
            
            if (price > priceLimits[itemDbDetails._parent])
            {
                i--;
                continue;
            }

            // Increment count as item is being added
            if (itemLimitCount)
            {
                itemLimitCount.current++;
            }

            // MUST randomise Ids as its possible to add the same base fence assort twice = duplicate IDs = dead client
            this.itemHelper.remapRootItemId(desiredAssortItemAndChildrenClone);
            this.itemHelper.replaceIDs(null, desiredAssortItemAndChildrenClone);

            const rootItemBeingAdded = desiredAssortItemAndChildrenClone[0];
            this.randomiseItemUpdProperties(itemDbDetails, rootItemBeingAdded);

            rootItemBeingAdded.upd.StackObjectsCount = this.getSingleItemStackCount(itemDbDetails);
            //rootItemBeingAdded.upd.BuyRestrictionCurrent = 0;
            //rootItemBeingAdded.upd.UnlimitedCount = false;

            // Need to add mods to armors so they dont show as red in the trade screen
            if (this.itemHelper.itemRequiresSoftInserts(rootItemBeingAdded._tpl))
            {
                this.randomiseArmorModDurability(desiredAssortItemAndChildrenClone, itemDbDetails);
            }

            assorts.items.push(...desiredAssortItemAndChildrenClone);
            assorts.barter_scheme[rootItemBeingAdded._id] = fenceAssort.barter_scheme[chosenAssortRoot._id];
            assorts.loyal_level_items[rootItemBeingAdded._id] = loyaltyLevel;
        }
    }

    /**
     * Find presets in base fence assort and add desired number to 'assorts' parameter
     * @param desiredPresetCount 
     * @param assorts 
     * @param baseFenceAssort 
     * @param loyaltyLevel Which loyalty level is required to see/buy item
     */
    protected addPresetsToAssort(desiredPresetCount: number, assorts: ITraderAssort, baseFenceAssort: ITraderAssort, loyaltyLevel: number): void
    {
        let presetsAddedCount = 0;
        if (desiredPresetCount <= 0)
        {
            return;
        }

        const presetRootItems = baseFenceAssort.items.filter(item => item.upd?.sptPresetId);
        while (presetsAddedCount < desiredPresetCount)
        {
            const randomPresetRoot = this.randomUtil.getArrayValue(presetRootItems);
            const rootItemDb = this.itemHelper.getItem(randomPresetRoot._tpl)[1];
            const presetWithChildrenClone = this.jsonUtil.clone(this.itemHelper.findAndReturnChildrenAsItems(baseFenceAssort.items, randomPresetRoot._id));

            // Need to add mods to armors so they dont show as red in the trade screen
            if (this.itemHelper.itemRequiresSoftInserts(randomPresetRoot._tpl))
            {
                this.randomiseArmorModDurability(presetWithChildrenClone, rootItemDb);
            }

            if (this.itemHelper.isOfBaseclass(rootItemDb._id, BaseClasses.WEAPON))
            {
                this.randomiseItemUpdProperties(rootItemDb, presetWithChildrenClone[0]);
            }

            this.removeRandomModsOfItem(presetWithChildrenClone);

            // MUST randomise Ids as its possible to add the same base fence assort twice = duplicate IDs = dead client
            this.itemHelper.remapRootItemId(presetWithChildrenClone);
            this.itemHelper.replaceIDs(null, presetWithChildrenClone);

            assorts.items.push(...presetWithChildrenClone);

            // Must be careful to use correct id as the item has had its IDs regenerated
            assorts.barter_scheme[presetWithChildrenClone[0]._id] = baseFenceAssort.barter_scheme[randomPresetRoot._id];
            assorts.loyal_level_items[presetWithChildrenClone[0]._id] = loyaltyLevel;

            presetsAddedCount++;
        }
    }

    /**
     * Adjust plate / soft insert durability values
     * @param armor Armor item array to add mods into
     * @param itemDbDetails Armor items db template
     */
    protected randomiseArmorModDurability(armor: Item[], itemDbDetails: ITemplateItem): void
    {
        // Armor has no mods, make no changes
        const hasMods = itemDbDetails._props.Slots.length > 0;
        if (!hasMods)
        {
            return;
        }

        // Check for and adjust soft insert durability values
        const requiredSlots = itemDbDetails._props.Slots.filter(slot => slot._required);
        const hasRequiredSlots = requiredSlots.length > 0;
        if (hasRequiredSlots)
        {
            for (const requiredSlot of requiredSlots)
            {
                const modItemDbDetails = this.itemHelper.getItem(requiredSlot._props.filters[0].Plate)[1];
                const durabilityValues = this.getRandomisedArmorDurabilityValues(
                    modItemDbDetails,
                    this.traderConfig.fence.armorMaxDurabilityPercentMinMax);
                const plateTpl = requiredSlot._props.filters[0].Plate; // `Plate` property appears to be the 'default' item for slot
                if (plateTpl === "")
                {
                    // Some bsg plate properties are empty, skip mod
                    continue;
                }

                // Find items mod to apply dura changes to
                const modItemToAdjust = armor.find(mod => mod.slotId.toLowerCase() === requiredSlot._name.toLowerCase());
                if (!modItemToAdjust.upd)
                {
                    modItemToAdjust.upd = {}
                }

                if (!modItemToAdjust.upd.Repairable)
                {
                    modItemToAdjust.upd.Repairable = {
                        Durability: modItemDbDetails._props.MaxDurability,
                        MaxDurability: modItemDbDetails._props.MaxDurability
                    };
                }
                modItemToAdjust.upd.Repairable.Durability = durabilityValues.Durability;
                modItemToAdjust.upd.Repairable.MaxDurability = durabilityValues.MaxDurability;

                // 25% chance to add shots to visor when its below max durability
                if (this.randomUtil.getChance100(25)
                    && modItemToAdjust.parentId === BaseClasses.ARMORED_EQUIPMENT && modItemToAdjust.slotId === "mod_equipment_000"
                    && modItemToAdjust.upd.Repairable.Durability < modItemDbDetails._props.MaxDurability) // Is damaged
                {
                    modItemToAdjust.upd.FaceShield = {
                        Hits: this.randomUtil.getInt(1,3)
                    }
                }
            }
        }

        // Check for and adjust plate durability values
        const plateSlots = itemDbDetails._props.Slots.filter(slot => this.itemHelper.isRemovablePlateSlot(slot._name));
        if (plateSlots.length > 0)
        {
            for (const plateSlot of plateSlots)
            {
                // Chance to not add plate
                if (!this.randomUtil.getChance100(this.traderConfig.fence.chancePlateExistsInArmorPercent))
                {
                    continue;
                }

                const plateTpl = plateSlot._props.filters[0].Plate
                if (!plateTpl)
                {
                    // Bsg data lacks a default plate, skip adding mod
                    continue;
                }
                const modItemDbDetails = this.itemHelper.getItem(plateTpl)[1];
                const durabilityValues = this.getRandomisedArmorDurabilityValues(
                    modItemDbDetails,
                    this.traderConfig.fence.armorMaxDurabilityPercentMinMax);

                // Find items mod to apply dura changes to
                const modItemToAdjust = armor.find(mod => mod.slotId.toLowerCase() === plateSlot._name.toLowerCase());
                if (!modItemToAdjust.upd)
                {
                    modItemToAdjust.upd = {}
                }

                if (!modItemToAdjust.upd.Repairable)
                {
                    modItemToAdjust.upd.Repairable = {
                        Durability: modItemDbDetails._props.MaxDurability,
                        MaxDurability: modItemDbDetails._props.MaxDurability
                    };
                }

                modItemToAdjust.upd.Repairable.Durability = durabilityValues.Durability;
                modItemToAdjust.upd.Repairable.MaxDurability = durabilityValues.MaxDurability;
            }
        }
    }

    /**
     * Get stack size of a singular item (no mods)
     * @param itemDbDetails item being added to fence
     * @returns Stack size
     */
    protected getSingleItemStackCount(itemDbDetails: ITemplateItem): number
    {
        // Check for override in config, use values if exists
        const overrideValues = this.traderConfig.fence.itemStackSizeOverrideMinMax[itemDbDetails._id];
        if (overrideValues)
        {
            return this.randomUtil.getInt(overrideValues.min, overrideValues.max);
        }

        if (this.itemHelper.isOfBaseclass(itemDbDetails._id, BaseClasses.AMMO))
        {
            // No override, use stack max size from item db
            return itemDbDetails._props.StackMaxSize === 1
                ? 1
                : this.randomUtil.getInt(itemDbDetails._props.StackMinRandom, itemDbDetails._props.StackMaxRandom);
        }

        return 1;
    }

    /**
     * Remove parts of a weapon prior to being listed on flea
     * @param itemAndMods Weapon to remove parts from
     */
    protected removeRandomModsOfItem(itemAndMods: Item[]): void
    {
        // Items to be removed from inventory
        const toDelete: string[] = [];

        // Find mods to remove from item that could've been scavenged by other players in-raid
        for (const itemMod of itemAndMods)
        {
            if (this.presetModItemWillBeRemoved(itemMod, toDelete))
            {
                // Skip if not an item
                const itemDbDetails = this.itemHelper.getItem(itemMod._tpl);
                if (!itemDbDetails[0])
                {
                    continue;
                }

                // Remove item and its sub-items to prevent orphans
                toDelete.push(...this.itemHelper.findAndReturnChildrenByItems(itemAndMods, itemMod._id));
            }
        }

        // Reverse loop and remove items
        for (let index = itemAndMods.length - 1; index >= 0; --index)
        {
            if (toDelete.includes(itemAndMods[index]._id))
            {
                itemAndMods.splice(index, 1);
            }
        }
    }

    /**
     * Roll % chance check to see if item should be removed
     * @param weaponMod Weapon mod being checked
     * @param itemsBeingDeleted Current list of items on weapon being deleted
     * @returns True if item will be removed
     */
    protected presetModItemWillBeRemoved(weaponMod: Item, itemsBeingDeleted: string[]): boolean
    {
        const slotIdsThatCanFail = this.traderConfig.fence.presetSlotsToRemoveChancePercent;
        const removalChance = slotIdsThatCanFail[weaponMod.slotId];
        if (!removalChance)
        {
            return false;
        }

        // Roll from 0 to 9999, then divide it by 100: 9999 =  99.99%
        const randomChance = this.randomUtil.getInt(0, 9999) / 100;

        return randomChance > removalChance && !itemsBeingDeleted.includes(weaponMod._id);
    }

    /**
     * Randomise items' upd properties e.g. med packs/weapons/armor
     * @param itemDetails Item being randomised
     * @param itemToAdjust Item being edited
     */
    protected randomiseItemUpdProperties(itemDetails: ITemplateItem, itemToAdjust: Item): void
    {
        if (!itemDetails._props)
        {
            this.logger.error(
                `Item ${itemDetails._name} lacks a _props field, unable to randomise item: ${itemToAdjust._id}`,
            );

            return;
        }

        // Randomise hp resource of med items
        if ("MaxHpResource" in itemDetails._props && itemDetails._props.MaxHpResource > 0)
        {
            itemToAdjust.upd.MedKit = { HpResource: this.randomUtil.getInt(1, itemDetails._props.MaxHpResource) };
        }

        // Randomise armor durability
        if (
            (itemDetails._parent === BaseClasses.ARMORED_EQUIPMENT
                || itemDetails._parent === BaseClasses.FACECOVER
                || itemDetails._parent === BaseClasses.ARMOR_PLATE
            ) && itemDetails._props.MaxDurability > 0
        )
        {
            const values = this.getRandomisedArmorDurabilityValues(itemDetails, this.traderConfig.fence.armorMaxDurabilityPercentMinMax);
            itemToAdjust.upd.Repairable = { Durability: values.Durability, MaxDurability: values.MaxDurability };

            return;
        }

        // Randomise Weapon durability
        if (this.itemHelper.isOfBaseclass(itemDetails._id, BaseClasses.WEAPON))
        {
            const presetMaxDurabilityLimits = this.traderConfig.fence.presetMaxDurabilityPercentMinMax;
            const duraMin = presetMaxDurabilityLimits.min / 100 * itemDetails._props.MaxDurability;
            const duraMax = presetMaxDurabilityLimits.max / 100 * itemDetails._props.MaxDurability;

            const maxDurability = this.randomUtil.getInt(duraMin, duraMax);
            const durability = this.randomUtil.getInt(1, maxDurability);

            itemToAdjust.upd.Repairable = { Durability: durability, MaxDurability: maxDurability };

            return;
        }

        if (this.itemHelper.isOfBaseclass(itemDetails._id, BaseClasses.REPAIR_KITS))
        {
            itemToAdjust.upd.RepairKit = { Resource: this.randomUtil.getInt(1, itemDetails._props.MaxRepairResource) };

            return;
        }

        // Mechanical key + has limited uses
        if (
            this.itemHelper.isOfBaseclass(itemDetails._id, BaseClasses.KEY_MECHANICAL)
            && itemDetails._props.MaximumNumberOfUsage > 1
        )
        {
            itemToAdjust.upd.Key = {
                NumberOfUsages: this.randomUtil.getInt(0, itemDetails._props.MaximumNumberOfUsage - 1),
            };

            return;
        }

        // Randomise items that use resources (e.g. fuel)
        if (itemDetails._props.MaxResource > 0)
        {
            const resourceMax = itemDetails._props.MaxResource;
            const resourceCurrent = this.randomUtil.getInt(1, itemDetails._props.MaxResource);

            itemToAdjust.upd.Resource = { Value: resourceMax - resourceCurrent, UnitsConsumed: resourceCurrent };
        }
    }

    /**
     * Generate a randomised current and max durabiltiy value for an armor item
     * @param itemDetails Item to create values for
     * @param maxDurabilityMinMaxPercent Max durabiltiy percent min/max values
     * @returns Durability + MaxDurability values
     */
    protected getRandomisedArmorDurabilityValues(itemDetails: ITemplateItem, maxDurabilityMinMaxPercent: MinMax): Repairable
    {
        const duraMin = maxDurabilityMinMaxPercent.min / 100 * itemDetails._props.MaxDurability;
        const duraMax = maxDurabilityMinMaxPercent.max / 100 * itemDetails._props.MaxDurability;

        const maxDurability = this.randomUtil.getInt(duraMin, duraMax);
        const durability = this.randomUtil.getInt(1, maxDurability);

        return { Durability: durability, MaxDurability: maxDurability };
    }

    /**
     * Construct item limit record to hold max and current item count
     * @param limits limits as defined in config
     * @returns record, key: item tplId, value: current/max item count allowed
     */
    protected initItemLimitCounter(limits: Record<string, number>): Record<string, { current: number; max: number; }>
    {
        const itemTypeCounts: Record<string, { current: number; max: number; }> = {};

        for (const x in limits)
        {
            itemTypeCounts[x] = { current: 0, max: limits[x] };
        }

        return itemTypeCounts;
    }

    /**
     * Get the next update timestamp for fence
     * @returns future timestamp
     */
    public getNextFenceUpdateTimestamp(): number
    {
        const time = this.timeUtil.getTimestamp();
        const updateSeconds = this.getFenceRefreshTime();
        return time + updateSeconds;
    }

    /**
     * Get fence refresh time in seconds
     * @returns Refresh time in seconds
     */
    protected getFenceRefreshTime(): number
    {
        return this.traderConfig.updateTime.find((x) => x.traderId === Traders.FENCE).seconds;
    }

    /**
     * Get fence level the passed in profile has
     * @param pmcData Player profile
     * @returns FenceLevel object
     */
    public getFenceInfo(pmcData: IPmcData): IFenceLevel
    {
        const fenceSettings = this.databaseServer.getTables().globals.config.FenceSettings;
        const pmcFenceInfo = pmcData.TradersInfo[fenceSettings.FenceId];

        if (!pmcFenceInfo)
        {
            return fenceSettings.Levels["0"];
        }

        const fenceLevels = (Object.keys(fenceSettings.Levels)).map((value) => Number.parseInt(value));
        const minLevel = Math.min(...fenceLevels);
        const maxLevel = Math.max(...fenceLevels);
        const pmcFenceLevel = Math.floor(pmcFenceInfo.standing);

        if (pmcFenceLevel < minLevel)
        {
            return fenceSettings.Levels[minLevel.toString()];
        }

        if (pmcFenceLevel > maxLevel)
        {
            return fenceSettings.Levels[maxLevel.toString()];
        }

        return fenceSettings.Levels[pmcFenceLevel.toString()];
    }

    /**
     * Remove an assort from fence by id
     * @param assortIdToRemove assort id to remove from fence assorts
     */
    public removeFenceOffer(assortIdToRemove: string): void
    {
        // Assort could have child items, remove those too
        const itemWithChildrenToRemove = this.itemHelper.findAndReturnChildrenAsItems(this.fenceAssort.items, assortIdToRemove);
        for (const itemToRemove of itemWithChildrenToRemove)
        {
            let indexToRemove = this.fenceAssort.items.findIndex(item => item._id === itemToRemove._id);

            // No offer found in main assort, check discount items
            if (indexToRemove === -1)
            {
                indexToRemove = this.fenceDiscountAssort.items.findIndex((i) => i._id === itemToRemove._id);
                this.fenceDiscountAssort.items.splice(indexToRemove, 1);

                if (indexToRemove === -1)
                {
                    this.logger.warning(`unable to remove fence assort item: ${itemToRemove._id} tpl: ${itemToRemove._tpl}`)
                }

                return;
            }

            // Remove offer from assort
            this.fenceAssort.items.splice(indexToRemove, 1);
        }
    }
}
