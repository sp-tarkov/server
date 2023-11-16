import { inject, injectable } from "tsyringe";

import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";

/**
 * Cache the baseids for each item in the tiems db inside a dictionary
 */
@injectable()
export class ItemBaseClassService
{
    protected itemBaseClassesCache: Record<string, string[]> = {};
    protected cacheGenerated = false;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
    )
    {}

    /**
     * Create cache and store inside ItemBaseClassService
     * Store a dict of an items tpl to the base classes it and its parents have
     */
    public hydrateItemBaseClassCache(): void
    {
        // Clear existing cache
        this.itemBaseClassesCache = {};

        const allDbItems = this.databaseServer.getTables().templates.items;
        if (!allDbItems)
        {
            this.logger.warning(this.localisationService.getText("baseclass-missing_db_no_cache"));

            return;
        }

        const filteredDbItems = Object.values(allDbItems).filter((x) => x._type === "Item");
        for (const item of filteredDbItems)
        {
            const itemIdToUpdate = item._id;
            if (!this.itemBaseClassesCache[item._id])
            {
                this.itemBaseClassesCache[item._id] = [];
            }

            this.addBaseItems(itemIdToUpdate, item, allDbItems);
        }

        this.cacheGenerated = true;
    }

    /**
     * Helper method, recursivly iterate through items parent items, finding and adding ids to dictionary
     * @param itemIdToUpdate item tpl to store base ids against in dictionary
     * @param item item being checked
     * @param allDbItems all items in db
     */
    protected addBaseItems(itemIdToUpdate: string, item: ITemplateItem, allDbItems: Record<string, ITemplateItem>): void
    {
        this.itemBaseClassesCache[itemIdToUpdate].push(item._parent);
        const parent = allDbItems[item._parent];

        if (parent._parent !== "")
        {
            this.addBaseItems(itemIdToUpdate, parent, allDbItems);
        }
    }

    /**
     * Does item tpl inherit from the requested base class
     * @param itemTpl item to check base classes of
     * @param baseClass base class to check for
     * @returns true if item inherits from base class passed in
     */
    public itemHasBaseClass(itemTpl: string, baseClasses: string[]): boolean
    {
        if (!this.cacheGenerated)
        {
            this.hydrateItemBaseClassCache();
        }

        if (typeof itemTpl === "undefined")
        {
            this.logger.warning("Unable to check itemTpl base class as its undefined");

            return false;
        }

        // Edge case - this is the 'root' item that all other items inherit from
        if (itemTpl === BaseClasses.ITEM)
        {
            return false;
        }

        // No item in cache
        if (!this.itemBaseClassesCache[itemTpl])
        {
            // Hydrate again
            this.logger.warning(this.localisationService.getText("baseclass-item_not_found", itemTpl));
            this.hydrateItemBaseClassCache();

            // Check for item again, throw exception if not found
            if (!this.itemBaseClassesCache[itemTpl])
            {
                throw new Error(this.localisationService.getText("baseclass-item_not_found_failed", itemTpl));
            }
        }

        return this.itemBaseClassesCache[itemTpl].some((x) => baseClasses.includes(x));
    }

    /**
     * Get base classes item inherits from
     * @param itemTpl item to get base classes for
     * @returns array of base classes
     */
    public getItemBaseClasses(itemTpl: string): string[]
    {
        if (!this.cacheGenerated)
        {
            this.hydrateItemBaseClassCache();
        }

        if (!this.itemBaseClassesCache[itemTpl])
        {
            return [];
        }

        return this.itemBaseClassesCache[itemTpl];
    }
}
