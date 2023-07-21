import { inject, injectable, injectAll } from "tsyringe";

import { BotGeneratorHelper } from "../helpers/BotGeneratorHelper";
import { BotWeaponGeneratorHelper } from "../helpers/BotWeaponGeneratorHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { WeightedRandomHelper } from "../helpers/WeightedRandomHelper";
import { MinMax } from "../models/common/MinMax";
import { IPreset } from "../models/eft/common/IGlobals";
import { Inventory as PmcInventory } from "../models/eft/common/tables/IBotBase";
import { Inventory, ModsChances } from "../models/eft/common/tables/IBotType";
import { Item } from "../models/eft/common/tables/IItem";
import { ITemplateItem } from "../models/eft/common/tables/ITemplateItem";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { EquipmentSlots } from "../models/enums/EquipmentSlots";
import { GenerateWeaponResult } from "../models/spt/bots/GenerateWeaponResult";
import { IBotConfig } from "../models/spt/config/IBotConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { BotWeaponModLimitService } from "../services/BotWeaponModLimitService";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { RandomUtil } from "../utils/RandomUtil";
import { BotEquipmentModGenerator } from "./BotEquipmentModGenerator";
import { IInventoryMagGen } from "./weapongen/IInventoryMagGen";
import { InventoryMagGen } from "./weapongen/InventoryMagGen";

@injectable()
export class BotWeaponGenerator
{
    protected readonly modMagazineSlotId = "mod_magazine";
    protected botConfig: IBotConfig;

    constructor(
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("BotWeaponGeneratorHelper") protected botWeaponGeneratorHelper: BotWeaponGeneratorHelper,
        @inject("BotWeaponModLimitService") protected botWeaponModLimitService: BotWeaponModLimitService,
        @inject("BotEquipmentModGenerator") protected botEquipmentModGenerator: BotEquipmentModGenerator,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @injectAll("InventoryMagGen") protected inventoryMagGenComponents: IInventoryMagGen[]
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.inventoryMagGenComponents.sort((a, b) => a.getPriority() - b.getPriority());
    }

    /**
     * Pick a random weapon based on weightings and generate a functional weapon
     * @param equipmentSlot Primary/secondary/holster
     * @param botTemplateInventory e.g. assault.json
     * @param weaponParentId 
     * @param modChances 
     * @param botRole role of bot, e.g. assault/followerBully
     * @param isPmc Is weapon generated for a pmc
     * @returns GenerateWeaponResult object
     */
    public generateRandomWeapon(sessionId: string, equipmentSlot: string, botTemplateInventory: Inventory, weaponParentId: string, modChances: ModsChances, botRole: string, isPmc: boolean, botLevel: number): GenerateWeaponResult
    {
        const weaponTpl = this.pickWeightedWeaponTplFromPool(equipmentSlot, botTemplateInventory);
        return this.generateWeaponByTpl(sessionId, weaponTpl, equipmentSlot, botTemplateInventory, weaponParentId, modChances, botRole, isPmc, botLevel);
    }

    /**
     * Get a random weighted weapon from a bots pool of weapons
     * @param equipmentSlot Primary/secondary/holster
     * @param botTemplateInventory e.g. assault.json
     * @returns weapon tpl
     */
    public pickWeightedWeaponTplFromPool(equipmentSlot: string, botTemplateInventory: Inventory): string
    {
        const weaponPool = botTemplateInventory.equipment[equipmentSlot];
        return this.weightedRandomHelper.getWeightedInventoryItem(weaponPool);
    }

