import { BotWeaponGenerator } from "@spt/generators/BotWeaponGenerator";
import { BotGeneratorHelper } from "@spt/helpers/BotGeneratorHelper";
import { BotHelper } from "@spt/helpers/BotHelper";
import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { IInventory as PmcInventory } from "@spt/models/eft/common/tables/IBotBase";
import { IBotType, IInventory, IModsChances } from "@spt/models/eft/common/tables/IBotType";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { EquipmentSlots } from "@spt/models/enums/EquipmentSlots";
import { ItemAddedResult } from "@spt/models/enums/ItemAddedResult";
import { LootCacheType } from "@spt/models/spt/bots/IBotLootCache";
import { IItemSpawnLimitSettings } from "@spt/models/spt/bots/IItemSpawnLimitSettings";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { BotLootCacheService } from "@spt/services/BotLootCacheService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotLootGenerator {
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("BotWeaponGenerator") protected botWeaponGenerator: BotWeaponGenerator,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("BotLootCacheService") protected botLootCacheService: BotLootCacheService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    protected getItemSpawnLimitsForBot(botRole: string): IItemSpawnLimitSettings {
        // Init item limits
        const limitsForBotDict: Record<string, number> = {};
        this.initItemLimitArray(botRole, limitsForBotDict);

        return { currentLimits: limitsForBotDict, globalLimits: this.getItemSpawnLimitsForBotType(botRole) };
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
        botLevel: number,
    ): void {
        // Limits on item types to be added as loot
        const itemCounts = botJsonTemplate.generation.items;

        if (
            !itemCounts.backpackLoot.weights ||
            !itemCounts.pocketLoot.weights ||
            !itemCounts.vestLoot.weights ||
            !itemCounts.specialItems.weights ||
            !itemCounts.healing.weights ||
            !itemCounts.drugs.weights ||
            !itemCounts.food.weights ||
            !itemCounts.drink.weights ||
            !itemCounts.currency.weights ||
            !itemCounts.stims.weights ||
            !itemCounts.grenades.weights
        ) {
            this.logger.warning(this.localisationService.getText("bot-unable_to_generate_bot_loot", botRole));

            return;
        }

        let backpackLootCount = Number(
            this.weightedRandomHelper.getWeightedValue<number>(itemCounts.backpackLoot.weights),
        );
        let pocketLootCount = Number(this.weightedRandomHelper.getWeightedValue<number>(itemCounts.pocketLoot.weights));
        let vestLootCount = this.weightedRandomHelper.getWeightedValue<number>(itemCounts.vestLoot.weights);
        const specialLootItemCount = Number(
            this.weightedRandomHelper.getWeightedValue<number>(itemCounts.specialItems.weights),
        );
        const healingItemCount = Number(this.weightedRandomHelper.getWeightedValue<number>(itemCounts.healing.weights));
        const drugItemCount = Number(this.weightedRandomHelper.getWeightedValue<number>(itemCounts.drugs.weights));

        const foodItemCount = Number(this.weightedRandomHelper.getWeightedValue<number>(itemCounts.food.weights));
        const drinkItemCount = Number(this.weightedRandomHelper.getWeightedValue<number>(itemCounts.drink.weights));

        let currencyItemCount = Number(this.weightedRandomHelper.getWeightedValue<number>(itemCounts.currency.weights));

        const stimItemCount = Number(this.weightedRandomHelper.getWeightedValue<number>(itemCounts.stims.weights));
        const grenadeCount = Number(this.weightedRandomHelper.getWeightedValue<number>(itemCounts.grenades.weights));

        // If bot has been flagged as not having loot, set below counts to 0
        if (this.botConfig.disableLootOnBotTypes?.includes(botRole.toLowerCase())) {
            backpackLootCount = 0;
            pocketLootCount = 0;
            vestLootCount = 0;
            currencyItemCount = 0;
        }

        // Forced pmc healing loot into secure container
        if (isPmc && this.pmcConfig.forceHealingItemsIntoSecure) {
            this.addForcedMedicalItemsToPmcSecure(botInventory, botRole);
        }

        const botItemLimits = this.getItemSpawnLimitsForBot(botRole);

        const containersBotHasAvailable = this.getAvailableContainersBotCanStoreItemsIn(botInventory);

        // This set is passed as a reference to fill up the containers that are already full, this aliviates
        // generation of the bots by avoiding checking the slots of containers we already know are full
        const containersIdFull = new Set<string>();

        // Special items
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.SPECIAL, botJsonTemplate),
            containersBotHasAvailable,
            specialLootItemCount,
            botInventory,
            botRole,
            botItemLimits,
            undefined,
            undefined,
            containersIdFull,
        );

        // Healing items / Meds
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.HEALING_ITEMS, botJsonTemplate),
            containersBotHasAvailable,
            healingItemCount,
            botInventory,
            botRole,
            undefined,
            0,
            isPmc,
            containersIdFull,
        );

        // Drugs
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.DRUG_ITEMS, botJsonTemplate),
            containersBotHasAvailable,
            drugItemCount,
            botInventory,
            botRole,
            undefined,
            0,
            isPmc,
            containersIdFull,
        );

        // Food
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.FOOD_ITEMS, botJsonTemplate),
            containersBotHasAvailable,
            foodItemCount,
            botInventory,
            botRole,
            undefined,
            0,
            isPmc,
            containersIdFull,
        );

        // Drink
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.DRINK_ITEMS, botJsonTemplate),
            containersBotHasAvailable,
            drinkItemCount,
            botInventory,
            botRole,
            undefined,
            0,
            isPmc,
            containersIdFull,
        );

        // Currency
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.CURRENCY_ITEMS, botJsonTemplate),
            containersBotHasAvailable,
            currencyItemCount,
            botInventory,
            botRole,
            undefined,
            0,
            isPmc,
            containersIdFull,
        );

        // Stims
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.STIM_ITEMS, botJsonTemplate),
            containersBotHasAvailable,
            stimItemCount,
            botInventory,
            botRole,
            botItemLimits,
            0,
            isPmc,
            containersIdFull,
        );

        // Grenades
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.GRENADE_ITEMS, botJsonTemplate),
            [EquipmentSlots.POCKETS, EquipmentSlots.TACTICAL_VEST], // Can't use containersBotHasEquipped as we dont want grenades added to backpack
            grenadeCount,
            botInventory,
            botRole,
            undefined,
            0,
            isPmc,
            containersIdFull,
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
                    botJsonTemplate.chances.weaponMods,
                    botRole,
                    isPmc,
                    botLevel,
                    containersIdFull,
                );
            }

            const backpackLootRoubleTotal = this.getBackpackRoubleTotalByLevel(botLevel, isPmc);
            this.addLootFromPool(
                this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.BACKPACK, botJsonTemplate),
                [EquipmentSlots.BACKPACK],
                backpackLootCount,
                botInventory,
                botRole,
                botItemLimits,
                backpackLootRoubleTotal,
                isPmc,
                containersIdFull,
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
                botItemLimits,
                this.pmcConfig.maxVestLootTotalRub,
                isPmc,
                containersIdFull,
            );
        }

        // Pockets
        this.addLootFromPool(
            this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.POCKET, botJsonTemplate),
            [EquipmentSlots.POCKETS],
            pocketLootCount,
            botInventory,
            botRole,
            botItemLimits,
            this.pmcConfig.maxPocketLootTotalRub,
            isPmc,
            containersIdFull,
        );

        // Secure

        // only add if not a pmc or is pmc and flag is true
        if (!isPmc || (isPmc && this.pmcConfig.addSecureContainerLootFromBotConfig)) {
            this.addLootFromPool(
                this.botLootCacheService.getLootFromCache(botRole, isPmc, LootCacheType.SECURE, botJsonTemplate),
                [EquipmentSlots.SECURED_CONTAINER],
                50,
                botInventory,
                botRole,
                undefined,
                -1,
                isPmc,
                containersIdFull,
            );
        }
    }

    /**
     * Gets the rouble cost total for loot in a bots backpack by the bots levl
     * Will return 0 for non PMCs
     * @param botLevel Bots level
     * @param isPmc Is the bot a PMC
     * @returns number
     */
    protected getBackpackRoubleTotalByLevel(botLevel: number, isPmc: boolean): number {
        if (isPmc) {
            const matchingValue = this.pmcConfig.maxBackpackLootTotalRub.find(
                (minMaxValue) => botLevel >= minMaxValue.min && botLevel <= minMaxValue.max,
            );
            return matchingValue.value;
        }

        return 0;
    }

    /**
     * Get an array of the containers a bot has on them (pockets/backpack/vest)
     * @param botInventory Bot to check
     * @returns Array of available slots
     */
    protected getAvailableContainersBotCanStoreItemsIn(botInventory: PmcInventory): EquipmentSlots[] {
        const result = [EquipmentSlots.POCKETS];

        if (botInventory.items.some((item) => item.slotId === EquipmentSlots.TACTICAL_VEST)) {
            result.push(EquipmentSlots.TACTICAL_VEST);
        }

        if (botInventory.items.some((item) => item.slotId === EquipmentSlots.BACKPACK)) {
            result.push(EquipmentSlots.BACKPACK);
        }

        return result;
    }

    /**
     * Force healing items onto bot to ensure they can heal in-raid
     * @param botInventory Inventory to add items to
     * @param botRole Role of bot (pmcBEAR/pmcUSEC)
     */
    protected addForcedMedicalItemsToPmcSecure(botInventory: PmcInventory, botRole: string): void {
        // surv12
        this.addLootFromPool(
            { "5d02797c86f774203f38e30a": 1 },
            [EquipmentSlots.SECURED_CONTAINER],
            1,
            botInventory,
            botRole,
            undefined,
            0,
            true,
        );

        // AFAK
        this.addLootFromPool(
            { "60098ad7c2240c0fe85c570a": 1 },
            [EquipmentSlots.SECURED_CONTAINER],
            10,
            botInventory,
            botRole,
            undefined,
            0,
            true,
        );
    }

    /**
     * Take random items from a pool and add to an inventory until totalItemCount or totalValueLimit or space limit is reached
     * @param pool Pool of items to pick from with weight
     * @param equipmentSlots What equipment slot will the loot items be added to
     * @param totalItemCount Max count of items to add
     * @param inventoryToAddItemsTo Bot inventory loot will be added to
     * @param botRole Role of the bot loot is being generated for (assault/pmcbot)
     * @param itemSpawnLimits Item spawn limits the bot must adhere to
     * @param totalValueLimitRub Total value of loot allowed in roubles
     * @param isPmc Is bot being generated for a pmc
     */
    protected addLootFromPool(
        pool: Record<string, number>,
        equipmentSlots: string[],
        totalItemCount: number,
        inventoryToAddItemsTo: PmcInventory,
        botRole: string,
        itemSpawnLimits?: IItemSpawnLimitSettings,
        totalValueLimitRub = 0,
        isPmc = false,
        containersIdFull = new Set<string>(),
    ): void {
        // Loot pool has items
        const poolSize = Object.keys(pool).length;
        if (poolSize > 0) {
            let currentTotalRub = 0;

            let fitItemIntoContainerAttempts = 0;
            for (let i = 0; i < totalItemCount; i++) {
                // Pool can become empty if item spawn limits keep removing items
                if (Object.keys(pool).length === 0) {
                    return;
                }

                const weightedItemTpl = this.weightedRandomHelper.getWeightedValue<string>(pool);
                const itemResult = this.itemHelper.getItem(weightedItemTpl);
                const itemToAddTemplate = itemResult[1];
                if (!itemResult[0]) {
                    this.logger.warning(
                        `Unable to process item tpl: ${weightedItemTpl} for slots: ${equipmentSlots} on bot: ${botRole}`,
                    );

                    continue;
                }

                if (itemSpawnLimits) {
                    if (this.itemHasReachedSpawnLimit(itemToAddTemplate, botRole, itemSpawnLimits)) {
                        // Remove item from pool to prevent it being picked again
                        delete pool[weightedItemTpl];

                        i--;
                        continue;
                    }
                }

                const newRootItemId = this.hashUtil.generate();
                const itemWithChildrenToAdd: IItem[] = [
                    {
                        _id: newRootItemId,
                        _tpl: itemToAddTemplate._id,
                        ...this.botGeneratorHelper.generateExtraPropertiesForItem(itemToAddTemplate, botRole),
                    },
                ];

                // Is Simple-Wallet / WZ wallet
                if (this.botConfig.walletLoot.walletTplPool.includes(weightedItemTpl)) {
                    const addCurrencyToWallet = this.randomUtil.getChance100(this.botConfig.walletLoot.chancePercent);
                    if (addCurrencyToWallet) {
                        // Create the currency items we want to add to wallet
                        const itemsToAdd = this.createWalletLoot(newRootItemId);

                        // Get the container grid for the wallet
                        const containerGrid = this.inventoryHelper.getContainerSlotMap(weightedItemTpl);

                        // Check if all the chosen currency items fit into wallet
                        const canAddToContainer = this.inventoryHelper.canPlaceItemsInContainer(
                            this.cloner.clone(containerGrid), // MUST clone grid before passing in as function modifies grid
                            itemsToAdd,
                        );
                        if (canAddToContainer) {
                            // Add each currency to wallet
                            for (const itemToAdd of itemsToAdd) {
                                this.inventoryHelper.placeItemInContainer(
                                    containerGrid,
                                    itemToAdd,
                                    itemWithChildrenToAdd[0]._id,
                                    "main",
                                );
                            }

                            itemWithChildrenToAdd.push(...itemsToAdd.flat());
                        }
                    }
                }
                // Some items (ammoBox/ammo) need extra changes
                this.addRequiredChildItemsToParent(itemToAddTemplate, itemWithChildrenToAdd, isPmc, botRole);

                // Attempt to add item to container(s)
                const itemAddedResult = this.botGeneratorHelper.addItemWithChildrenToEquipmentSlot(
                    equipmentSlots,
                    newRootItemId,
                    itemToAddTemplate._id,
                    itemWithChildrenToAdd,
                    inventoryToAddItemsTo,
                    containersIdFull,
                );

                // Handle when item cannot be added
                if (itemAddedResult !== ItemAddedResult.SUCCESS) {
                    if (itemAddedResult === ItemAddedResult.NO_CONTAINERS) {
                        // Bot has no container to put item in, exit
                        this.logger.debug(
                            `Unable to add: ${totalItemCount} items to bot as it lacks a container to include them`,
                        );
                        break;
                    }

                    fitItemIntoContainerAttempts++;
                    if (fitItemIntoContainerAttempts >= 4) {
                        this.logger.debug(
                            `Failed placing item: ${i} of: ${totalItemCount} items into: ${botRole} containers: ${equipmentSlots.join(
                                ",",
                            )}. Tried: ${fitItemIntoContainerAttempts} times, reason: ${
                                ItemAddedResult[itemAddedResult]
                            }, skipping`,
                        );

                        break;
                    }

                    // Try again, failed but still under attempt limit
                    continue;
                }

                // Item added okay, reset counter for next item
                fitItemIntoContainerAttempts = 0;

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

    protected createWalletLoot(walletId: string): IItem[][] {
        const result: IItem[][] = [];

        // Choose how many stacks of currency will be added to wallet
        const itemCount = this.randomUtil.getInt(
            this.botConfig.walletLoot.itemCount.min,
            this.botConfig.walletLoot.itemCount.max,
        );
        for (let index = 0; index < itemCount; index++) {
            // Choose the size of the currency stack - default is 5k, 10k, 15k, 20k, 25k
            const chosenStackCount = Number(
                this.weightedRandomHelper.getWeightedValue<string>(this.botConfig.walletLoot.stackSizeWeight),
            );
            result.push([
                {
                    _id: this.hashUtil.generate(),
                    _tpl: this.weightedRandomHelper.getWeightedValue<string>(this.botConfig.walletLoot.currencyWeight),
                    parentId: walletId,
                    upd: { StackObjectsCount: chosenStackCount },
                },
            ]);
        }

        return result;
    }

    /**
     * Some items need child items to function, add them to the itemToAddChildrenTo array
     * @param itemToAddTemplate Db template of item to check
     * @param itemToAddChildrenTo Item to add children to
     * @param isPmc Is the item being generated for a pmc (affects money/ammo stack sizes)
     * @param botRole role bot has that owns item
     */
    protected addRequiredChildItemsToParent(
        itemToAddTemplate: ITemplateItem,
        itemToAddChildrenTo: IItem[],
        isPmc: boolean,
        botRole: string,
    ): void {
        // Fill ammo box
        if (this.itemHelper.isOfBaseclass(itemToAddTemplate._id, BaseClasses.AMMO_BOX)) {
            this.itemHelper.addCartridgesToAmmoBox(itemToAddChildrenTo, itemToAddTemplate);
        }
        // Make money a stack
        else if (this.itemHelper.isOfBaseclass(itemToAddTemplate._id, BaseClasses.MONEY)) {
            this.randomiseMoneyStackSize(botRole, itemToAddTemplate, itemToAddChildrenTo[0]);
        }
        // Make ammo a stack
        else if (this.itemHelper.isOfBaseclass(itemToAddTemplate._id, BaseClasses.AMMO)) {
            this.randomiseAmmoStackSize(isPmc, itemToAddTemplate, itemToAddChildrenTo[0]);
        }
        // Must add soft inserts/plates
        else if (this.itemHelper.itemRequiresSoftInserts(itemToAddTemplate._id)) {
            this.itemHelper.addChildSlotItems(itemToAddChildrenTo, itemToAddTemplate, undefined, false);
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
        templateInventory: IInventory,
        modChances: IModsChances,
        botRole: string,
        isPmc: boolean,
        botLevel: number,
        containersIdFull?: Set<string>,
    ): void {
        const chosenWeaponType = this.randomUtil.getArrayValue([
            EquipmentSlots.FIRST_PRIMARY_WEAPON,
            EquipmentSlots.FIRST_PRIMARY_WEAPON,
            EquipmentSlots.FIRST_PRIMARY_WEAPON,
            EquipmentSlots.HOLSTER,
        ]);
        const randomisedWeaponCount = this.randomUtil.getInt(
            this.pmcConfig.looseWeaponInBackpackLootMinMax.min,
            this.pmcConfig.looseWeaponInBackpackLootMinMax.max,
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
                    botLevel,
                );
                const result = this.botGeneratorHelper.addItemWithChildrenToEquipmentSlot(
                    [equipmentSlot],
                    generatedWeapon.weapon[0]._id,
                    generatedWeapon.weapon[0]._tpl,
                    [...generatedWeapon.weapon],
                    botInventory,
                    containersIdFull,
                );

                if (result !== ItemAddedResult.SUCCESS) {
                    this.logger.debug(
                        `Failed to add additional weapon ${generatedWeapon.weapon[0]._id} to bot backpack, reason: ${ItemAddedResult[result]}`,
                    );
                }
            }
        }
    }

    /**
     * Hydrate item limit array to contain items that have a limit for a specific bot type
     * All values are set to 0
     * @param botRole Role the bot has
     * @param limitCount
     */
    protected initItemLimitArray(botRole: string, limitCount: Record<string, number>): void {
        // Init current count of items we want to limit
        const spawnLimits = this.getItemSpawnLimitsForBotType(botRole);
        for (const limit in spawnLimits) {
            limitCount[limit] = 0;
        }
    }

    /**
     * Check if an item has reached its bot-specific spawn limit
     * @param itemTemplate Item we check to see if its reached spawn limit
     * @param botRole Bot type
     * @param itemSpawnLimits
     * @returns true if item has reached spawn limit
     */
    protected itemHasReachedSpawnLimit(
        itemTemplate: ITemplateItem,
        botRole: string,
        itemSpawnLimits: IItemSpawnLimitSettings,
    ): boolean {
        // PMCs and scavs have different sections of bot config for spawn limits
        if (!!itemSpawnLimits && Object.keys(itemSpawnLimits.globalLimits).length === 0) {
            // No items found in spawn limit, drop out
            return false;
        }

        // No spawn limits, skipping
        if (!itemSpawnLimits) {
            return false;
        }

        const idToCheckFor = this.getMatchingIdFromSpawnLimits(itemTemplate, itemSpawnLimits.globalLimits);
        if (!idToCheckFor) {
            // ParentId or tplid not found in spawnLimits, not a spawn limited item, skip
            return false;
        }

        // Increment item count with this bot type
        itemSpawnLimits.currentLimits[idToCheckFor]++;

        // Check if over limit
        if (itemSpawnLimits.currentLimits[idToCheckFor] > itemSpawnLimits.globalLimits[idToCheckFor]) {
            // Prevent edge-case of small loot pools + code trying to add limited item over and over infinitely
            if (itemSpawnLimits.currentLimits[idToCheckFor] > itemSpawnLimits[idToCheckFor] * 10) {
                this.logger.debug(
                    this.localisationService.getText("bot-item_spawn_limit_reached_skipping_item", {
                        botRole: botRole,
                        itemName: itemTemplate._name,
                        attempts: itemSpawnLimits.currentLimits[idToCheckFor],
                    }),
                );

                return false;
            }

            return true;
        }

        return false;
    }

    /**
     * Randomise the stack size of a money object, uses different values for pmc or scavs
     * @param botRole Role bot has that has money stack
     * @param itemTemplate item details from db
     * @param moneyItem Money item to randomise
     */
    protected randomiseMoneyStackSize(botRole: string, itemTemplate: ITemplateItem, moneyItem: IItem): void {
        // Get all currency weights for this bot type
        let currencyWeights = this.botConfig.currencyStackSize[botRole];
        if (!currencyWeights) {
            currencyWeights = this.botConfig.currencyStackSize.default;
        }

        const currencyWeight = currencyWeights[moneyItem._tpl];

        this.itemHelper.addUpdObjectToItem(moneyItem);

        moneyItem.upd.StackObjectsCount = Number.parseInt(this.weightedRandomHelper.getWeightedValue(currencyWeight));
    }

    /**
     * Randomise the size of an ammo stack
     * @param isPmc Is ammo on a PMC bot
     * @param itemTemplate item details from db
     * @param ammoItem Ammo item to randomise
     */
    protected randomiseAmmoStackSize(isPmc: boolean, itemTemplate: ITemplateItem, ammoItem: IItem): void {
        const randomSize = this.itemHelper.getRandomisedAmmoStackSize(itemTemplate);
        this.itemHelper.addUpdObjectToItem(ammoItem);

        ammoItem.upd.StackObjectsCount = randomSize;
    }

    /**
     * Get spawn limits for a specific bot type from bot.json config
     * If no limit found for a non pmc bot, fall back to defaults
     * @param botRole what role does the bot have
     * @returns Dictionary of tplIds and limit
     */
    protected getItemSpawnLimitsForBotType(botRole: string): Record<string, number> {
        if (this.botHelper.isBotPmc(botRole)) {
            return this.botConfig.itemSpawnLimits.pmc;
        }

        if (this.botConfig.itemSpawnLimits[botRole.toLowerCase()]) {
            return this.botConfig.itemSpawnLimits[botRole.toLowerCase()];
        }

        this.logger.warning(
            this.localisationService.getText("bot-unable_to_find_spawn_limits_fallback_to_defaults", botRole),
        );

        return this.botConfig.itemSpawnLimits.default;
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
