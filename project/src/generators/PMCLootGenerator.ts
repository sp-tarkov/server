import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
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

    constructor(
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
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
            const pmcPriceOverrides =
                this.databaseServer.getTables().bots.types[botRole === "sptBear" ? "bear" : "usec"].inventory.items
                    .Pockets;

            const allowedItemTypes = this.pmcConfig.pocketLoot.whitelist;
            const pmcItemBlacklist = this.pmcConfig.pocketLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();

            // Blacklist seasonal items if not inside seasonal event
            if (!this.seasonalEventService.seasonalEventEnabled())
            {
                // Blacklist seasonal items
                itemBlacklist.push(...this.seasonalEventService.getInactiveSeasonalEventItems());
            }

            const itemsToAdd = Object.values(items).filter((item) =>
                allowedItemTypes.includes(item._parent)
                && this.itemHelper.isValidItem(item._id)
                && !pmcItemBlacklist.includes(item._id)
                && !itemBlacklist.includes(item._id)
                && item._props.Width === 1
                && item._props.Height === 1
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
                    const price = this.ragfairPriceService.getFleaPriceForItem(itemToAdd._id);
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

            this.reduceWeightValues(this.pocketLootPool);
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
            const pmcPriceOverrides =
                this.databaseServer.getTables().bots.types[botRole === "sptBear" ? "bear" : "usec"].inventory.items
                    .TacticalVest;

            const allowedItemTypes = this.pmcConfig.vestLoot.whitelist;
            const pmcItemBlacklist = this.pmcConfig.vestLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();

            // Blacklist seasonal items if not inside seasonal event
            // Blacklist seasonal items if not inside seasonal event
            if (!this.seasonalEventService.seasonalEventEnabled())
            {
                // Blacklist seasonal items
                itemBlacklist.push(...this.seasonalEventService.getInactiveSeasonalEventItems());
            }

            const itemsToAdd = Object.values(items).filter((item) =>
                allowedItemTypes.includes(item._parent)
                && this.itemHelper.isValidItem(item._id)
                && !pmcItemBlacklist.includes(item._id)
                && !itemBlacklist.includes(item._id)
                && this.itemFitsInto2By2Slot(item)
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
                    const price = this.ragfairPriceService.getFleaPriceForItem(itemToAdd._id);
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

            this.reduceWeightValues(this.vestLootPool);
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
            const pmcPriceOverrides =
                this.databaseServer.getTables().bots.types[botRole === "sptBear" ? "bear" : "usec"].inventory.items
                    .Backpack;

            const allowedItemTypes = this.pmcConfig.backpackLoot.whitelist;
            const pmcItemBlacklist = this.pmcConfig.backpackLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();

            // blacklist event items if not inside seasonal event
            if (!this.seasonalEventService.seasonalEventEnabled())
            {
                // Blacklist seasonal items
                itemBlacklist.push(...this.seasonalEventService.getInactiveSeasonalEventItems());
            }

            const itemsToAdd = Object.values(items).filter((item) =>
                allowedItemTypes.includes(item._parent)
                && this.itemHelper.isValidItem(item._id)
                && !pmcItemBlacklist.includes(item._id)
                && !itemBlacklist.includes(item._id)
            );

            for (const itemToAdd of itemsToAdd)
            {
                // If pmc has override, use that. Otherwise use flea price
                if (pmcPriceOverrides[itemToAdd._id])
                {
                    this.backpackLootPool[itemToAdd._id] = pmcPriceOverrides[itemToAdd._id];
                }
                else
                {
                    // Set price of item as its weight
                    const price = this.ragfairPriceService.getFleaPriceForItem(itemToAdd._id);
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

            this.reduceWeightValues(this.backpackLootPool);
        }

        return this.backpackLootPool;
    }

    /**
     * Find the greated common divisor of all weights and use it on the passed in dictionary
     * @param weightedDict
     */
    protected reduceWeightValues(weightedDict: Record<string, number>): void
    {
        // No values, nothing to reduce
        if (Object.keys(weightedDict).length === 0)
        {
            return;
        }

        // Only one value, set to 1 and exit
        if (Object.keys(weightedDict).length === 1)
        {
            const key = Object.keys(weightedDict)[0];
            weightedDict[key] = 1;
            return;
        }

        const weights = Object.values(weightedDict).slice();
        const commonDivisor = this.commonDivisor(weights);

        // No point in dividing by  1
        if (commonDivisor === 1)
        {
            return;
        }

        for (const key in weightedDict)
        {
            if (Object.hasOwn(weightedDict, key))
            {
                weightedDict[key] /= commonDivisor;
            }
        }
    }

    protected commonDivisor(numbers: number[]): number
    {
        let result = numbers[0];
        for (let i = 1; i < numbers.length; i++)
        {
            result = this.gcd(result, numbers[i]);
        }

        return result;
    }

    protected gcd(a: number, b: number): number
    {
        while (b !== 0)
        {
            const temp = b;
            b = a % b;
            a = temp;
        }

        return a;
    }
}