    /**
     * Generated a weapon based on the supplied weapon tpl
     * @param weaponTpl weapon tpl to generate (use pickWeightedWeaponTplFromPool())
     * @param equipmentSlot slot to fit into, primary/secondary/holster
     * @param botTemplateInventory e.g. assault.json
     * @param weaponParentId ParentId of the weapon being generated
     * @param modChances Dictionary of item types and % chance weapon will have that mod
     * @param botRole e.g. assault/exusec
     * @param isPmc 
     * @returns GenerateWeaponResult object
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public generateWeaponByTpl(sessionId: string, weaponTpl: string, equipmentSlot: string, botTemplateInventory: Inventory, weaponParentId: string, modChances: ModsChances, botRole: string, isPmc: boolean, botLevel: number): GenerateWeaponResult
    {
        const modPool = botTemplateInventory.mods;
        const weaponItemTemplate = this.itemHelper.getItem(weaponTpl)[1];

        if (!weaponItemTemplate)
        {
            this.logger.error(this.localisationService.getText("bot-missing_item_template", weaponTpl));
            this.logger.error(`WeaponSlot -> ${equipmentSlot}`);

            return;
        }

        // Find ammo to use when filling magazines/chamber
        if (!botTemplateInventory.Ammo)
        {
            this.logger.error(this.localisationService.getText("bot-no_ammo_found_in_bot_json", botRole));

            throw new Error(this.localisationService.getText("bot-generation_failed"));
        }
        const ammoTpl = this.getWeightedCompatibleAmmo(botTemplateInventory.Ammo, weaponItemTemplate);

        // Create with just base weapon item
        let weaponWithModsArray = this.constructWeaponBaseArray(weaponTpl, weaponParentId, equipmentSlot, weaponItemTemplate, botRole);

        // Add mods to weapon base
        if (Object.keys(modPool).includes(weaponTpl))
        {
            const botEquipmentRole = this.botGeneratorHelper.getBotEquipmentRole(botRole);
            const modLimits = this.botWeaponModLimitService.getWeaponModLimits(botEquipmentRole);
            weaponWithModsArray = this.botEquipmentModGenerator.generateModsForWeapon(sessionId, weaponWithModsArray, modPool, weaponWithModsArray[0]._id, weaponItemTemplate, modChances, ammoTpl, botRole, botLevel, modLimits, botEquipmentRole);
        }

        // Use weapon preset from globals.json if weapon isnt valid
        if (!this.isWeaponValid(weaponWithModsArray, botRole))
        {
            // Weapon is bad, fall back to weapons preset
            weaponWithModsArray = this.getPresetWeaponMods(weaponTpl, equipmentSlot, weaponParentId, weaponItemTemplate, botRole);
        }

        // Fill existing magazines to full and sync ammo type
        for (const magazine of weaponWithModsArray.filter(x => x.slotId === this.modMagazineSlotId))
        {
            this.fillExistingMagazines(weaponWithModsArray, magazine, ammoTpl);
        }

        // Fill UBGL if found
        const ubglMod = weaponWithModsArray.find(x => x.slotId === "mod_launcher");
        let ubglAmmoTpl: string = undefined;
        if (ubglMod)
        {
            const ubglTemplate = this.itemHelper.getItem(ubglMod._tpl)[1];
            ubglAmmoTpl = this.getWeightedCompatibleAmmo(botTemplateInventory.Ammo, ubglTemplate);
            this.fillUbgl(weaponWithModsArray, ubglMod, ubglAmmoTpl);
        }

        return {
            weapon: weaponWithModsArray,
            chosenAmmoTpl: ammoTpl,
            chosenUbglAmmoTpl: ubglAmmoTpl,
            weaponMods: modPool,
            weaponTemplate: weaponItemTemplate
        };
    }

    /**
     * Create array with weapon base as only element and
     * add additional properties based on weapon type
     * @param weaponTpl Weapon tpl to create item with
     * @param weaponParentId Weapons parent id
     * @param equipmentSlot e.g. primary/secondary/holster 
     * @param weaponItemTemplate db template for weapon
     * @param botRole for durability values
     * @returns Base weapon item in array
     */
    protected constructWeaponBaseArray(weaponTpl: string, weaponParentId: string, equipmentSlot: string, weaponItemTemplate: ITemplateItem, botRole: string): Item[]
    {
        return [{
            _id: this.hashUtil.generate(),
            _tpl: weaponTpl,
            parentId: weaponParentId,
            slotId: equipmentSlot,
            ...this.botGeneratorHelper.generateExtraPropertiesForItem(weaponItemTemplate, botRole)
        }];
    }

