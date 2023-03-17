import { inject, injectable } from "tsyringe";

import { BotGeneratorHelper } from "../helpers/BotGeneratorHelper";
import { BotWeaponGeneratorHelper } from "../helpers/BotWeaponGeneratorHelper";
import { HandbookHelper } from "../helpers/HandbookHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { Inventory as PmcInventory } from "../models/eft/common/tables/IBotBase";
import { IBotType, Inventory, ModsChances } from "../models/eft/common/tables/IBotType";
import { Item } from "../models/eft/common/tables/IItem";
import { ITemplateItem } from "../models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "../models/enums/BaseClasses";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { EquipmentSlots } from "../models/enums/EquipmentSlots";
import { LootCacheType } from "../models/spt/bots/BotLootCache";
import { IBotConfig } from "../models/spt/config/IBotConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { BotLootCacheService } from "../services/BotLootCacheService";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { RandomUtil } from "../utils/RandomUtil";
import { BotWeaponGenerator } from "./BotWeaponGenerator";

@injectable()
export class BotLootGenerator
{
    protected botConfig: IBotConfig;
    
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("BotWeaponGenerator") protected botWeaponGenerator: BotWeaponGenerator,
        @inject("BotWeaponGeneratorHelper") protected botWeaponGeneratorHelper: BotWeaponGeneratorHelper,
        @inject("BotLootCacheService") protected botLootCacheService: BotLootCacheService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Add loot to bots containers
     * @param sessionId Session id
     * @param botJsonTemplate Base json db file for the bot having its loot generated
     * @param isPmc Will bot be a pmc
     * @param botRole Role of bot, e.g. asssult
     * @param botInventory Inventory to add loot to
     * @param botLevel Level of bot
     */
    public generateLoot(sessionId: string, botJsonTemplate: IBotType, isPmc: boolean, botRole: string, botInventory: PmcInventory, botLevel: number): void
    {
        // Limits on item types to be added as loot
        const itemCounts = botJsonTemplate.generation.items;
        
        const nValue =  this.getBotLootNValue(isPmc);
        const looseLootMin = itemCounts.looseLoot.min;
        const looseLootMax = itemCounts.looseLoot.max;

        const lootItemCount = this.getRandomisedCount(looseLootMin, looseLootMax, nValue);
        const pocketLootCount = this.getRandomisedCount(1, 4, nValue);
        const vestLootCount = this.getRandomisedCount(Math.round(looseLootMin / 2), Math.round(looseLootMax / 2), nValue); // Count is half what loose loot min/max is
        const specialLootItemCount = this.getRandomisedCount(itemCounts.specialItems.min, itemCounts.specialItems.max, nValue);

        const healingItemCount = this.getRandomisedCount(itemCounts.healing.min, itemCounts.healing.max, 3);
        const drugItemCount = this.getRandomisedCount(itemCounts.drugs.min, itemCounts.drugs.max, 3);
        const stimItemCount = this.getRandomisedCount(itemCounts.stims.min, itemCounts.stims.max, 3);
        const grenadeCount = this.getRandomisedCount(itemCounts.grenades.min, itemCounts.grenades.max, 4);

        // Special items
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.SPECIAL, botJsonTemplate),
            [EquipmentSlots.POCKETS, EquipmentSlots.BACKPACK, EquipmentSlots.TACTICAL_VEST],
            specialLootItemCount,
            botInventory,
            botRole);

        // Meds
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.HEALING_ITEMS, botJsonTemplate),
            [EquipmentSlots.TACTICAL_VEST, EquipmentSlots.POCKETS, EquipmentSlots.BACKPACK, EquipmentSlots.SECURED_CONTAINER],
            healingItemCount,
            botInventory,
            botRole,
            false,
            0,
            isPmc);

        // Drugs
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.DRUG_ITEMS, botJsonTemplate),
            [EquipmentSlots.TACTICAL_VEST, EquipmentSlots.POCKETS, EquipmentSlots.BACKPACK, EquipmentSlots.SECURED_CONTAINER],
            drugItemCount,
            botInventory,
            botRole,
            false,
            0,
            isPmc);

        // Stims
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.STIM_ITEMS, botJsonTemplate),
            [EquipmentSlots.TACTICAL_VEST, EquipmentSlots.POCKETS, EquipmentSlots.BACKPACK, EquipmentSlots.SECURED_CONTAINER],
            stimItemCount,
            botInventory,
            botRole,
            true,
            0,
            isPmc);

        // Grenades
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.GRENADE_ITEMS, botJsonTemplate),
            [EquipmentSlots.TACTICAL_VEST, EquipmentSlots.POCKETS],
            grenadeCount,
            botInventory,
            botRole,
            false,
            0,
            isPmc);

        if (isPmc && this.randomUtil.getChance100(this.botConfig.pmc.looseWeaponInBackpackChancePercent))
        {
            this.addLooseWeaponsToInventorySlot(sessionId, botInventory, "Backpack", botJsonTemplate.inventory, botJsonTemplate.chances.mods, botRole, isPmc, botLevel);
        }

        // Backpack
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.BACKPACK, botJsonTemplate),
            [EquipmentSlots.BACKPACK],
            lootItemCount,
            botInventory,
            botRole,
            true,
            this.botConfig.pmc.maxBackpackLootTotalRub,
            isPmc);

        // Vest
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.VEST, botJsonTemplate),
            [EquipmentSlots.TACTICAL_VEST],
            vestLootCount,
            botInventory,
            botRole,
            true,
            this.botConfig.pmc.maxVestLootTotalRub,
            isPmc);

        // Pockets
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.POCKET, botJsonTemplate),
            [EquipmentSlots.POCKETS],
            pocketLootCount,
            botInventory,
            botRole,
            true,
            this.botConfig.pmc.maxPocketLootTotalRub,
            isPmc);
    }

    protected getRandomisedCount(min: number, max: number, nValue: number): number
    {
        const range = max - min;
        return this.randomUtil.getBiasedRandomNumber(min, max, range, nValue);
    }

    /**
     * Take random items from a pool and add to an inventory until totalItemCount or totalValueLimit is reached
     * @param pool pool of items to pick from
     * @param equipmentSlots What equality slot will the loot items be added to
     * @param totalItemCount Max count of items to add
     * @param inventoryToAddItemsTo bot inventory loot will be added to
     * @param botRole role of the bot loot is being generated for (assault/pmcbot)
     * @param useLimits should item limit counts be used as defined in config/bot.json
     * @param totalValueLimitRub total value of loot allowed in roubles
     * @param isPmc is the bot being generated for a pmc
     */
    protected addLootFromPool(
        pool: ITemplateItem[],
        equipmentSlots: string[],
        totalItemCount: number,
        inventoryToAddItemsTo: PmcInventory,
        botRole: string,
        useLimits = false,
        totalValueLimitRub = 0,
        isPmc = false): void
    {
        // Loot pool has items
        if (pool.length)
        {
            let currentTotalRub = 0;
            const itemLimits: Record<string, number> = {};
            const itemSpawnLimits: Record<string,Record<string, number>> = {};
            for (let i = 0; i < totalItemCount; i++)
            {
                const itemToAddTemplate = this.getRandomItemFromPool(pool, isPmc);
                const id = this.hashUtil.generate();
                const itemsToAdd: Item[] = [{
                    _id: id,
                    _tpl: itemToAddTemplate._id,
                    ...this.botGeneratorHelper.generateExtraPropertiesForItem(itemToAddTemplate)
                }];

                if (useLimits)
                {
                    if (Object.keys(itemLimits).length === 0)
                    {
                        this.initItemLimitArray(isPmc, botRole, itemLimits);
                    }

                    if (!itemSpawnLimits[botRole])
                    {
                        itemSpawnLimits[botRole] = this.getItemSpawnLimitsForBotType(isPmc, botRole);
                    }

                    if (this.itemHasReachedSpawnLimit(itemToAddTemplate, botRole, isPmc, itemLimits, itemSpawnLimits[botRole]))
                    {
                        i--;
                        continue;
                    }  
                }

                // Fill ammo box
                if (this.itemHelper.isOfBaseclass(itemToAddTemplate._id, BaseClasses.AMMO_BOX))
                {
                    this.itemHelper.addCartridgesToAmmoBox(itemsToAdd, itemToAddTemplate);
                }
                // make money a stack
                else if (this.itemHelper.isOfBaseclass(itemToAddTemplate._id, BaseClasses.MONEY))
                {
                    this.randomiseMoneyStackSize(isPmc, itemToAddTemplate, itemsToAdd[0]);
                }
                // Make ammo a stack
                else if (this.itemHelper.isOfBaseclass(itemToAddTemplate._id, BaseClasses.AMMO))
                {
                    this.randomiseAmmoStackSize(isPmc, itemToAddTemplate, itemsToAdd[0]);
                }

                this.botWeaponGeneratorHelper.addItemWithChildrenToEquipmentSlot(equipmentSlots, id, itemToAddTemplate._id, itemsToAdd, inventoryToAddItemsTo);

                // Stop adding items to bots pool if rolling total is over total limit
                if (totalValueLimitRub > 0)
                {
                    currentTotalRub += this.handbookHelper.getTemplatePrice(itemToAddTemplate._id);
                    if (currentTotalRub > totalValueLimitRub)
                    {
                        break;
                    }
                }
            }
        }
    }


    /**
     * Add generated weapons to inventory as loot
     * @param botInventory inventory to add preset to
     * @param equipmentSlot slot to place the preset in (backpack)
     * @param templateInventory bots template, assault.json
     * @param modChances chances for mods to spawn on weapon
     * @param botRole bots role, .e.g. pmcBot
     * @param isPmc are we generating for a pmc
     */
    protected addLooseWeaponsToInventorySlot(sessionId: string, botInventory: PmcInventory, equipmentSlot: string, templateInventory: Inventory, modChances: ModsChances, botRole: string, isPmc: boolean, botLevel: number): void
    {
        const chosenWeaponType = this.randomUtil.getArrayValue([EquipmentSlots.FIRST_PRIMARY_WEAPON, EquipmentSlots.FIRST_PRIMARY_WEAPON, EquipmentSlots.FIRST_PRIMARY_WEAPON, EquipmentSlots.HOLSTER]);
        const randomisedWeaponCount = this.randomUtil.getInt(this.botConfig.pmc.looseWeaponInBackpackLootMinMax.min, this.botConfig.pmc.looseWeaponInBackpackLootMinMax.max);
        if (randomisedWeaponCount > 0)
        {
            for (let i = 0; i < randomisedWeaponCount; i++)
            {
                const generatedWeapon = this.botWeaponGenerator.generateRandomWeapon(sessionId, chosenWeaponType, templateInventory, botInventory.equipment, modChances, botRole, isPmc, botLevel);
                this.botWeaponGeneratorHelper.addItemWithChildrenToEquipmentSlot([equipmentSlot], generatedWeapon.weapon[0]._id, generatedWeapon.weapon[0]._tpl, [...generatedWeapon.weapon], botInventory);
            }
        }
    }

    /**
     * Get a random item from the pool parameter using the biasedRandomNumber system
     * @param pool pool of items to pick an item from
     * @param isPmc is the bot being created a pmc
     * @returns ITemplateItem object
     */
    protected getRandomItemFromPool(pool: ITemplateItem[], isPmc: boolean): ITemplateItem
    {
        const itemIndex = this.randomUtil.getBiasedRandomNumber(0, pool.length - 1, pool.length - 1, this.getBotLootNValue(isPmc));
        return pool[itemIndex];
    }

    /**
     * Get the loot nvalue from botconfig
     * @param isPmc if true the pmc nvalue is returned
     * @returns nvalue as number
     */
    protected getBotLootNValue(isPmc: boolean): number
    {
        if (isPmc)
        {
            return this.botConfig.lootNValue["pmc"];
        }

        return this.botConfig.lootNValue["scav"];
    }

    /**
     * Update item limit array to contain items that have a limit
     * All values are set to 0
     * @param isPmc is the bot a pmc
     * @param botRole role the bot has
     * @param limitCount 
     */
    protected initItemLimitArray(isPmc: boolean, botRole: string, limitCount: Record<string, number>): void
    {
        // Init current count of items we want to limit
        const spawnLimits = this.getItemSpawnLimitsForBotType(isPmc, botRole);
        for (const limit in spawnLimits)
        {
            limitCount[limit] = 0;
        }
    }
    
    /**
     * Check if an item has reached its bot-specific spawn limit
     * @param itemTemplate Item we check to see if its reached spawn limit
     * @param botRole Bot type
     * @param isPmc Is bot we're working with a pmc
     * @param limitCount spawn limits for items on bot
     * @param itemSpawnLimits the limits this bot is allowed to have
     * @returns true if item has reached spawn limit
     */
    protected itemHasReachedSpawnLimit(itemTemplate: ITemplateItem, botRole: string, isPmc: boolean, limitCount: Record<string, number>, itemSpawnLimits: Record<string, number>): boolean
    {
        // PMCs and scavs have different sections of bot config for spawn limits
        if (!!itemSpawnLimits && itemSpawnLimits.length === 0)
        {
            // No items found in spawn limit, drop out
            return false;
        }

        // No spawn limits, skipping
        if (!itemSpawnLimits)
        {
            return false;
        }

        const idToCheckFor = this.getMatchingIdFromSpawnLimits(itemTemplate, itemSpawnLimits);
        if (!idToCheckFor)
        {
            // ParentId or tplid not found in spawnLimits, not a spawn limited item, skip
            return false;
        }

        // Increment item count with this bot type
        limitCount[idToCheckFor]++;

        // return true, we are over limit
        if (limitCount[idToCheckFor] > itemSpawnLimits[idToCheckFor])
        {
            if (limitCount[idToCheckFor] > itemSpawnLimits[idToCheckFor] * 10)
            {
                this.logger.warning(this.localisationService.getText("bot-item_spawn_limit_reached_skipping_item", {botRole: botRole, itemName: itemTemplate._name, attempts: limitCount[idToCheckFor]}));

                return false;
            }

            return true;
        }

        return false;
    }

    /**
     * Randomise the stack size of a money object, uses different values for pmc or scavs
     * @param isPmc is this a PMC
     * @param itemTemplate item details
     * @param moneyItem Money stack to randomise
     */
    protected randomiseMoneyStackSize(isPmc: boolean, itemTemplate: ITemplateItem, moneyItem: Item): void
    {
        // Only add if no upd or stack objects exist - preserves existing stack count
        if (!moneyItem.upd?.StackObjectsCount)
        {
            // PMCs have a different stack max size
            const minStackSize = itemTemplate._props.StackMinRandom;
            const maxStackSize = (isPmc)
                ? this.botConfig.pmc.dynamicLoot.moneyStackLimits[itemTemplate._id]
                : itemTemplate._props.StackMaxRandom;

            moneyItem.upd = { "StackObjectsCount":  this.randomUtil.getInt(minStackSize, maxStackSize) };
        }
    }

    /**
     * Randomise the size of an ammo stack
     * @param isPmc is this a PMC
     * @param itemTemplate item details
     * @param ammoItem Ammo stack to randomise
     */
    protected randomiseAmmoStackSize(isPmc: boolean, itemTemplate: ITemplateItem, ammoItem: Item): void
    {
        // only add if no upd or stack objects exist - preserves existing stack count
        if (!ammoItem.upd?.StackObjectsCount)
        {
            const minStackSize = itemTemplate._props.StackMinRandom;
            const maxStackSize = itemTemplate._props.StackMaxSize;

            ammoItem.upd = { "StackObjectsCount":  this.randomUtil.getInt(minStackSize, maxStackSize) };
        }
    }

    /**
     * Get spawn limits for a specific bot type from bot.json config
     * If no limit found for a non pmc bot, fall back to defaults
     * @param isPmc is the bot we want limits for a pmc
     * @param botRole what role does the bot have
     * @returns Dictionary of tplIds and limit
     */
    protected getItemSpawnLimitsForBotType(isPmc: boolean, botRole: string): Record<string, number>
    {
        if (isPmc)
        {
            return this.botConfig.itemSpawnLimits["pmc"];
        }

        if (this.botConfig.itemSpawnLimits[botRole.toLowerCase()])
        {
            return this.botConfig.itemSpawnLimits[botRole.toLowerCase()];
        }

        this.logger.warning(this.localisationService.getText("bot-unable_to_find_spawn_limits_fallback_to_defaults", botRole));

        return this.botConfig.itemSpawnLimits["default"];
    }

    /**
     * Get the parentId or tplId of item inside spawnLimits object if it exists
     * @param itemTemplate item we want to look for in spawn limits
     * @param spawnLimits Limits to check for item
     * @returns id as string, otherwise undefined
     */
    protected getMatchingIdFromSpawnLimits(itemTemplate: ITemplateItem, spawnLimits: Record<string, number>): string
    {
        
        if (itemTemplate._id in spawnLimits)
        {
            return itemTemplate._id;
        }

        // tplId not found in spawnLimits, check if parentId is
        if (itemTemplate._parent in spawnLimits)
        {
            return itemTemplate._parent;
        }

        // parentId and tplid not found
        return undefined;
    }
}