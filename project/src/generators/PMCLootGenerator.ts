import { inject, injectable } from "tsyringe";

import { ItemHelper } from "../helpers/ItemHelper";
import { ITemplateItem } from "../models/eft/common/tables/ITemplateItem";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { IBotConfig } from "../models/spt/config/IBotConfig";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { ItemFilterService } from "../services/ItemFilterService";
import { SeasonalEventService } from "../services/SeasonalEventService";

/**
 * Handle the generation of dynamic PMC loot in pockets and backpacks 
 * and the removal of blacklisted items
 */
@injectable()

export class PMCLootGenerator
{
    protected pocketLootPool: string[] = [];
    protected vestLootPool: string[] = [];
    protected backpackLootPool: string[] = [];
    protected botConfig: IBotConfig;

    constructor(
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Create an array of loot items a PMC can have in their pockets
     * @returns string array of tpls
     */
    public generatePMCPocketLootPool(): string[]
    {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.pocketLootPool).length === 0)
        {
            const items = this.databaseServer.getTables().templates.items;

            const allowedItemTypes = this.botConfig.pmc.pocketLoot.whitelist;
            const pmcItemBlacklist = this.botConfig.pmc.pocketLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();
    
            // Blacklist seasonal items if not inside seasonal event
            // Blacklist seasonal items if not inside seasonal event
            if (!this.seasonalEventService.seasonalEventEnabled())
            {
                // Blacklist seasonal items
                itemBlacklist.push(...this.seasonalEventService.getSeasonalEventItemsToBlock());
            }

            const itemsToAdd = Object.values(items).filter(item => allowedItemTypes.includes(item._parent)
                                                            && this.itemHelper.isValidItem(item._id)
                                                            && !pmcItemBlacklist.includes(item._id)
                                                            && !itemBlacklist.includes(item._id)
                                                            && item._props.Width === 1
                                                            && item._props.Height === 1);

            this.pocketLootPool = itemsToAdd.map(x => x._id);
        }

        return this.pocketLootPool;
    }

    /**
     * Create an array of loot items a PMC can have in their vests
     * @returns string array of tpls
     */
    public generatePMCVestLootPool(): string[]
    {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.vestLootPool).length === 0)
        {
            const items = this.databaseServer.getTables().templates.items;

            const allowedItemTypes = this.botConfig.pmc.vestLoot.whitelist;
            const pmcItemBlacklist = this.botConfig.pmc.vestLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();
    
            // Blacklist seasonal items if not inside seasonal event
            // Blacklist seasonal items if not inside seasonal event
            if (!this.seasonalEventService.seasonalEventEnabled())
            {
                // Blacklist seasonal items
                itemBlacklist.push(...this.seasonalEventService.getSeasonalEventItemsToBlock());
            }

            const itemsToAdd = Object.values(items).filter(item => allowedItemTypes.includes(item._parent)
                                                            && this.itemHelper.isValidItem(item._id)
                                                            && !pmcItemBlacklist.includes(item._id)
                                                            && !itemBlacklist.includes(item._id)
                                                            && this.itemFitsInto1By2Slot(item));

            this.vestLootPool = itemsToAdd.map(x => x._id);
        }

        return this.vestLootPool;
    }

    /**
     * Check if item has a width/height that lets it fit into a 1x2/2x1 slot
     * 1x1 / 1x2 / 2x1
     * @param item Item to check size of
     * @returns true if it fits
     */
    protected itemFitsInto1By2Slot(item: ITemplateItem): boolean
    {
        switch (`{${item._props.Width}x${item._props.Height}}`)
        {
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
    public generatePMCBackpackLootPool(): string[]
    {
        // Hydrate loot dictionary if empty
        if (Object.keys(this.backpackLootPool).length === 0)
        {
            const items = this.databaseServer.getTables().templates.items;

            const allowedItemTypes = this.botConfig.pmc.backpackLoot.whitelist;
            const pmcItemBlacklist = this.botConfig.pmc.backpackLoot.blacklist;
            const itemBlacklist = this.itemFilterService.getBlacklistedItems();
    
            // blacklist event items if not inside seasonal event
            if (!this.seasonalEventService.seasonalEventEnabled())
            {
                // Blacklist seasonal items
                itemBlacklist.push(...this.seasonalEventService.getSeasonalEventItemsToBlock());
            }

            const itemsToAdd = Object.values(items).filter(item => allowedItemTypes.includes(item._parent)
                                                            && this.itemHelper.isValidItem(item._id)
                                                            && !pmcItemBlacklist.includes(item._id)
                                                            && !itemBlacklist.includes(item._id));

            this.backpackLootPool = itemsToAdd.map(x => x._id);
        }

        return this.backpackLootPool;
    }
}