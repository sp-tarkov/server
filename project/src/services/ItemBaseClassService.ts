import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { inject, injectable } from "tsyringe";

/**
 * Cache the baseids for each item in the tiems db inside a dictionary
 */
@injectable()
export class ItemBaseClassService {
    protected itemBaseClassesCache: Record<string, string[]> = {};
    protected items: Record<string, ITemplateItem>;
    protected cacheGenerated = false;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("DatabaseService") protected databaseService: DatabaseService,
    ) {}

    /**
     * Create cache and store inside ItemBaseClassService
     * Store a dict of an items tpl to the base classes it and its parents have
     */
    public hydrateItemBaseClassCache(): void {
        // Clear existing cache
        this.itemBaseClassesCache = {};

        this.items = this.databaseService.getItems();
        if (!this.items) {
            this.logger.warning(this.localisationService.getText("baseclass-missing_db_no_cache"));

            return;
        }

        const filteredDbItems = Object.values(this.items).filter((x) => x._type === "Item");
        for (const item of filteredDbItems) {
            const itemIdToUpdate = item._id;
            if (!this.itemBaseClassesCache[item._id]) {
                this.itemBaseClassesCache[item._id] = [];
            }

            this.addBaseItems(itemIdToUpdate, item);
        }

        this.cacheGenerated = true;
    }

    /**
     * Helper method, recursivly iterate through items parent items, finding and adding ids to dictionary
     * @param itemIdToUpdate item tpl to store base ids against in dictionary
     * @param item item being checked
     */
    protected addBaseItems(itemIdToUpdate: string, item: ITemplateItem): void {
        this.itemBaseClassesCache[itemIdToUpdate].push(item._parent);
        const parent = this.items[item._parent];

        if (parent._parent !== "") {
            this.addBaseItems(itemIdToUpdate, parent);
        }
    }

    /**
     * Does item tpl inherit from the requested base class
     * @param itemTpl item to check base classes of
     * @param baseClass base class to check for
     * @returns true if item inherits from base class passed in
     */
    public itemHasBaseClass(itemTpl: string, baseClasses: string[]): boolean {
        if (!this.cacheGenerated) {
            this.hydrateItemBaseClassCache();
        }

        if (typeof itemTpl === "undefined") {
            this.logger.warning("Unable to check itemTpl base class as its undefined");

            return false;
        }

        // The cache is only generated for item templates with `_type === "Item"`, so return false for any other type,
        // including item templates that simply don't exist.
        if (!this.cachedItemIsOfItemType(itemTpl)) {
            return false;
        }

        // No item in cache
        if (!this.itemBaseClassesCache[itemTpl]) {
            // Hydrate again
            this.logger.debug(this.localisationService.getText("baseclass-item_not_found", itemTpl));
            this.hydrateItemBaseClassCache();

            // Check for item again, throw exception if not found
            if (!this.itemBaseClassesCache[itemTpl]) {
                throw new Error(this.localisationService.getText("baseclass-item_not_found_failed", itemTpl));
            }
        }

        return this.itemBaseClassesCache[itemTpl].some((x) => baseClasses.includes(x));
    }

    /**
     * Check if cached item template is of type Item
     * @param itemTemplateId item to check
     * @returns true if item is of type Item
     */
    private cachedItemIsOfItemType(itemTemplateId: string): boolean {
        return this.items[itemTemplateId]?._type === "Item";
    }

    /**
     * Get base classes item inherits from
     * @param itemTpl item to get base classes for
     * @returns array of base classes
     */
    public getItemBaseClasses(itemTpl: string): string[] {
        if (!this.cacheGenerated) {
            this.hydrateItemBaseClassCache();
        }

        if (!this.itemBaseClassesCache[itemTpl]) {
            return [];
        }

        return this.itemBaseClassesCache[itemTpl];
    }
}
