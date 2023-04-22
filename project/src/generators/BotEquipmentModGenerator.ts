import { inject, injectable } from "tsyringe";

import { BotGeneratorHelper, ExhaustableArray } from "../helpers/BotGeneratorHelper";
import { BotHelper } from "../helpers/BotHelper";
import { BotWeaponGeneratorHelper } from "../helpers/BotWeaponGeneratorHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { ProbabilityHelper } from "../helpers/ProbabilityHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { Mods, ModsChances } from "../models/eft/common/tables/IBotType";
import { Item } from "../models/eft/common/tables/IItem";
import { ITemplateItem, Slot } from "../models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "../models/enums/BaseClasses";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { EquipmentFilterDetails, IBotConfig } from "../models/spt/config/IBotConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { BotEquipmentFilterService } from "../services/BotEquipmentFilterService";
import { BotEquipmentModPoolService } from "../services/BotEquipmentModPoolService";
import { BotModLimits, BotWeaponModLimitService } from "../services/BotWeaponModLimitService";
import { ItemBaseClassService } from "../services/ItemBaseClassService";
import { ItemFilterService } from "../services/ItemFilterService";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { RandomUtil } from "../utils/RandomUtil";

@injectable()
export class BotEquipmentModGenerator
{
    protected botConfig: IBotConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ProbabilityHelper") protected probabilityHelper: ProbabilityHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("BotEquipmentFilterService") protected botEquipmentFilterService: BotEquipmentFilterService,
        @inject("ItemBaseClassService") protected itemBaseClassService: ItemBaseClassService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("BotWeaponModLimitService") protected botWeaponModLimitService: BotWeaponModLimitService,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("BotWeaponGeneratorHelper") protected botWeaponGeneratorHelper: BotWeaponGeneratorHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotEquipmentModPoolService") protected botEquipmentModPoolService: BotEquipmentModPoolService,
        @inject("ConfigServer") protected configServer: ConfigServer
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
     * @param modSpawnChances dictionary of mod items and their chance to spawn for this bot type
     * @param botRole the bot role being generated for
     * @param forceSpawn should this mod be forced to spawn
     * @returns Item + compatible mods as an array
     */
    public generateModsForEquipment(equipment: Item[], modPool: Mods, parentId: string, parentTemplate: ITemplateItem, modSpawnChances: ModsChances, botRole: string, forceSpawn = false): Item[]
    {
        const compatibleModsPool = modPool[parentTemplate._id];

        // Iterate over mod pool and choose mods to add to item
        for (const modSlot in compatibleModsPool)
        {
            const itemSlot = this.getModItemSlot(modSlot, parentTemplate);
            if (!itemSlot)
            {
                this.logger.error(this.localisationService.getText("bot-mod_slot_missing_from_item", {modSlot: modSlot, parentId: parentTemplate._id, parentName: parentTemplate._name}));
                continue;
            }

            if (!(this.shouldModBeSpawned(itemSlot, modSlot, modSpawnChances) || forceSpawn))
            {
                continue;
            }

            // Ensure submods for nvgs all spawn together
            forceSpawn = (modSlot === "mod_nvg")
                ? true
                : false;

            let modTpl: string;
            let found = false;
            
            // Find random mod and check its compatible
            const exhaustableModPool = new ExhaustableArray(compatibleModsPool[modSlot], this.randomUtil, this.jsonUtil);
            while (exhaustableModPool.hasValues())
            {
                modTpl = exhaustableModPool.getRandomValue();
                if (!this.botGeneratorHelper.isItemIncompatibleWithCurrentItems(equipment, modTpl, modSlot).incompatible)
                {
                    found = true;
                    break;
                }
            }

            // Combatible item not found but slot REQUIRES item, get random item from db
            const parentSlot = parentTemplate._props.Slots.find(i => i._name === modSlot);
            if (!found && parentSlot !== undefined && parentSlot._required)
            {
                modTpl = this.getModTplFromItemDb(modTpl, parentSlot, modSlot, equipment);
                found = !!modTpl;
            }

            // Compatible item not found + not required
            if (!found && parentSlot !== undefined && !parentSlot._required)
            {
                // Dont add item
                continue;
            }

            const modTemplate = this.itemHelper.getItem(modTpl);
            if (!this.isModValidForSlot(modTemplate, itemSlot, modSlot, parentTemplate))
            {
                continue;
            }

            const modId = this.hashUtil.generate();
            equipment.push(this.createModItem(modId, modTpl, parentId, modSlot, modTemplate[1], botRole));

            if (Object.keys(modPool).includes(modTpl))
            {
                // Call self recursivly
                this.generateModsForEquipment(equipment, modPool, modId, modTemplate[1], modSpawnChances, botRole, forceSpawn);
            }
        }

        return equipment;
    }

