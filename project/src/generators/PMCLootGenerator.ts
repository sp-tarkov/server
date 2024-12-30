import { ItemHelper } from "@spt/helpers/ItemHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Money } from "@spt/models/enums/Money";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { RagfairPriceService } from "@spt/services/RagfairPriceService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { inject, injectable } from "tsyringe";

/**
 * Handle the generation of dynamic PMC loot in pockets and backpacks
 * and the removal of blacklisted items
 */
@injectable()
export class PMCLootGenerator {
    protected pocketLootPool: Record<string, number> = {};
    protected vestLootPool: Record<string, number> = {};
    protected backpackLootPool: Record<string, number> = {};
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
    ) {
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Create an array of loot items a PMC can have in their pockets
     * @returns string array of tpls
     */
    public generatePMCPocketLootPool(botRole: string): Record<string, number> {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.pocketLootPool).length === 0) {
            const items = this.databaseService.getItems();
            const pmcPriceOverrides =
                this.databaseService.getBots().types[botRole === "pmcBEAR" ? "bear" : "usec"].inventory.items.Pockets;

            const allowedItemTypeWhitelist = this.pmcConfig.pocketLoot.whitelist;

            const blacklist = new Set();
            for (const id of [
                ...this.pmcConfig.pocketLoot.blacklist,
                ...this.pmcConfig.globalLootBlacklist,
                ...this.itemFilterService.getBlacklistedItems(),
                ...this.seasonalEventService.getInactiveSeasonalEventItems(),
            ]) {
                blacklist.add(id);
            }

            const itemsToAdd = Object.values(items).filter(
                (item) =>
                    allowedItemTypeWhitelist.includes(item._parent) &&
                    this.itemHelper.isValidItem(item._id) &&
                    !blacklist.has(item._id) &&
                    !blacklist.has(item._parent) &&
                    this.itemFitsInto1By2Slot(item),
            );

            for (const itemToAdd of itemsToAdd) {
                // If pmc has override, use that. Otherwise use flea price
                if (pmcPriceOverrides[itemToAdd._id]) {
                    this.pocketLootPool[itemToAdd._id] = pmcPriceOverrides[itemToAdd._id];
                } else {
                    // Set price of item as its weight
                    const price = this.ragfairPriceService.getDynamicItemPrice(itemToAdd._id, Money.ROUBLES);
                    this.pocketLootPool[itemToAdd._id] = price;
                }
            }

            const highestPrice = Math.max(...Object.values(this.backpackLootPool));
            for (const key of Object.keys(this.pocketLootPool)) {
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
    public generatePMCVestLootPool(botRole: string): Record<string, number> {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.vestLootPool).length === 0) {
            const items = this.databaseService.getItems();
            const pmcPriceOverrides =
                this.databaseService.getBots().types[botRole === "pmcBEAR" ? "bear" : "usec"].inventory.items
                    .TacticalVest;

            const allowedItemTypeWhitelist = this.pmcConfig.vestLoot.whitelist;

            const blacklist = new Set();
            for (const id of [
                ...this.pmcConfig.vestLoot.blacklist,
                ...this.pmcConfig.globalLootBlacklist,
                ...this.itemFilterService.getBlacklistedItems(),
                ...this.seasonalEventService.getInactiveSeasonalEventItems(),
            ]) {
                blacklist.add(id);
            }

            const itemsToAdd = Object.values(items).filter(
                (item) =>
                    allowedItemTypeWhitelist.includes(item._parent) &&
                    this.itemHelper.isValidItem(item._id) &&
                    !blacklist.has(item._id) &&
                    !blacklist.has(item._parent) &&
                    this.itemFitsInto2By2Slot(item),
            );

            for (const itemToAdd of itemsToAdd) {
                // If pmc has override, use that. Otherwise use flea price
                if (pmcPriceOverrides[itemToAdd._id]) {
                    this.vestLootPool[itemToAdd._id] = pmcPriceOverrides[itemToAdd._id];
                } else {
                    // Set price of item as its weight
                    const price = this.ragfairPriceService.getDynamicItemPrice(itemToAdd._id, Money.ROUBLES);
                    this.vestLootPool[itemToAdd._id] = price;
                }
            }

            const highestPrice = Math.max(...Object.values(this.backpackLootPool));
            for (const key of Object.keys(this.vestLootPool)) {
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
    protected itemFitsInto2By2Slot(item: ITemplateItem): boolean {
        return item._props.Width <= 2 && item._props.Height <= 2;
    }

    /**
     * Check if item has a width/height that lets it fit into a 1x2 slot
     * 1x1 / 1x2 / 2x1
     * @param item Item to check size of
     * @returns true if it fits
     */
    protected itemFitsInto1By2Slot(item: ITemplateItem): boolean {
        switch (`${item._props.Width}x${item._props.Height}`) {
            case "1x1":
            case "1x2":
            case "2x1":
                return true;

            default:
                return false;
        }
    }

    /**
     * Create an array of loot items a PMC can have in their backpack
     * @returns string array of tpls
     */
    public generatePMCBackpackLootPool(botRole: string): Record<string, number> {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.backpackLootPool).length === 0) {
            const items = this.databaseService.getItems();
            const pmcPriceOverrides =
                this.databaseService.getBots().types[botRole === "pmcBEAR" ? "bear" : "usec"].inventory.items.Backpack;

            const allowedItemTypeWhitelist = this.pmcConfig.backpackLoot.whitelist;

            const blacklist = new Set();
            for (const id of [
                ...this.pmcConfig.backpackLoot.blacklist,
                ...this.pmcConfig.globalLootBlacklist,
                ...this.itemFilterService.getBlacklistedItems(),
                ...this.seasonalEventService.getInactiveSeasonalEventItems(),
            ]) {
                blacklist.add(id);
            }

            const itemsToAdd = Object.values(items).filter(
                (item) =>
                    allowedItemTypeWhitelist.includes(item._parent) &&
                    this.itemHelper.isValidItem(item._id) &&
                    !blacklist.has(item._id) &&
                    !blacklist.has(item._parent),
            );

            for (const itemToAdd of itemsToAdd) {
                // If pmc has price override, use that. Otherwise use flea price
                if (pmcPriceOverrides[itemToAdd._id]) {
                    this.backpackLootPool[itemToAdd._id] = pmcPriceOverrides[itemToAdd._id];
                } else {
                    // Set price of item as its weight
                    const price = this.ragfairPriceService.getDynamicItemPrice(itemToAdd._id, Money.ROUBLES);
                    this.backpackLootPool[itemToAdd._id] = price;
                }
            }

            const highestPrice = Math.max(...Object.values(this.backpackLootPool));
            for (const key of Object.keys(this.backpackLootPool)) {
                // Invert price so cheapest has a larger weight
                // Times by highest price so most expensive item has weight of 1
                this.backpackLootPool[key] = Math.round((1 / this.backpackLootPool[key]) * highestPrice);
            }

            this.weightedRandomHelper.reduceWeightValues(this.backpackLootPool);
        }

        return this.backpackLootPool;
    }
}
