import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IPmcConfig } from "@spt-aki/models/spt/config/IPmcConfig";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ItemFilterService } from "@spt-aki/services/ItemFilterService";
import { SeasonalEventService } from "@spt-aki/services/SeasonalEventService";

/**
 * Handle the generation of dynamic PMC loot in pockets and backpacks
 * and the removal of blacklisted items
 */
@injectable()
export class PMCLootGenerator {
    protected pocketLootPool: string[] = [];
    protected vestLootPool: string[] = [];
    protected backpackLootPool: string[] = [];
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService
    ) {
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Create an array of loot items a PMC can have in their pockets
     * @returns string array of tpls
     */
    public generatePMCPocketLootPool(): string[] {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.pocketLootPool).length === 0) {
            const items = this.databaseServer.getTables().templates.items;

            const allowedItemTypes = this.pmcConfig.pocketLoot.whitelist;
            const pmcItemBlacklist = this.pmcConfig.pocketLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();

            // Blacklist seasonal items if not inside seasonal event
            // Blacklist seasonal items if not inside seasonal event
            if (!this.seasonalEventService.seasonalEventEnabled()) {
                // Blacklist seasonal items
                itemBlacklist.push(...this.seasonalEventService.getAllSeasonalEventItems());
            }

            const itemsToAdd = Object.values(items).filter(
                (item) =>
                    allowedItemTypes.includes(item._parent) &&
                    this.itemHelper.isValidItem(item._id) &&
                    !pmcItemBlacklist.includes(item._id) &&
                    !itemBlacklist.includes(item._id) &&
                    item._props.Width === 1 &&
                    item._props.Height === 1
            );

            this.pocketLootPool = itemsToAdd.map((x) => x._id);
        }

        return this.pocketLootPool;
    }

    /**
     * Create an array of loot items a PMC can have in their vests
     * @returns string array of tpls
     */
    public generatePMCVestLootPool(): string[] {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.vestLootPool).length === 0) {
            const items = this.databaseServer.getTables().templates.items;

            const allowedItemTypes = this.pmcConfig.vestLoot.whitelist;
            const pmcItemBlacklist = this.pmcConfig.vestLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();

            // Blacklist seasonal items if not inside seasonal event
            // Blacklist seasonal items if not inside seasonal event
            if (!this.seasonalEventService.seasonalEventEnabled()) {
                // Blacklist seasonal items
                itemBlacklist.push(...this.seasonalEventService.getAllSeasonalEventItems());
            }

            const itemsToAdd = Object.values(items).filter(
                (item) =>
                    allowedItemTypes.includes(item._parent) &&
                    this.itemHelper.isValidItem(item._id) &&
                    !pmcItemBlacklist.includes(item._id) &&
                    !itemBlacklist.includes(item._id) &&
                    this.itemFitsInto2By2Slot(item)
            );

            this.vestLootPool = itemsToAdd.map((x) => x._id);
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
     * Create an array of loot items a PMC can have in their backpack
     * @returns string array of tpls
     */
    public generatePMCBackpackLootPool(): string[] {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.backpackLootPool).length === 0) {
            const items = this.databaseServer.getTables().templates.items;

            const allowedItemTypes = this.pmcConfig.backpackLoot.whitelist;
            const pmcItemBlacklist = this.pmcConfig.backpackLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();

            // blacklist event items if not inside seasonal event
            if (!this.seasonalEventService.seasonalEventEnabled()) {
                // Blacklist seasonal items
                itemBlacklist.push(...this.seasonalEventService.getAllSeasonalEventItems());
            }

            const itemsToAdd = Object.values(items).filter(
                (item) =>
                    allowedItemTypes.includes(item._parent) &&
                    this.itemHelper.isValidItem(item._id) &&
                    !pmcItemBlacklist.includes(item._id) &&
                    !itemBlacklist.includes(item._id)
            );

            this.backpackLootPool = itemsToAdd.map((x) => x._id);
        }

        return this.backpackLootPool;
    }
}
