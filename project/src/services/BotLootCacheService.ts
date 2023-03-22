import { inject, injectable } from "tsyringe";

import { PMCLootGenerator } from "../generators/PMCLootGenerator";
import { ItemHelper } from "../helpers/ItemHelper";
import { IBotType } from "../models/eft/common/tables/IBotType";
import { ITemplateItem, Props } from "../models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "../models/enums/BaseClasses";
import { IBotLootCache, LootCacheType } from "../models/spt/bots/IBotLootCache";
import { ILogger } from "../models/spt/utils/ILogger";
import { DatabaseServer } from "../servers/DatabaseServer";
import { JsonUtil } from "../utils/JsonUtil";
import { LocalisationService } from "./LocalisationService";
import { RagfairPriceService } from "./RagfairPriceService";

@injectable()
export class BotLootCacheService
{
    protected lootCache: Record<string, IBotLootCache>;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("PMCLootGenerator") protected pmcLootGenerator: PMCLootGenerator,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService
    )
    {
        this.clearCache();
    }

    /**
     * Remove all cached bot loot data
     */
    public clearCache(): void
    {
        this.lootCache = {};
    }

    /**
     * Get the fully created loot array, ordered by price low to high
     * @param botRole bot to get loot for
     * @param isPmc is the bot a pmc
     * @param lootType what type of loot is needed (backpack/pocket/stim/vest etc)
     * @param botJsonTemplate Base json db file for the bot having its loot generated
     * @returns ITemplateItem array
     */
    public getLootFromCache(botRole: string, isPmc: boolean, lootType: LootCacheType, botJsonTemplate: IBotType): ITemplateItem[]
    {
        if (!this.botRoleExistsInCache(botRole))
        {
            this.initCacheForBotRole(botRole);
            this.addLootToCache(botRole, isPmc, botJsonTemplate);
        }

        switch (lootType)
        {
            case LootCacheType.SPECIAL:
                return this.lootCache[botRole].specialItems;
            case LootCacheType.BACKPACK:
                return this.lootCache[botRole].backpackLoot;
            case LootCacheType.POCKET:
                return this.lootCache[botRole].pocketLoot;
            case LootCacheType.VEST:
                return this.lootCache[botRole].vestLoot;
            case LootCacheType.COMBINED:
                return this.lootCache[botRole].combinedPoolLoot;
            case LootCacheType.HEALING_ITEMS:
                return this.lootCache[botRole].healingItems;
            case LootCacheType.GRENADE_ITEMS:
                return this.lootCache[botRole].grenadeItems;
            case LootCacheType.DRUG_ITEMS:
                return this.lootCache[botRole].drugItems;
            case LootCacheType.STIM_ITEMS:
                return this.lootCache[botRole].stimItems;
            default:
                this.logger.error(this.localisationService.getText("bot-loot_type_not_found", {lootType: lootType, botRole: botRole, isPmc: isPmc}));
                break;
        }
    }

    /**
     * Generate loot for a bot and store inside a private class property
     * @param botRole bots role (assault / pmcBot etc)
     * @param isPmc Is the bot a PMC (alteres what loot is cached)
     * @param botJsonTemplate db template for bot having its loot generated
     */
    protected addLootToCache(botRole: string, isPmc: boolean, botJsonTemplate: IBotType): void
    {
        // the full pool of loot we use to create the various sub-categories with
        const lootPool = botJsonTemplate.inventory.items;

        // Flatten all individual slot loot pools into one big pool, while filtering out potentially missing templates
        const specialLootTemplates: ITemplateItem[] = [];
        const backpackLootTemplates: ITemplateItem[] = [];
        const pocketLootTemplates: ITemplateItem[] = [];
        const vestLootTemplates: ITemplateItem[] = [];
        const combinedPoolTemplates: ITemplateItem[] = [];

        if (isPmc)
        {
            // Replace lootPool passed in with our own generated list if bot is a pmc
            lootPool.Backpack = this.jsonUtil.clone(this.pmcLootGenerator.generatePMCBackpackLootPool());
            lootPool.Pockets = this.jsonUtil.clone(this.pmcLootGenerator.generatePMCPocketLootPool());
            lootPool.TacticalVest = this.jsonUtil.clone(this.pmcLootGenerator.generatePMCVestLootPool());
        }

        for (const [slot, pool] of Object.entries(lootPool))
        {
            // No items to add, skip
            if (!pool?.length)
            {
                continue;
            }

            // Sort loot pool into separate buckets
            let itemsToAdd: ITemplateItem[] = [];
            const items = this.databaseServer.getTables().templates.items;
            switch (slot.toLowerCase())
            {
                case "specialloot":
                    itemsToAdd = pool.map((lootTpl: string) => items[lootTpl]);
                    this.addUniqueItemsToPool(specialLootTemplates, itemsToAdd);
                    break;
                case "pockets":
                    itemsToAdd = pool.map((lootTpl: string) => items[lootTpl]);
                    this.addUniqueItemsToPool(pocketLootTemplates, itemsToAdd);
                    break;
                case "tacticalvest":
                    itemsToAdd = pool.map((lootTpl: string) => items[lootTpl]);
                    this.addUniqueItemsToPool(vestLootTemplates, itemsToAdd);
                    break;
                case "securedcontainer":
                    // Don't add these items to loot pool
                    break;
                default:
                    itemsToAdd = pool.map((lootTpl: string) => items[lootTpl]);
                    this.addUniqueItemsToPool(backpackLootTemplates, itemsToAdd);
            }
            
            // Add items to combined pool if any exist
            if (Object.keys(itemsToAdd).length > 0)
            {
                this.addUniqueItemsToPool(combinedPoolTemplates, itemsToAdd);
            }
        }

        // Sort all items by their worth
        this.sortPoolByRagfairPrice(specialLootTemplates);
        this.sortPoolByRagfairPrice(backpackLootTemplates);
        this.sortPoolByRagfairPrice(pocketLootTemplates);
        this.sortPoolByRagfairPrice(vestLootTemplates);
        this.sortPoolByRagfairPrice(combinedPoolTemplates);

        // use whitelist if array has values, otherwise process above sorted pools
        const specialLootItems = (botJsonTemplate.generation.items.specialItems.whitelist?.length > 0)
            ? botJsonTemplate.generation.items.specialItems.whitelist.map(x => this.itemHelper.getItem(x)[1])
            : specialLootTemplates.filter(template =>
                !(this.isBulletOrGrenade(template._props)
                || this.isMagazine(template._props)));

        const healingItems = (botJsonTemplate.generation.items.healing.whitelist?.length > 0)
            ? botJsonTemplate.generation.items.healing.whitelist.map(x => this.itemHelper.getItem(x)[1])
            : combinedPoolTemplates.filter(template =>
                this.isMedicalItem(template._props)
                && template._parent !== BaseClasses.STIMULATOR
                && template._parent !== BaseClasses.DRUGS);

        const drugItems = (botJsonTemplate.generation.items.drugs.whitelist?.length > 0)
            ? botJsonTemplate.generation.items.drugs.whitelist.map(x => this.itemHelper.getItem(x)[1])
            : combinedPoolTemplates.filter(template =>
                this.isMedicalItem(template._props)
                && template._parent === BaseClasses.DRUGS);

        const stimItems = (botJsonTemplate.generation.items.stims.whitelist?.length > 0)
            ? botJsonTemplate.generation.items.stims.whitelist.map(x => this.itemHelper.getItem(x)[1])
            : combinedPoolTemplates.filter(template =>
                this.isMedicalItem(template._props)
                && template._parent === BaseClasses.STIMULATOR);

        const grenadeItems = (botJsonTemplate.generation.items.grenades.whitelist?.length > 0)
            ? botJsonTemplate.generation.items.grenades.whitelist.map(x => this.itemHelper.getItem(x)[1])
            : combinedPoolTemplates.filter(template =>
                this.isGrenade(template._props));

        // Get loot items (excluding magazines, bullets, grenades and healing items)
        const backpackLootItems = backpackLootTemplates.filter(template =>
            // rome-ignore lint/complexity/useSimplifiedLogicExpression: <explanation>
            !this.isBulletOrGrenade(template._props)
            && !this.isMagazine(template._props)
            && !this.isMedicalItem(template._props)
            && !this.isGrenade(template._props));

        // Get pocket loot
        const pocketLootItems = pocketLootTemplates.filter(template =>
            // rome-ignore lint/complexity/useSimplifiedLogicExpression: <explanation>
            !this.isBulletOrGrenade(template._props)
            && !this.isMagazine(template._props)
            && !this.isMedicalItem(template._props)
            && !this.isGrenade(template._props)
            && ("Height" in template._props)
            && ("Width" in template._props));

        // Get vest loot items
        const vestLootItems = vestLootTemplates.filter(template =>
            // rome-ignore lint/complexity/useSimplifiedLogicExpression: <explanation>
            !this.isBulletOrGrenade(template._props)
            && !this.isMagazine(template._props)
            && !this.isMedicalItem(template._props)
            && !this.isGrenade(template._props));

        this.lootCache[botRole].healingItems = healingItems;
        this.lootCache[botRole].drugItems = drugItems;
        this.lootCache[botRole].stimItems = stimItems;
        this.lootCache[botRole].grenadeItems = grenadeItems;

        this.lootCache[botRole].specialItems = specialLootItems;
        this.lootCache[botRole].backpackLoot = backpackLootItems;
        this.lootCache[botRole].pocketLoot = pocketLootItems;
        this.lootCache[botRole].vestLoot = vestLootItems;
    }

    /**
     * Sort a pool of item objects by its flea price
     * @param poolToSort pool of items to sort
     */
    protected sortPoolByRagfairPrice(poolToSort: ITemplateItem[]): void
    {
        poolToSort.sort((a, b) => this.compareByValue(this.ragfairPriceService.getFleaPriceForItem(a._id), this.ragfairPriceService.getFleaPriceForItem(b._id)));
    }

    /**
     * Add unique items into combined pool
     * @param combinedItemPool Pool of items to add to
     * @param itemsToAdd items to add to combined pool if unique
     */
    protected addUniqueItemsToPool(combinedItemPool: ITemplateItem[], itemsToAdd: ITemplateItem[]): void
    {
        if (combinedItemPool.length === 0)
        {
            combinedItemPool.push(...itemsToAdd);
            return;
        }

        const mergedItemPools = [...combinedItemPool, ...itemsToAdd];

        // Save only unique array values
        const uniqueResults = [... new Set([].concat(...mergedItemPools))];
        combinedItemPool.splice(0, combinedItemPool.length);
        combinedItemPool.push(...uniqueResults);
    }

    /**
     * Ammo/grenades have this property
     * @param props 
     * @returns 
     */
    protected isBulletOrGrenade(props: Props): boolean
    {
        return ("ammoType" in props);
    }

    /**
     * Internal and external magazine have this property
     * @param props 
     * @returns 
     */
    protected isMagazine(props: Props): boolean
    {
        return ("ReloadMagType" in props);
    }

    /**
     * Medical use items (e.g. morphine/lip balm/grizzly)
     * @param props 
     * @returns 
     */
    protected isMedicalItem(props: Props): boolean
    {
        return ("medUseTime" in props);
    }

    /**
     * Grenades have this property (e.g. smoke/frag/flash grenades)
     * @param props 
     * @returns 
     */
    protected isGrenade(props: Props): boolean
    {
        return ("ThrowType" in props);
    }

    /**
     * Check if a bot type exists inside the loot cache
     * @param botRole role to check for
     * @returns true if they exist
     */
    protected botRoleExistsInCache(botRole: string): boolean
    {
        return !!this.lootCache[botRole];
    }

    /**
     * If lootcache is null, init with empty property arrays
     * @param botRole Bot role to hydrate
     */
    protected initCacheForBotRole(botRole: string): void
    {
        this.lootCache[botRole] = {
            backpackLoot: [],
            pocketLoot: [],
            vestLoot: [],
            combinedPoolLoot: [],

            specialItems: [],
            grenadeItems: [],
            drugItems: [],
            healingItems: [],
            stimItems: []
        };
    }

    /**
     * Compares two item prices by their flea (or handbook if that doesnt exist) price
     * -1 when a < b
     * 0 when a === b
     * 1 when a > b
     * @param itemAPrice 
     * @param itemBPrice 
     * @returns 
     */
    protected compareByValue(itemAPrice: number, itemBPrice: number): number
    {
        // If item A has no price, it should be moved to the back when sorting
        if (!itemAPrice)
        {
            return 1;
        }

        if (!itemBPrice)
        {
            return -1;
        }

        if (itemAPrice < itemBPrice)
        {
            return -1;
        }

        if (itemAPrice > itemBPrice)
        {
            return 1;
        }

        return 0;
    }
    
}