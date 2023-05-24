import { inject, injectable } from "tsyringe";

import { BotGeneratorHelper } from "../helpers/BotGeneratorHelper";
import { BotHelper } from "../helpers/BotHelper";
import { WeightedRandomHelper } from "../helpers/WeightedRandomHelper";
import { Inventory as PmcInventory } from "../models/eft/common/tables/IBotBase";
import {
    Chances, Generation, IBotType, Inventory, Mods
} from "../models/eft/common/tables/IBotType";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { EquipmentSlots } from "../models/enums/EquipmentSlots";
import {
    EquipmentFilterDetails, IBotConfig, RandomisationDetails
} from "../models/spt/config/IBotConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { BotEquipmentModPoolService } from "../services/BotEquipmentModPoolService";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { RandomUtil } from "../utils/RandomUtil";
import { BotEquipmentModGenerator } from "./BotEquipmentModGenerator";
import { BotLootGenerator } from "./BotLootGenerator";
import { BotWeaponGenerator } from "./BotWeaponGenerator";

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
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotEquipmentModPoolService") protected botEquipmentModPoolService: BotEquipmentModPoolService,
        @inject("BotEquipmentModGenerator") protected botEquipmentModGenerator: BotEquipmentModGenerator,
        @inject("ConfigServer") protected configServer: ConfigServer
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
    public generateInventory(sessionId: string, botJsonTemplate: IBotType, botRole: string, isPmc: boolean, botLevel: number): PmcInventory
    {
        const templateInventory = botJsonTemplate.inventory;
        const equipmentChances = botJsonTemplate.chances;
        const itemGenerationLimitsMinMax = botJsonTemplate.generation;

        // Generate base inventory with no items
        const botInventory = this.generateInventoryBase();

        this.generateAndAddEquipmentToBot(templateInventory, equipmentChances, botRole, botInventory, botLevel);

        // Roll weapon spawns and generate a weapon for each roll that passed
        this.generateAndAddWeaponsToBot(templateInventory, equipmentChances, sessionId, botInventory, botRole, isPmc, itemGenerationLimitsMinMax, botLevel);

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
                {
                    "_id": equipmentId,
                    "_tpl": equipmentTpl
                },
                {
                    "_id": stashId,
                    "_tpl": stashTpl
                },
                {
                    "_id": questRaidItemsId,
                    "_tpl": questRaidItemsTpl
                },
                {
                    "_id": questStashItemsId,
                    "_tpl": questStashItemsTpl
                },
                {
                    "_id": sortingTableId,
                    "_tpl": sortingTableTpl
                }
            ],
            equipment: equipmentId,
            stash: stashId,
            questRaidItems: questRaidItemsId,
            questStashItems: questStashItemsId,
            sortingTable: sortingTableId,
            fastPanel: {}
        };
    }

    /**
     * Add equipment to a bot
     * @param templateInventory bot/x.json data from db
     * @param equipmentChances Chances items will be added to bot
     * @param botRole Role bot has (assault/pmcBot)
     * @param botInventory Inventory to add equipment to
     * @param botLevel Level of bot
     */
    protected generateAndAddEquipmentToBot(templateInventory: Inventory, equipmentChances: Chances, botRole: string, botInventory: PmcInventory, botLevel: number): void
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
            EquipmentSlots.EARPIECE
        ];

        const botEquipConfig = this.botConfig.equipment[this.botGeneratorHelper.getBotEquipmentRole(botRole)];
        const randomistionDetails = this.botHelper.getBotRandomizationDetails(botLevel, botEquipConfig);

        for (const equipmentSlot in templateInventory.equipment)
        {
            // Weapons have special generation and will be generated seperately; ArmorVest should be generated after TactivalVest
            if (excludedSlots.includes(equipmentSlot))
            {
                continue;
            }

            this.generateEquipment(equipmentSlot, templateInventory.equipment[equipmentSlot], templateInventory.mods, equipmentChances, botRole, botInventory, randomistionDetails);
        }

        // Generate below in specific order
        this.generateEquipment(EquipmentSlots.FACE_COVER, templateInventory.equipment.FaceCover, templateInventory.mods, equipmentChances, botRole, botInventory, randomistionDetails);
        this.generateEquipment(EquipmentSlots.HEADWEAR, templateInventory.equipment.Headwear, templateInventory.mods, equipmentChances, botRole, botInventory, randomistionDetails);
        this.generateEquipment(EquipmentSlots.EARPIECE, templateInventory.equipment.Earpiece, templateInventory.mods, equipmentChances, botRole, botInventory, randomistionDetails);
        this.generateEquipment(EquipmentSlots.TACTICAL_VEST, templateInventory.equipment.TacticalVest, templateInventory.mods, equipmentChances, botRole, botInventory, randomistionDetails);
        this.generateEquipment(EquipmentSlots.ARMOR_VEST, templateInventory.equipment.ArmorVest, templateInventory.mods, equipmentChances, botRole, botInventory, randomistionDetails);
    }

    /**
     * Add a piece of equipment with mods to inventory from the provided pools
     * @param equipmentSlot Slot to select an item for
     * @param equipmentPool Possible items to choose from
     * @param modPool Possible mods to apply to item chosen
     * @param spawnChances Chances items will be chosen to be added
     * @param botRole Role of bot e.g. assault
     * @param inventory Inventory to add item into
     * @param randomisationDetails settings from bot.json to adjust how item is generated
     */
    protected generateEquipment(
        equipmentSlot: string,
        equipmentPool: Record<string, number>,
        modPool: Mods,
        spawnChances: Chances,
        botRole: string,
        inventory: PmcInventory,
        randomisationDetails: RandomisationDetails): void
    {
        const spawnChance = ([EquipmentSlots.POCKETS, EquipmentSlots.SECURED_CONTAINER] as string[]).includes(equipmentSlot)
            ? 100
            : spawnChances.equipment[equipmentSlot];
        if (typeof spawnChance === "undefined")
        {
            this.logger.warning(this.localisationService.getText("bot-no_spawn_chance_defined_for_equipment_slot", equipmentSlot));

            return;
        }

        const shouldSpawn = this.randomUtil.getChance100(spawnChance);
        if (Object.keys(equipmentPool).length && shouldSpawn)
        {
            const id = this.hashUtil.generate();
            const equipmentItemTpl = this.weightedRandomHelper.getWeightedInventoryItem(equipmentPool);
            const itemTemplate = this.databaseServer.getTables().templates.items[equipmentItemTpl];

            if (!itemTemplate)
            {
                this.logger.error(this.localisationService.getText("bot-missing_item_template", equipmentItemTpl));
                this.logger.info(`EquipmentSlot -> ${equipmentSlot}`);

                return;
            }

            if (this.botGeneratorHelper.isItemIncompatibleWithCurrentItems(inventory.items, equipmentItemTpl, equipmentSlot).incompatible)
            {
                // Bad luck - randomly picked item was not compatible with current gear
                return;
            }

            const item = {
                "_id": id,
                "_tpl": equipmentItemTpl,
                "parentId": inventory.equipment,
                "slotId": equipmentSlot,
                ...this.botGeneratorHelper.generateExtraPropertiesForItem(itemTemplate, botRole)
            };

            // use dynamic mod pool if enabled in config
            const botEquipmentRole = this.botGeneratorHelper.getBotEquipmentRole(botRole);
            if (this.botConfig.equipment[botEquipmentRole] && randomisationDetails?.randomisedArmorSlots?.includes(equipmentSlot))
            {
                modPool[equipmentItemTpl] = this.getFilteredDynamicModsForItem(equipmentItemTpl, this.botConfig.equipment[botEquipmentRole].blacklist);
            }

            if (typeof(modPool[equipmentItemTpl]) !== "undefined" || Object.keys(modPool[equipmentItemTpl] || {}).length > 0)
            {
                const items = this.botEquipmentModGenerator.generateModsForEquipment([item], modPool, id, itemTemplate, spawnChances.mods, botRole);
                inventory.items.push(...items);
            }
            else
            {
                inventory.items.push(item);
            }
        }
    }

    /**
     * Get all possible mods for item and filter down based on equipment blacklist from bot.json config
     * @param itemTpl Item mod pool is being retreived and filtered
     * @param equipmentBlacklist blacklist to filter mod pool with
     * @returns Filtered pool of mods
     */
    protected getFilteredDynamicModsForItem(itemTpl: string, equipmentBlacklist: EquipmentFilterDetails[]): Record<string, string[]>
    {
        const modPool = this.botEquipmentModPoolService.getModsForGearSlot(itemTpl);
        for (const modSlot of Object.keys(modPool ?? []))
        {
            const blacklistedMods = equipmentBlacklist[0]?.equipment[modSlot] || [];
            const filteredMods =  modPool[modSlot].filter(x => !blacklistedMods.includes(x));

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
    protected generateAndAddWeaponsToBot(templateInventory: Inventory, equipmentChances: Chances, sessionId: string, botInventory: PmcInventory, botRole: string, isPmc: boolean, itemGenerationLimitsMinMax: Generation, botLevel: number): void
    {
        const weaponSlotsToFill = this.getDesiredWeaponsForBot(equipmentChances);
        for (const weaponSlot of weaponSlotsToFill)
        {
            // Add weapon to bot if true and bot json has something to put into the slot
            if (weaponSlot.shouldSpawn && Object.keys(templateInventory.equipment[weaponSlot.slot]).length)
            {
                this.addWeaponAndMagazinesToInventory(sessionId, weaponSlot, templateInventory, botInventory, equipmentChances, botRole, isPmc, itemGenerationLimitsMinMax, botLevel);
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
        return [
            {
                slot: EquipmentSlots.FIRST_PRIMARY_WEAPON,
                shouldSpawn: shouldSpawnPrimary
            },
            {
                slot: EquipmentSlots.SECOND_PRIMARY_WEAPON,
                shouldSpawn: shouldSpawnPrimary 
                    ? this.randomUtil.getChance100(equipmentChances.equipment.SecondPrimaryWeapon)
                    : false
            },
            {
                slot: EquipmentSlots.HOLSTER,
                shouldSpawn: shouldSpawnPrimary
                    ? this.randomUtil.getChance100(equipmentChances.equipment.Holster) // Primary weapon = roll for chance at pistol
                    : true // No primary = force pistol
            }
        ];
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
     * @param itemGenerationLimitsMinMax 
     */
    protected addWeaponAndMagazinesToInventory(
        sessionId: string,
        weaponSlot: { slot: EquipmentSlots; shouldSpawn: boolean; },
        templateInventory: Inventory,
        botInventory: PmcInventory,
        equipmentChances: Chances,
        botRole: string,
        isPmc: boolean,
        itemGenerationLimitsMinMax: Generation,
        botLevel: number): void
    {
        const generatedWeapon = this.botWeaponGenerator.generateRandomWeapon(
            sessionId,
            weaponSlot.slot,
            templateInventory,
            botInventory.equipment,
            equipmentChances.mods,
            botRole,
            isPmc,
            botLevel);

        botInventory.items.push(...generatedWeapon.weapon);

        this.botWeaponGenerator.addExtraMagazinesToInventory(generatedWeapon, itemGenerationLimitsMinMax.items.magazines, botInventory, botRole);
    }
}