    /**
     * Add mods to a weapon using the provided mod pool
     * @param sessionId session id
     * @param weapon Weapon to add mods to
     * @param modPool Pool of compatible mods to attach to weapon
     * @param weaponParentId parentId of weapon
     * @param parentTemplate Weapon which mods will be generated on
     * @param modSpawnChances Mod spawn chances
     * @param ammoTpl Ammo tpl to use when generating magazines/cartridges
     * @param botRole Role of bot weapon is generated for
     * @param botLevel lvel of the bot weapon is being generated for
     * @param modLimits limits placed on certian mod types per gun
     * @param botEquipmentRole role of bot when accessing bot.json equipment config settings
     * @returns Weapon + mods array
     */
    public generateModsForWeapon(
        sessionId: string,
        weapon: Item[],
        modPool: Mods,
        weaponParentId: string,
        parentTemplate: ITemplateItem,
        modSpawnChances: ModsChances,
        ammoTpl: string,
        botRole: string,
        botLevel: number,
        modLimits: BotModLimits,
        botEquipmentRole: string): Item[]
    {
        const pmcProfile = this.profileHelper.getPmcProfile(sessionId);

        // Get pool of mods that fit weapon
        const compatibleModsPool = modPool[parentTemplate._id];

        // Null guard against bad input weapon
        // rome-ignore lint/complexity/useSimplifiedLogicExpression: <explanation>
        if  (!parentTemplate._props.Slots.length
            && !parentTemplate._props.Cartridges?.length
            && !parentTemplate._props.Chambers?.length)
        {
            this.logger.error(this.localisationService.getText("bot-unable_to_add_mods_to_weapon_missing_ammo_slot", {weaponName: parentTemplate._name, weaponId: parentTemplate._id}));

            return weapon;
        }

        const botEquipConfig = this.botConfig.equipment[botEquipmentRole];
        const botEquipBlacklist = this.botEquipmentFilterService.getBotEquipmentBlacklist(botEquipmentRole, pmcProfile.Info.Level);
        const botWeaponSightWhitelist = this.botEquipmentFilterService.getBotWeaponSightWhitelist(botEquipmentRole);
        const randomisationSettings = this.botHelper.getBotRandomizationDetails(botLevel, botEquipConfig);

        const sortedModKeys = this.sortModKeys(Object.keys(compatibleModsPool));

        // Iterate over mod pool and choose mods to add to item
        for (const modSlot of sortedModKeys)
        {
            // Check weapon has slot for mod to fit in
            const modsParentSlot = this.getModItemSlot(modSlot, parentTemplate);
            if (!modsParentSlot)
            {
                this.logger.error(this.localisationService.getText("bot-weapon_missing_mod_slot", {modSlot: modSlot, weaponId: parentTemplate._id, weaponName: parentTemplate._name, botRole: botRole}));

                continue;
            }

            // Check spawn chance of mod
            if (!this.shouldModBeSpawned(modsParentSlot, modSlot, modSpawnChances))
            {
                continue;
            }

            const isRandomisableSlot = randomisationSettings?.randomisedWeaponModSlots?.includes(modSlot);
            const modToAdd = this.chooseModToPutIntoSlot(modSlot, isRandomisableSlot, botWeaponSightWhitelist, botEquipBlacklist, compatibleModsPool, weapon, ammoTpl, parentTemplate);

            // Compatible mod not found
            if (!modToAdd || typeof (modToAdd) === "undefined")
            {
                continue;
            }

            const modToAddTemplate = modToAdd[1];

            if (!this.isModValidForSlot(modToAdd, modsParentSlot, modSlot, parentTemplate))
            {
                continue;
            }

            // Skip adding mod to weapon if type limit reached
            if (this.botWeaponModLimitService.weaponModHasReachedLimit(botEquipmentRole, modToAddTemplate, modLimits, parentTemplate, weapon))
            {
                continue;
            }

            // If item is a mount for scopes, set scope chance to 100%, this helps fix empty mounts appearing on weapons
            if (this.modSlotCanHoldScope(modSlot, modToAddTemplate._parent))
            {
                // mod_mount was picked to be added to weapon, force scope chance to ensure its filled
                this.setScopeSpawnChancesToFull(modSpawnChances);

                // Hydrate pool of mods that fit into mount as its a randomisable slot
                if (isRandomisableSlot)
                {
                    // Add scope mods to modPool dictionary to ensure the mount has a scope in the pool to pick
                    this.addCompatibleModsForProvidedMod("mod_scope", modToAddTemplate, modPool, botEquipBlacklist);
                }
            }

            // If front/rear sight are to be added, set opposite to 100% chance
            if (this.modIsFrontOrRearSight(modSlot))
            {
                modSpawnChances.mod_sight_front = 100;
                modSpawnChances.mod_sight_rear = 100;
            }

            // If stock mod can take a sub stock mod, force spawn chance to be 100% to ensure stock gets added
            if (modSlot === "mod_stock" && modToAddTemplate._props.Slots.find(x => x._name === "mod_stock"))
            {
                // Stock mod can take additional stocks, could be a locking device, force 100% chance
                modSpawnChances.mod_stock = 100;
            }

            const modId = this.hashUtil.generate();
            weapon.push(this.createModItem(modId, modToAddTemplate._id, weaponParentId, modSlot, modToAddTemplate, botRole));
            
            // I first thought we could use the recursive generateModsForItems as previously for cylinder magazines.
            // However, the recursion doesnt go over the slots of the parent mod but over the modPool which is given by the bot config
            // where we decided to keep cartridges instead of camoras. And since a CylinderMagazine only has one cartridge entry and
            // this entry is not to be filled, we need a special handling for the CylinderMagazine
            const modParentItem = this.databaseServer.getTables().templates.items[modToAddTemplate._parent];
            if (this.botWeaponGeneratorHelper.magazineIsCylinderRelated(modParentItem._name))
            {
                // We don't have child mods, we need to create the camoras for the magazines instead
                this.fillCamora(weapon, modPool, modId, modToAddTemplate);
            }
            else
            {
                let containsModInPool = Object.keys(modPool).includes(modToAddTemplate._id);

                // Sometimes randomised slots are missing sub-mods, if so, get values from mod pool service
                // Check for a randomisable slot + without data in modPool + item being added as additional slots
                if (isRandomisableSlot && !containsModInPool && modToAddTemplate._props.Slots.length > 0)
                {
                    const modFromService = this.botEquipmentModPoolService.getModsForWeaponSlot(modToAddTemplate._id);
                    if (Object.keys(modFromService ?? {}).length > 0)
                    {
                        modPool[modToAddTemplate._id] = modFromService;
                        containsModInPool = true;
                    }
                }
                if (containsModInPool)
                {
                    // Call self recursivly to add mods to this mod
                    this.generateModsForWeapon(sessionId, weapon, modPool, modId, modToAddTemplate, modSpawnChances, ammoTpl, botRole, botLevel, modLimits, botEquipmentRole);
                }
            }
        }

        return weapon;
    }

