import { inject, injectable } from "tsyringe";

import { PMCLootGenerator } from "@spt-aki/generators/PMCLootGenerator";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { IBotType } from "@spt-aki/models/eft/common/tables/IBotType";
import { ITemplateItem, Props } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { IBotLootCache, LootCacheType } from "@spt-aki/models/spt/bots/IBotLootCache";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { RagfairPriceService } from "@spt-aki/services/RagfairPriceService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

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
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
    )
    {
        this.clearCache();
    }

    /**
     * Remove cached bot loot data
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
    public getLootFromCache(
        botRole: string,
        isPmc: boolean,
        lootType: LootCacheType,
        botJsonTemplate: IBotType,
    ): Record<string, number>
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
            case LootCacheType.SECURE:
                return this.lootCache[botRole].secureLoot;
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
                this.logger.error(
                    this.localisationService.getText("bot-loot_type_not_found", {
                        lootType: lootType,
                        botRole: botRole,
                        isPmc: isPmc,
                    }),
                );
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
        const specialLootPool: Record<string, number> = {};
        const backpackLootPool: Record<string, number> = {};
        const pocketLootPool: Record<string, number> = {};
        const vestLootPool: Record<string, number> = {};
        const secureLootTPool: Record<string, number> = {};
        const combinedLootPool: Record<string, number> = {};

        if (isPmc)
        {
            // Replace lootPool from bot json with our own generated list for PMCs
            lootPool.Backpack = this.jsonUtil.clone(this.pmcLootGenerator.generatePMCBackpackLootPool(botRole));
            lootPool.Pockets = this.jsonUtil.clone(this.pmcLootGenerator.generatePMCPocketLootPool(botRole));
            lootPool.TacticalVest = this.jsonUtil.clone(this.pmcLootGenerator.generatePMCVestLootPool(botRole));
        }

        // Backpack/Pockets etc
        for (const [slot, pool] of Object.entries(lootPool))
        {
            // No items to add, skip
            if (Object.keys(pool).length === 0)
            {
                continue;
            }

            // Sort loot pool into separate buckets
            switch (slot.toLowerCase())
            {
                case "specialloot":
                    this.addItemsToPool(specialLootPool, pool);
                    break;
                case "pockets":
                    this.addItemsToPool(pocketLootPool, pool);
                    break;
                case "tacticalvest":
                    this.addItemsToPool(vestLootPool, pool);
                    break;
                case "securedcontainer":
                    this.addItemsToPool(secureLootTPool, pool);
                    break;
                case "backpack":
                    this.addItemsToPool(backpackLootPool, pool);
                    break;
                default:
                    this.logger.warning(`How did you get here ${slot}`);
            }

            // Add all items (if any) to combined pool (excluding secure)
            if (Object.keys(pool).length > 0 && slot.toLowerCase() !== "securedcontainer")
            {
                this.addItemsToPool(combinedLootPool, pool);
            }
        }

        // Assign whitelisted special items to bot if any exist
        const specialLootItems: Record<string, number> =
            (Object.keys(botJsonTemplate.generation.items.specialItems.whitelist)?.length > 0)
                ? botJsonTemplate.generation.items.specialItems.whitelist
                : {};

        // no whitelist, find and assign from combined item pool
        if (Object.keys(specialLootItems).length === 0)
        {
            for (const [tpl, weight] of Object.entries(specialLootPool))
            {
                const itemTemplate = this.itemHelper.getItem(tpl)[1];
                if (!(this.isBulletOrGrenade(itemTemplate._props) || this.isMagazine(itemTemplate._props)))
                {
                    specialLootItems[tpl] = weight;
                }
            }
        }

        // Assign whitelisted healing items to bot if any exist
        const healingItems: Record<string, number> =
            (Object.keys(botJsonTemplate.generation.items.healing.whitelist)?.length > 0)
                ? botJsonTemplate.generation.items.healing.whitelist
                : {};

        // No whitelist, find and assign from combined item pool
        if (Object.keys(healingItems).length === 0)
        {
            for (const [tpl, weight] of Object.entries(combinedLootPool))
            {
                const itemTemplate = this.itemHelper.getItem(tpl)[1];
                if (
                    this.isMedicalItem(itemTemplate._props)
                    && itemTemplate._parent !== BaseClasses.STIMULATOR
                    && itemTemplate._parent !== BaseClasses.DRUGS
                )
                {
                    healingItems[tpl] = weight;
                }
            }
        }

        // Assign whitelisted drugs to bot if any exist
        const drugItems: Record<string, number> =
            (Object.keys(botJsonTemplate.generation.items.drugs.whitelist)?.length > 0)
                ? botJsonTemplate.generation.items.drugs.whitelist
                : {};

        // no whitelist, find and assign from combined item pool
        if (Object.keys(drugItems).length === 0)
        {
            for (const [tpl, weight] of Object.entries(combinedLootPool))
            {
                const itemTemplate = this.itemHelper.getItem(tpl)[1];
                if (this.isMedicalItem(itemTemplate._props) && itemTemplate._parent === BaseClasses.DRUGS)
                {
                    drugItems[tpl] = weight;
                }
            }
        }

        // Assign whitelisted stims to bot if any exist
        const stimItems: Record<string, number> =
            (Object.keys(botJsonTemplate.generation.items.stims.whitelist)?.length > 0)
                ? botJsonTemplate.generation.items.stims.whitelist
                : {};

        // No whitelist, find and assign from combined item pool
        if (Object.keys(stimItems).length === 0)
        {
            for (const [tpl, weight] of Object.entries(combinedLootPool))
            {
                const itemTemplate = this.itemHelper.getItem(tpl)[1];
                if (this.isMedicalItem(itemTemplate._props) && itemTemplate._parent === BaseClasses.STIMULATOR)
                {
                    stimItems[tpl] = weight;
                }
            }
        }

        // Assign whitelisted grenades to bot if any exist
        const grenadeItems: Record<string, number> =
            (Object.keys(botJsonTemplate.generation.items.grenades.whitelist)?.length > 0)
                ? botJsonTemplate.generation.items.grenades.whitelist
                : {};

        // no whitelist, find and assign from combined item pool
        if (Object.keys(grenadeItems).length === 0)
        {
            for (const [tpl, weight] of Object.entries(combinedLootPool))
            {
                const itemTemplate = this.itemHelper.getItem(tpl)[1];
                if (this.isGrenade(itemTemplate._props))
                {
                    grenadeItems[tpl] = weight;
                }
            }
        }

        // Get backpack loot (excluding magazines, bullets, grenades and healing items)
        const filteredBackpackItems = {};
        for (const itemKey of Object.keys(backpackLootPool))
        {
            const itemResult = this.itemHelper.getItem(itemKey);
            if (!itemResult[0])
            {
                continue;
            }
            const itemTemplate = itemResult[1];
            if (
                this.isBulletOrGrenade(itemTemplate._props)
                || this.isMagazine(itemTemplate._props)
                || this.isMedicalItem(itemTemplate._props)
                || this.isGrenade(itemTemplate._props)
            )
            {
                // Is type we dont want as backpack loot, skip
                continue;
            }

            filteredBackpackItems[itemKey] = backpackLootPool[itemKey];
        }

        // Get pocket loot (excluding magazines, bullets, grenades, medical and healing items)
        const filteredPocketItems = {};
        for (const itemKey of Object.keys(pocketLootPool))
        {
            const itemResult = this.itemHelper.getItem(itemKey);
            if (!itemResult[0])
            {
                continue;
            }
            const itemTemplate = itemResult[1];
            if (
                this.isBulletOrGrenade(itemTemplate._props)
                || this.isMagazine(itemTemplate._props)
                || this.isMedicalItem(itemTemplate._props)
                || this.isGrenade(itemTemplate._props)
                || !("Height" in itemTemplate._props) // lacks height
                || !("Width" in itemTemplate._props) // lacks width
            )
            {
                continue;
            }

            filteredPocketItems[itemKey] = pocketLootPool[itemKey];
        }

        // Get vest loot (excluding magazines, bullets, grenades, medical and healing items)
        const filteredVestItems = {};
        for (const itemKey of Object.keys(vestLootPool))
        {
            const itemResult = this.itemHelper.getItem(itemKey);
            if (!itemResult[0])
            {
                continue;
            }
            const itemTemplate = itemResult[1];
            if (
                this.isBulletOrGrenade(itemTemplate._props)
                || this.isMagazine(itemTemplate._props)
                || this.isMedicalItem(itemTemplate._props)
                || this.isGrenade(itemTemplate._props)
            )
            {
                continue;
            }

            filteredVestItems[itemKey] = vestLootPool[itemKey];
        }

        this.lootCache[botRole].healingItems = healingItems;
        this.lootCache[botRole].drugItems = drugItems;
        this.lootCache[botRole].stimItems = stimItems;
        this.lootCache[botRole].grenadeItems = grenadeItems;

        this.lootCache[botRole].specialItems = specialLootItems;
        this.lootCache[botRole].backpackLoot = filteredBackpackItems;
        this.lootCache[botRole].pocketLoot = filteredPocketItems;
        this.lootCache[botRole].vestLoot = filteredVestItems;
        this.lootCache[botRole].secureLoot = secureLootTPool;
    }

    /**
     * Add unique items into combined pool
     * @param poolToAddTo Pool of items to add to
     * @param itemsToAdd items to add to combined pool if unique
     */
    protected addUniqueItemsToPool(poolToAddTo: ITemplateItem[], itemsToAdd: ITemplateItem[]): void
    {
        if (poolToAddTo.length === 0)
        {
            poolToAddTo.push(...itemsToAdd);
            return;
        }

        const mergedItemPools = [...poolToAddTo, ...itemsToAdd];

        // Save only unique array values
        const uniqueResults = [...new Set([].concat(...mergedItemPools))];
        poolToAddTo.splice(0, poolToAddTo.length);
        poolToAddTo.push(...uniqueResults);
    }

    protected addItemsToPool(poolToAddTo: Record<string, number>, poolOfItemsToAdd: Record<string, number>): void
    {
        for (const tpl in poolOfItemsToAdd)
        {
            // Skip adding items that already exist
            if (poolToAddTo[tpl])
            {
                continue;
            }

            poolToAddTo[tpl] = poolOfItemsToAdd[tpl];
        }
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
            backpackLoot: {},
            pocketLoot: {},
            vestLoot: {},
            secureLoot: {},
            combinedPoolLoot: {},

            specialItems: {},
            grenadeItems: {},
            drugItems: {},
            healingItems: {},
            stimItems: {},
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
