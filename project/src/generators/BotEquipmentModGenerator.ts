import { inject, injectable } from "tsyringe";
import { BotGeneratorHelper } from "@spt/helpers/BotGeneratorHelper";
import { BotHelper } from "@spt/helpers/BotHelper";
import { BotWeaponGeneratorHelper } from "@spt/helpers/BotWeaponGeneratorHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { ProbabilityHelper } from "@spt/helpers/ProbabilityHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { IPreset } from "@spt/models/eft/common/IGlobals";
import { Mods, ModsChances } from "@spt/models/eft/common/tables/IBotType";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem, Slot } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ModSpawn } from "@spt/models/enums/ModSpawn";
import { IChooseRandomCompatibleModResult } from "@spt/models/spt/bots/IChooseRandomCompatibleModResult";
import { IGenerateWeaponRequest } from "@spt/models/spt/bots/IGenerateWeaponRequest";
import { IModToSpawnRequest } from "@spt/models/spt/bots/IModToSpawnRequest";
import { EquipmentFilterDetails, EquipmentFilters, IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { ExhaustableArray } from "@spt/models/spt/server/ExhaustableArray";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { BotEquipmentFilterService } from "@spt/services/BotEquipmentFilterService";
import { BotEquipmentModPoolService } from "@spt/services/BotEquipmentModPoolService";
import { BotWeaponModLimitService } from "@spt/services/BotWeaponModLimitService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { IGenerateEquipmentProperties } from "./BotInventoryGenerator";
import { IFilterPlateModsForSlotByLevelResult, Result } from "./IFilterPlateModsForSlotByLevelResult";

@injectable()
export class BotEquipmentModGenerator
{
    protected botConfig: IBotConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ProbabilityHelper") protected probabilityHelper: ProbabilityHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("BotEquipmentFilterService") protected botEquipmentFilterService: BotEquipmentFilterService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("BotWeaponModLimitService") protected botWeaponModLimitService: BotWeaponModLimitService,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("BotWeaponGeneratorHelper") protected botWeaponGeneratorHelper: BotWeaponGeneratorHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotEquipmentModPoolService") protected botEquipmentModPoolService: BotEquipmentModPoolService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("RecursiveCloner") protected cloner: ICloner,
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Check mods are compatible and add to array
     * @param equipment Equipment item to add mods to
     * @param modPool Mod list to choose frm
     * @param parentId parentid of item to add mod to
     * @param parentTemplate template objet of item to add mods to
     * @param forceSpawn should this mod be forced to spawn
     * @returns Item + compatible mods as an array
     */
    public generateModsForEquipment(
        equipment: Item[],
        parentId: string,
        parentTemplate: ITemplateItem,
        settings: IGenerateEquipmentProperties,
        shouldForceSpawn = false,
    ): Item[]
    {
        let forceSpawn = shouldForceSpawn;

        const compatibleModsPool = settings.modPool[parentTemplate._id];
        if (!compatibleModsPool)
        {
            this.logger.warning(
                `bot: ${settings.botRole} lacks a mod slot pool for item: ${parentTemplate._id} ${parentTemplate._name}`,
            );
        }

        // Iterate over mod pool and choose mods to add to item
        for (const modSlotName in compatibleModsPool)
        {
            const itemSlotTemplate = this.getModItemSlotFromDb(modSlotName, parentTemplate);
            if (!itemSlotTemplate)
            {
                this.logger.error(
                    this.localisationService.getText("bot-mod_slot_missing_from_item", {
                        modSlot: modSlotName,
                        parentId: parentTemplate._id,
                        parentName: parentTemplate._name,
                        botRole: settings.botRole,
                    }),
                );
                continue;
            }
            const modSpawnResult = this.shouldModBeSpawned(
                itemSlotTemplate,
                modSlotName.toLowerCase(),
                settings.spawnChances.equipmentMods,
                settings.botEquipmentConfig,
            );
            if (modSpawnResult === ModSpawn.SKIP && !forceSpawn)
            {
                continue;
            }

            // Ensure submods for nvgs all spawn together
            if (modSlotName === "mod_nvg")
            {
                forceSpawn = true;
            }

            let modPoolToChooseFrom = compatibleModsPool[modSlotName];
            if (
                settings.botEquipmentConfig.filterPlatesByLevel
                && this.itemHelper.isRemovablePlateSlot(modSlotName.toLowerCase())
            )
            {
                const outcome = this.filterPlateModsForSlotByLevel(
                    settings,
                    modSlotName.toLowerCase(),
                    compatibleModsPool[modSlotName],
                    parentTemplate,
                );
                if ([Result.UNKNOWN_FAILURE, Result.NO_DEFAULT_FILTER].includes(outcome.result))
                {
                    this.logger.debug(
                        `Plate slot: ${modSlotName} selection for armor: ${parentTemplate._id} failed: ${
                            Result[outcome.result]
                        }, skipping`,
                    );

                    continue;
                }

                if ([Result.LACKS_PLATE_WEIGHTS].includes(outcome.result))
                {
                    this.logger.warning(
                        `Plate slot: ${modSlotName} lacks weights for armor: ${parentTemplate._id}, unable to adjust plate choice, using existing data`,
                    );
                }

                modPoolToChooseFrom = outcome.plateModTpls;
            }

            // Find random mod and check its compatible
            let modTpl: string;
            let found = false;
            const exhaustableModPool = new ExhaustableArray(modPoolToChooseFrom, this.randomUtil, this.cloner);
            while (exhaustableModPool.hasValues())
            {
                modTpl = exhaustableModPool.getRandomValue();
                if (
                    !this.botGeneratorHelper.isItemIncompatibleWithCurrentItems(equipment, modTpl, modSlotName)
                        .incompatible
                )
                {
                    found = true;
                    break;
                }
            }

            // Compatible item not found but slot REQUIRES item, get random item from db
            if (!found && itemSlotTemplate._required)
            {
                modTpl = this.getRandomModTplFromItemDb(modTpl, itemSlotTemplate, modSlotName, equipment);
                found = !!modTpl;
            }

            // Compatible item not found + not required
            if (!(found || itemSlotTemplate._required))
            {
                // Don't add item
                continue;
            }

            const modTemplate = this.itemHelper.getItem(modTpl);
            if (!this.isModValidForSlot(modTemplate, itemSlotTemplate, modSlotName, parentTemplate, settings.botRole))
            {
                continue;
            }

            // Generate new id to ensure all items are unique on bot
            const modId = this.hashUtil.generate();
            equipment.push(this.createModItem(modId, modTpl, parentId, modSlotName, modTemplate[1], settings.botRole));

            // Does the item being added have possible child mods?
            if (Object.keys(settings.modPool).includes(modTpl))
            {
                // Call self recursively with item being checkced item we just added to bot
                this.generateModsForEquipment(equipment, modId, modTemplate[1], settings, forceSpawn);
            }
        }

        return equipment;
    }

    /**
     * Filter a bots plate pool based on its current level
     * @param settings Bot equipment generation settings
     * @param modSlot Armor slot being filtered
     * @param existingPlateTplPool Plates tpls to choose from
     * @param armorItem
     * @returns Array of plate tpls to choose from
     */
    protected filterPlateModsForSlotByLevel(
        settings: IGenerateEquipmentProperties,
        modSlot: string,
        existingPlateTplPool: string[],
        armorItem: ITemplateItem,
    ): IFilterPlateModsForSlotByLevelResult
    {
        const result: IFilterPlateModsForSlotByLevelResult = { result: Result.UNKNOWN_FAILURE, plateModTpls: undefined };

        // Not pmc or not a plate slot, return original mod pool array
        if (!this.itemHelper.isRemovablePlateSlot(modSlot))
        {
            result.result = Result.NOT_PLATE_HOLDING_SLOT;
            result.plateModTpls = existingPlateTplPool;

            return result;
        }

        // Get the front/back/side weights based on bots level
        const plateSlotWeights = settings.botEquipmentConfig?.armorPlateWeighting?.find(
            (armorWeight) =>
                settings.botLevel >= armorWeight.levelRange.min && settings.botLevel <= armorWeight.levelRange.max,
        );
        if (!plateSlotWeights)
        {
            // No weights, return original array of plate tpls
            result.result = Result.LACKS_PLATE_WEIGHTS;
            result.plateModTpls = existingPlateTplPool;

            return result;
        }

        // Get the specific plate slot weights (front/back/side)
        const plateWeights: Record<string, number> = plateSlotWeights[modSlot];
        if (!plateWeights)
        {
            // No weights, return original array of plate tpls
            result.result = Result.LACKS_PLATE_WEIGHTS;
            result.plateModTpls = existingPlateTplPool;

            return result;
        }

        // Choose a plate level based on weighting
        const chosenArmorPlateLevel = this.weightedRandomHelper.getWeightedValue<string>(plateWeights);

        // Convert the array of ids into database items
        const platesFromDb = existingPlateTplPool.map((plateTpl) => this.itemHelper.getItem(plateTpl)[1]);

        // Filter plates to the chosen level based on its armorClass property
        const platesOfDesiredLevel = platesFromDb.filter((item) => item._props.armorClass === chosenArmorPlateLevel);
        if (platesOfDesiredLevel.length === 0)
        {
            this.logger.debug(
                `Plate filter was too restrictive for armor: ${armorItem._name} ${armorItem._id}, unable to find plates of level: ${chosenArmorPlateLevel}. Using mod items default plate`,
            );

            const relatedItemDbModSlot = armorItem._props.Slots.find((slot) => slot._name.toLowerCase() === modSlot);
            const defaultPlate = relatedItemDbModSlot._props.filters[0].Plate;
            if (!defaultPlate)
            {
                // No relevant plate found after filtering AND no default plate

                // Last attempt, get default preset and see if it has a plate default
                const defaultPreset = this.presetHelper.getDefaultPreset(armorItem._id);
                if (defaultPreset)
                {
                    const relatedPresetSlot = defaultPreset._items.find(
                        (item) => item.slotId?.toLowerCase() === modSlot,
                    );
                    if (relatedPresetSlot)
                    {
                        result.result = Result.SUCCESS;
                        result.plateModTpls = [relatedPresetSlot._tpl];

                        return result;
                    }
                }

                result.result = Result.NO_DEFAULT_FILTER;

                return result;
            }

            result.result = Result.SUCCESS;
            result.plateModTpls = [defaultPlate];

            return result;
        }

        // Only return the items ids
        result.result = Result.SUCCESS;
        result.plateModTpls = platesOfDesiredLevel.map((item) => item._id);

        return result;
    }

    /**
     * Add mods to a weapon using the provided mod pool
     * @param sessionId Session id
     * @param request Data used to generate the weapon
     * @returns Weapon + mods array
     */
    public generateModsForWeapon(sessionId: string, request: IGenerateWeaponRequest): Item[]
    {
        const pmcProfile = this.profileHelper.getPmcProfile(sessionId);

        // Get pool of mods that fit weapon
        const compatibleModsPool = request.modPool[request.parentTemplate._id];

        if (
            !(
                request.parentTemplate._props.Slots.length
                || request.parentTemplate._props.Cartridges?.length
                || request.parentTemplate._props.Chambers?.length
            )
        )
        {
            this.logger.error(
                this.localisationService.getText("bot-unable_to_add_mods_to_weapon_missing_ammo_slot", {
                    weaponName: request.parentTemplate._name,
                    weaponId: request.parentTemplate._id,
                    botRole: request.botData.role,
                }),
            );

            return request.weapon;
        }

        const botEquipConfig = this.botConfig.equipment[request.botData.equipmentRole];
        const botEquipBlacklist = this.botEquipmentFilterService.getBotEquipmentBlacklist(
            request.botData.equipmentRole,
            pmcProfile.Info.Level,
        );
        const botWeaponSightWhitelist
            = this.botEquipmentFilterService.getBotWeaponSightWhitelist(request.botData.equipmentRole);
        const randomisationSettings
            = this.botHelper.getBotRandomizationDetails(request.botData.level, botEquipConfig);

        // Iterate over mod pool and choose mods to attach
        const sortedModKeys = this.sortModKeys(Object.keys(compatibleModsPool));
        for (const modSlot of sortedModKeys)
        {
            // Check weapon has slot for mod to fit in
            const modsParentSlot = this.getModItemSlotFromDb(modSlot, request.parentTemplate);
            if (!modsParentSlot)
            {
                this.logger.error(
                    this.localisationService.getText("bot-weapon_missing_mod_slot", {
                        modSlot: modSlot,
                        weaponId: request.parentTemplate._id,
                        weaponName: request.parentTemplate._name,
                        botRole: request.botData.role,
                    }),
                );

                continue;
            }

            // Check spawn chance of mod
            const modSpawnResult = this.shouldModBeSpawned(
                modsParentSlot,
                modSlot,
                request.modSpawnChances,
                botEquipConfig);
            if (modSpawnResult === ModSpawn.SKIP)
            {
                continue;
            }

            const isRandomisableSlot = randomisationSettings?.randomisedWeaponModSlots?.includes(modSlot) ?? false;
            const modToSpawnRequest: IModToSpawnRequest = {
                modSlot: modSlot,
                isRandomisableSlot: isRandomisableSlot,
                botWeaponSightWhitelist: botWeaponSightWhitelist,
                botEquipBlacklist: botEquipBlacklist,
                itemModPool: compatibleModsPool,
                weapon: request.weapon,
                ammoTpl: request.ammoTpl,
                parentTemplate: request.parentTemplate,
                modSpawnResult: modSpawnResult,
                weaponStats: request.weaponStats,
            };
            const modToAdd = this.chooseModToPutIntoSlot(modToSpawnRequest);

            // Compatible mod not found
            if (!modToAdd || typeof modToAdd === "undefined")
            {
                continue;
            }

            if (!this.isModValidForSlot(modToAdd, modsParentSlot, modSlot, request.parentTemplate, request.botData.role))
            {
                continue;
            }

            const modToAddTemplate = modToAdd[1];
            // Skip adding mod to weapon if type limit reached
            if (
                this.botWeaponModLimitService.weaponModHasReachedLimit(
                    request.botData.equipmentRole,
                    modToAddTemplate,
                    request.modLimits,
                    request.parentTemplate,
                    request.weapon,
                )
            )
            {
                continue;
            }

            // If item is a mount for scopes, set scope chance to 100%, this helps fix empty mounts appearing on weapons
            if (this.modSlotCanHoldScope(modSlot, modToAddTemplate._parent))
            {
                // mod_mount was picked to be added to weapon, force scope chance to ensure its filled
                const scopeSlots = ["mod_scope", "mod_scope_000", "mod_scope_001", "mod_scope_002", "mod_scope_003"];
                this.adjustSlotSpawnChances(request.modSpawnChances, scopeSlots, 100);

                // Hydrate pool of mods that fit into mount as its a randomisable slot
                if (isRandomisableSlot)
                {
                    // Add scope mods to modPool dictionary to ensure the mount has a scope in the pool to pick
                    this.addCompatibleModsForProvidedMod("mod_scope", modToAddTemplate, request.modPool, botEquipBlacklist);
                }
            }

            // If picked item is muzzle adapter that can hold a child, adjust spawn chance
            if (this.modSlotCanHoldMuzzleDevices(modSlot, modToAddTemplate._parent))
            {
                const muzzleSlots = ["mod_muzzle", "mod_muzzle_000", "mod_muzzle_001"];
                // Make chance of muzzle devices 95%, nearly certain but not guaranteed
                this.adjustSlotSpawnChances(request.modSpawnChances, muzzleSlots, 95);
            }

            // If front/rear sight are to be added, set opposite to 100% chance
            if (this.modIsFrontOrRearSight(modSlot, modToAddTemplate._id))
            {
                request.modSpawnChances.mod_sight_front = 100;
                request.modSpawnChances.mod_sight_rear = 100;
            }

            // Handguard mod can take a sub handguard mod + weapon has no UBGL (takes same slot)
            // Force spawn chance to be 100% to ensure it gets added
            if (
                modSlot === "mod_handguard"
                && modToAddTemplate._props.Slots.find((slot) => slot._name === "mod_handguard")
                && !request.weapon.find((item) => item.slotId === "mod_launcher")
            )
            {
                // Needed for handguards with lower
                request.modSpawnChances.mod_handguard = 100;
            }

            // If stock mod can take a sub stock mod, force spawn chance to be 100% to ensure sub-stock gets added
            // Or if mod_stock is configured to be forced on
            if (
                modSlot === "mod_stock"
                && modToAddTemplate._props.Slots.find(
                    (slot) => slot._name.includes("mod_stock") || botEquipConfig.forceStock,
                )
            )
            {
                // Stock mod can take additional stocks, could be a locking device, force 100% chance
                const stockSlots = ["mod_stock", "mod_stock_000", "mod_stock_akms"];
                this.adjustSlotSpawnChances(request.modSpawnChances, stockSlots, 100);
            }

            // Gather stats on mods being added to weapon
            if (this.itemHelper.isOfBaseclass(modToAddTemplate._id, BaseClasses.IRON_SIGHT))
            {
                if (modSlot === "mod_sight_front")
                {
                    request.weaponStats.hasFrontIronSight = true;
                }
                else if (modSlot === "mod_sight_rear")
                {
                    request.weaponStats.hasRearIronSight = true;
                }
            }
            else if (!request.weaponStats.hasOptic
              && this.itemHelper.isOfBaseclass(modToAddTemplate._id, BaseClasses.SIGHTS))
            {
                request.weaponStats.hasOptic = true;
            }

            const modId = this.hashUtil.generate();
            request.weapon.push(this.createModItem(
                modId,
                modToAddTemplate._id,
                request.weaponId,
                modSlot,
                modToAddTemplate,
                request.botData.role));

            // I first thought we could use the recursive generateModsForItems as previously for cylinder magazines.
            // However, the recursion doesn't go over the slots of the parent mod but over the modPool which is given by the bot config
            // where we decided to keep cartridges instead of camoras. And since a CylinderMagazine only has one cartridge entry and
            // this entry is not to be filled, we need a special handling for the CylinderMagazine
            const modParentItem = this.databaseServer.getTables().templates.items[modToAddTemplate._parent];
            if (this.botWeaponGeneratorHelper.magazineIsCylinderRelated(modParentItem._name))
            {
                // We don't have child mods, we need to create the camoras for the magazines instead
                this.fillCamora(request.weapon, request.modPool, modId, modToAddTemplate);
            }
            else
            {
                let containsModInPool = Object.keys(request.modPool).includes(modToAddTemplate._id);

                // Sometimes randomised slots are missing sub-mods, if so, get values from mod pool service
                // Check for a randomisable slot + without data in modPool + item being added as additional slots
                if (isRandomisableSlot && !containsModInPool && modToAddTemplate._props.Slots.length > 0)
                {
                    const modFromService = this.botEquipmentModPoolService.getModsForWeaponSlot(modToAddTemplate._id);
                    if (Object.keys(modFromService ?? {}).length > 0)
                    {
                        request.modPool[modToAddTemplate._id] = modFromService;
                        containsModInPool = true;
                    }
                }
                if (containsModInPool)
                {
                    const recursiveRequestData: IGenerateWeaponRequest = {
                        weapon: request.weapon,
                        modPool: request.modPool,
                        weaponId: modId,
                        parentTemplate: modToAddTemplate,
                        modSpawnChances: request.modSpawnChances,
                        ammoTpl: request.ammoTpl,
                        botData: {
                            role: request.botData.role,
                            level: request.botData.level,
                            equipmentRole: request.botData.equipmentRole },
                        modLimits: request.modLimits,
                        weaponStats: request.weaponStats,
                    };
                    // Call self recursively to add mods to this mod
                    this.generateModsForWeapon(
                        sessionId,
                        recursiveRequestData,
                    );
                }
            }
        }

        return request.weapon;
    }

    /**
     * Is this modslot a front or rear sight
     * @param modSlot Slot to check
     * @returns true if it's a front/rear sight
     */
    protected modIsFrontOrRearSight(modSlot: string, tpl: string): boolean
    {
        // Gas block /w front sight is special case, deem it a 'front sight' too
        if (modSlot === "mod_gas_block" && tpl === "5ae30e795acfc408fb139a0b")
        {
            // M4A1 front sight with gas block
            return true;
        }

        return ["mod_sight_front", "mod_sight_rear"].includes(modSlot);
    }

    /**
     * Does the provided mod details show the mod can hold a scope
     * @param modSlot e.g. mod_scope, mod_mount
     * @param modsParentId Parent id of mod item
     * @returns true if it can hold a scope
     */
    protected modSlotCanHoldScope(modSlot: string, modsParentId: string): boolean
    {
        return (
            [
                "mod_scope",
                "mod_mount",
                "mod_mount_000",
                "mod_scope_000",
                "mod_scope_001",
                "mod_scope_002",
                "mod_scope_003",
            ].includes(modSlot.toLowerCase()) && modsParentId === BaseClasses.MOUNT
        );
    }

    /**
     * Set mod spawn chances to defined amount
     * @param modSpawnChances Chance dictionary to update
     */
    protected adjustSlotSpawnChances(
        modSpawnChances: ModsChances,
        modSlotsToAdjust: string[],
        newChancePercent: number,
    ): void
    {
        if (!modSpawnChances)
        {
            this.logger.warning("Unable to adjust scope spawn chances as spawn chance object is empty");

            return;
        }

        if (!modSlotsToAdjust)
        {
            return;
        }

        for (const modName of modSlotsToAdjust)
        {
            modSpawnChances[modName] = newChancePercent;
        }
    }

    protected modSlotCanHoldMuzzleDevices(modSlot: string, modsParentId: string): boolean
    {
        return ["mod_muzzle", "mod_muzzle_000", "mod_muzzle_001"].includes(modSlot.toLowerCase());
    }

    protected sortModKeys(unsortedKeys: string[]): string[]
    {
        if (unsortedKeys.length <= 1)
        {
            return unsortedKeys;
        }

        const sortedKeys: string[] = [];
        const modRecieverKey = "mod_reciever";
        const modMount001Key = "mod_mount_001";
        const modGasBlockKey = "mod_gas_block";
        const modPistolGrip = "mod_pistol_grip";
        const modStockKey = "mod_stock";
        const modBarrelKey = "mod_barrel";
        const modHandguardKey = "mod_handguard";
        const modMountKey = "mod_mount";
        const modScopeKey = "mod_scope";

        if (unsortedKeys.includes(modHandguardKey))
        {
            sortedKeys.push(modHandguardKey);
            unsortedKeys.splice(unsortedKeys.indexOf(modHandguardKey), 1);
        }

        if (unsortedKeys.includes(modBarrelKey))
        {
            sortedKeys.push(modBarrelKey);
            unsortedKeys.splice(unsortedKeys.indexOf(modBarrelKey), 1);
        }

        if (unsortedKeys.includes(modMount001Key))
        {
            sortedKeys.push(modMount001Key);
            unsortedKeys.splice(unsortedKeys.indexOf(modMount001Key), 1);
        }

        if (unsortedKeys.includes(modRecieverKey))
        {
            sortedKeys.push(modRecieverKey);
            unsortedKeys.splice(unsortedKeys.indexOf(modRecieverKey), 1);
        }

        if (unsortedKeys.includes(modPistolGrip))
        {
            sortedKeys.push(modPistolGrip);
            unsortedKeys.splice(unsortedKeys.indexOf(modPistolGrip), 1);
        }

        if (unsortedKeys.includes(modGasBlockKey))
        {
            sortedKeys.push(modGasBlockKey);
            unsortedKeys.splice(unsortedKeys.indexOf(modGasBlockKey), 1);
        }

        if (unsortedKeys.includes(modStockKey))
        {
            sortedKeys.push(modStockKey);
            unsortedKeys.splice(unsortedKeys.indexOf(modStockKey), 1);
        }

        if (unsortedKeys.includes(modMountKey))
        {
            sortedKeys.push(modMountKey);
            unsortedKeys.splice(unsortedKeys.indexOf(modMountKey), 1);
        }

        if (unsortedKeys.includes(modScopeKey))
        {
            sortedKeys.push(modScopeKey);
            unsortedKeys.splice(unsortedKeys.indexOf(modScopeKey), 1);
        }

        sortedKeys.push(...unsortedKeys);

        return sortedKeys;
    }

    /**
     * Get a Slot property for an item (chamber/cartridge/slot)
     * @param modSlot e.g patron_in_weapon
     * @param parentTemplate item template
     * @returns Slot item
     */
    protected getModItemSlotFromDb(modSlot: string, parentTemplate: ITemplateItem): Slot
    {
        const modSlotLower = modSlot.toLowerCase();
        switch (modSlotLower)
        {
            case "patron_in_weapon":
            case "patron_in_weapon_000":
            case "patron_in_weapon_001":
                return parentTemplate._props.Chambers.find((chamber) => chamber._name.includes(modSlotLower));
            case "cartridges":
                return parentTemplate._props.Cartridges.find((c) => c._name.toLowerCase() === modSlotLower);
            default:
                return parentTemplate._props.Slots.find((s) => s._name.toLowerCase() === modSlotLower);
        }
    }

    /**
     * Randomly choose if a mod should be spawned, 100% for required mods OR mod is ammo slot
     * @param itemSlot slot the item sits in
     * @param modSlot slot the mod sits in
     * @param modSpawnChances Chances for various mod spawns
     * @param botEquipConfig Various config settings for generating this type of bot
     * @returns ModSpawn.SPAWN when mod should be spawned, ModSpawn.DEFAULT_MOD when default mod should spawn, ModSpawn.SKIP when mod is skipped
     */
    protected shouldModBeSpawned(
        itemSlot: Slot,
        modSlot: string,
        modSpawnChances: ModsChances,
        botEquipConfig: EquipmentFilters,
    ): ModSpawn
    {
        const slotRequired = itemSlot._required;
        if (this.getAmmoContainers().includes(modSlot))
        {
            return ModSpawn.SPAWN;
        }
        const spawnMod = this.probabilityHelper.rollChance(modSpawnChances[modSlot]);
        if (!spawnMod && (slotRequired || botEquipConfig.weaponSlotIdsToMakeRequired?.includes(modSlot)))
        {
            // Mod is required but spawn chance roll failed, choose default mod spawn for slot
            return ModSpawn.DEFAULT_MOD;
        }

        return spawnMod ? ModSpawn.SPAWN : ModSpawn.SKIP;
    }

    /**
     * Choose a mod to fit into the desired slot
     * @param request Data used to choose an appropriate mod with
     * @returns itemHelper.getItem() result
     */
    protected chooseModToPutIntoSlot(
        request: IModToSpawnRequest,
    ): [boolean, ITemplateItem]
    {
        /** Slot mod will fill */
        const parentSlot = request.parentTemplate._props.Slots.find((i) => i._name === request.modSlot);
        const weaponTemplate = this.itemHelper.getItem(request.weapon[0]._tpl)[1];

        // It's ammo, use predefined ammo parameter
        if (this.getAmmoContainers().includes(request.modSlot) && request.modSlot !== "mod_magazine")
        {
            return this.itemHelper.getItem(request.ammoTpl);
        }

        // Ensure there's a pool of mods to pick from
        let modPool = this.getModPoolForSlot(
            request.itemModPool,
            request.modSpawnResult,
            request.parentTemplate,
            weaponTemplate,
            request.modSlot,
            request.botEquipBlacklist,
            request.isRandomisableSlot,
        );
        if (!(modPool || parentSlot._required))
        {
            // Nothing in mod pool + item not required
            this.logger.debug(`Mod pool for slot: ${request.modSlot} on item: ${request.parentTemplate._name} was empty, skipping mod`);
            return undefined;
        }

        // Filter out non-whitelisted scopes, use full modpool if filtered pool would have no elements
        if (request.modSlot.includes("mod_scope") && request.botWeaponSightWhitelist)
        {
            // scope pool has more than one scope
            if (modPool.length > 1)
            {
                modPool = this.filterSightsByWeaponType(request.weapon[0], modPool, request.botWeaponSightWhitelist);
            }
        }

        if (request.modSlot == "mod_gas_block")
        {
            if (request.weaponStats.hasOptic && modPool.length > 1)
            {
                // Attempt to limit modpool to low profile gas blocks when weapon has an optic
                const onlyLowProfileGasBlocks = modPool
                    .filter((tpl) => this.botConfig.lowProfileGasBlockTpls.includes(tpl));
                if (onlyLowProfileGasBlocks.length > 0)
                {
                    modPool = onlyLowProfileGasBlocks;
                }
            }
            else if (request.weaponStats.hasRearIronSight && modPool.length > 1)
            {
                // Attempt to limit modpool to high profile gas blocks when weapon has rear iron sight + no front iron sight
                const onlyHighProfileGasBlocks = modPool
                    .filter((tpl) => !this.botConfig.lowProfileGasBlockTpls.includes(tpl));
                if (onlyHighProfileGasBlocks.length > 0)
                {
                    modPool = onlyHighProfileGasBlocks;
                }
            }
        }

        // Pick random mod that's compatible
        const chosenModResult = this.pickWeaponModTplForSlotFromPool(
            modPool,
            parentSlot,
            request.modSpawnResult,
            request.weapon,
            request.modSlot,
        );
        if (chosenModResult.slotBlocked && !parentSlot._required)
        {
            // Don't bother trying to fit mod, slot is completely blocked
            return undefined;
        }

        // Log if mod chosen was incompatible
        if (chosenModResult.incompatible && parentSlot._required)
        {
            this.logger.debug(chosenModResult.reason);
            // this.logger.debug(`Weapon: ${weapon.map(x => `${x._tpl} ${x.slotId ?? ""}`).join(",")}`)
        }

        // Get random mod to attach from items db for required slots if none found above
        if (!chosenModResult.found && parentSlot !== undefined && parentSlot._required)
        {
            chosenModResult.chosenTpl = this.getRandomModTplFromItemDb("", parentSlot, request.modSlot, request.weapon);
            chosenModResult.found = true;
        }

        // Compatible item not found + not required
        if (!chosenModResult.found && parentSlot !== undefined && !parentSlot._required)
        {
            return undefined;
        }

        if (!chosenModResult.found && parentSlot !== undefined)
        {
            if (parentSlot._required)
            {
                this.logger.warning(
                    `Required slot unable to be filled, ${request.modSlot} on ${request.parentTemplate._name} ${request.parentTemplate._id} for weapon: ${request.weapon[0]._tpl}`,
                );
            }

            return undefined;
        }

        return this.itemHelper.getItem(chosenModResult.chosenTpl);
    }

    protected pickWeaponModTplForSlotFromPool(
        modPool: string[],
        parentSlot: Slot,
        modSpawnResult: ModSpawn,
        weapon: Item[],
        modSlotname: string,
    ): IChooseRandomCompatibleModResult
    {
        let chosenTpl: string;
        const exhaustableModPool = new ExhaustableArray(modPool, this.randomUtil, this.cloner);
        let chosenModResult: IChooseRandomCompatibleModResult = { incompatible: true, found: false, reason: "unknown" };
        const modParentFilterList = parentSlot._props.filters[0].Filter;

        // How many times can a mod for the slot be blocked before we stop trying
        const maxBlockedAttempts = Math.round(modPool.length * 0.75); // Roughly 75% of pool size
        let blockedAttemptCount = 0;
        while (exhaustableModPool.hasValues())
        {
            chosenTpl = exhaustableModPool.getRandomValue();
            if (modSpawnResult === ModSpawn.DEFAULT_MOD && modPool.length === 1)
            {
                // Default mod wanted and only one choice in pool
                chosenModResult.found = true;
                chosenModResult.incompatible = false;
                chosenModResult.chosenTpl = chosenTpl;

                break;
            }

            // Check chosen item is on the allowed list of the parent
            const isOnModParentFilterList = modParentFilterList.includes(chosenTpl);
            if (!isOnModParentFilterList)
            {
                // Try again
                continue;
            }

            chosenModResult = this.botGeneratorHelper.isWeaponModIncompatibleWithCurrentMods(
                weapon,
                chosenTpl,
                modSlotname,
            );

            if (chosenModResult.slotBlocked)
            {
                // Give max of x attempts of picking a mod if blocked by another
                if (blockedAttemptCount > maxBlockedAttempts)
                {
                    blockedAttemptCount = 0;
                    break;
                }

                blockedAttemptCount++;

                // Try again
                continue;
            }

            // Some mod combos will never work, make sure this isnt the case
            if (!(chosenModResult.incompatible || this.weaponModComboIsIncompatible(weapon, chosenTpl)))
            {
                // Success
                chosenModResult.found = true;
                chosenModResult.incompatible = false;
                chosenModResult.chosenTpl = chosenTpl;

                break;
            }
        }

        return chosenModResult;
    }

    /**
     * Filter mod pool down based on various criteria:
     * Is slot flagged as randomisable
     * Is slot required
     * Is slot flagged as default mod only
     * @param itemModPool Existing pool of mods to choose
     * @param modSpawnResult outcome of random roll to select if mod should be added
     * @param parentTemplate Mods parent
     * @param weaponTemplate Mods root parent (weapon/equipment)
     * @param modSlot name of mod slot to choose for
     * @param botEquipBlacklist
     * @param isRandomisableSlot is flagged as a randomisable slot
     * @returns
     */
    protected getModPoolForSlot(
        itemModPool: Record<string, string[]>,
        modSpawnResult: ModSpawn,
        parentTemplate: ITemplateItem,
        weaponTemplate: ITemplateItem,
        modSlot: string,
        botEquipBlacklist: EquipmentFilterDetails,
        isRandomisableSlot: boolean,
    ): string[]
    {
        // Mod is flagged as being default only, try and find it in globals
        if (modSpawnResult === ModSpawn.DEFAULT_MOD)
        {
            const matchingPreset = this.getMatchingPreset(weaponTemplate, parentTemplate._id);
            const matchingModFromPreset = matchingPreset?._items.find(
                (item) => item?.slotId?.toLowerCase() === modSlot.toLowerCase(),
            );

            // Only filter mods down to single default item if it already exists in existing itemModPool, OR the default item has no children
            // Filtering mod pool to item that wasnt already there can have problems;
            // You'd have a mod being picked without any sub-mods in its chain, possibly resulting in missing required mods not being added
            if (matchingModFromPreset)
            {
                // Mod is in existing mod pool
                if (itemModPool[modSlot].includes(matchingModFromPreset._tpl))
                {
                    // Found mod on preset + it already exists in mod pool
                    return [matchingModFromPreset._tpl];
                }

                // Get an array of items that are allowed in slot from parent item
                // Check the filter of the slot to ensure a chosen mod fits
                const parentSlotCompatibleItems = parentTemplate._props.Slots?.find(
                    (slot) => slot._name.toLowerCase() === modSlot.toLowerCase(),
                )._props.filters[0].Filter;

                // Mod isnt in existing pool, only add if it has no children and matches parent filter
                if (
                    parentSlotCompatibleItems.includes(matchingModFromPreset._tpl)
                    && this.itemHelper.getItem(matchingModFromPreset._tpl)[1]._props.Slots.length === 0
                )
                {
                    // Mod has no children and matches parent filters, can be used
                    return [matchingModFromPreset._tpl];
                }
            }

            if (itemModPool[modSlot]?.length > 1)
            {
                this.logger.debug(
                    `No default: ${modSlot} mod found on template: ${weaponTemplate._name} and multiple items found in existing pool`,
                );
            }

            // Couldnt find default in globals, use existing mod pool data
            return itemModPool[modSlot];
        }

        if (isRandomisableSlot)
        {
            return this.getDynamicModPool(parentTemplate._id, modSlot, botEquipBlacklist);
        }

        // Required mod is not default or randomisable, use existing pool
        return itemModPool[modSlot];
    }

    /**
     * Get default preset for weapon, get specific weapon presets for edge cases (mp5/silenced dvl)
     * @param weaponTemplate
     * @param parentItemTpl
     * @returns Default preset found
     */
    protected getMatchingPreset(weaponTemplate: ITemplateItem, parentItemTpl: string): IPreset
    {
        // Edge case - using mp5sd reciever means default mp5 handguard doesnt fit
        const isMp5sd = parentItemTpl === "5926f2e086f7745aae644231";
        if (isMp5sd)
        {
            return this.presetHelper.getPreset("59411abb86f77478f702b5d2");
        }

        // Edge case - dvl 500mm is the silenced barrel and has specific muzzle mods
        const isDvl500mmSilencedBarrel = parentItemTpl === "5888945a2459774bf43ba385";
        if (isDvl500mmSilencedBarrel)
        {
            return this.presetHelper.getPreset("59e8d2b386f77445830dd299");
        }

        return this.presetHelper.getDefaultPreset(weaponTemplate._id);
    }

    /**
     * Temp fix to prevent certain combinations of weapons with mods that are known to be incompatible
     * @param weapon Weapon
     * @param modTpl Mod to check compatibility with weapon
     * @returns True if incompatible
     */
    protected weaponModComboIsIncompatible(weapon: Item[], modTpl: string): boolean
    {
        // STM-9 + AR-15 Lone Star Ion Lite handguard
        if (weapon[0]._tpl === "60339954d62c9b14ed777c06" && modTpl === "5d4405f0a4b9361e6a4e6bd9")
        {
            return true;
        }

        return false;
    }

    /**
     * Create a mod item with parameters as properties
     * @param modId _id
     * @param modTpl _tpl
     * @param parentId parentId
     * @param modSlot slotId
     * @param modTemplate Used to add additional properties in the upd object
     * @returns Item object
     */
    protected createModItem(
        modId: string,
        modTpl: string,
        parentId: string,
        modSlot: string,
        modTemplate: ITemplateItem,
        botRole: string,
    ): Item
    {
        return {
            _id: modId,
            _tpl: modTpl,
            parentId: parentId,
            slotId: modSlot,
            ...this.botGeneratorHelper.generateExtraPropertiesForItem(modTemplate, botRole),
        };
    }

    /**
     * Get a list of containers that hold ammo
     * e.g. mod_magazine / patron_in_weapon_000
     * @returns string array
     */
    protected getAmmoContainers(): string[]
    {
        return ["mod_magazine", "patron_in_weapon", "patron_in_weapon_000", "patron_in_weapon_001", "cartridges"];
    }

    /**
     * Get a random mod from an items compatible mods Filter array
     * @param modTpl ???? default value to return if nothing found
     * @param parentSlot item mod will go into, used to get compatible items
     * @param modSlot Slot to get mod to fill
     * @param items items to ensure picked mod is compatible with
     * @returns item tpl
     */
    protected getRandomModTplFromItemDb(modTpl: string, parentSlot: Slot, modSlot: string, items: Item[]): string
    {
        // Find compatible mods and make an array of them
        const allowedItems = parentSlot._props.filters[0].Filter;

        // Find mod item that fits slot from sorted mod array
        const exhaustableModPool = new ExhaustableArray(allowedItems, this.randomUtil, this.cloner);
        let tmpModTpl = modTpl;
        while (exhaustableModPool.hasValues())
        {
            tmpModTpl = exhaustableModPool.getRandomValue();
            if (!this.botGeneratorHelper.isItemIncompatibleWithCurrentItems(items, tmpModTpl, modSlot).incompatible)
            {
                return tmpModTpl;
            }
        }

        // No mod found
        return undefined;
    }

    /**
     * Check if mod exists in db + is for a required slot
     * @param modToAdd Db template of mod to check
     * @param slotAddedToTemplate Slot object the item will be placed as child into
     * @param modSlot Slot the mod will fill
     * @param parentTemplate Db template of the mods being added
     * @param botRole Bots wildspawntype (assault/pmcBot etc)
     * @returns true if valid
     */
    protected isModValidForSlot(
        modToAdd: [boolean, ITemplateItem],
        slotAddedToTemplate: Slot,
        modSlot: string,
        parentTemplate: ITemplateItem,
        botRole: string,
    ): boolean
    {
        const modBeingAddedDbTemplate = modToAdd[1];

        // Mod lacks db template object
        if (!modBeingAddedDbTemplate)
        {
            this.logger.error(
                this.localisationService.getText("bot-no_item_template_found_when_adding_mod", {
                    modId: modBeingAddedDbTemplate?._id ?? "UNKNOWN",
                    modSlot: modSlot,
                }),
            );
            this.logger.debug(`Item -> ${parentTemplate?._id}; Slot -> ${modSlot}`);

            return false;
        }

        // Mod has invalid db item
        if (!modToAdd[0])
        {
            // Parent slot must be filled but db object is invalid, show warning and return false
            if (slotAddedToTemplate._required)
            {
                this.logger.warning(
                    this.localisationService.getText("bot-unable_to_add_mod_item_invalid", {
                        itemName: modBeingAddedDbTemplate?._name ?? "UNKNOWN",
                        modSlot: modSlot,
                        parentItemName: parentTemplate._name,
                        botRole: botRole,
                    }),
                );
            }

            return false;
        }

        // Mod was found in db
        return true;
    }

    /**
     * Find mod tpls of a provided type and add to modPool
     * @param desiredSlotName slot to look up and add we are adding tpls for (e.g mod_scope)
     * @param modTemplate db object for modItem we get compatible mods from
     * @param modPool Pool of mods we are adding to
     */
    protected addCompatibleModsForProvidedMod(
        desiredSlotName: string,
        modTemplate: ITemplateItem,
        modPool: Mods,
        botEquipBlacklist: EquipmentFilterDetails,
    ): void
    {
        const desiredSlotObject = modTemplate._props.Slots.find((slot) => slot._name.includes(desiredSlotName));
        if (desiredSlotObject)
        {
            const supportedSubMods = desiredSlotObject._props.filters[0].Filter;
            if (supportedSubMods)
            {
                // Filter mods
                let filteredMods = this.filterWeaponModsByBlacklist(
                    supportedSubMods,
                    botEquipBlacklist,
                    desiredSlotName,
                );
                if (filteredMods.length === 0)
                {
                    this.logger.warning(
                        this.localisationService.getText("bot-unable_to_filter_mods_all_blacklisted", {
                            slotName: desiredSlotObject._name,
                            itemName: modTemplate._name,
                        }),
                    );
                    filteredMods = supportedSubMods;
                }

                if (!modPool[modTemplate._id])
                {
                    modPool[modTemplate._id] = {};
                }

                modPool[modTemplate._id][desiredSlotObject._name] = supportedSubMods;
            }
        }
    }

    /**
     * Get the possible items that fit a slot
     * @param parentItemId item tpl to get compatible items for
     * @param modSlot Slot item should fit in
     * @param botEquipBlacklist equipment that should not be picked
     * @returns array of compatible items for that slot
     */
    protected getDynamicModPool(
        parentItemId: string,
        modSlot: string,
        botEquipBlacklist: EquipmentFilterDetails,
    ): string[]
    {
        const modsFromDynamicPool = this.cloner.clone(
            this.botEquipmentModPoolService.getCompatibleModsForWeaponSlot(parentItemId, modSlot),
        );

        const filteredMods = this.filterWeaponModsByBlacklist(modsFromDynamicPool, botEquipBlacklist, modSlot);
        if (filteredMods.length === 0)
        {
            this.logger.warning(
                this.localisationService.getText("bot-unable_to_filter_mod_slot_all_blacklisted", modSlot),
            );
            return modsFromDynamicPool;
        }

        return filteredMods;
    }

    /**
     * Take a list of tpls and filter out blacklisted values using itemFilterService + botEquipmentBlacklist
     * @param allowedMods base mods to filter
     * @param botEquipBlacklist equipment blacklist
     * @param modSlot slot mods belong to
     * @returns Filtered array of mod tpls
     */
    protected filterWeaponModsByBlacklist(
        allowedMods: string[],
        botEquipBlacklist: EquipmentFilterDetails,
        modSlot: string,
    ): string[]
    {
        if (!botEquipBlacklist)
        {
            return allowedMods;
        }

        let result: string[] = [];

        // Get item blacklist and mod equipment blacklist as one array
        const blacklist = this.itemFilterService
            .getBlacklistedItems()
            .concat(botEquipBlacklist.equipment[modSlot] || []);
        result = allowedMods.filter((tpl) => !blacklist.includes(tpl));

        return result;
    }

    /**
     * With the shotgun revolver (60db29ce99594040e04c4a27) 12.12 introduced CylinderMagazines.
     * Those magazines (e.g. 60dc519adf4c47305f6d410d) have a "Cartridges" entry with a _max_count=0.
     * Ammo is not put into the magazine directly but assigned to the magazine's slots: The "camora_xxx" slots.
     * This function is a helper called by generateModsForItem for mods with parent type "CylinderMagazine"
     * @param items The items where the CylinderMagazine's camora are appended to
     * @param modPool modPool which should include available cartridges
     * @param parentId The CylinderMagazine's UID
     * @param parentTemplate The CylinderMagazine's template
     */
    protected fillCamora(items: Item[], modPool: Mods, parentId: string, parentTemplate: ITemplateItem): void
    {
        let itemModPool = modPool[parentTemplate._id];
        if (!itemModPool)
        {
            this.logger.warning(
                this.localisationService.getText("bot-unable_to_fill_camora_slot_mod_pool_empty", {
                    weaponId: parentTemplate._id,
                    weaponName: parentTemplate._name,
                }),
            );
            const camoraSlots = parentTemplate._props.Slots.filter((slot) => slot._name.startsWith("camora"));

            // Attempt to generate camora slots for item
            modPool[parentTemplate._id] = {};
            for (const camora of camoraSlots)
            {
                modPool[parentTemplate._id][camora._name] = camora._props.filters[0].Filter;
            }
            itemModPool = modPool[parentTemplate._id];
        }

        let exhaustableModPool = undefined;
        let modSlot = "cartridges";
        const camoraFirstSlot = "camora_000";
        if (modSlot in itemModPool)
        {
            exhaustableModPool = new ExhaustableArray(itemModPool[modSlot], this.randomUtil, this.cloner);
        }
        else if (camoraFirstSlot in itemModPool)
        {
            modSlot = camoraFirstSlot;
            exhaustableModPool = new ExhaustableArray(
                this.mergeCamoraPoolsTogether(itemModPool),
                this.randomUtil,
                this.cloner,
            );
        }
        else
        {
            this.logger.error(this.localisationService.getText("bot-missing_cartridge_slot", parentTemplate._id));

            return;
        }

        let modTpl: string;
        let found = false;
        while (exhaustableModPool.hasValues())
        {
            modTpl = exhaustableModPool.getRandomValue();
            if (!this.botGeneratorHelper.isItemIncompatibleWithCurrentItems(items, modTpl, modSlot).incompatible)
            {
                found = true;
                break;
            }
        }

        if (!found)
        {
            this.logger.error(this.localisationService.getText("bot-no_compatible_camora_ammo_found", modSlot));

            return;
        }

        for (const slot of parentTemplate._props.Slots)
        {
            const modSlotId = slot._name;
            const modId = this.hashUtil.generate();
            items.push({ _id: modId, _tpl: modTpl, parentId: parentId, slotId: modSlotId });
        }
    }

    /**
     * Take a record of camoras and merge the compatible shells into one array
     * @param camorasWithShells camoras we want to merge into one array
     * @returns string array of shells for multiple camora sources
     */
    protected mergeCamoraPoolsTogether(camorasWithShells: Record<string, string[]>): string[]
    {
        const poolResult: string[] = [];
        for (const camoraKey in camorasWithShells)
        {
            const shells = camorasWithShells[camoraKey];
            for (const shell of shells)
            {
                // Only add distinct shells
                if (!poolResult.includes(shell))
                {
                    poolResult.push(shell);
                }
            }
        }

        return poolResult;
    }

    /**
     * Filter out non-whitelisted weapon scopes
     * Controlled by bot.json weaponSightWhitelist
     * e.g. filter out rifle scopes from SMGs
     * @param weapon Weapon scopes will be added to
     * @param scopes Full scope pool
     * @param botWeaponSightWhitelist Whitelist of scope types by weapon base type
     * @returns Array of scope tpls that have been filtered to just ones allowed for that weapon type
     */
    protected filterSightsByWeaponType(
        weapon: Item,
        scopes: string[],
        botWeaponSightWhitelist: Record<string, string[]>,
    ): string[]
    {
        const weaponDetails = this.itemHelper.getItem(weapon._tpl);

        // Return original scopes array if whitelist not found
        const whitelistedSightTypes = botWeaponSightWhitelist[weaponDetails[1]._parent];
        if (!whitelistedSightTypes)
        {
            this.logger.debug(
                `Unable to find whitelist for weapon type: ${weaponDetails[1]._parent} ${weaponDetails[1]._name}, skipping sight filtering`,
            );

            return scopes;
        }

        // Filter items that are not directly scopes OR mounts that do not hold the type of scope we allow for this weapon type
        const filteredScopesAndMods: string[] = [];
        for (const item of scopes)
        {
            // Mods is a scope, check base class is allowed
            if (this.itemHelper.isOfBaseclasses(item, whitelistedSightTypes))
            {
                // Add mod to allowed list
                filteredScopesAndMods.push(item);
                continue;
            }

            // Edge case, what if item is a mount for a scope and not directly a scope?
            // Check item is mount + has child items
            const itemDetails = this.itemHelper.getItem(item)[1];
            if (this.itemHelper.isOfBaseclass(item, BaseClasses.MOUNT) && itemDetails._props.Slots.length > 0)
            {
                // Check to see if mount has a scope slot (only include primary slot, ignore the rest like the backup sight slots)
                // Should only find 1 as there's currently no items with a mod_scope AND a mod_scope_000
                const scopeSlot = itemDetails._props.Slots.filter((slot) =>
                    ["mod_scope", "mod_scope_000"].includes(slot._name),
                );

                // Mods scope slot found must allow ALL whitelisted scope types OR be a mount
                if (
                    scopeSlot?.every((slot) =>
                        slot._props.filters[0].Filter.every(
                            (tpl) =>
                                this.itemHelper.isOfBaseclasses(tpl, whitelistedSightTypes)
                                || this.itemHelper.isOfBaseclass(tpl, BaseClasses.MOUNT),
                        ),
                    )
                )
                {
                    // Add mod to allowed list
                    filteredScopesAndMods.push(item);
                }
            }
        }

        // No mods added to return list after filtering has occurred, send back the original mod list
        if (!filteredScopesAndMods || filteredScopesAndMods.length === 0)
        {
            this.logger.debug(
                `Scope whitelist too restrictive for: ${weapon._tpl} ${weaponDetails[1]._name}, skipping filter`,
            );

            return scopes;
        }

        return filteredScopesAndMods;
    }
}
