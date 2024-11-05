import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { BotEquipmentModGenerator } from "@spt/generators/BotEquipmentModGenerator";
import { BotLootGenerator } from "@spt/generators/BotLootGenerator";
import { BotWeaponGenerator } from "@spt/generators/BotWeaponGenerator";
import { BotGeneratorHelper } from "@spt/helpers/BotGeneratorHelper";
import { BotHelper } from "@spt/helpers/BotHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { WeatherHelper } from "@spt/helpers/WeatherHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { IInventory as PmcInventory } from "@spt/models/eft/common/tables/IBotBase";
import { IBotType, IChances, IEquipment, IGeneration, IInventory } from "@spt/models/eft/common/tables/IBotType";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { IGetRaidConfigurationRequestData } from "@spt/models/eft/match/IGetRaidConfigurationRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { EquipmentSlots } from "@spt/models/enums/EquipmentSlots";
import { GameEditions } from "@spt/models/enums/GameEditions";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { IGenerateEquipmentProperties } from "@spt/models/spt/bots/IGenerateEquipmentProperties";
import { IBotConfig, IEquipmentFilterDetails } from "@spt/models/spt/config/IBotConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { BotEquipmentFilterService } from "@spt/services/BotEquipmentFilterService";
import { BotEquipmentModPoolService } from "@spt/services/BotEquipmentModPoolService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotInventoryGenerator {
    protected botConfig: IBotConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("BotWeaponGenerator") protected botWeaponGenerator: BotWeaponGenerator,
        @inject("BotLootGenerator") protected botLootGenerator: BotLootGenerator,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("WeatherHelper") protected weatherHelper: WeatherHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotEquipmentFilterService") protected botEquipmentFilterService: BotEquipmentFilterService,
        @inject("BotEquipmentModPoolService") protected botEquipmentModPoolService: BotEquipmentModPoolService,
        @inject("BotEquipmentModGenerator") protected botEquipmentModGenerator: BotEquipmentModGenerator,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Add equipment/weapons/loot to bot
     * @param sessionId Session id
     * @param botJsonTemplate Base json db file for the bot having its loot generated
     * @param botRole Role bot has (assault/pmcBot)
     * @param isPmc Is bot being converted into a pmc
     * @param botLevel Level of bot being generated
     * @param chosenGameVersion Game version for bot, only really applies for PMCs
     * @returns PmcInventory object with equipment/weapons/loot
     */
    public generateInventory(
        sessionId: string,
        botJsonTemplate: IBotType,
        botRole: string,
        isPmc: boolean,
        botLevel: number,
        chosenGameVersion: string,
    ): PmcInventory {
        const templateInventory = botJsonTemplate.inventory;
        const wornItemChances = botJsonTemplate.chances;
        const itemGenerationLimitsMinMax = botJsonTemplate.generation;

        // Generate base inventory with no items
        const botInventory = this.generateInventoryBase();

        // Get generated raid details bot will be spawned in
        const raidConfig = this.applicationContext
            .getLatestValue(ContextVariableType.RAID_CONFIGURATION)
            ?.getValue<IGetRaidConfigurationRequestData>();

        this.generateAndAddEquipmentToBot(
            sessionId,
            templateInventory,
            wornItemChances,
            botRole,
            botInventory,
            botLevel,
            chosenGameVersion,
            raidConfig,
        );

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
    protected generateInventoryBase(): PmcInventory {
        const equipmentId = this.hashUtil.generate();
        const stashId = this.hashUtil.generate();
        const questRaidItemsId = this.hashUtil.generate();
        const questStashItemsId = this.hashUtil.generate();
        const sortingTableId = this.hashUtil.generate();

        return {
            items: [
                { _id: equipmentId, _tpl: ItemTpl.INVENTORY_DEFAULT },
                { _id: stashId, _tpl: ItemTpl.STASH_STANDARD_STASH_10X30 },
                { _id: questRaidItemsId, _tpl: ItemTpl.STASH_QUESTRAID },
                { _id: questStashItemsId, _tpl: ItemTpl.STASH_QUESTOFFLINE },
                { _id: sortingTableId, _tpl: ItemTpl.SORTINGTABLE_SORTING_TABLE },
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
     * @param sessionId Session id
     * @param templateInventory bot/x.json data from db
     * @param wornItemChances Chances items will be added to bot
     * @param botRole Role bot has (assault/pmcBot)
     * @param botInventory Inventory to add equipment to
     * @param botLevel Level of bot
     * @param chosenGameVersion Game version for bot, only really applies for PMCs
     */
    protected generateAndAddEquipmentToBot(
        sessionId: string,
        templateInventory: IInventory,
        wornItemChances: IChances,
        botRole: string,
        botInventory: PmcInventory,
        botLevel: number,
        chosenGameVersion: string,
        raidConfig: IGetRaidConfigurationRequestData,
    ): void {
        // These will be handled later
        const excludedSlots: string[] = [
            EquipmentSlots.POCKETS,
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

        // Apply nighttime changes if its nighttime + there's changes to make
        if (
            randomistionDetails?.nighttimeChanges &&
            raidConfig &&
            this.weatherHelper.isNightTime(raidConfig.timeVariant)
        ) {
            for (const equipmentSlotKey of Object.keys(randomistionDetails.nighttimeChanges.equipmentModsModifiers)) {
                // Never let mod chance go outside of 0 - 100
                randomistionDetails.equipmentMods[equipmentSlotKey] = Math.min(
                    Math.max(
                        (randomistionDetails.equipmentMods[equipmentSlotKey] ?? 0) +
                            randomistionDetails.nighttimeChanges.equipmentModsModifiers[equipmentSlotKey],
                        0,
                    ),
                    100,
                );
            }
        }

        // Get profile of player generating bots, we use their level later on
        const pmcProfile = this.profileHelper.getPmcProfile(sessionId);
        const botEquipmentRole = this.botGeneratorHelper.getBotEquipmentRole(botRole);

        // Iterate over all equipment slots of bot, do it in specifc order to reduce conflicts
        // e.g. ArmorVest should be generated after TactivalVest
        // or FACE_COVER before HEADWEAR
        for (const equipmentSlot in templateInventory.equipment) {
            // Skip some slots as they need to be done in a specific order + with specific parameter values
            // e.g. Weapons
            if (excludedSlots.includes(equipmentSlot)) {
                continue;
            }

            this.generateEquipment({
                rootEquipmentSlot: equipmentSlot,
                rootEquipmentPool: templateInventory.equipment[equipmentSlot],
                modPool: templateInventory.mods,
                spawnChances: wornItemChances,
                botData: { role: botRole, level: botLevel, equipmentRole: botEquipmentRole },
                inventory: botInventory,
                botEquipmentConfig: botEquipConfig,
                randomisationDetails: randomistionDetails,
                generatingPlayerLevel: pmcProfile.Info.Level,
            });
        }

        // Generate below in specific order
        this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.POCKETS,
            // Unheard profiles have unique sized pockets, TODO - handle this somewhere else in a better way
            rootEquipmentPool:
                chosenGameVersion === GameEditions.UNHEARD
                    ? { [ItemTpl.POCKETS_1X4_TUE]: 1 }
                    : templateInventory.equipment.Pockets,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botData: { role: botRole, level: botLevel, equipmentRole: botEquipmentRole },
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
            generateModsBlacklist: [ItemTpl.POCKETS_1X4_TUE],
            generatingPlayerLevel: pmcProfile.Info.Level,
        });
        this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.FACE_COVER,
            rootEquipmentPool: templateInventory.equipment.FaceCover,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botData: { role: botRole, level: botLevel, equipmentRole: botEquipmentRole },
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
            generatingPlayerLevel: pmcProfile.Info.Level,
        });
        this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.HEADWEAR,
            rootEquipmentPool: templateInventory.equipment.Headwear,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botData: { role: botRole, level: botLevel, equipmentRole: botEquipmentRole },
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
            generatingPlayerLevel: pmcProfile.Info.Level,
        });
        this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.EARPIECE,
            rootEquipmentPool: templateInventory.equipment.Earpiece,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botData: { role: botRole, level: botLevel, equipmentRole: botEquipmentRole },
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
            generatingPlayerLevel: pmcProfile.Info.Level,
        });
        const hasArmorVest = this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.ARMOR_VEST,
            rootEquipmentPool: templateInventory.equipment.ArmorVest,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botData: { role: botRole, level: botLevel, equipmentRole: botEquipmentRole },
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
            generatingPlayerLevel: pmcProfile.Info.Level,
        });

        // Bot has no armor vest and flagged to be forceed to wear armored rig in this event
        if (botEquipConfig.forceOnlyArmoredRigWhenNoArmor && !hasArmorVest) {
            // Filter rigs down to only those with armor
            this.filterRigsToThoseWithProtection(templateInventory.equipment, botRole);
        }

        // Optimisation - Remove armored rigs from pool
        if (hasArmorVest) {
            // Filter rigs down to only those with armor
            this.filterRigsToThoseWithoutProtection(templateInventory.equipment, botRole);
        }

        // Bot is flagged as always needing a vest
        if (botEquipConfig.forceRigWhenNoVest && !hasArmorVest) {
            wornItemChances.equipment.TacticalVest = 100;
        }

        this.generateEquipment({
            rootEquipmentSlot: EquipmentSlots.TACTICAL_VEST,
            rootEquipmentPool: templateInventory.equipment.TacticalVest,
            modPool: templateInventory.mods,
            spawnChances: wornItemChances,
            botData: { role: botRole, level: botLevel, equipmentRole: botEquipmentRole },
            inventory: botInventory,
            botEquipmentConfig: botEquipConfig,
            randomisationDetails: randomistionDetails,
            generatingPlayerLevel: pmcProfile.Info.Level,
        });
    }

    /**
     * Remove non-armored rigs from parameter data
     * @param templateEquipment Equpiment to filter TacticalVest of
     * @param botRole Role of bot vests are being filtered for
     */
    protected filterRigsToThoseWithProtection(templateEquipment: IEquipment, botRole: string): void {
        const tacVestsWithArmor = Object.entries(templateEquipment.TacticalVest).reduce(
            (newVestDictionary, [tplKey]) => {
                if (this.itemHelper.itemHasSlots(tplKey)) {
                    newVestDictionary[tplKey] = templateEquipment.TacticalVest[tplKey];
                }
                return newVestDictionary;
            },
            {},
        );

        if (Object.keys(tacVestsWithArmor).length === 0) {
            this.logger.debug(`Unable to filter to only armored rigs as bot: ${botRole} has none in pool`);

            return;
        }

        templateEquipment.TacticalVest = tacVestsWithArmor;
    }

    /**
     * Remove armored rigs from parameter data
     * @param templateEquipment Equpiment to filter TacticalVest of
     * @param botRole Role of bot vests are being filtered for
     * @param allowEmptyResult Should the function return all rigs when 0 unarmored are found
     */
    protected filterRigsToThoseWithoutProtection(
        templateEquipment: IEquipment,
        botRole: string,
        allowEmptyResult = true,
    ): void {
        const tacVestsWithoutArmor = Object.entries(templateEquipment.TacticalVest).reduce(
            (newVestDictionary, [tplKey]) => {
                if (!this.itemHelper.itemHasSlots(tplKey)) {
                    newVestDictionary[tplKey] = templateEquipment.TacticalVest[tplKey];
                }
                return newVestDictionary;
            },
            {},
        );

        if (!allowEmptyResult && Object.keys(tacVestsWithoutArmor).length === 0) {
            this.logger.debug(`Unable to filter to only unarmored rigs as bot: ${botRole} has none in pool`);

            return;
        }

        templateEquipment.TacticalVest = tacVestsWithoutArmor;
    }

    /**
     * Add a piece of equipment with mods to inventory from the provided pools
     * @param sessionId Session id
     * @param settings Values to adjust how item is chosen and added to bot
     * @returns true when item added
     */
    protected generateEquipment(settings: IGenerateEquipmentProperties): boolean {
        const spawnChance = ([EquipmentSlots.POCKETS, EquipmentSlots.SECURED_CONTAINER] as string[]).includes(
            settings.rootEquipmentSlot,
        )
            ? 100
            : settings.spawnChances.equipment[settings.rootEquipmentSlot];

        if (typeof spawnChance === "undefined") {
            this.logger.warning(
                this.localisationService.getText(
                    "bot-no_spawn_chance_defined_for_equipment_slot",
                    settings.rootEquipmentSlot,
                ),
            );

            return false;
        }

        // Roll dice on equipment item
        const shouldSpawn = this.randomUtil.getChance100(spawnChance);
        if (shouldSpawn && Object.keys(settings.rootEquipmentPool).length) {
            let pickedItemDb: ITemplateItem;
            let found = false;

            // Limit attempts to find a compatible item as its expensive to check them all
            const maxAttempts = Math.round(Object.keys(settings.rootEquipmentPool).length * 0.75); // Roughly 75% of pool size
            let attempts = 0;
            while (!found) {
                if (Object.values(settings.rootEquipmentPool).length === 0) {
                    return false;
                }

                const chosenItemTpl = this.weightedRandomHelper.getWeightedValue<string>(settings.rootEquipmentPool);
                const dbResult = this.itemHelper.getItem(chosenItemTpl);

                if (!dbResult[0]) {
                    this.logger.error(this.localisationService.getText("bot-missing_item_template", chosenItemTpl));
                    this.logger.debug(`EquipmentSlot -> ${settings.rootEquipmentSlot}`);

                    // Remove picked item
                    delete settings.rootEquipmentPool[chosenItemTpl];

                    attempts++;

                    continue;
                }

                // Is the chosen item compatible with other items equipped
                const compatibilityResult = this.botGeneratorHelper.isItemIncompatibleWithCurrentItems(
                    settings.inventory.items,
                    chosenItemTpl,
                    settings.rootEquipmentSlot,
                );
                if (compatibilityResult.incompatible) {
                    // Tried x different items that failed, stop
                    if (attempts > maxAttempts) {
                        return false;
                    }

                    // Remove picked item from pool
                    delete settings.rootEquipmentPool[chosenItemTpl];

                    // Increment times tried
                    attempts++;
                } else {
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
                ...this.botGeneratorHelper.generateExtraPropertiesForItem(pickedItemDb, settings.botData.role),
            };

            const botEquipBlacklist = this.botEquipmentFilterService.getBotEquipmentBlacklist(
                settings.botData.equipmentRole,
                settings.generatingPlayerLevel,
            );

            // Edge case: Filter the armor items mod pool if bot exists in config dict + config has armor slot
            if (
                this.botConfig.equipment[settings.botData.equipmentRole] &&
                settings.randomisationDetails?.randomisedArmorSlots?.includes(settings.rootEquipmentSlot)
            ) {
                // Filter out mods from relevant blacklist
                settings.modPool[pickedItemDb._id] = this.getFilteredDynamicModsForItem(
                    pickedItemDb._id,
                    botEquipBlacklist.equipment,
                );
            }

            // Does item have slots for sub-mods to be inserted into
            if (pickedItemDb._props.Slots?.length > 0 && !settings.generateModsBlacklist?.includes(pickedItemDb._id)) {
                const childItemsToAdd = this.botEquipmentModGenerator.generateModsForEquipment(
                    [item],
                    id,
                    pickedItemDb,
                    settings,
                    botEquipBlacklist,
                );
                settings.inventory.items.push(...childItemsToAdd);
            } else {
                // No slots, add root item only
                settings.inventory.items.push(item);
            }

            return true;
        }

        return false;
    }

    /**
     * Get all possible mods for item and filter down based on equipment blacklist from bot.json config
     * @param itemTpl Item mod pool is being retrieved and filtered
     * @param equipmentBlacklist Blacklist to filter mod pool with
     * @returns Filtered pool of mods
     */
    protected getFilteredDynamicModsForItem(
        itemTpl: string,
        equipmentBlacklist: Record<string, string[]>,
    ): Record<string, string[]> {
        const modPool = this.botEquipmentModPoolService.getModsForGearSlot(itemTpl);
        for (const modSlot of Object.keys(modPool ?? [])) {
            const blacklistedMods = equipmentBlacklist[modSlot] ?? [];
            const filteredMods = modPool[modSlot].filter((slotName) => !blacklistedMods.includes(slotName));

            if (filteredMods.length > 0) {
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
     * @param itemGenerationLimitsMinMax Limits for items the bot can have
     * @param botLevel level of bot having weapon generated
     */
    protected generateAndAddWeaponsToBot(
        templateInventory: IInventory,
        equipmentChances: IChances,
        sessionId: string,
        botInventory: PmcInventory,
        botRole: string,
        isPmc: boolean,
        itemGenerationLimitsMinMax: IGeneration,
        botLevel: number,
    ): void {
        const weaponSlotsToFill = this.getDesiredWeaponsForBot(equipmentChances);
        for (const weaponSlot of weaponSlotsToFill) {
            // Add weapon to bot if true and bot json has something to put into the slot
            if (weaponSlot.shouldSpawn && Object.keys(templateInventory.equipment[weaponSlot.slot]).length) {
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
    protected getDesiredWeaponsForBot(equipmentChances: IChances): { slot: EquipmentSlots; shouldSpawn: boolean }[] {
        const shouldSpawnPrimary = this.randomUtil.getChance100(equipmentChances.equipment.FirstPrimaryWeapon);
        return [
            { slot: EquipmentSlots.FIRST_PRIMARY_WEAPON, shouldSpawn: shouldSpawnPrimary },
            {
                slot: EquipmentSlots.SECOND_PRIMARY_WEAPON,
                shouldSpawn: shouldSpawnPrimary
                    ? this.randomUtil.getChance100(equipmentChances.equipment.SecondPrimaryWeapon)
                    : false,
            },
            {
                slot: EquipmentSlots.HOLSTER,
                shouldSpawn: shouldSpawnPrimary
                    ? this.randomUtil.getChance100(equipmentChances.equipment.Holster) // Primary weapon = roll for chance at pistol
                    : true, // No primary = force pistol
            },
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
     * @param itemGenerationWeights
     */
    protected addWeaponAndMagazinesToInventory(
        sessionId: string,
        weaponSlot: { slot: EquipmentSlots; shouldSpawn: boolean },
        templateInventory: IInventory,
        botInventory: PmcInventory,
        equipmentChances: IChances,
        botRole: string,
        isPmc: boolean,
        itemGenerationWeights: IGeneration,
        botLevel: number,
    ): void {
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
