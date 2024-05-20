import { inject, injectable } from "tsyringe";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { WeightedRandomHelper } from "@spt-aki/helpers/WeightedRandomHelper";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IPmcConfig } from "@spt-aki/models/spt/config/IPmcConfig";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ItemFilterService } from "@spt-aki/services/ItemFilterService";
import { RagfairPriceService } from "@spt-aki/services/RagfairPriceService";
import { SeasonalEventService } from "@spt-aki/services/SeasonalEventService";

/**
 * Handle the generation of dynamic PMC loot in pockets and backpacks
 * and the removal of blacklisted items
 */
@injectable()
export class PMCLootGenerator
{
    protected pocketLootPool: Record<string, number> = {};
    protected vestLootPool: Record<string, number> = {};
    protected backpackLootPool: Record<string, number> = {};
    protected pmcConfig: IPmcConfig;

    protected roubleTpl = "5449016a4bdc2d6f028b456f";

    constructor(
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
    )
    {
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Create an array of loot items a PMC can have in their pockets
     * @returns string array of tpls
     */
    public generatePMCPocketLootPool(botRole: string): Record<string, number>
    {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.pocketLootPool).length === 0)
        {
            const items = this.databaseServer.getTables().templates.items;
            const pmcPriceOverrides
                = this.databaseServer.getTables().bots.types[botRole === "sptBear" ? "bear" : "usec"].inventory.items
                    .Pockets;

            const allowedItemTypes = this.pmcConfig.pocketLoot.whitelist;
            const pmcItemBlacklist = this.pmcConfig.pocketLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();

            // Blacklist inactive seasonal items
            itemBlacklist.push(...this.seasonalEventService.getInactiveSeasonalEventItems());

            const itemsToAdd = Object.values(items).filter(
                (item) =>
                    allowedItemTypes.includes(item._parent)
                    && this.itemHelper.isValidItem(item._id)
                    && !pmcItemBlacklist.includes(item._id)
                    && !itemBlacklist.includes(item._id)
                    && item._props.Width === 1
                    && item._props.Height === 1,
            );

            for (const itemToAdd of itemsToAdd)
            {
                // If pmc has override, use that. Otherwise use flea price
                if (pmcPriceOverrides[itemToAdd._id])
                {
                    this.pocketLootPool[itemToAdd._id] = pmcPriceOverrides[itemToAdd._id];
                }
                else
                {
                    // Set price of item as its weight
                    const price = this.ragfairPriceService.getDynamicItemPrice(itemToAdd._id, this.roubleTpl);
                    this.pocketLootPool[itemToAdd._id] = price;
                }
            }

            const highestPrice = Math.max(...Object.values(this.backpackLootPool));
            for (const key of Object.keys(this.pocketLootPool))
            {
                // Invert price so cheapest has a larger weight
                // Times by highest price so most expensive item has weight of 1
                this.pocketLootPool[key] = Math.round((1 / this.pocketLootPool[key]) * highestPrice);
            }

            this.weightedRandomHelper.reduceWeightValues(this.pocketLootPool);
        }

        return this.pocketLootPool;
    }

    /**
     * Create an array of loot items a PMC can have in their vests
     * @returns string array of tpls
     */
    public generatePMCVestLootPool(botRole: string): Record<string, number>
    {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.vestLootPool).length === 0)
        {
            const items = this.databaseServer.getTables().templates.items;
            const pmcPriceOverrides
                = this.databaseServer.getTables().bots.types[botRole === "sptBear" ? "bear" : "usec"].inventory.items
                    .TacticalVest;

            const allowedItemTypes = this.pmcConfig.vestLoot.whitelist;
            const pmcItemBlacklist = this.pmcConfig.vestLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();

            // Blacklist seasonal items
            itemBlacklist.push(...this.seasonalEventService.getInactiveSeasonalEventItems());

            const itemsToAdd = Object.values(items).filter(
                (item) =>
                    allowedItemTypes.includes(item._parent)
                    && this.itemHelper.isValidItem(item._id)
                    && !pmcItemBlacklist.includes(item._id)
                    && !itemBlacklist.includes(item._id)
                    && this.itemFitsInto2By2Slot(item),
            );

            for (const itemToAdd of itemsToAdd)
            {
                // If pmc has override, use that. Otherwise use flea price
                if (pmcPriceOverrides[itemToAdd._id])
                {
                    this.vestLootPool[itemToAdd._id] = pmcPriceOverrides[itemToAdd._id];
                }
                else
                {
                    // Set price of item as its weight
                    const price = this.ragfairPriceService.getDynamicItemPrice(itemToAdd._id, this.roubleTpl);
                    this.vestLootPool[itemToAdd._id] = price;
                }
            }

            const highestPrice = Math.max(...Object.values(this.backpackLootPool));
            for (const key of Object.keys(this.vestLootPool))
            {
                // Invert price so cheapest has a larger weight
                // Times by highest price so most expensive item has weight of 1
                this.vestLootPool[key] = Math.round((1 / this.vestLootPool[key]) * highestPrice);
            }

            this.weightedRandomHelper.reduceWeightValues(this.vestLootPool);
        }

        return this.vestLootPool;
    }

    /**
     * Check if item has a width/height that lets it fit into a 2x2 slot
     * 1x1 / 1x2 / 2x1 / 2x2
     * @param item Item to check size of
     * @returns true if it fits
     */
    protected itemFitsInto2By2Slot(item: ITemplateItem): boolean
    {
        return item._props.Width <= 2 && item._props.Height <= 2;
    }

    /**
     * Create an array of loot items a PMC can have in their backpack
     * @returns string array of tpls
     */
    public generatePMCBackpackLootPool(botRole: string): Record<string, number>
    {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.backpackLootPool).length === 0)
        {
            const items = this.databaseServer.getTables().templates.items;
            const pmcPriceOverrides
                = this.databaseServer.getTables().bots.types[botRole === "sptBear" ? "bear" : "usec"].inventory.items
                    .Backpack;

            const allowedItemTypes = this.pmcConfig.backpackLoot.whitelist;
            const pmcItemBlacklist = this.pmcConfig.backpackLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();

            // Blacklist seasonal items
            itemBlacklist.push(...this.seasonalEventService.getInactiveSeasonalEventItems());

            const itemsToAdd = Object.values(items).filter(
                (item) =>
                    allowedItemTypes.includes(item._parent)
                    && this.itemHelper.isValidItem(item._id)
                    && !pmcItemBlacklist.includes(item._id)
                    && !itemBlacklist.includes(item._id),
            );

            for (const itemToAdd of itemsToAdd)
            {
                // If pmc has price override, use that. Otherwise use flea price
                if (pmcPriceOverrides[itemToAdd._id])
                {
                    this.backpackLootPool[itemToAdd._id] = pmcPriceOverrides[itemToAdd._id];
                }
                else
                {
                    // Set price of item as its weight
                    const price = this.ragfairPriceService.getDynamicItemPrice(itemToAdd._id, this.roubleTpl);
                    this.backpackLootPool[itemToAdd._id] = price;
                }
            }

            const highestPrice = Math.max(...Object.values(this.backpackLootPool));
            for (const key of Object.keys(this.backpackLootPool))
            {
                // Invert price so cheapest has a larger weight
                // Times by highest price so most expensive item has weight of 1
                this.backpackLootPool[key] = Math.round((1 / this.backpackLootPool[key]) * highestPrice);
            }

            this.weightedRandomHelper.reduceWeightValues(this.backpackLootPool);
        }

        return this.backpackLootPool;
    }
}
