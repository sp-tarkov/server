import { IHandbookCategory } from "@spt/models/eft/common/tables/IHandbookBase";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Money } from "@spt/models/enums/Money";
import { IItemConfig } from "@spt/models/spt/config/IItemConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

class LookupItem<T, I> {
    readonly byId: Map<string, T>;
    readonly byParent: Map<string, I[]>;

    constructor() {
        this.byId = new Map();
        this.byParent = new Map();
    }
}

export class LookupCollection {
    readonly items: LookupItem<number, string>;
    readonly categories: LookupItem<string, string>;

    constructor() {
        this.items = new LookupItem<number, string>();
        this.categories = new LookupItem<string, string>();
    }
}

@injectable()
export class HandbookHelper {
    protected itemConfig: IItemConfig;
    protected lookupCacheGenerated = false;
    protected handbookPriceCache = new LookupCollection();

    constructor(
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.itemConfig = this.configServer.getConfig(ConfigTypes.ITEM);
    }

    /**
     * Create an in-memory cache of all items with associated handbook price in handbookPriceCache class
     */
    public hydrateLookup(): void {
        const handbook = this.databaseService.getHandbook();
        // Add handbook overrides found in items.json config into db
        for (const itemTplKey of Object.keys(this.itemConfig.handbookPriceOverride)) {
            const data = this.itemConfig.handbookPriceOverride[itemTplKey];

            let itemToUpdate = handbook.Items.find((item) => item.Id === itemTplKey);
            if (!itemToUpdate) {
                handbook.Items.push({
                    Id: itemTplKey,
                    ParentId: data.parentId,
                    Price: data.price,
                });
                itemToUpdate = handbook.Items.find((item) => item.Id === itemTplKey);
            }

            itemToUpdate.Price = data.price;
        }

        const handbookDbClone = this.cloner.clone(handbook);
        for (const handbookItem of handbookDbClone.Items) {
            this.handbookPriceCache.items.byId.set(handbookItem.Id, handbookItem.Price);
            if (!this.handbookPriceCache.items.byParent.has(handbookItem.ParentId)) {
                this.handbookPriceCache.items.byParent.set(handbookItem.ParentId, []);
            }
            this.handbookPriceCache.items.byParent.get(handbookItem.ParentId).push(handbookItem.Id);
        }

        for (const handbookCategory of handbookDbClone.Categories) {
            this.handbookPriceCache.categories.byId.set(handbookCategory.Id, handbookCategory.ParentId || undefined);
            if (handbookCategory.ParentId) {
                if (!this.handbookPriceCache.categories.byParent.has(handbookCategory.ParentId)) {
                    this.handbookPriceCache.categories.byParent.set(handbookCategory.ParentId, []);
                }
                this.handbookPriceCache.categories.byParent.get(handbookCategory.ParentId).push(handbookCategory.Id);
            }
        }
    }

    /**
     * Get price from internal cache, if cache empty look up price directly in handbook (expensive)
     * If no values found, return 0
     * @param tpl Item tpl to look up price for
     * @returns price in roubles
     */
    public getTemplatePrice(tpl: string): number {
        if (!this.lookupCacheGenerated) {
            this.hydrateLookup();
            this.lookupCacheGenerated = true;
        }

        if (this.handbookPriceCache.items.byId.has(tpl)) {
            return this.handbookPriceCache.items.byId.get(tpl);
        }

        const handbookItem = this.databaseService.getHandbook().Items.find((item) => item.Id === tpl);
        if (!handbookItem) {
            const newValue = 0;
            this.handbookPriceCache.items.byId.set(tpl, newValue);

            return newValue;
        }

        this.handbookPriceCache.items.byId.set(tpl, handbookItem.Price);
        return handbookItem.Price;
    }

    public getTemplatePriceForItems(items: IItem[]): number {
        let total = 0;
        for (const item of items) {
            total += this.getTemplatePrice(item._tpl);
        }

        return total;
    }

    /**
     * Get all items in template with the given parent category
     * @param parentId
     * @returns string array
     */
    public templatesWithParent(parentId: string): string[] {
        return this.handbookPriceCache.items.byParent.get(parentId) ?? [];
    }

    /**
     * Does category exist in handbook cache
     * @param category
     * @returns true if exists in cache
     */
    public isCategory(category: string): boolean {
        return this.handbookPriceCache.categories.byId.has(category);
    }

    /**
     * Get all items associated with a categories parent
     * @param categoryParent
     * @returns string array
     */
    public childrenCategories(categoryParent: string): string[] {
        return this.handbookPriceCache.categories.byParent.get(categoryParent) ?? [];
    }

    /**
     * Convert non-roubles into roubles
     * @param nonRoubleCurrencyCount Currency count to convert
     * @param currencyTypeFrom What current currency is
     * @returns Count in roubles
     */
    public inRUB(nonRoubleCurrencyCount: number, currencyTypeFrom: string): number {
        if (currencyTypeFrom === Money.ROUBLES) {
            return nonRoubleCurrencyCount;
        }

        return Math.round(nonRoubleCurrencyCount * (this.getTemplatePrice(currencyTypeFrom) || 0));
    }

    /**
     * Convert roubles into another currency
     * @param roubleCurrencyCount roubles to convert
     * @param currencyTypeTo Currency to convert roubles into
     * @returns currency count in desired type
     */
    public fromRUB(roubleCurrencyCount: number, currencyTypeTo: string): number {
        if (currencyTypeTo === Money.ROUBLES) {
            return roubleCurrencyCount;
        }

        // Get price of currency from handbook
        const price = this.getTemplatePrice(currencyTypeTo);
        return price ? Math.max(1, Math.round(roubleCurrencyCount / price)) : 0;
    }

    public getCategoryById(handbookId: string): IHandbookCategory {
        return this.databaseService.getHandbook().Categories.find((category) => category.Id === handbookId);
    }
}