    /**
     * Get the mods necessary to kit out a weapon to its preset level
     * @param weaponTpl weapon to find preset for
     * @param equipmentSlot the slot the weapon will be placed in
     * @param weaponParentId Value used for the parentid
     * @returns array of weapon mods
     */
    protected getPresetWeaponMods(weaponTpl: string, equipmentSlot: string, weaponParentId: string, itemTemplate: ITemplateItem, botRole: string): Item[]
    {
        // Invalid weapon generated, fallback to preset
        this.logger.warning(this.localisationService.getText("bot-weapon_generated_incorrect_using_default", weaponTpl));
        const weaponMods = [];

        // TODO: Right now, preset weapons trigger a lot of warnings regarding missing ammo in magazines & such
        let preset: IPreset;
        for (const presetObj of Object.values(this.databaseServer.getTables().globals.ItemPresets))
        {
            if (presetObj._items[0]._tpl === weaponTpl)
            {
                preset = this.jsonUtil.clone(presetObj);
                break;
            }
        }

        if (preset)
        {
            const parentItem = preset._items[0];
            preset._items[0] = {
                ...parentItem, ...{
                    "parentId": weaponParentId,
                    "slotId": equipmentSlot,
                    ...this.botGeneratorHelper.generateExtraPropertiesForItem(itemTemplate, botRole)
                }
            };
            weaponMods.push(...preset._items);
        }
        else
        {
            throw new Error(this.localisationService.getText("bot-missing_weapon_preset", weaponTpl));
        }

        return weaponMods;
    }

