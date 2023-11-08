import { inject, injectable } from "tsyringe";

import { BotWeaponGenerator } from "@spt-aki/generators/BotWeaponGenerator";
import { BotGeneratorHelper } from "@spt-aki/helpers/BotGeneratorHelper";
import { BotWeaponGeneratorHelper } from "@spt-aki/helpers/BotWeaponGeneratorHelper";
import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { WeightedRandomHelper } from "@spt-aki/helpers/WeightedRandomHelper";
import { Inventory as PmcInventory } from "@spt-aki/models/eft/common/tables/IBotBase";
import { IBotType, Inventory, ModsChances } from "@spt-aki/models/eft/common/tables/IBotType";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { EquipmentSlots } from "@spt-aki/models/enums/EquipmentSlots";
import { ItemAddedResult } from "@spt-aki/models/enums/ItemAddedResult";
import { LootCacheType } from "@spt-aki/models/spt/bots/IBotLootCache";
import { IBotConfig } from "@spt-aki/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt-aki/models/spt/config/IPmcConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { BotLootCacheService } from "@spt-aki/services/BotLootCacheService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class BotLootGenerator {
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;

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
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("BotLootCacheService") protected botLootCacheService: BotLootCacheService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
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
    public generateLoot(
        sessionId: string,
        botJsonTemplate: IBotType,
        isPmc: boolean,
        botRole: string,
        botInventory: PmcInventory,
        botLevel: number
    ): void {
        // Limits on item types to be added as loot
        const itemCounts = botJsonTemplate.generation.items;

        const backpackLootCount = this.weightedRandomHelper.getWeightedValue<number>(itemCounts.backpackLoot.weights);
        const pocketLootCount = this.weightedRandomHelper.getWeightedValue<number>(itemCounts.pocketLoot.weights);
        const vestLootCount = this.weightedRandomHelper.getWeightedValue<number>(itemCounts.vestLoot.weights);
        const specialLootItemCount = this.weightedRandomHelper.getWeightedValue<number>(
            itemCounts.specialItems.weights
        );
        const healingItemCount = this.weightedRandomHelper.getWeightedValue<number>(itemCounts.healing.weights);
        const drugItemCount = this.weightedRandomHelper.getWeightedValue<number>(itemCounts.drugs.weights);
        const stimItemCount = this.weightedRandomHelper.getWeightedValue<number>(itemCounts.stims.weights);
        const grenadeCount = this.weightedRandomHelper.getWeightedValue<number>(itemCounts.grenades.weights);

        // Forced pmc healing loot
        if (isPmc && this.pmcConfig.forceHealingItemsIntoSecure) {
            this.addForcedMedicalItemsToPmcSecure(botInventory, botRole);
        }

        const containersBotHasAvailable = this.getAvailableContainersBotCanStoreItemsIn(botInventory);

        // Special items
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.SPECIAL, botJsonTemplate),
            containersBotHasAvailable,
            specialLootItemCount,
            botInventory,
            botRole
        );

        // Healing items / Meds
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.HEALING_ITEMS, botJsonTemplate),
            containersBotHasAvailable,
            healingItemCount,
            botInventory,
            botRole,
            false,
            0,
            isPmc
        );

        // Drugs
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.DRUG_ITEMS, botJsonTemplate),
            containersBotHasAvailable,
            drugItemCount,
            botInventory,
            botRole,
            false,
            0,
            isPmc
        );

        // Stims
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.STIM_ITEMS, botJsonTemplate),
            containersBotHasAvailable,
            stimItemCount,
            botInventory,
            botRole,
            true,
            0,
            isPmc
        );

        // Grenades
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.GRENADE_ITEMS, botJsonTemplate),
            [EquipmentSlots.POCKETS, EquipmentSlots.TACTICAL_VEST], // Can't use containersBotHasEquipped as we dont want grenades added to backpack
            grenadeCount,
            botInventory,
            botRole,
            false,
            0,
            isPmc
        );

        // Backpack - generate loot if they have one
        if (containersBotHasAvailable.includes(EquipmentSlots.BACKPACK)) {
            // Add randomly generated weapon to PMC backpacks
            if (isPmc && this.randomUtil.getChance100(this.pmcConfig.looseWeaponInBackpackChancePercent)) {
                this.addLooseWeaponsToInventorySlot(
                    sessionId,
                    botInventory,
                    EquipmentSlots.BACKPACK,
                    botJsonTemplate.inventory,
                    botJsonTemplate.chances.mods,
                    botRole,
                    isPmc,
                    botLevel
                );
            }

            this.addLootFromPool(
                this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.BACKPACK, botJsonTemplate),
                [EquipmentSlots.BACKPACK],
                backpackLootCount,
                botInventory,
                botRole,
                true,
                this.pmcConfig.maxBackpackLootTotalRub,
                isPmc
            );
        }

        // TacticalVest - generate loot if they have one
        if (containersBotHasAvailable.includes(EquipmentSlots.TACTICAL_VEST)) {
            // Vest
            this.addLootFromPool(
                this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.VEST, botJsonTemplate),
                [EquipmentSlots.TACTICAL_VEST],
                vestLootCount,
                botInventory,
                botRole,
                true,
                this.pmcConfig.maxVestLootTotalRub,
                isPmc
            );
        }

        // Pockets
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.POCKET, botJsonTemplate),
            [EquipmentSlots.POCKETS],
            pocketLootCount,
            botInventory,
            botRole,
            true,
            this.pmcConfig.maxPocketLootTotalRub,
            isPmc
        );
    }

    /**
     * Get an array of the containers a bot has on them (pockets/backpack/vest)
     * @param botInventory Bot to check
     * @returns Array of available slots
     */
    protected getAvailableContainersBotCanStoreItemsIn(botInventory: PmcInventory): EquipmentSlots[] {
        const result = [EquipmentSlots.POCKETS];

        if (botInventory.items.find((x) => x.slotId === EquipmentSlots.TACTICAL_VEST)) {
            result.push(EquipmentSlots.TACTICAL_VEST);
        }

        if (botInventory.items.find((x) => x.slotId === EquipmentSlots.BACKPACK)) {
            result.push(EquipmentSlots.BACKPACK);
        }

        return result;
    }

    /**
     * Force healing items onto bot to ensure they can heal in-raid
     * @param botInventory Inventory to add items to
     * @param botRole Role of bot (sptBear/sptUsec)
     */
    protected addForcedMedicalItemsToPmcSecure(botInventory: PmcInventory, botRole: string): void {
        const grizzly = this.itemHelper.getItem("590c657e86f77412b013051d")[1];
        this.addLootFromPool([grizzly], [EquipmentSlots.SECURED_CONTAINER], 2, botInventory, botRole, false, 0, true);

        const surv12 = this.itemHelper.getItem("5d02797c86f774203f38e30a")[1];
        this.addLootFromPool([surv12], [EquipmentSlots.SECURED_CONTAINER], 1, botInventory, botRole, false, 0, true);

        const morphine = this.itemHelper.getItem("544fb3f34bdc2d03748b456a")[1];
        this.addLootFromPool([morphine], [EquipmentSlots.SECURED_CONTAINER], 3, botInventory, botRole, false, 0, true);

        const afak = this.itemHelper.getItem("60098ad7c2240c0fe85c570a")[1];
        this.addLootFromPool([afak], [EquipmentSlots.SECURED_CONTAINER], 2, botInventory, botRole, false, 0, true);
    }

    /**
     * Get a biased random number
     * @param min Smallest size
     * @param max Biggest size
     * @param nValue Value to bias choice
     * @returns Chosen number
     */
    protected getRandomisedCount(min: number, max: number, nValue: number): number {
        const range = max - min;
        return this.randomUtil.getBiasedRandomNumber(min, max, range, nValue);
    }

    /**
     * Take random items from a pool and add to an inventory until totalItemCount or totalValueLimit is reached
     * @param pool Pool of items to pick from
     * @param equipmentSlots What equipment slot will the loot items be added to
     * @param totalItemCount Max count of items to add
     * @param inventoryToAddItemsTo Bot inventory loot will be added to
     * @param botRole Role of the bot loot is being generated for (assault/pmcbot)
     * @param useLimits Should item limit counts be used as defined in config/bot.json
     * @param totalValueLimitRub Total value of loot allowed in roubles
     * @param isPmc Is bot being generated for a pmc
     */
    protected addLootFromPool(
        pool: ITemplateItem[],
        equipmentSlots: string[],
        totalItemCount: number,
        inventoryToAddItemsTo: PmcInventory,
        botRole: string,
        useLimits = false,
        totalValueLimitRub = 0,
        isPmc = false
    ): void {
        // Loot pool has items
        if (pool.length) {
            let currentTotalRub = 0;
            const itemLimits: Record<string, number> = {};
            const itemSpawnLimits: Record<string, Record<string, number>> = {};
            let fitItemIntoContainerAttempts = 0;
            for (let i = 0; i < totalItemCount; i++) {
                const itemToAddTemplate = this.getRandomItemFromPoolByRole(pool, botRole);
                const id = this.hashUtil.generate();
                const itemsToAdd: Item[] = [
                    {
                        _id: id,
                        _tpl: itemToAddTemplate._id,
                        ...this.botGeneratorHelper.generateExtraPropertiesForItem(itemToAddTemplate, botRole),
                    },
                ];

                if (useLimits) {
                    if (Object.keys(itemLimits).length === 0) {
                        this.initItemLimitArray(isPmc, botRole, itemLimits);
                    }

                    if (!itemSpawnLimits[botRole]) {
                        itemSpawnLimits[botRole] = this.getItemSpawnLimitsForBotType(isPmc, botRole);
                    }

                    if (
                        this.itemHasReachedSpawnLimit(
                            itemToAddTemplate,
                            botRole,
                            isPmc,
                            itemLimits,
                            itemSpawnLimits[botRole]
                        )
                    ) {
                        i--;
                        continue;
                    }
                }

                // Fill ammo box
                if (this.itemHelper.isOfBaseclass(itemToAddTemplate._id, BaseClasses.AMMO_BOX)) {
                    this.itemHelper.addCartridgesToAmmoBox(itemsToAdd, itemToAddTemplate);
                }
                // Make money a stack
                else if (this.itemHelper.isOfBaseclass(itemToAddTemplate._id, BaseClasses.MONEY)) {
                    this.randomiseMoneyStackSize(isPmc, itemToAddTemplate, itemsToAdd[0]);
                }
                // Make ammo a stack
                else if (this.itemHelper.isOfBaseclass(itemToAddTemplate._id, BaseClasses.AMMO)) {
                    this.randomiseAmmoStackSize(isPmc, itemToAddTemplate, itemsToAdd[0]);
                }

                // Attempt to add item to container(s)
                const itemAddedResult = this.botWeaponGeneratorHelper.addItemWithChildrenToEquipmentSlot(
                    equipmentSlots,
                    id,
                    itemToAddTemplate._id,
                    itemsToAdd,
                    inventoryToAddItemsTo
                );
                if (itemAddedResult === ItemAddedResult.NO_SPACE) {
                    fitItemIntoContainerAttempts++;
                    if (fitItemIntoContainerAttempts >= 4) {
                        this.logger.debug(
                            `Failed to place item ${i} of ${totalItemCount} item into ${botRole} container: ${equipmentSlots}, ${fitItemIntoContainerAttempts} times, skipping`
                        );

                        break;
                    }
                } else {
                    fitItemIntoContainerAttempts = 0;
                }

                // Stop adding items to bots pool if rolling total is over total limit
                if (totalValueLimitRub > 0) {
                    currentTotalRub += this.handbookHelper.getTemplatePrice(itemToAddTemplate._id);
                    if (currentTotalRub > totalValueLimitRub) {
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
     * @param botRole bots role .e.g. pmcBot
     * @param isPmc are we generating for a pmc
     */
    protected addLooseWeaponsToInventorySlot(
        sessionId: string,
        botInventory: PmcInventory,
        equipmentSlot: string,
        templateInventory: Inventory,
        modChances: ModsChances,
        botRole: string,
        isPmc: boolean,
        botLevel: number
    ): void {
        const chosenWeaponType = this.randomUtil.getArrayValue([
            EquipmentSlots.FIRST_PRIMARY_WEAPON,
            EquipmentSlots.FIRST_PRIMARY_WEAPON,
            EquipmentSlots.FIRST_PRIMARY_WEAPON,
            EquipmentSlots.HOLSTER,
        ]);
        const randomisedWeaponCount = this.randomUtil.getInt(
            this.pmcConfig.looseWeaponInBackpackLootMinMax.min,
            this.pmcConfig.looseWeaponInBackpackLootMinMax.max
        );
        if (randomisedWeaponCount > 0) {
            for (let i = 0; i < randomisedWeaponCount; i++) {
                const generatedWeapon = this.botWeaponGenerator.generateRandomWeapon(
                    sessionId,
                    chosenWeaponType,
                    templateInventory,
                    botInventory.equipment,
                    modChances,
                    botRole,
                    isPmc,
                    botLevel
                );
                this.botWeaponGeneratorHelper.addItemWithChildrenToEquipmentSlot(
                    [equipmentSlot],
                    generatedWeapon.weapon[0]._id,
                    generatedWeapon.weapon[0]._tpl,
                    [...generatedWeapon.weapon],
                    botInventory
                );
            }
        }
    }

    /**
     * Get a random item from the pool parameter using the biasedRandomNumber system
     * @param pool Pool of items to pick an item from
     * @param isPmc Is the bot being created a pmc
     * @returns ITemplateItem object
     */
    protected getRandomItemFromPoolByRole(pool: ITemplateItem[], botRole: string): ITemplateItem {
        const itemIndex = this.randomUtil.getBiasedRandomNumber(
            0,
            pool.length - 1,
            pool.length - 1,
            this.getBotLootNValueByRole(botRole)
        );
        return pool[itemIndex];
    }

    /**
     * Get the loot nvalue from botconfig
     * @param botRole Role of bot e.g. assault/bosstagilla/sptBear
     * @returns nvalue as number
     */
    protected getBotLootNValueByRole(botRole: string): number {
        const result = this.botConfig.lootNValue[botRole];
        if (!result) {
            this.logger.warning(this.localisationService.getText("bot-unable_to_find_loot_n_value_for_bot", botRole));

            return this.botConfig.lootNValue["scav"];
        }

        return result;
    }

    /**
     * Hydrate item limit array to contain items that have a limit for a specific bot type
     * All values are set to 0
     * @param isPmc Is the bot a pmc
     * @param botRole Role the bot has
     * @param limitCount
     */
    protected initItemLimitArray(isPmc: boolean, botRole: string, limitCount: Record<string, number>): void {
        // Init current count of items we want to limit
        const spawnLimits = this.getItemSpawnLimitsForBotType(isPmc, botRole);
        for (const limit in spawnLimits) {
            limitCount[limit] = 0;
        }
    }

    /**
     * Check if an item has reached its bot-specific spawn limit
     * @param itemTemplate Item we check to see if its reached spawn limit
     * @param botRole Bot type
     * @param isPmc Is bot we're working with a pmc
     * @param limitCount Spawn limits for items on bot
     * @param itemSpawnLimits The limits this bot is allowed to have
     * @returns true if item has reached spawn limit
     */
    protected itemHasReachedSpawnLimit(
        itemTemplate: ITemplateItem,
        botRole: string,
        isPmc: boolean,
        limitCount: Record<string, number>,
        itemSpawnLimits: Record<string, number>
    ): boolean {
        // PMCs and scavs have different sections of bot config for spawn limits
        if (!!itemSpawnLimits && itemSpawnLimits.length === 0) {
            // No items found in spawn limit, drop out
            return false;
        }

        // No spawn limits, skipping
        if (!itemSpawnLimits) {
            return false;
        }

        const idToCheckFor = this.getMatchingIdFromSpawnLimits(itemTemplate, itemSpawnLimits);
        if (!idToCheckFor) {
            // ParentId or tplid not found in spawnLimits, not a spawn limited item, skip
            return false;
        }

        // Increment item count with this bot type
        limitCount[idToCheckFor]++;

        // return true, we are over limit
        if (limitCount[idToCheckFor] > itemSpawnLimits[idToCheckFor]) {
            // Prevent edge-case of small loot pools + code trying to add limited item over and over infinitely
            if (limitCount[idToCheckFor] > itemSpawnLimits[idToCheckFor] * 10) {
                this.logger.debug(
                    this.localisationService.getText("bot-item_spawn_limit_reached_skipping_item", {
                        botRole: botRole,
                        itemName: itemTemplate._name,
                        attempts: limitCount[idToCheckFor],
                    })
                );

                return false;
            }

            return true;
        }

        return false;
    }

    /**
     * Randomise the stack size of a money object, uses different values for pmc or scavs
     * @param isPmc Is money on a PMC bot
     * @param itemTemplate item details from db
     * @param moneyItem Money item to randomise
     */
    protected randomiseMoneyStackSize(isPmc: boolean, itemTemplate: ITemplateItem, moneyItem: Item): void {
        // PMCs have a different stack max size
        const minStackSize = itemTemplate._props.StackMinRandom;
        const maxStackSize = isPmc
            ? this.pmcConfig.dynamicLoot.moneyStackLimits[itemTemplate._id]
            : itemTemplate._props.StackMaxRandom;
        const randomSize = this.randomUtil.getInt(minStackSize, maxStackSize);

        if (!moneyItem.upd) {
            moneyItem.upd = {};
        }

        moneyItem.upd.StackObjectsCount = randomSize;
    }

    /**
     * Randomise the size of an ammo stack
     * @param isPmc Is ammo on a PMC bot
     * @param itemTemplate item details from db
     * @param ammoItem Ammo item to randomise
     */
    protected randomiseAmmoStackSize(isPmc: boolean, itemTemplate: ITemplateItem, ammoItem: Item): void {
        const randomSize =
            itemTemplate._props.StackMaxSize === 1
                ? 1
                : this.randomUtil.getInt(itemTemplate._props.StackMinRandom, itemTemplate._props.StackMaxRandom);

        if (!ammoItem.upd) {
            ammoItem.upd = {};
        }

        ammoItem.upd.StackObjectsCount = randomSize;
    }

    /**
     * Get spawn limits for a specific bot type from bot.json config
     * If no limit found for a non pmc bot, fall back to defaults
     * @param isPmc is the bot we want limits for a pmc
     * @param botRole what role does the bot have
     * @returns Dictionary of tplIds and limit
     */
    protected getItemSpawnLimitsForBotType(isPmc: boolean, botRole: string): Record<string, number> {
        if (isPmc) {
            return this.botConfig.itemSpawnLimits["pmc"];
        }

        if (this.botConfig.itemSpawnLimits[botRole.toLowerCase()]) {
            return this.botConfig.itemSpawnLimits[botRole.toLowerCase()];
        }

        this.logger.warning(
            this.localisationService.getText("bot-unable_to_find_spawn_limits_fallback_to_defaults", botRole)
        );

        return this.botConfig.itemSpawnLimits["default"];
    }

    /**
     * Get the parentId or tplId of item inside spawnLimits object if it exists
     * @param itemTemplate item we want to look for in spawn limits
     * @param spawnLimits Limits to check for item
     * @returns id as string, otherwise undefined
     */
    protected getMatchingIdFromSpawnLimits(itemTemplate: ITemplateItem, spawnLimits: Record<string, number>): string {
        if (itemTemplate._id in spawnLimits) {
            return itemTemplate._id;
        }

        // tplId not found in spawnLimits, check if parentId is
        if (itemTemplate._parent in spawnLimits) {
            return itemTemplate._parent;
        }

        // parentId and tplid not found
        return undefined;
    }
}