    /**
     * Is this modslot a front or rear sight
     * @param modSlot Slot to check
     * @returns true if it's a front/rear sight
     */
    protected modIsFrontOrRearSight(modSlot: string): boolean
    {
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
        return ["mod_scope", "mod_mount", "mod_mount_000", "mod_scope_000", "mod_scope_001", "mod_scope_002", "mod_scope_003"].includes(modSlot.toLowerCase())
            && modsParentId === BaseClasses.MOUNT;
    }

    /**
     * Set all scope mod chances to 100%
     * @param modSpawnChances Chances objet to update
     */
    protected setScopeSpawnChancesToFull(modSpawnChances: ModsChances): void
    {
        if (!modSpawnChances)
        {
            this.logger.warning("Unable to adjust scope spawn chances as spawn chance object is empty");

            return;
        }

        const fullSpawnChancePercent = 100;
        const scopeMods = [
            "mod_scope",
            "mod_scope_000",
            "mod_scope_001",
            "mod_scope_002",
            "mod_scope_003"
        ];

        for (const modName of scopeMods)
        {
            modSpawnChances[modName] = fullSpawnChancePercent;
        }
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
        const modGasBLockKey = "mod_gas_block";
        const modPistolGrip = "mod_pistol_grip";
        const modStockKey = "mod_stock";
        const modBarrelKey = "mod_barrel";
        const modMountKey = "mod_mount";
        const modScopeKey = "mod_scope";

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

        if (unsortedKeys.includes(modGasBLockKey))
        {
            sortedKeys.push(modGasBLockKey);
            unsortedKeys.splice(unsortedKeys.indexOf(modGasBLockKey), 1);
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
    protected getModItemSlot(modSlot: string, parentTemplate: ITemplateItem): Slot
    {
        switch (modSlot)
        {
            case "patron_in_weapon":
            case "patron_in_weapon_000":
            case "patron_in_weapon_001":
                return parentTemplate._props.Chambers.find(c => c._name.includes(modSlot));
            case "cartridges":
                return parentTemplate._props.Cartridges.find(c => c._name === modSlot);
            default:
                return parentTemplate._props.Slots.find(s => s._name === modSlot);
        }
    }

    /**
     * Randomly choose if a mod should be spawned, 100% for required mods OR mod is ammo slot
     * never return true for an item that has 0% spawn chance
     * @param itemSlot slot the item sits in
     * @param modSlot slot the mod sits in
     * @param modSpawnChances Chances for various mod spawns
     * @returns boolean true if it should spawn
     */
    protected shouldModBeSpawned(itemSlot: Slot, modSlot: string, modSpawnChances: ModsChances): boolean
    {
        const modSpawnChance = itemSlot._required || this.getAmmoContainers().includes(modSlot) // Required OR it is ammo
            ? 100
            : modSpawnChances[modSlot];

        if (modSpawnChance === 100)
        {
            return true;
        }

        return this.probabilityHelper.rollChance(modSpawnChance);
    }

    /**
     * 
     * @param modSlot Slot mod will fit into
     * @param isRandomisableSlot Will generate a randomised mod pool if true
     * @param modsParent Parent slot the item will be a part of
     * @param botEquipBlacklist Blacklist to prevent mods from being picked
     * @param itemModPool Pool of items to pick from
     * @param weapon array with only weapon tpl in it, ready for mods to be added
     * @param ammoTpl ammo tpl to use if slot requires a cartridge to be added (e.g. mod_magazine)
     * @param parentTemplate Parent item the mod will go into
     * @returns ITemplateItem
     */
    protected chooseModToPutIntoSlot(
        modSlot: string,
        isRandomisableSlot: boolean,
        botWeaponSightWhitelist: Record<string, string[]>,
        botEquipBlacklist: EquipmentFilterDetails,
        itemModPool: Record<string, string[]>,
        weapon: Item[],
        ammoTpl: string,
        parentTemplate: ITemplateItem): [boolean, ITemplateItem]
    {
        let modTpl: string;
        let found = false;
        const parentSlot = parentTemplate._props.Slots.find(i => i._name === modSlot);
        
        // It's ammo, use predefined ammo parameter
        if (this.getAmmoContainers().includes(modSlot) && modSlot !== "mod_magazine")
        {
            modTpl = ammoTpl;
        }
        else
        {
            // Get randomised pool of mods if this is a slot we randomise
            if (isRandomisableSlot)
            {
                itemModPool[modSlot] = this.getDynamicModPool(parentTemplate._id, modSlot, botEquipBlacklist);
            }

            // Ensure there's a pool of mods to pick from
            if (!(itemModPool[modSlot] || parentSlot._required))
            {
                this.logger.debug(`Mod pool for slot: ${modSlot} on item: ${parentTemplate._name} was empty, skipping mod`);
                return null;
            }

            // Filter out non-whitelisted scopes, use full modpool if filtered pool would have no elements
            if (modSlot.includes("mod_scope")  && botWeaponSightWhitelist)
            {
                // scope pool has more than one scope
                if (itemModPool[modSlot].length > 1)
                {
                    itemModPool[modSlot] = this.filterSightsByWeaponType(weapon[0], itemModPool[modSlot], botWeaponSightWhitelist);
                }
            }
            
            // Pick random mod and check it's compatible
            const exhaustableModPool = new ExhaustableArray(itemModPool[modSlot], this.randomUtil, this.jsonUtil);
            let modCompatibilityResult: {incompatible: boolean, reason: string} = {incompatible: false, reason: ""};
            while (exhaustableModPool.hasValues())
            {
                modTpl = exhaustableModPool.getRandomValue();
                modCompatibilityResult = this.botGeneratorHelper.isItemIncompatibleWithCurrentItems(weapon, modTpl, modSlot);
                if (!modCompatibilityResult.incompatible)
                {
                    found = true;
                    break;
                }
            }

            // Log mod chosen was incompatible
            if (modCompatibilityResult.incompatible && parentSlot._required)
            {
                this.logger.debug(modCompatibilityResult.reason);
            }
        }

        // Get random mod to attach from items db for required slots if none found above
        if (!found && parentSlot !== undefined && parentSlot._required)
        {
            modTpl = this.getModTplFromItemDb(modTpl, parentSlot, modSlot, weapon);
            found = !!modTpl;
        }

        // Compatible item not found + not required
        if (!found && parentSlot !== undefined && !parentSlot._required)
        {
            return null;
        }

        if (!found && parentSlot !== undefined)
        {
            if (parentSlot._required)
            {
                this.logger.warning(`Required slot unable to be filled, ${modSlot} on ${parentTemplate._name} ${parentTemplate._id} for weapon ${weapon[0]._tpl}`);
            }

            return null;
        }

        return this.itemHelper.getItem(modTpl);
    }

    /**
     * Create a mod item with parameters as properties
     * @param modId _id
     * @param modTpl _tpl
     * @param parentId parentId
     * @param modSlot slotId
     * @param modTemplate Used to add additional properites in the upd object
     * @returns Item object
     */
    protected createModItem(modId: string, modTpl: string, parentId: string, modSlot: string, modTemplate: ITemplateItem, botRole: string): Item
    {
        return {
            "_id": modId,
            "_tpl": modTpl,
            "parentId": parentId,
            "slotId": modSlot,
            ...this.botGeneratorHelper.generateExtraPropertiesForItem(modTemplate, botRole)
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
     * @param parentSlot item mod will go into, used to get combatible items
     * @param modSlot Slot to get mod to fill
     * @param items items to ensure picked mod is compatible with
     * @returns item tpl
     */
    protected getModTplFromItemDb(modTpl: string, parentSlot: Slot, modSlot: string, items: Item[]): string
    {
        // Find combatible mods and make an array of them
        const allowedItems = parentSlot._props.filters[0].Filter;

        // Find mod item that fits slot from sorted mod array
        const exhaustableModPool = new ExhaustableArray(allowedItems, this.randomUtil, this.jsonUtil);
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
        return null;
    }

    /**
     * Log errors if mod is not compatible with slot
     * @param modToAdd template of mod to check
     * @param itemSlot slot the item will be placed in
     * @param modSlot slot the mod will fill
     * @param parentTemplate template of the mods parent item
     * @returns true if valid
     */
    protected isModValidForSlot(modToAdd: [boolean, ITemplateItem], itemSlot: Slot, modSlot: string, parentTemplate: ITemplateItem): boolean
    {
        // Mod lacks template item
        if (!modToAdd[1])
        {
            this.logger.error(this.localisationService.getText("bot-no_item_template_found_when_adding_mod", {modId: modToAdd[1]._id, modSlot: modSlot}));
            this.logger.debug(`Item -> ${parentTemplate._id}; Slot -> ${modSlot}`);

            return false;
        }

        // Mod isn't a valid item
        if (!modToAdd[0])
        {
            // Slot must be filled, show warning
            if (itemSlot._required)
            {
                this.logger.warning(this.localisationService.getText("bot-unable_to_add_mod_item_invalid", {itemName: modToAdd[1]._name, modSlot: modSlot, parentItemName: parentTemplate._name}));
            }

            return false;
        }

        // If mod id doesnt exist in slots filter list and mod id doesnt have any of the slots filters as a base class, mod isn't valid for the slot
        if (!(itemSlot._props.filters[0].Filter.includes(modToAdd[1]._id) || this.itemBaseClassService.itemHasBaseClass(modToAdd[1]._id, itemSlot._props.filters[0].Filter)))
        {
            this.logger.warning(this.localisationService.getText("bot-mod_not_in_slot_filter_list", {modId: modToAdd[1]._id, modSlot: modSlot, parentName: parentTemplate._name}));

            return false;
        }

        return true;
    }

    
    /**
     * Find mod tpls of a provided type and add to modPool
     * @param desiredSlotName slot to look up and add we are adding tpls for (e.g mod_scope)
     * @param modTemplate db object for modItem we get compatible mods from
     * @param modPool Pool of mods we are adding to
     */
    protected addCompatibleModsForProvidedMod(desiredSlotName: string, modTemplate: ITemplateItem, modPool: Mods, botEquipBlacklist: EquipmentFilterDetails): void
    {
        const desiredSlotObject = modTemplate._props.Slots.find(x => x._name.includes(desiredSlotName));
        if (desiredSlotObject)
        {
            const supportedSubMods = desiredSlotObject._props.filters[0].Filter;
            if (supportedSubMods)
            {
                // Filter mods
                let filteredMods = this.filterWeaponModsByBlacklist(supportedSubMods, botEquipBlacklist, desiredSlotName);
                if (filteredMods.length === 0)
                {
                    this.logger.warning(this.localisationService.getText("bot-unable_to_filter_mods_all_blacklisted", {slotName: desiredSlotObject._name, itemName: modTemplate._name}));
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
    protected getDynamicModPool(parentItemId: string, modSlot: string, botEquipBlacklist: EquipmentFilterDetails): string[]
    {
        const modsFromDynamicPool = this.jsonUtil.clone(this.botEquipmentModPoolService.getCompatibleModsForWeaponSlot(parentItemId, modSlot));

        const filteredMods = this.filterWeaponModsByBlacklist(modsFromDynamicPool, botEquipBlacklist, modSlot);
        if (filteredMods.length === 0)
        {
            this.logger.warning(this.localisationService.getText("bot-unable_to_filter_mod_slot_all_blacklisted", modSlot));
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
    protected filterWeaponModsByBlacklist(allowedMods: string[], botEquipBlacklist: EquipmentFilterDetails, modSlot: string): string[]
    {
        if (!botEquipBlacklist)
        {
            return allowedMods;
        }
        
        let result: string[] = [];

        // Get item blacklist and mod equipmet blackist as one array
        const blacklist = this.itemFilterService.getBlacklistedItems().concat(botEquipBlacklist.equipment[modSlot] || []);
        result = allowedMods.filter(x => !blacklist.includes(x));

        return result;
    }

    /**
     * With the shotgun revolver (60db29ce99594040e04c4a27) 12.12 introduced CylinderMagazines.
     * Those magazines (e.g. 60dc519adf4c47305f6d410d) have a "Cartridges" entry with a _max_count=0.
     * Ammo is not put into the magazine directly but assigned to the magazine's slots: The "camora_xxx" slots.
     * This function is a helper called by generateModsForItem for mods with parent type "CylinderMagazine"
     * @param items The items where the CylinderMagazine's camora are appended to
     * @param modPool modPool which should include available cartrigdes
     * @param parentId The CylinderMagazine's UID
     * @param parentTemplate The CylinderMagazine's template
     */
    protected fillCamora(items: Item[], modPool: Mods, parentId: string, parentTemplate: ITemplateItem): void
    {
        const itemModPool = modPool[parentTemplate._id];

        if (!itemModPool)
        {
            this.logger.error(`mod pool for item ${parentTemplate._name} was empty, weapon gen will fail`);
        }

        let exhaustableModPool = null;
        let modSlot = "cartridges";
        const camoraFirstSlot = "camora_000";
        if (modSlot in itemModPool)
        {
            exhaustableModPool = new ExhaustableArray(itemModPool[modSlot], this.randomUtil, this.jsonUtil);
        }
        else if (camoraFirstSlot in itemModPool)
        {
            modSlot = camoraFirstSlot;
            exhaustableModPool = new ExhaustableArray(this.mergeCamoraPoolsTogether(itemModPool), this.randomUtil, this.jsonUtil);
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
            items.push({
                "_id": modId,
                "_tpl": modTpl,
                "parentId": parentId,
                "slotId": modSlotId
            });
        }
    }

    /**
     * Take a record of camoras and merge the compatable shells into one array
     * @param camorasWithShells camoras we want to merge into one array
     * @returns string array of shells fro luitple camora sources
     */
    protected mergeCamoraPoolsTogether(camorasWithShells: Record<string, string[]> ): string[]
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
     * @param weapon Weapon scopes will be added to
     * @param scopes Full scope pool
     * @param botWeaponSightWhitelist whitelist of scope types by weapon base type 
     * @returns array of scope tpls that have been filtered
     */
    protected filterSightsByWeaponType(weapon: Item, scopes: string[], botWeaponSightWhitelist: Record<string, string[]>): string[]
    {
        const weaponDetails = this.itemHelper.getItem(weapon._tpl);

        // Return original scopes array if whitelist not found
        const whitelistedSightTypes = botWeaponSightWhitelist[weaponDetails[1]._parent];
        if (!whitelistedSightTypes)
        {
            return scopes;
        }

        // Filter items that are not directly scopes OR mounts that do not hold the type of scope we allow for this weapon type
        const filteredScopesAndMods: string[] = [];
        for (const item of scopes)
        {
            // Mods is a scope, check base class is allowed
            if (this.itemHelper.isOfBaseclasses(item, whitelistedSightTypes))
            {
                filteredScopesAndMods.push(item);
                continue;
            }

            // Check item is mount, then check if it allows whitelisted mods
            const itemDetails = this.itemHelper.getItem(item)[1];
            if (this.itemHelper.isOfBaseclass(item, BaseClasses.MOUNT) && itemDetails._props.Slots.length > 0 )
            {
                const scopeSlot = itemDetails._props.Slots.find(x => x._name.includes("mod_scope"));
                if (scopeSlot?._props.filters[0].Filter.some(x => this.itemHelper.isOfBaseclasses(x, whitelistedSightTypes)))
                {
                    filteredScopesAndMods.push(item);
                }
                
            }
        }

        // If no mods left after filtering has occured, send back the original mod list
        if (!filteredScopesAndMods || filteredScopesAndMods.length === 0)
        {
            this.logger.debug(`Scope whitelist was too restrictive for: ${weapon._tpl} ${weaponDetails[1]._name}, skipping filter`);

            return scopes;
        }

        return filteredScopesAndMods;
    }
}