    /**
     * Checks if all required slots are occupied on a weapon and all it's mods
     * @param weaponItemArray Weapon + mods
     * @param botRole role of bot weapon is for
     * @returns true if valid
     */
    protected isWeaponValid(weaponItemArray: Item[], botRole: string): boolean
    {
        for (const mod of weaponItemArray)
        {
            const modDbTemplate = this.itemHelper.getItem(mod._tpl)[1];
            if (!modDbTemplate._props.Slots?.length)
            {
                continue;
            }

            // Iterate over slots in db item, if required, check tpl in that slot matches the filter list
            for (const modSlot of modDbTemplate._props.Slots)
            {
                // ignore optional mods
                if (!modSlot._required)
                {
                    continue;
                }

                const allowedTpls = modSlot._props.filters[0].Filter;
                const slotName = modSlot._name;

                const weaponSlotItem = weaponItemArray.find(x => x.parentId === mod._id && x.slotId === slotName);
                if (!weaponSlotItem)
                {
                    this.logger.error(this.localisationService.getText("bot-weapons_required_slot_missing_item", {modSlot: modSlot._name, modName: modDbTemplate._name, slotId: mod.slotId, botRole: botRole}));

                    return false;
                }

                if (!allowedTpls.includes(weaponSlotItem._tpl))
                {
                    this.logger.error(this.localisationService.getText("bot-weapon_contains_invalid_item", {modSlot: modSlot._name, modName: modDbTemplate._name, weaponTpl: weaponSlotItem._tpl}));

                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Generates extra magazines or bullets (if magazine is internal) and adds them to TacticalVest and Pockets.
     * Additionally, adds extra bullets to SecuredContainer
     * @param generatedWeaponResult object with properties for generated weapon (weapon mods pool / weapon template / ammo tpl)
     * @param magCounts Magazine count to add to inventory
     * @param inventory Inventory to add magazines to
     * @param botRole The bot type we're getting generating extra mags for
     */
    public addExtraMagazinesToInventory(generatedWeaponResult: GenerateWeaponResult, magCounts: MinMax, inventory: PmcInventory, botRole: string): void
    {
        const weaponMods = generatedWeaponResult.weapon;
        const weaponTemplate = generatedWeaponResult.weaponTemplate;
        const ammoTpl = generatedWeaponResult.chosenAmmoTpl;
        const magazineTpl = this.getMagazineTplFromWeaponTemplate(weaponMods, weaponTemplate, botRole);
        
        const magTemplate = this.itemHelper.getItem(magazineTpl)[1];
        if (!magTemplate)
        {
            this.logger.error(this.localisationService.getText("bot-unable_to_find_magazine_item", magazineTpl));

            return;
        }

        const ammoTemplate = this.itemHelper.getItem(ammoTpl)[1];
        if (!ammoTemplate)
        {
            this.logger.error(this.localisationService.getText("bot-unable_to_find_ammo_item", ammoTpl));

            return;
        }

        // Has an UBGL
        if (generatedWeaponResult.chosenUbglAmmoTpl)
        {
            this.addUbglGrenadesToBotInventory(weaponMods, generatedWeaponResult, inventory);
        }

        const inventoryMagGenModel = new InventoryMagGen(magCounts, magTemplate, weaponTemplate, ammoTemplate, inventory);
        this.inventoryMagGenComponents.find(v => v.canHandleInventoryMagGen(inventoryMagGenModel)).process(inventoryMagGenModel);

        // Add x stacks of bullets to SecuredContainer (bots use a magic mag packing skill to reload instantly)
        this.addAmmoToSecureContainer(this.botConfig.secureContainerAmmoStackCount, ammoTpl, 999, inventory);
    }

    /**
     * Add Grendaes for UBGL to bots vest and secure container
     * @param weaponMods Weapon array with mods
     * @param generatedWeaponResult result of weapon generation
     * @param inventory bot inventory to add grenades to
     */
    protected addUbglGrenadesToBotInventory(weaponMods: Item[], generatedWeaponResult: GenerateWeaponResult, inventory: PmcInventory): void
    {
        // Find ubgl mod item + get details of it from db
        const ubglMod = weaponMods.find(x => x.slotId === "mod_launcher");
        const ubglDbTemplate = this.itemHelper.getItem(ubglMod._tpl)[1];

        // Define min/max of how many grenades bot will have
        const ubglMinMax = { min: 1, max: 2 };

        // get ammo template from db
        const ubglAmmoDbTemplate = this.itemHelper.getItem(generatedWeaponResult.chosenUbglAmmoTpl)[1];

        // Add greandes to bot inventory
        const ubglAmmoGenModel = new InventoryMagGen(ubglMinMax, ubglDbTemplate, ubglDbTemplate, ubglAmmoDbTemplate, inventory);
        this.inventoryMagGenComponents.find(v => v.canHandleInventoryMagGen(ubglAmmoGenModel)).process(ubglAmmoGenModel);

        // Store extra grenades in secure container
        this.addAmmoToSecureContainer(5, generatedWeaponResult.chosenUbglAmmoTpl, 20, inventory);
    }

    /**
     * Add ammo to the secure container
     * @param stackCount How many stacks of ammo to add
     * @param ammoTpl Ammo type to add
     * @param stackSize Size of the ammo stack to add
     * @param inventory Player inventory
     */
    protected addAmmoToSecureContainer(stackCount: number, ammoTpl: string, stackSize: number, inventory: PmcInventory): void
    {
        for (let i = 0; i < stackCount; i++)
        {
            const id = this.hashUtil.generate();
            this.botWeaponGeneratorHelper.addItemWithChildrenToEquipmentSlot([EquipmentSlots.SECURED_CONTAINER], id, ammoTpl, [{
                _id: id,
                _tpl: ammoTpl,
                upd: { StackObjectsCount: stackSize }
            }],
            inventory);
        }
    }

    /**
     * Get a weapons magazine tpl from a weapon template
     * @param weaponMods mods from a weapon template
     * @param weaponTemplate Weapon to get magazine tpl for
     * @param botRole the bot type we are getting the magazine for
     * @returns magazine tpl string
     */
    protected getMagazineTplFromWeaponTemplate(weaponMods: Item[], weaponTemplate: ITemplateItem, botRole: string): string
    {
        const magazine = weaponMods.find(m => m.slotId === this.modMagazineSlotId);
        if (!magazine)
        {
            // Edge case - magazineless chamber loaded weapons dont have magazines, e.g. mp18
            // return default mag tpl
            if (weaponTemplate._props.ReloadMode === "OnlyBarrel")
            {
                return this.botWeaponGeneratorHelper.getWeaponsDefaultMagazineTpl(weaponTemplate);
            }

            // log error if no magazine AND not a chamber loaded weapon (e.g. shotgun revolver)
            if (!weaponTemplate._props.isChamberLoad)
            {
                // Shouldn't happen
                this.logger.warning(this.localisationService.getText("bot-weapon_missing_magazine_or_chamber", weaponTemplate._id));
            }

            const defaultMagTplId = this.botWeaponGeneratorHelper.getWeaponsDefaultMagazineTpl(weaponTemplate);
            this.logger.debug(`[${botRole}] Unable to find magazine for weapon ${weaponTemplate._id} ${weaponTemplate._name}, using mag template default ${defaultMagTplId}.`);

            return defaultMagTplId;
        }

        return magazine._tpl;
    }

    /**
     * Finds and return a compatible ammo tpl based on the bots ammo weightings (x.json/inventory/equipment/ammo)
     * @param ammo a list of ammo tpls the weapon can use
     * @param weaponTemplate the weapon we want to pick ammo for
     * @returns an ammo tpl that works with the desired gun
     */
    protected getWeightedCompatibleAmmo(ammo: Record<string, Record<string, number>>, weaponTemplate: ITemplateItem): string
    {
        const desiredCaliber = this.getWeaponCaliber(weaponTemplate);

        const compatibleCartridges = ammo[desiredCaliber];
        if (!compatibleCartridges || compatibleCartridges?.length === 0)
        {
            this.logger.warning(this.localisationService.getText("bot-no_caliber_data_for_weapon_falling_back_to_default", {weaponId: weaponTemplate._id, weaponName: weaponTemplate._name, defaultAmmo: weaponTemplate._props.defAmmo}));

            // Immediately returns, as default ammo is guaranteed to be compatible
            return weaponTemplate._props.defAmmo;
        }

        const chosenAmmoTpl = this.weightedRandomHelper.getWeightedInventoryItem(compatibleCartridges);
        if (weaponTemplate._props.Chambers[0] && !weaponTemplate._props.Chambers[0]._props.filters[0].Filter.includes(chosenAmmoTpl))
        {
            this.logger.warning(this.localisationService.getText("bot-incompatible_ammo_for_weapon_falling_back_to_default", {chosenAmmo: chosenAmmoTpl, weaponId: weaponTemplate._id, weaponName: weaponTemplate._name, defaultAmmo: weaponTemplate._props.defAmmo}));

            // Incompatible ammo found, return default (can happen with .366 and 7.62x39 weapons)
            return weaponTemplate._props.defAmmo;
        }

        return chosenAmmoTpl;
    }

    /**
     * Get a weapons compatible cartridge caliber
     * @param weaponTemplate Weapon to look up caliber of
     * @returns caliber as string
     */
    protected getWeaponCaliber(weaponTemplate: ITemplateItem): string
    {
        if (weaponTemplate._props.Caliber)
        {
            return weaponTemplate._props.Caliber;
        }

        if (weaponTemplate._props.ammoCaliber)
        {
            return weaponTemplate._props.ammoCaliber;
        }

        // UBGLs use a linked weapon that contains caliber info
        if (weaponTemplate._props.LinkedWeapon)
        {
            const linkedWeaponItem = this.itemHelper.getItem(weaponTemplate._props.LinkedWeapon)[1];
            if (!linkedWeaponItem)
            {
                return;
            }

            return linkedWeaponItem._props.ammoCaliber;
        }
    }

    /**
     * Fill existing magazines to full, while replacing their contents with specified ammo
     * @param weaponMods Weapon with children
     * @param magazine Magazine item
     * @param cartridgeTpl Cartridge to insert into magazine
     */
    protected fillExistingMagazines(weaponMods: Item[], magazine: Item, cartridgeTpl: string): void
    {
        const magazineTemplate = this.itemHelper.getItem(magazine._tpl)[1];
        if (!magazineTemplate)
        {
            this.logger.error(this.localisationService.getText("bot-unable_to_find_magazine_item", magazine._tpl));

            return;
        }

        const parentItem = this.itemHelper.getItem(magazineTemplate._parent)[1];

        // the revolver shotgun uses a magazine with chambers, not cartridges ("camora_xxx")
        // Exchange of the camora ammo is not necessary we could also just check for stackSize > 0 here
        // and remove the else
        if (this.botWeaponGeneratorHelper.magazineIsCylinderRelated(parentItem._name))
        {
            this.fillCamorasWithAmmo(weaponMods, magazine._id, cartridgeTpl);
        }
        else
        {
            this.addOrUpdateMagazinesChildWithAmmo(weaponMods, magazine, cartridgeTpl, magazineTemplate);
        }
    }

    /**
     * Add desired ammo tpl as item to weaponmods array, placed as child to UBGL
     * @param weaponMods Weapon with children
     * @param ubglMod UBGL item
     * @param ubglAmmoTpl Grenade ammo tpl
     */
    protected fillUbgl(weaponMods: Item[], ubglMod: Item, ubglAmmoTpl: string): void
    {
        weaponMods.push(
            {
                _id: this.hashUtil.generate(),
                _tpl: ubglAmmoTpl,
                parentId: ubglMod._id,
                slotId: "patron_in_weapon"
            }
        );
    }

    /**
     * Add cartridge item to weapon Item array, if it already exists, update
     * @param weaponWithMods Weapon items array to amend
     * @param magazine magazine item details we're adding cartridges to
     * @param chosenAmmoTpl cartridge to put into the magazine
     * @param newStackSize how many cartridges should go into the magazine
     * @param magazineTemplate magazines db template
     */
    protected addOrUpdateMagazinesChildWithAmmo(weaponWithMods: Item[], magazine: Item, chosenAmmoTpl: string, magazineTemplate: ITemplateItem): void
    {
        const magazineCartridgeChildItem = weaponWithMods.find(m => m.parentId === magazine._id && m.slotId === "cartridges");
        if (magazineCartridgeChildItem)
        {
            // Easier to delete and create below instaed of modifying existing item
            weaponWithMods = weaponWithMods.slice(weaponWithMods.indexOf(magazineCartridgeChildItem), 1);
        }

        // Create array with just magazine
        const magazineWithCartridges = [magazine];

        // Add full cartridge child items to above array
        this.itemHelper.fillMagazineWithCartridge(magazineWithCartridges, magazineTemplate, chosenAmmoTpl, 1);

        // Replace existing magazine with above array of mag + cartridge stacks
        weaponWithMods.splice(weaponWithMods.indexOf(magazine), 1, ...magazineWithCartridges);
    }

    /**
     * Fill each Camora with a bullet
     * @param weaponMods Weapon mods to find and update camora mod(s) from
     * @param magazineId magazine id to find and add to
     * @param ammoTpl ammo template id to hydate with
     */
    protected fillCamorasWithAmmo(weaponMods: Item[], magazineId: string, ammoTpl: string): void
    {
        // for CylinderMagazine we exchange the ammo in the "camoras".
        // This might not be necessary since we already filled the camoras with a random whitelisted and compatible ammo type,
        // but I'm not sure whether this is also used elsewhere
        const camoras = weaponMods.filter(x => x.parentId === magazineId && x.slotId.startsWith("camora"));
        for (const camora of camoras)
        {
            camora._tpl = ammoTpl;
        }
    }
}