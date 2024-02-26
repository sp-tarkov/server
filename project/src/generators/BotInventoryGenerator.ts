import { inject, injectable } from "tsyringe";

import { BotEquipmentModGenerator } from "@spt-aki/generators/BotEquipmentModGenerator";
import { BotLootGenerator } from "@spt-aki/generators/BotLootGenerator";
import { BotWeaponGenerator } from "@spt-aki/generators/BotWeaponGenerator";
import { BotGeneratorHelper } from "@spt-aki/helpers/BotGeneratorHelper";
import { BotHelper } from "@spt-aki/helpers/BotHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { WeightedRandomHelper } from "@spt-aki/helpers/WeightedRandomHelper";
import { Inventory as PmcInventory } from "@spt-aki/models/eft/common/tables/IBotBase";
import { Chances, Generation, IBotType, Inventory, Mods } from "@spt-aki/models/eft/common/tables/IBotType";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { EquipmentSlots } from "@spt-aki/models/enums/EquipmentSlots";
import {
    EquipmentFilterDetails,
    EquipmentFilters,
    IBotConfig,
    RandomisationDetails,
} from "@spt-aki/models/spt/config/IBotConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { BotEquipmentModPoolService } from "@spt-aki/services/BotEquipmentModPoolService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class BotInventoryGenerator
{
    protected botConfig: IBotConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("BotWeaponGenerator") protected botWeaponGenerator: BotWeaponGenerator,
        @inject("BotLootGenerator") protected botLootGenerator: BotLootGenerator,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotEquipmentModPoolService") protected botEquipmentModPoolService: BotEquipmentModPoolService,
        @inject("BotEquipmentModGenerator") protected botEquipmentModGenerator: BotEquipmentModGenerator,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Add equipment/weapons/loot to bot
     * @param sessionId Session id
     * @param botJsonTemplate Base json db file for the bot having its loot generated
     * @param botRole Role bot has (assault/pmcBot)
     * @param isPmc Is bot being converted into a pmc
     * @param botLevel Level of bot being generated
     * @returns PmcInventory object with equipment/weapons/loot
     */
    public generateInventory(
        sessionId: string,
        botJsonTemplate: IBotType,
        botRole: string,
        isPmc: boolean,
        botLevel: number,
    ): PmcInventory
    {
        const templateInventory = botJsonTemplate.inventory;
        const wornItemChances = botJsonTemplate.chances;
        const itemGenerationLimitsMinMax = botJsonTemplate.generation;

        // Generate base inventory with no items
        const botInventory = this.generateInventoryBase();

        this.generateAndAddEquipmentToBot(templateInventory, wornItemChances, botRole, botInventory, botLevel);

        // Roll weapon spawns (primary/secondary/holster) and generate a weapon for each roll that passed
        this.generateAndAddWeaponsToBot(
            templateInventory,
            wornItemChances,
            sessionId,
            botInventory,
            botRole,
            isPmc,
            itemGenerationLimitsMinMax,
            botLevel,
        );

        // Pick loot and add to bots containers (rig/backpack/pockets/secure)
        this.botLootGenerator.generateLoot(sessionId, botJsonTemplate, isPmc, botRole, botInventory, botLevel);

        return botInventory;
    }

    /**
     * Create a pmcInventory object with all the base/generic items needed
     * @returns PmcInventory object
     */
    protected generateInventoryBase(): PmcInventory
    {
        const equipmentId = this.hashUtil.generate();
        const equipmentTpl = "55d7217a4bdc2d86028b456d";

        const stashId = this.hashUtil.generate();
        const stashTpl = "566abbc34bdc2d92178b4576";

        const questRaidItemsId = this.hashUtil.generate();
        const questRaidItemsTpl = "5963866286f7747bf429b572";

        const questStashItemsId = this.hashUtil.generate();
        const questStashItemsTpl = "5963866b86f7747bfa1c4462";

        const sortingTableId = this.hashUtil.generate();
        const sortingTableTpl = "602543c13fee350cd564d032";

        return {
            items: [
                { _id: equipmentId, _tpl: equipmentTpl },
                { _id: stashId, _tpl: stashTpl },
                { _id: questRaidItemsId, _tpl: questRaidItemsTpl },
                { _id: questStashItemsId, _tpl: questStashItemsTpl },
                { _id: sortingTableId, _tpl: sortingTableTpl },
            ],
            equipment: equipmentId,
            stash: stashId,
            questRaidItems: questRaidItemsId,
            questStashItems: questStashItemsId,
            sortingTable: sortingTableId,
            hideoutAreaStashes: {},
            fastPanel: {},
            favoriteItems: [],
        };
    }

    /**
     * Add equipment to a bot
     * @param templateInventory bot/x.json data from db
     * @param wornItemChances Chances items will be added to bot
     * @param botRole Role bot has (assault/pmcBot)
     * @param botInventory Inventory to add equipment to
     * @param botLevel Level of bot
     */
    protected generateAndAddEquipmentToBot(
        templateInventory: Inventory,
        wornItemChances: Chances,
        botRole: string,
        botInventory: PmcInventory,
        botLevel: number,
    ): void
    {
        // These will be handled later
        const excludedSlots: string[] = [
            EquipmentSlots.FIRST_PRIMARY_WEAPON,
            EquipmentSlots.SECOND_PRIMARY_WEAPON,
            EquipmentSlots.HOLSTER,
            EquipmentSlots.ARMOR_VEST,
            EquipmentSlots.TACTICAL_VEST,
            EquipmentSlots.FACE_COVER,
            EquipmentSlots.HEADWEAR,
            EquipmentSlots.EARPIECE,
        ];

        const botEquipConfig = this.botConfig.equipment[this.botGeneratorHelper.getBotEquipmentRole(botRole)];
        const randomistionDetails = this.botHelper.getBotRandomizationDetails(botLevel, botEquipConfig);
        for (const equipmentSlot in templateInventory.equipment)
        {
            // Weapons have special generation and will be generated separately; ArmorVest should be generated after TactivalVest
            if (excludedSlots.includes(equipmentSlot))
            {
                continue;
            }

            this.generateEquipment({
                rootEquipmentSlot: equipmentSlot,
                rootEquipmentPool: templateInventory.equipment[equipmentSlot],
                modPool: templateInventory.mods,
                spawnChances: wornItemChances,
                botRole: botRole,
                botLevel: botLevel,
                inventory: botInventory,
                botEquipmentConfig: botEquipConfig,
                randomisationDetails: randomistionDetails,
            });
        }

        // Generate below in specific order
        this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.FACE_COVER,
            rootEquipmentPool: templateInventory.equipment.FaceCover,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botRole: botRole,
            botLevel: botLevel,
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
        });
        this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.HEADWEAR,
            rootEquipmentPool: templateInventory.equipment.Headwear,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botRole: botRole,
            botLevel: botLevel,
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
        });
        this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.EARPIECE,
            rootEquipmentPool: templateInventory.equipment.Earpiece,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botRole: botRole,
            botLevel: botLevel,
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
        });
        const hasArmorVest = this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.ARMOR_VEST,
            rootEquipmentPool: templateInventory.equipment.ArmorVest,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botRole: botRole,
            botLevel: botLevel,
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
        });

        // Bot has no armor vest and flagged to be foreced to wear armored rig in this event
        if (botEquipConfig.forceOnlyArmoredRigWhenNoArmor && !hasArmorVest)
        {
            // Filter rigs down to only those with armor
            this.filterRigsToThoseWithProtection(templateInventory);
        }

        // Optimisation - Remove armored rigs from pool
        if (hasArmorVest)
        {
            // Filter rigs down to only those with armor
            this.filterRigsToThoseWithoutProtection(templateInventory);
        }

        this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.TACTICAL_VEST,
            rootEquipmentPool: templateInventory.equipment.TacticalVest,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botRole: botRole,
            botLevel: botLevel,
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
        });
    }

    /**
     * Remove non-armored rigs from parameter data
     * @param templateInventory
     */
    protected filterRigsToThoseWithProtection(templateInventory: Inventory): void
    {
        const tacVestsWithArmor = Object.entries(templateInventory.equipment.TacticalVest).reduce(
            (newVestDictionary, [tplKey]) =>
            {
                if (this.itemHelper.itemHasSlots(tplKey))
                {
                    newVestDictionary[tplKey] = templateInventory.equipment.TacticalVest[tplKey];
                }
                return newVestDictionary;
            },
            {},
        );

        templateInventory.equipment.TacticalVest = tacVestsWithArmor;
    }

    /**
     * Remove armored rigs from parameter data
     * @param templateInventory
     */
    protected filterRigsToThoseWithoutProtection(templateInventory: Inventory): void
    {
        const tacVestsWithoutArmor = Object.entries(templateInventory.equipment.TacticalVest).reduce(
            (newVestDictionary, [tplKey]) =>
            {
                if (!this.itemHelper.itemHasSlots(tplKey))
                {
                    newVestDictionary[tplKey] = templateInventory.equipment.TacticalVest[tplKey];
                }
                return newVestDictionary;
            },
            {},
        );

        templateInventory.equipment.TacticalVest = tacVestsWithoutArmor;
    }

    /**
     * Add a piece of equipment with mods to inventory from the provided pools
     * @param settings Values to adjust how item is chosen and added to bot
     * @returns true when item added
     */
    protected generateEquipment(settings: IGenerateEquipmentProperties): boolean
    {
        const spawnChance =
            ([EquipmentSlots.POCKETS, EquipmentSlots.SECURED_CONTAINER] as string[]).includes(
                    settings.rootEquipmentSlot,
                )
                ? 100
                : settings.spawnChances.equipment[settings.rootEquipmentSlot];
        if (typeof spawnChance === "undefined")
        {
            this.logger.warning(
                this.localisationService.getText(
                    "bot-no_spawn_chance_defined_for_equipment_slot",
                    settings.rootEquipmentSlot,
                ),
            );

            return false;
        }

        const shouldSpawn = this.randomUtil.getChance100(spawnChance);
        if (shouldSpawn && Object.keys(settings.rootEquipmentPool).length)
        {
            let pickedItemDb: ITemplateItem;
            let found = false;

            const maxAttempts = Math.round(Object.keys(settings.rootEquipmentPool).length * 0.75); // Roughly 75% of pool size
            let attempts = 0;
            while (!found)
            {
                if (Object.values(settings.rootEquipmentPool).length === 0)
                {
                    return false;
                }

                const chosenItemTpl = this.weightedRandomHelper.getWeightedValue<string>(settings.rootEquipmentPool);
                const dbResult = this.itemHelper.getItem(chosenItemTpl);

                if (!dbResult[0])
                {
                    this.logger.error(this.localisationService.getText("bot-missing_item_template", chosenItemTpl));
                    this.logger.info(`EquipmentSlot -> ${settings.rootEquipmentSlot}`);

                    // remove picked item
                    delete settings.rootEquipmentPool[chosenItemTpl];

                    attempts++;

                    continue;
                }

                const compatabilityResult = this.botGeneratorHelper.isItemIncompatibleWithCurrentItems(
                    settings.inventory.items,
                    chosenItemTpl,
                    settings.rootEquipmentSlot,
                );
                if (compatabilityResult.incompatible)
                {
                    // Tried x different items that failed, stop
                    if (attempts > maxAttempts)
                    {
                        return false;
                    }

                    // Remove picked item
                    delete settings.rootEquipmentPool[chosenItemTpl];

                    attempts++;
                }
                else
                {
                    // Success
                    found = true;
                    pickedItemDb = dbResult[1];
                }
            }

            // Create root item
            const id = this.hashUtil.generate();
            const item = {
                _id: id,
                _tpl: pickedItemDb._id,
                parentId: settings.inventory.equipment,
                slotId: settings.rootEquipmentSlot,
                ...this.botGeneratorHelper.generateExtraPropertiesForItem(pickedItemDb, settings.botRole),
            };

            // Use dynamic mod pool if enabled in config for this bot
            const botEquipmentRole = this.botGeneratorHelper.getBotEquipmentRole(settings.botRole);
            if (
                this.botConfig.equipment[botEquipmentRole]
                && settings.randomisationDetails?.randomisedArmorSlots?.includes(settings.rootEquipmentSlot)
            )
            {
                settings.modPool[pickedItemDb._id] = this.getFilteredDynamicModsForItem(
                    pickedItemDb._id,
                    this.botConfig.equipment[botEquipmentRole].blacklist,
                );
            }

            // Item has slots, fill them
            if (pickedItemDb._props.Slots?.length > 0)
            {
                const items = this.botEquipmentModGenerator.generateModsForEquipment(
                    [item],
                    id,
                    pickedItemDb,
                    settings,
                );
                settings.inventory.items.push(...items);
            }
            else
            {
                // No slots, push root item only
                settings.inventory.items.push(item);
            }

            return true;
        }

        return false;
    }

    /**
     * Get all possible mods for item and filter down based on equipment blacklist from bot.json config
     * @param itemTpl Item mod pool is being retrieved and filtered
     * @param equipmentBlacklist blacklist to filter mod pool with
     * @returns Filtered pool of mods
     */
    protected getFilteredDynamicModsForItem(
        itemTpl: string,
        equipmentBlacklist: EquipmentFilterDetails[],
    ): Record<string, string[]>
    {
        const modPool = this.botEquipmentModPoolService.getModsForGearSlot(itemTpl);
        for (const modSlot of Object.keys(modPool ?? []))
        {
            const blacklistedMods = equipmentBlacklist[0]?.equipment[modSlot] || [];
            const filteredMods = modPool[modSlot].filter((x) => !blacklistedMods.includes(x));

            if (filteredMods.length > 0)
            {
                modPool[modSlot] = filteredMods;
            }
        }

        return modPool;
    }

    /**
     * Work out what weapons bot should have equipped and add them to bot inventory
     * @param templateInventory bot/x.json data from db
     * @param equipmentChances Chances bot can have equipment equipped
     * @param sessionId Session id
     * @param botInventory Inventory to add weapons to
     * @param botRole assault/pmcBot/bossTagilla etc
     * @param isPmc Is the bot being generated as a pmc
     * @param botLevel level of bot having weapon generated
     * @param itemGenerationLimitsMinMax Limits for items the bot can have
     */
    protected generateAndAddWeaponsToBot(
        templateInventory: Inventory,
        equipmentChances: Chances,
        sessionId: string,
        botInventory: PmcInventory,
        botRole: string,
        isPmc: boolean,
        itemGenerationLimitsMinMax: Generation,
        botLevel: number,
    ): void
    {
        const weaponSlotsToFill = this.getDesiredWeaponsForBot(equipmentChances);
        for (const weaponSlot of weaponSlotsToFill)
        {
            // Add weapon to bot if true and bot json has something to put into the slot
            if (weaponSlot.shouldSpawn && Object.keys(templateInventory.equipment[weaponSlot.slot]).length)
            {
                this.addWeaponAndMagazinesToInventory(
                    sessionId,
                    weaponSlot,
                    templateInventory,
                    botInventory,
                    equipmentChances,
                    botRole,
                    isPmc,
                    itemGenerationLimitsMinMax,
                    botLevel,
                );
            }
        }
    }

    /**
     * Calculate if the bot should have weapons in Primary/Secondary/Holster slots
     * @param equipmentChances Chances bot has certain equipment
     * @returns What slots bot should have weapons generated for
     */
    protected getDesiredWeaponsForBot(equipmentChances: Chances): { slot: EquipmentSlots; shouldSpawn: boolean; }[]
    {
        const shouldSpawnPrimary = this.randomUtil.getChance100(equipmentChances.equipment.FirstPrimaryWeapon);
        return [{ slot: EquipmentSlots.FIRST_PRIMARY_WEAPON, shouldSpawn: shouldSpawnPrimary }, {
            slot: EquipmentSlots.SECOND_PRIMARY_WEAPON,
            shouldSpawn: shouldSpawnPrimary
                ? this.randomUtil.getChance100(equipmentChances.equipment.SecondPrimaryWeapon)
                : false,
        }, {
            slot: EquipmentSlots.HOLSTER,
            shouldSpawn: shouldSpawnPrimary
                ? this.randomUtil.getChance100(equipmentChances.equipment.Holster) // Primary weapon = roll for chance at pistol
                : true, // No primary = force pistol
        }];
    }

    /**
     * Add weapon + spare mags/ammo to bots inventory
     * @param sessionId Session id
     * @param weaponSlot Weapon slot being generated
     * @param templateInventory bot/x.json data from db
     * @param botInventory Inventory to add weapon+mags/ammo to
     * @param equipmentChances Chances bot can have equipment equipped
     * @param botRole assault/pmcBot/bossTagilla etc
     * @param isPmc Is the bot being generated as a pmc
     * @param itemGenerationWeights
     */
    protected addWeaponAndMagazinesToInventory(
        sessionId: string,
        weaponSlot: { slot: EquipmentSlots; shouldSpawn: boolean; },
        templateInventory: Inventory,
        botInventory: PmcInventory,
        equipmentChances: Chances,
        botRole: string,
        isPmc: boolean,
        itemGenerationWeights: Generation,
        botLevel: number,
    ): void
    {
        const generatedWeapon = this.botWeaponGenerator.generateRandomWeapon(
            sessionId,
            weaponSlot.slot,
            templateInventory,
            botInventory.equipment,
            equipmentChances.weaponMods,
            botRole,
            isPmc,
            botLevel,
        );

        botInventory.items.push(...generatedWeapon.weapon);

        this.botWeaponGenerator.addExtraMagazinesToInventory(
            generatedWeapon,
            itemGenerationWeights.items.magazines,
            botInventory,
            botRole,
        );
    }
}

export interface IGenerateEquipmentProperties
{
    /** Root Slot being generated */
    rootEquipmentSlot: string;
    /** Equipment pool for root slot being generated */
    rootEquipmentPool: Record<string, number>;
    modPool: Mods;
    /** Dictionary of mod items and their chance to spawn for this bot type */
    spawnChances: Chances;
    /** Role being generated for */
    botRole: string;
    /** Level of bot being generated */
    botLevel: number;
    inventory: PmcInventory;
    botEquipmentConfig: EquipmentFilters;
    /** Settings from bot.json to adjust how item is generated */
    randomisationDetails: RandomisationDetails;
}
