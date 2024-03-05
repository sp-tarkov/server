import { inject, injectable } from "tsyringe";

import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { MinMax } from "@spt-aki/models/common/MinMax";
import { IFenceLevel } from "@spt-aki/models/eft/common/IGlobals";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Item, Repairable } from "@spt-aki/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { IBarterScheme, ITraderAssort } from "@spt-aki/models/eft/common/tables/ITrader";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IItemDurabilityCurrentMax, ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import {
    IFenceAssortGenerationValues,
    IGenerationAssortValues,
} from "@spt-aki/models/spt/fence/IFenceAssortGenerationValues";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
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
    protected traderConfig: ITraderConfig;

    /** Time when some items in assort will be replaced  */
    protected nextPartialRefreshTimestamp: number;

    /** Main assorts you see at all rep levels */
    protected fenceAssort: ITraderAssort = undefined;

    /** Assorts shown on a separate tab when you max out fence rep */
    protected fenceDiscountAssort: ITraderAssort = undefined;

    /** Hydrated on initial assort generation as part of generateFenceAssorts() */
    protected desiredAssortCounts: IFenceAssortGenerationValues;

    /** Items that have a multi-stack */
    protected multiStackItems: Record<string, boolean> = {};

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
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
            // Using base assorts made earlier, do some alterations and store in this.fenceAssort
            this.generateFenceAssorts();
        }

        // Clone assorts so we can adjust prices before sending to client
        const assort = this.jsonUtil.clone(this.fenceAssort);
        this.adjustAssortItemPricesByConfigMultiplier(assort, 1, this.traderConfig.fence.presetPriceMult);

        // merge normal fence assorts + discount assorts if player standing is large enough
        if (pmcProfile.TradersInfo[Traders.FENCE].standing >= 6)
        {
            const discountAssort = this.jsonUtil.clone(this.fenceDiscountAssort);
            this.adjustAssortItemPricesByConfigMultiplier(
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
    protected adjustAssortItemPricesByConfigMultiplier(
        assort: ITraderAssort,
        itemMultipler: number,
        presetMultiplier: number,
    ): void
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
                assort.barter_scheme[item._id][0][0].count *= presetModifier;
            }
        }
        else if (assort.barter_scheme[item._id])
        {
            assort.barter_scheme[item._id][0][0].count *= modifier;
        }
        else
        {
            this.logger.warning(`adjustItemPriceByModifier() - no action taken for item: ${item._tpl}`);

            return;
        }
    }

    /**
     * Get fence assorts with no price adjustments based on fence rep
     * @returns ITraderAssort
     */
    public getRawFenceAssorts(): ITraderAssort
    {
        return this.mergeAssorts(this.jsonUtil.clone(this.fenceAssort), this.jsonUtil.clone(this.fenceDiscountAssort));
    }

    /**
     * Does fence need to perform a partial refresh because its passed the refresh timer defined in trader.json
     * @returns true if it needs a partial refresh
     */
    public needsPartialRefresh(): boolean
    {
        return this.timeUtil.getTimestamp() > this.nextPartialRefreshTimestamp;
    }

    /**
     * Replace a percentage of fence assorts with freshly generated items
     */
    public performPartialRefresh(): void
    {
        const itemCountToReplace = this.getCountOfItemsToReplace(this.traderConfig.fence.assortSize);
        const discountItemCountToReplace = this.getCountOfItemsToReplace(
            this.traderConfig.fence.discountOptions.assortSize,
        );

        // Simulate players buying items
        this.deleteRandomAssorts(itemCountToReplace, this.fenceAssort);
        this.deleteRandomAssorts(discountItemCountToReplace, this.fenceDiscountAssort);

        // Get count of what item pools need new items (item/weapon/equipment)
        const itemCountsToReplace = this.getCountOfItemsToGenerate();

        const newItems = this.createFenceAssortSkeleton();
        this.createAssorts(itemCountsToReplace.normal, newItems, 2);
        this.fenceAssort.items.push(...newItems.items);

        const newDiscountItems = this.createFenceAssortSkeleton();
        this.createAssorts(itemCountsToReplace.discount, newDiscountItems, 2);
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

        // Reset the clock
        this.incrementPartialRefreshTime();
    }

    /**
     * Increment fence next refresh timestamp by current timestamp + partialRefreshTimeSeconds from config
     */
    protected incrementPartialRefreshTime(): void
    {
        this.nextPartialRefreshTimestamp = this.timeUtil.getTimestamp()
            + this.traderConfig.fence.partialRefreshTimeSeconds;
    }

    /**
     * Compare the current fence offer count to what the config wants it to be,
     * If value is lower add extra count to value to generate more items to fill gap
     * @param existingItemCountToReplace count of items to generate
     * @returns number of items to generate
     */
    protected getCountOfItemsToGenerate(): IFenceAssortGenerationValues
    {
        const currentItemAssortCount = Object.keys(this.fenceAssort.loyal_level_items).length;

        const rootPresetItems = this.fenceAssort.items.filter((item) =>
            item.slotId === "hideout" && item.upd.sptPresetId
        );

        // Get count of weapons
        const currentWeaponPresetCount = rootPresetItems.reduce((count, item) =>
        {
            return this.itemHelper.isOfBaseclass(item._tpl, BaseClasses.WEAPON) ? count + 1 : count;
        }, 0);

        // Get count of equipment
        const currentEquipmentPresetCount = rootPresetItems.reduce((count, item) =>
        {
            return this.itemHelper.armorItemCanHoldMods(item._tpl) ? count + 1 : count;
        }, 0);

        const itemCountToGenerate = Math.max(this.desiredAssortCounts.normal.item - currentItemAssortCount, 0);
        const weaponCountToGenerate = Math.max(
            this.desiredAssortCounts.normal.weaponPreset - currentWeaponPresetCount,
            0,
        );
        const equipmentCountToGenerate = Math.max(
            this.desiredAssortCounts.normal.equipmentPreset - currentEquipmentPresetCount,
            0,
        );

        const normalValues: IGenerationAssortValues = {
            item: itemCountToGenerate,
            weaponPreset: weaponCountToGenerate,
            equipmentPreset: equipmentCountToGenerate,
        };

        // Discount tab handling
        const currentDiscountItemAssortCount = Object.keys(this.fenceDiscountAssort.loyal_level_items).length;
        const rootDiscountPresetItems = this.fenceDiscountAssort.items.filter((item) =>
            item.slotId === "hideout" && item.upd.sptPresetId
        );

        // Get count of weapons
        const currentDiscountWeaponPresetCount = rootDiscountPresetItems.reduce((count, item) =>
        {
            return this.itemHelper.isOfBaseclass(item._tpl, BaseClasses.WEAPON) ? count + 1 : count;
        }, 0);

        // Get count of equipment
        const currentDiscountEquipmentPresetCount = rootDiscountPresetItems.reduce((count, item) =>
        {
            return this.itemHelper.armorItemCanHoldMods(item._tpl) ? count + 1 : count;
        }, 0);

        const itemDiscountCountToGenerate = Math.max(
            this.desiredAssortCounts.discount.item - currentDiscountItemAssortCount,
            0,
        );
        const weaponDiscountCountToGenerate = Math.max(
            this.desiredAssortCounts.discount.weaponPreset - currentDiscountWeaponPresetCount,
            0,
        );
        const equipmentDiscountCountToGenerate = Math.max(
            this.desiredAssortCounts.discount.equipmentPreset - currentDiscountEquipmentPresetCount,
            0,
        );

        const discountValues: IGenerationAssortValues = {
            item: itemDiscountCountToGenerate,
            weaponPreset: weaponDiscountCountToGenerate,
            equipmentPreset: equipmentDiscountCountToGenerate,
        };

        return { normal: normalValues, discount: discountValues };
    }

    /**
     * Delete desired number of items from assort (including children)
     * @param itemCountToReplace
     * @param discountItemCountToReplace
     */
    protected deleteRandomAssorts(itemCountToReplace: number, assort: ITraderAssort): void
    {
        if (assort?.items?.length > 0)
        {
            const rootItems = assort.items.filter((item) => item.slotId === "hideout");
            for (let index = 0; index < itemCountToReplace; index++)
            {
                this.removeRandomItemFromAssorts(assort, rootItems);
            }
        }
    }

    /**
     * Choose an item at random and remove it + mods from assorts
     * @param assort Items to remove from
     * @param rootItems Assort root items to pick from to remove
     */
    protected removeRandomItemFromAssorts(assort: ITraderAssort, rootItems: Item[]): void
    {
        const rootItemToRemove = this.randomUtil.getArrayValue(rootItems);

        // Clean up any mods if item had them
        const itemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(assort.items, rootItemToRemove._id);
        for (const itemToDelete of itemWithChildren)
        {
            // Delete item from assort items array
            assort.items.splice(assort.items.indexOf(itemToDelete), 1);
        }

        delete assort.barter_scheme[rootItemToRemove._id];
        delete assort.loyal_level_items[rootItemToRemove._id];
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

        // Choose assort counts using config
        this.createInitialFenceAssortGenerationValues();

        // Create basic fence assort
        const assorts = this.createFenceAssortSkeleton();
        this.createAssorts(this.desiredAssortCounts.normal, assorts, 1);
        // Store in this.fenceAssort
        this.setFenceAssort(assorts);

        // Create level 2 assorts accessible at rep level 6
        const discountAssorts = this.createFenceAssortSkeleton();
        this.createAssorts(this.desiredAssortCounts.discount, discountAssorts, 2);
        // Store in this.fenceDiscountAssort
        this.setFenceDiscountAssort(discountAssorts);
    }

    /**
     * Create object that contains calculated fence assort item values to make based on config
     * Stored in this.desiredAssortCounts
     */
    protected createInitialFenceAssortGenerationValues(): void
    {
        const result: IFenceAssortGenerationValues = {
            normal: { item: 0, weaponPreset: 0, equipmentPreset: 0 },
            discount: { item: 0, weaponPreset: 0, equipmentPreset: 0 },
        };

        result.normal.item = this.traderConfig.fence.assortSize;

        result.normal.weaponPreset = this.randomUtil.getInt(
            this.traderConfig.fence.weaponPresetMinMax.min,
            this.traderConfig.fence.weaponPresetMinMax.max,
        );

        result.normal.equipmentPreset = this.randomUtil.getInt(
            this.traderConfig.fence.equipmentPresetMinMax.min,
            this.traderConfig.fence.equipmentPresetMinMax.max,
        );

        result.discount.item = this.traderConfig.fence.discountOptions.assortSize;

        result.discount.weaponPreset = this.randomUtil.getInt(
            this.traderConfig.fence.discountOptions.weaponPresetMinMax.min,
            this.traderConfig.fence.discountOptions.weaponPresetMinMax.max,
        );

        result.discount.equipmentPreset = this.randomUtil.getInt(
            this.traderConfig.fence.discountOptions.equipmentPresetMinMax.min,
            this.traderConfig.fence.discountOptions.equipmentPresetMinMax.max,
        );

        this.desiredAssortCounts = result;
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
    protected createAssorts(itemCounts: IGenerationAssortValues, assorts: ITraderAssort, loyaltyLevel: number): void
    {
        const baseFenceAssortClone = this.jsonUtil.clone(this.databaseServer.getTables().traders[Traders.FENCE].assort);
        const itemTypeLimitCounts = this.initItemLimitCounter(this.traderConfig.fence.itemTypeLimits);

        if (itemCounts.item > 0)
        {
            this.addItemAssorts(itemCounts.item, assorts, baseFenceAssortClone, itemTypeLimitCounts, loyaltyLevel);
        }

        if (itemCounts.weaponPreset > 0 || itemCounts.equipmentPreset > 0)
        {
            // Add presets
            this.addPresetsToAssort(
                itemCounts.weaponPreset,
                itemCounts.equipmentPreset,
                assorts,
                baseFenceAssortClone,
                loyaltyLevel,
            );
        }
    }

    /**
     * Add item assorts to existing assort data
     * @param assortCount Number to add
     * @param assorts Assorts data to add to
     * @param baseFenceAssortClone Base data to draw from
     * @param itemTypeLimits
     * @param loyaltyLevel Loyalty level to set new item to
     */
    protected addItemAssorts(
        assortCount: number,
        assorts: ITraderAssort,
        baseFenceAssortClone: ITraderAssort,
        itemTypeLimits: Record<string, { current: number; max: number; }>,
        loyaltyLevel: number,
    ): void
    {
        const priceLimits = this.traderConfig.fence.itemCategoryRoublePriceLimit;
        const assortRootItems = baseFenceAssortClone.items.filter((x) =>
            x.parentId === "hideout" && !x.upd?.sptPresetId
        );

        // Clear cache of multi-stack items
        this.multiStackItems = {};

        for (let i = 0; i < assortCount; i++)
        {
            const chosenBaseAssortRoot = this.randomUtil.getArrayValue(assortRootItems);
            if (!chosenBaseAssortRoot)
            {
                this.logger.error(
                    this.localisationService.getText("fence-unable_to_find_assort_by_id", chosenBaseAssortRoot._id),
                );

                continue;
            }
            let desiredAssortItemAndChildrenClone = this.jsonUtil.clone(
                this.itemHelper.findAndReturnChildrenAsItems(baseFenceAssortClone.items, chosenBaseAssortRoot._id),
            );

            const itemDbDetails = this.itemHelper.getItem(chosenBaseAssortRoot._tpl)[1];
            const itemLimitCount = this.getMatchingItemLimit(itemTypeLimits, itemDbDetails._id);
            if (itemLimitCount?.current >= itemLimitCount?.max)
            {
                // Skip adding item as assort as limit reached, decrement i counter so we still get another item
                i--;
                continue;
            }

            const itemIsPreset = this.presetHelper.isPreset(chosenBaseAssortRoot._id);

            const price = baseFenceAssortClone.barter_scheme[chosenBaseAssortRoot._id][0][0].count;
            if (price === 0 || (price === 1 && !itemIsPreset) || price === 100)
            {
                // Don't allow "special" items / presets
                i--;
                continue;
            }

            if (price > priceLimits[itemDbDetails._parent])
            {
                // Too expensive for fence, try another item
                i--;
                continue;
            }

            // Increment count as item is being added
            if (itemLimitCount)
            {
                itemLimitCount.current++;
            }

            // MUST randomise Ids as its possible to add the same base fence assort twice = duplicate IDs = dead client
            desiredAssortItemAndChildrenClone = this.itemHelper.replaceIDs(desiredAssortItemAndChildrenClone);
            this.itemHelper.remapRootItemId(desiredAssortItemAndChildrenClone);

            const rootItemBeingAdded = desiredAssortItemAndChildrenClone[0];

            rootItemBeingAdded.upd.StackObjectsCount = this.getSingleItemStackCount(itemDbDetails);
            // rootItemBeingAdded.upd.BuyRestrictionCurrent = 0;
            // rootItemBeingAdded.upd.UnlimitedCount = false;

            // Skip items already in the assort if it exists in the prevent duplicate list
            if (
                assorts.items.some((item) => item._tpl === rootItemBeingAdded._tpl)
                && this.traderConfig.fence.preventDuplicateOffersOfCategory.includes(
                    this.itemHelper.getItem(rootItemBeingAdded._tpl)[1]._parent,
                )
            )
            {
                i--;
                continue;
            }

            // Only randomise single items
            const isSingleStack = rootItemBeingAdded.upd.StackObjectsCount === 1;
            if (isSingleStack)
            {
                this.randomiseItemUpdProperties(itemDbDetails, rootItemBeingAdded);
            }
            else
            {
                // Already have multi-stack, skip
                if (this.multiStackItems[itemDbDetails._id])
                {
                    i--;
                    continue;
                }

                // Flag item as added as multi-stack
                this.multiStackItems[itemDbDetails._id] = true;
            }

            // Need to add mods to armors so they dont show as red in the trade screen
            if (this.itemHelper.itemRequiresSoftInserts(rootItemBeingAdded._tpl))
            {
                this.randomiseArmorModDurability(desiredAssortItemAndChildrenClone, itemDbDetails);
            }

            assorts.items.push(...desiredAssortItemAndChildrenClone);

            assorts.barter_scheme[rootItemBeingAdded._id] = this.jsonUtil.clone(
                baseFenceAssortClone.barter_scheme[chosenBaseAssortRoot._id],
            );

            // Only adjust item price by quality for solo items, never multi-stack
            if (isSingleStack)
            {
                this.adjustItemPriceByQuality(assorts.barter_scheme, rootItemBeingAdded, itemDbDetails);
            }

            assorts.loyal_level_items[rootItemBeingAdded._id] = loyaltyLevel;
        }
    }

    /**
     * Adjust price of item based on what is left to buy (resource/uses left)
     * @param barterSchemes All barter scheme for item having price adjusted
     * @param itemRoot Root item having price adjusted
     * @param itemTemplate Db template of item
     */
    protected adjustItemPriceByQuality(
        barterSchemes: Record<string, IBarterScheme[][]>,
        itemRoot: Item,
        itemTemplate: ITemplateItem,
    ): void
    {
        // Healing items
        if (itemRoot.upd?.MedKit)
        {
            const itemTotalMax = itemTemplate._props.MaxHpResource;
            const current = itemRoot.upd.MedKit.HpResource;

            // Current and max match, no adjustment necessary
            if (itemTotalMax === current)
            {
                return;
            }

            const multipler = current / itemTotalMax;

            // Multiply item cost by desired multiplier
            const basePrice = barterSchemes[itemRoot._id][0][0].count;
            barterSchemes[itemRoot._id][0][0].count = Math.round(basePrice * multipler);

            return;
        }

        // Adjust price based on durability
        if (itemRoot.upd?.Repairable || this.itemHelper.isOfBaseclass(itemRoot._tpl, BaseClasses.KEY_MECHANICAL))
        {
            const itemQualityModifier = this.itemHelper.getItemQualityModifier(itemRoot);
            const basePrice = barterSchemes[itemRoot._id][0][0].count;
            barterSchemes[itemRoot._id][0][0].count = Math.round(basePrice * itemQualityModifier);
        }
    }

    protected getMatchingItemLimit(
        itemTypeLimits: Record<string, { current: number; max: number; }>,
        itemTpl: string,
    ): { current: number; max: number; }
    {
        for (const baseTypeKey in itemTypeLimits)
        {
            if (this.itemHelper.isOfBaseclass(itemTpl, baseTypeKey))
            {
                return itemTypeLimits[baseTypeKey];
            }
        }
    }

    /**
     * Find presets in base fence assort and add desired number to 'assorts' parameter
     * @param desiredWeaponPresetsCount
     * @param assorts Assorts to add preset to
     * @param baseFenceAssort Base data to draw from
     * @param loyaltyLevel Which loyalty level is required to see/buy item
     */
    protected addPresetsToAssort(
        desiredWeaponPresetsCount: number,
        desiredEquipmentPresetsCount: number,
        assorts: ITraderAssort,
        baseFenceAssort: ITraderAssort,
        loyaltyLevel: number,
    ): void
    {
        let weaponPresetsAddedCount = 0;
        if (desiredWeaponPresetsCount > 0)
        {
            const weaponPresetRootItems = baseFenceAssort.items.filter((item) =>
                item.upd?.sptPresetId && this.itemHelper.isOfBaseclass(item._tpl, BaseClasses.WEAPON)
            );
            while (weaponPresetsAddedCount < desiredWeaponPresetsCount)
            {
                const randomPresetRoot = this.randomUtil.getArrayValue(weaponPresetRootItems);
                if (this.traderConfig.fence.blacklist.includes(randomPresetRoot._tpl))
                {
                    continue;
                }

                const rootItemDb = this.itemHelper.getItem(randomPresetRoot._tpl)[1];

                const presetWithChildrenClone = this.jsonUtil.clone(
                    this.itemHelper.findAndReturnChildrenAsItems(baseFenceAssort.items, randomPresetRoot._id),
                );

                this.randomiseItemUpdProperties(rootItemDb, presetWithChildrenClone[0]);

                this.removeRandomModsOfItem(presetWithChildrenClone);

                // Check chosen item is below price cap
                const priceLimitRouble = this.traderConfig.fence.itemCategoryRoublePriceLimit[rootItemDb._parent];
                const itemPrice = this.handbookHelper.getTemplatePriceForItems(presetWithChildrenClone)
                    * this.itemHelper.getItemQualityModifierForOfferItems(presetWithChildrenClone);
                if (priceLimitRouble)
                {
                    if (itemPrice > priceLimitRouble)
                    {
                        // Too expensive, try again
                        continue;
                    }
                }

                // MUST randomise Ids as its possible to add the same base fence assort twice = duplicate IDs = dead client
                this.itemHelper.reparentItemAndChildren(presetWithChildrenClone[0], presetWithChildrenClone);
                this.itemHelper.remapRootItemId(presetWithChildrenClone);

                // Remapping IDs causes parentid to be altered
                presetWithChildrenClone[0].parentId = "hideout";

                assorts.items.push(...presetWithChildrenClone);

                // Set assort price
                // Must be careful to use correct id as the item has had its IDs regenerated
                assorts.barter_scheme[presetWithChildrenClone[0]._id] = [[{
                    _tpl: "5449016a4bdc2d6f028b456f",
                    count: Math.round(itemPrice),
                }]];
                assorts.loyal_level_items[presetWithChildrenClone[0]._id] = loyaltyLevel;

                weaponPresetsAddedCount++;
            }
        }

        let equipmentPresetsAddedCount = 0;
        if (desiredEquipmentPresetsCount <= 0)
        {
            return;
        }

        const equipmentPresetRootItems = baseFenceAssort.items.filter((item) =>
            item.upd?.sptPresetId && this.itemHelper.armorItemCanHoldMods(item._tpl)
        );
        while (equipmentPresetsAddedCount < desiredEquipmentPresetsCount)
        {
            const randomPresetRoot = this.randomUtil.getArrayValue(equipmentPresetRootItems);
            const rootItemDb = this.itemHelper.getItem(randomPresetRoot._tpl)[1];

            const presetWithChildrenClone = this.jsonUtil.clone(
                this.itemHelper.findAndReturnChildrenAsItems(baseFenceAssort.items, randomPresetRoot._id),
            );

            // Need to add mods to armors so they dont show as red in the trade screen
            if (this.itemHelper.itemRequiresSoftInserts(randomPresetRoot._tpl))
            {
                this.randomiseArmorModDurability(presetWithChildrenClone, rootItemDb);
            }

            this.removeRandomModsOfItem(presetWithChildrenClone);

            // Check chosen item is below price cap
            const priceLimitRouble = this.traderConfig.fence.itemCategoryRoublePriceLimit[rootItemDb._parent];
            const itemPrice = this.handbookHelper.getTemplatePriceForItems(presetWithChildrenClone)
                * this.itemHelper.getItemQualityModifierForOfferItems(presetWithChildrenClone);
            if (priceLimitRouble)
            {
                if (itemPrice > priceLimitRouble)
                {
                    // Too expensive, try again
                    continue;
                }
            }

            // MUST randomise Ids as its possible to add the same base fence assort twice = duplicate IDs = dead client
            this.itemHelper.reparentItemAndChildren(presetWithChildrenClone[0], presetWithChildrenClone);
            this.itemHelper.remapRootItemId(presetWithChildrenClone);

            // Remapping IDs causes parentid to be altered
            presetWithChildrenClone[0].parentId = "hideout";

            assorts.items.push(...presetWithChildrenClone);

            // Set assort price
            // Must be careful to use correct id as the item has had its IDs regenerated
            assorts.barter_scheme[presetWithChildrenClone[0]._id] = [[{
                _tpl: "5449016a4bdc2d6f028b456f",
                count: Math.round(itemPrice),
            }]];
            assorts.loyal_level_items[presetWithChildrenClone[0]._id] = loyaltyLevel;

            equipmentPresetsAddedCount++;
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
        const requiredSlots = itemDbDetails._props.Slots.filter((slot) => slot._required);
        const hasRequiredSlots = requiredSlots.length > 0;
        if (hasRequiredSlots)
        {
            for (const requiredSlot of requiredSlots)
            {
                const modItemDbDetails = this.itemHelper.getItem(requiredSlot._props.filters[0].Plate)[1];
                const durabilityValues = this.getRandomisedArmorDurabilityValues(
                    modItemDbDetails,
                    this.traderConfig.fence.armorMaxDurabilityPercentMinMax,
                );
                const plateTpl = requiredSlot._props.filters[0].Plate; // `Plate` property appears to be the 'default' item for slot
                if (plateTpl === "")
                {
                    // Some bsg plate properties are empty, skip mod
                    continue;
                }

                // Find items mod to apply dura changes to
                const modItemToAdjust = armor.find((mod) =>
                    mod.slotId.toLowerCase() === requiredSlot._name.toLowerCase()
                );
                if (!modItemToAdjust.upd)
                {
                    modItemToAdjust.upd = {};
                }

                if (!modItemToAdjust.upd.Repairable)
                {
                    modItemToAdjust.upd.Repairable = {
                        Durability: modItemDbDetails._props.MaxDurability,
                        MaxDurability: modItemDbDetails._props.MaxDurability,
                    };
                }
                modItemToAdjust.upd.Repairable.Durability = durabilityValues.Durability;
                modItemToAdjust.upd.Repairable.MaxDurability = durabilityValues.MaxDurability;

                // 25% chance to add shots to visor when its below max durability
                if (
                    this.randomUtil.getChance100(25)
                    && modItemToAdjust.parentId === BaseClasses.ARMORED_EQUIPMENT
                    && modItemToAdjust.slotId === "mod_equipment_000"
                    && modItemToAdjust.upd.Repairable.Durability < modItemDbDetails._props.MaxDurability
                )
                { // Is damaged
                    modItemToAdjust.upd.FaceShield = { Hits: this.randomUtil.getInt(1, 3) };
                }
            }
        }

        // Check for and adjust plate durability values
        const plateSlots = itemDbDetails._props.Slots.filter((slot) =>
            this.itemHelper.isRemovablePlateSlot(slot._name)
        );
        if (plateSlots.length > 0)
        {
            for (const plateSlot of plateSlots)
            {
                // Chance to not add plate
                if (!this.randomUtil.getChance100(this.traderConfig.fence.chancePlateExistsInArmorPercent))
                {
                    continue;
                }

                const plateTpl = plateSlot._props.filters[0].Plate;
                if (!plateTpl)
                {
                    // Bsg data lacks a default plate, skip adding mod
                    continue;
                }
                const modItemDbDetails = this.itemHelper.getItem(plateTpl)[1];
                const durabilityValues = this.getRandomisedArmorDurabilityValues(
                    modItemDbDetails,
                    this.traderConfig.fence.armorMaxDurabilityPercentMinMax,
                );

                // Find items mod to apply dura changes to
                const modItemToAdjust = armor.find((mod) => mod.slotId.toLowerCase() === plateSlot._name.toLowerCase());
                if (!modItemToAdjust.upd)
                {
                    modItemToAdjust.upd = {};
                }

                if (!modItemToAdjust.upd.Repairable)
                {
                    modItemToAdjust.upd.Repairable = {
                        Durability: modItemDbDetails._props.MaxDurability,
                        MaxDurability: modItemDbDetails._props.MaxDurability,
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
        if (this.itemHelper.isOfBaseclass(itemDbDetails._id, BaseClasses.AMMO))
        {
            const overrideValues = this.traderConfig.fence.itemStackSizeOverrideMinMax[itemDbDetails._parent];
            if (overrideValues)
            {
                return this.randomUtil.getInt(overrideValues.min, overrideValues.max);
            }

            // No override, use stack max size from item db
            return itemDbDetails._props.StackMaxSize === 1
                ? 1
                : this.randomUtil.getInt(itemDbDetails._props.StackMinRandom, itemDbDetails._props.StackMaxRandom);
        }

        // Check for override in config, use values if exists
        const overrideValues = this.traderConfig.fence.itemStackSizeOverrideMinMax[itemDbDetails._id];
        if (overrideValues)
        {
            return this.randomUtil.getInt(overrideValues.min, overrideValues.max);
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

        return removalChance > randomChance && !itemsBeingDeleted.includes(weaponMod._id);
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
                || itemDetails._parent === BaseClasses.ARMOR_PLATE) && itemDetails._props.MaxDurability > 0
        )
        {
            const values = this.getRandomisedArmorDurabilityValues(
                itemDetails,
                this.traderConfig.fence.armorMaxDurabilityPercentMinMax,
            );
            itemToAdjust.upd.Repairable = { Durability: values.Durability, MaxDurability: values.MaxDurability };

            return;
        }

        // Randomise Weapon durability
        if (this.itemHelper.isOfBaseclass(itemDetails._id, BaseClasses.WEAPON))
        {
            const weaponDurabilityLimits = this.traderConfig.fence.weaponDurabilityPercentMinMax;
            const maxDuraMin = weaponDurabilityLimits.max.min / 100 * itemDetails._props.MaxDurability;
            const maxDuraMax = weaponDurabilityLimits.max.max / 100 * itemDetails._props.MaxDurability;
            const chosenMaxDurability = this.randomUtil.getInt(maxDuraMin, maxDuraMax);

            const currentDuraMin = weaponDurabilityLimits.current.min / 100 * itemDetails._props.MaxDurability;
            const currentDuraMax = weaponDurabilityLimits.current.max / 100 * itemDetails._props.MaxDurability;
            const currentDurability = Math.min(
                this.randomUtil.getInt(currentDuraMin, currentDuraMax),
                chosenMaxDurability,
            );

            itemToAdjust.upd.Repairable = { Durability: currentDurability, MaxDurability: chosenMaxDurability };

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
     * @param equipmentDurabilityLimits Max durabiltiy percent min/max values
     * @returns Durability + MaxDurability values
     */
    protected getRandomisedArmorDurabilityValues(
        itemDetails: ITemplateItem,
        equipmentDurabilityLimits: IItemDurabilityCurrentMax,
    ): Repairable
    {
        const maxDuraMin = equipmentDurabilityLimits.max.min / 100 * itemDetails._props.MaxDurability;
        const maxDuraMax = equipmentDurabilityLimits.max.max / 100 * itemDetails._props.MaxDurability;
        const chosenMaxDurability = this.randomUtil.getInt(maxDuraMin, maxDuraMax);

        const currentDuraMin = equipmentDurabilityLimits.current.min / 100 * itemDetails._props.MaxDurability;
        const currentDuraMax = equipmentDurabilityLimits.current.max / 100 * itemDetails._props.MaxDurability;
        const chosenCurrentDurability = Math.min(
            this.randomUtil.getInt(currentDuraMin, currentDuraMax),
            chosenMaxDurability,
        );

        return { Durability: chosenCurrentDurability, MaxDurability: chosenMaxDurability };
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
     * Remove or lower stack size of an assort from fence by id
     * @param assortId assort id to adjust
     * @param buyCount Count of items bought
     */
    public amendOrRemoveFenceOffer(assortId: string, buyCount: number): void
    {
        let isNormalAssort = true;
        let fenceAssortItem = this.fenceAssort.items.find((item) => item._id === assortId);
        if (!fenceAssortItem)
        {
            // Not in main assorts, check secondary section
            fenceAssortItem = this.fenceDiscountAssort.items.find((item) => item._id === assortId);
            if (!fenceAssortItem)
            {
                this.logger.error(`Offer with id: ${assortId} not found`);

                return;
            }
            isNormalAssort = false;
        }

        // Player wants to buy whole stack, delete stack
        if (fenceAssortItem.upd.StackObjectsCount === buyCount)
        {
            this.deleteOffer(assortId, isNormalAssort ? this.fenceAssort.items : this.fenceDiscountAssort.items);

            return;
        }

        // Adjust stack size
        fenceAssortItem.upd.StackObjectsCount -= buyCount;
    }

    protected deleteOffer(assortId: string, assorts: Item[]): void
    {
        // Assort could have child items, remove those too
        const itemWithChildrenToRemove = this.itemHelper.findAndReturnChildrenAsItems(assorts, assortId);
        for (const itemToRemove of itemWithChildrenToRemove)
        {
            let indexToRemove = assorts.findIndex((item) => item._id === itemToRemove._id);

            // No offer found in main assort, check discount items
            if (indexToRemove === -1)
            {
                indexToRemove = this.fenceDiscountAssort.items.findIndex((item) => item._id === itemToRemove._id);
                this.fenceDiscountAssort.items.splice(indexToRemove, 1);

                if (indexToRemove === -1)
                {
                    this.logger.warning(
                        `unable to remove fence assort item: ${itemToRemove._id} tpl: ${itemToRemove._tpl}`,
                    );
                }

                return;
            }

            // Remove offer from assort
            assorts.splice(indexToRemove, 1);
        }
    }
}
