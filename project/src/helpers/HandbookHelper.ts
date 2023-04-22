import { inject, injectable } from "tsyringe";

import { Money } from "../models/enums/Money";
import { DatabaseServer } from "../servers/DatabaseServer";

class LookupItem<T, I>
{
    readonly byId: Map<string, T>;
    readonly byParent: Map<string, I[]>;

    constructor()
    {
        this.byId = new Map();
        this.byParent = new Map();
    }
}

export class LookupCollection
{
    readonly items: LookupItem<number, string>;
    readonly categories: LookupItem<string, string>;

    constructor()
    {
        this.items = new LookupItem<number, string>();
        this.categories = new LookupItem<string, string>();
    }
}

@injectable()
export class HandbookHelper
{    
    protected lookupCacheGenerated = false;
    protected handbookPriceCache = new LookupCollection();

    constructor(@inject("DatabaseServer") protected databaseServer: DatabaseServer)
    {}

    public hydrateLookup(): void
    {
        const handbookDb = this.databaseServer.getTables().templates.handbook;
        for (const handbookItem of handbookDb.Items)
        {
            this.handbookPriceCache.items.byId.set(handbookItem.Id, handbookItem.Price);
            if (!this.handbookPriceCache.items.byParent.has(handbookItem.ParentId))
            {
                this.handbookPriceCache.items.byParent.set(handbookItem.ParentId, []);
            }
            this.handbookPriceCache.items.byParent
                .get(handbookItem.ParentId)
                .push(handbookItem.Id);
        }

        for (const handbookCategory of handbookDb.Categories)
        {
            this.handbookPriceCache.categories.byId.set(handbookCategory.Id, handbookCategory.ParentId || null);
            if (handbookCategory.ParentId)
            {
                if (!this.handbookPriceCache.categories.byParent.has(handbookCategory.ParentId))
                {
                    this.handbookPriceCache.categories.byParent.set(handbookCategory.ParentId, []);
                }
                this.handbookPriceCache.categories.byParent
                    .get(handbookCategory.ParentId)
                    .push(handbookCategory.Id);
            }
        }
    }

    /**
     * Get price from internal cache, if cache empty look up price directly in handbook (expensive)
     * If no values found, return 1
     * @param tpl item tpl to look up price for
     * @returns price in roubles
     */
    public getTemplatePrice(tpl: string): number
    {
        if (!this.lookupCacheGenerated)
        {
            this.hydrateLookup();
            this.lookupCacheGenerated = true;
        }

        if (this.handbookPriceCache.items.byId.has(tpl))
        {
            return this.handbookPriceCache.items.byId[tpl];
        }

        const handbookItem = this.databaseServer.getTables().templates.handbook.Items.find(x => x.Id === tpl);

        return handbookItem
            ? handbookItem.Price
            : 1;
    }

    /**
     * all items in template with the given parent category
     * @param x 
     * @returns string array
     */
    public templatesWithParent(x: string): string[]
    {
        return this.handbookPriceCache.items.byParent.get(x) ?? [];
    }

    /**
     * Does category exist in handbook cache
     * @param category 
     * @returns true if exists in cache
     */
    public isCategory(category: string): boolean
    {
        return this.handbookPriceCache.categories.byId.has(category);
    }

    public childrenCategories(x: string): string[]
    {
        return this.handbookPriceCache.categories.byParent.get(x) ?? [];
    }

    /**
     * Convert non-roubles into roubles
     * @param nonRoubleCurrencyCount Currency count to convert
     * @param currencyTypeFrom What current currency is
     * @returns Count in roubles
     */
    public inRUB(nonRoubleCurrencyCount: number, currencyTypeFrom: string): number
    {
        if (currencyTypeFrom === Money.ROUBLES)
        {
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
    public fromRUB(roubleCurrencyCount: number, currencyTypeTo: string): number
    {
        if (currencyTypeTo === Money.ROUBLES)
        {
            return roubleCurrencyCount;
        }

        // Get price of currency from handbook
        const price = this.getTemplatePrice(currencyTypeTo);
        return price ? Math.round(roubleCurrencyCount / price) : 0;
    }
}