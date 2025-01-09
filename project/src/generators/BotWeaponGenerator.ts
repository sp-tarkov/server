import { BotEquipmentModGenerator } from "@spt/generators/BotEquipmentModGenerator";
import { IInventoryMagGen } from "@spt/generators/weapongen/IInventoryMagGen";
import { InventoryMagGen } from "@spt/generators/weapongen/InventoryMagGen";
import { BotGeneratorHelper } from "@spt/helpers/BotGeneratorHelper";
import { BotWeaponGeneratorHelper } from "@spt/helpers/BotWeaponGeneratorHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { IPreset } from "@spt/models/eft/common/IGlobals";
import { IInventory as PmcInventory } from "@spt/models/eft/common/tables/IBotBase";
import { IGenerationData, IInventory, IModsChances } from "@spt/models/eft/common/tables/IBotType";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { EquipmentSlots } from "@spt/models/enums/EquipmentSlots";
import { IGenerateWeaponRequest } from "@spt/models/spt/bots/IGenerateWeaponRequest";
import { IGenerateWeaponResult } from "@spt/models/spt/bots/IGenerateWeaponResult";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { IRepairConfig } from "@spt/models/spt/config/IRepairConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { BotWeaponModLimitService } from "@spt/services/BotWeaponModLimitService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RepairService } from "@spt/services/RepairService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class BotWeaponGenerator {
    protected readonly modMagazineSlotId = "mod_magazine";
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;
    protected repairConfig: IRepairConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("BotWeaponGeneratorHelper") protected botWeaponGeneratorHelper: BotWeaponGeneratorHelper,
        @inject("BotWeaponModLimitService") protected botWeaponModLimitService: BotWeaponModLimitService,
        @inject("BotEquipmentModGenerator") protected botEquipmentModGenerator: BotEquipmentModGenerator,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("RepairService") protected repairService: RepairService,
        @injectAll("InventoryMagGen") protected inventoryMagGenComponents: IInventoryMagGen[],
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
        this.repairConfig = this.configServer.getConfig(ConfigTypes.REPAIR);
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
    public generateRandomWeapon(
        sessionId: string,
        equipmentSlot: string,
        botTemplateInventory: IInventory,
        weaponParentId: string,
        modChances: IModsChances,
        botRole: string,
        isPmc: boolean,
        botLevel: number,
    ): IGenerateWeaponResult {
        const weaponTpl = this.pickWeightedWeaponTplFromPool(equipmentSlot, botTemplateInventory);
        return this.generateWeaponByTpl(
            sessionId,
            weaponTpl,
            equipmentSlot,
            botTemplateInventory,
            weaponParentId,
            modChances,
            botRole,
            isPmc,
            botLevel,
        );
    }

    /**
     * Get a random weighted weapon from a bots pool of weapons
     * @param equipmentSlot Primary/secondary/holster
     * @param botTemplateInventory e.g. assault.json
     * @returns weapon tpl
     */
    public pickWeightedWeaponTplFromPool(equipmentSlot: string, botTemplateInventory: IInventory): string {
        const weaponPool = botTemplateInventory.equipment[equipmentSlot];
        return this.weightedRandomHelper.getWeightedValue<string>(weaponPool);
    }

    /**
     * Generated a weapon based on the supplied weapon tpl
     * @param weaponTpl Weapon tpl to generate (use pickWeightedWeaponTplFromPool())
     * @param slotName Slot to fit into, primary/secondary/holster
     * @param botTemplateInventory e.g. assault.json
     * @param weaponParentId ParentId of the weapon being generated
     * @param modChances Dictionary of item types and % chance weapon will have that mod
     * @param botRole e.g. assault/exusec
     * @param isPmc Is weapon being generated for a pmc
     * @returns GenerateWeaponResult object
     */
    public generateWeaponByTpl(
        sessionId: string,
        weaponTpl: string,
        slotName: string,
        botTemplateInventory: IInventory,
        weaponParentId: string,
        modChances: IModsChances,
        botRole: string,
        isPmc: boolean,
        botLevel: number,
    ): IGenerateWeaponResult {
        const modPool = botTemplateInventory.mods;
        const weaponItemTemplate = this.itemHelper.getItem(weaponTpl)[1];

        if (!weaponItemTemplate) {
            this.logger.error(this.localisationService.getText("bot-missing_item_template", weaponTpl));
            this.logger.error(`WeaponSlot -> ${slotName}`);

            return;
        }

        // Find ammo to use when filling magazines/chamber
        if (!botTemplateInventory.Ammo) {
            this.logger.error(this.localisationService.getText("bot-no_ammo_found_in_bot_json", botRole));

            throw new Error(this.localisationService.getText("bot-generation_failed"));
        }
        const ammoTpl = this.getWeightedCompatibleAmmo(botTemplateInventory.Ammo, weaponItemTemplate);

        // Create with just base weapon item
        let weaponWithModsArray = this.constructWeaponBaseArray(
            weaponTpl,
            weaponParentId,
            slotName,
            weaponItemTemplate,
            botRole,
        );

        // Chance to add randomised weapon enhancement
        if (isPmc && this.randomUtil.getChance100(this.pmcConfig.weaponHasEnhancementChancePercent)) {
            // Add buff to weapon root
            this.repairService.addBuff(this.repairConfig.repairKit.weapon, weaponWithModsArray[0]);
        }

        // Add mods to weapon base
        if (Object.keys(modPool).includes(weaponTpl)) {
            // Role to treat bot as e.g. pmc/scav/boss
            const botEquipmentRole = this.botGeneratorHelper.getBotEquipmentRole(botRole);

            // Different limits if bot is boss vs scav
            const modLimits = this.botWeaponModLimitService.getWeaponModLimits(botEquipmentRole);

            const generateWeaponModsRequest: IGenerateWeaponRequest = {
                weapon: weaponWithModsArray, // Will become hydrated array of weapon + mods
                modPool: modPool,
                weaponId: weaponWithModsArray[0]._id, // Weapon root id
                parentTemplate: weaponItemTemplate,
                modSpawnChances: modChances,
                ammoTpl: ammoTpl,
                botData: { role: botRole, level: botLevel, equipmentRole: botEquipmentRole },
                modLimits: modLimits,
                weaponStats: {},
                conflictingItemTpls: new Set(),
            };
            weaponWithModsArray = this.botEquipmentModGenerator.generateModsForWeapon(
                sessionId,
                generateWeaponModsRequest,
            );
        }

        // Use weapon preset from globals.json if weapon isnt valid
        if (!this.isWeaponValid(weaponWithModsArray, botRole)) {
            // Weapon is bad, fall back to weapons preset
            weaponWithModsArray = this.getPresetWeaponMods(
                weaponTpl,
                slotName,
                weaponParentId,
                weaponItemTemplate,
                botRole,
            );
        }

        // Fill existing magazines to full and sync ammo type
        for (const magazine of weaponWithModsArray.filter((item) => item.slotId === this.modMagazineSlotId)) {
            this.fillExistingMagazines(weaponWithModsArray, magazine, ammoTpl);
        }

        // Add cartridge(s) to gun chamber(s)
        if (
            weaponItemTemplate._props.Chambers?.length > 0 &&
            weaponItemTemplate._props.Chambers[0]?._props?.filters[0]?.Filter?.includes(ammoTpl)
        ) {
            // Guns have variety of possible Chamber ids, patron_in_weapon/patron_in_weapon_000/patron_in_weapon_001
            const chamberSlotNames = weaponItemTemplate._props.Chambers.map((chamberSlot) => chamberSlot._name);
            this.addCartridgeToChamber(weaponWithModsArray, ammoTpl, chamberSlotNames);
        }

        // Fill UBGL if found
        const ubglMod = weaponWithModsArray.find((x) => x.slotId === "mod_launcher");
        let ubglAmmoTpl: string = undefined;
        if (ubglMod) {
            const ubglTemplate = this.itemHelper.getItem(ubglMod._tpl)[1];
            ubglAmmoTpl = this.getWeightedCompatibleAmmo(botTemplateInventory.Ammo, ubglTemplate);
            this.fillUbgl(weaponWithModsArray, ubglMod, ubglAmmoTpl);
        }

        return {
            weapon: weaponWithModsArray,
            chosenAmmoTpl: ammoTpl,
            chosenUbglAmmoTpl: ubglAmmoTpl,
            weaponMods: modPool,
            weaponTemplate: weaponItemTemplate,
        };
    }

    /**
     * Insert a cartridge(s) into a weapon
     * Handles all chambers - patron_in_weapon, patron_in_weapon_000 etc
     * @param weaponWithModsArray Weapon and mods
     * @param ammoTpl Cartridge to add to weapon
     * @param chamberSlotIds name of slots to create or add ammo to
     */
    protected addCartridgeToChamber(weaponWithModsArray: IItem[], ammoTpl: string, chamberSlotIds: string[]): void {
        for (const slotId of chamberSlotIds) {
            const existingItemWithSlot = weaponWithModsArray.find((x) => x.slotId === slotId);
            if (!existingItemWithSlot) {
                // Not found, add new slot to weapon
                weaponWithModsArray.push({
                    _id: this.hashUtil.generate(),
                    _tpl: ammoTpl,
                    parentId: weaponWithModsArray[0]._id,
                    slotId: slotId,
                    upd: { StackObjectsCount: 1 },
                });
            } else {
                // Already exists, update values
                existingItemWithSlot._tpl = ammoTpl;
                existingItemWithSlot.upd = { StackObjectsCount: 1 };
            }
        }
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
    protected constructWeaponBaseArray(
        weaponTpl: string,
        weaponParentId: string,
        equipmentSlot: string,
        weaponItemTemplate: ITemplateItem,
        botRole: string,
    ): IItem[] {
        return [
            {
                _id: this.hashUtil.generate(),
                _tpl: weaponTpl,
                parentId: weaponParentId,
                slotId: equipmentSlot,
                ...this.botGeneratorHelper.generateExtraPropertiesForItem(weaponItemTemplate, botRole),
            },
        ];
    }

    /**
     * Get the mods necessary to kit out a weapon to its preset level
     * @param weaponTpl weapon to find preset for
     * @param equipmentSlot the slot the weapon will be placed in
     * @param weaponParentId Value used for the parentid
     * @returns array of weapon mods
     */
    protected getPresetWeaponMods(
        weaponTpl: string,
        equipmentSlot: string,
        weaponParentId: string,
        itemTemplate: ITemplateItem,
        botRole: string,
    ): IItem[] {
        // Invalid weapon generated, fallback to preset
        this.logger.warning(
            this.localisationService.getText(
                "bot-weapon_generated_incorrect_using_default",
                `${weaponTpl} ${itemTemplate._name}`,
            ),
        );
        const weaponMods = [];

        // TODO: Right now, preset weapons trigger a lot of warnings regarding missing ammo in magazines & such
        let preset: IPreset;
        for (const presetObj of Object.values(this.databaseService.getGlobals().ItemPresets)) {
            if (presetObj._items[0]._tpl === weaponTpl) {
                preset = this.cloner.clone(presetObj);
                break;
            }
        }

        if (preset) {
            const parentItem = preset._items[0];
            preset._items[0] = {
                ...parentItem,
                ...{
                    parentId: weaponParentId,
                    slotId: equipmentSlot,
                    ...this.botGeneratorHelper.generateExtraPropertiesForItem(itemTemplate, botRole),
                },
            };
            weaponMods.push(...preset._items);
        } else {
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
    protected isWeaponValid(weaponItemArray: IItem[], botRole: string): boolean {
        for (const mod of weaponItemArray) {
            const modTemplate = this.itemHelper.getItem(mod._tpl)[1];
            if (!modTemplate._props.Slots?.length) {
                continue;
            }

            // Iterate over required slots in db item, check mod exists for that slot
            for (const modSlotTemplate of modTemplate._props.Slots.filter((slot) => slot._required)) {
                const slotName = modSlotTemplate._name;
                const hasWeaponSlotItem = weaponItemArray.some(
                    (weaponItem) => weaponItem.parentId === mod._id && weaponItem.slotId === slotName,
                );
                if (!hasWeaponSlotItem) {
                    this.logger.warning(
                        this.localisationService.getText("bot-weapons_required_slot_missing_item", {
                            modSlot: modSlotTemplate._name,
                            modName: modTemplate._name,
                            slotId: mod.slotId,
                            botRole: botRole,
                        }),
                    );

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
     * @param magWeights Magazine weights for count to add to inventory
     * @param inventory Inventory to add magazines to
     * @param botRole The bot type we're getting generating extra mags for
     */
    public addExtraMagazinesToInventory(
        generatedWeaponResult: IGenerateWeaponResult,
        magWeights: IGenerationData,
        inventory: PmcInventory,
        botRole: string,
    ): void {
        const weaponAndMods = generatedWeaponResult.weapon;
        const weaponTemplate = generatedWeaponResult.weaponTemplate;
        const magazineTpl = this.getMagazineTplFromWeaponTemplate(weaponAndMods, weaponTemplate, botRole);

        const magTemplate = this.itemHelper.getItem(magazineTpl)[1];
        if (!magTemplate) {
            this.logger.error(this.localisationService.getText("bot-unable_to_find_magazine_item", magazineTpl));

            return;
        }

        const ammoTemplate = this.itemHelper.getItem(generatedWeaponResult.chosenAmmoTpl)[1];
        if (!ammoTemplate) {
            this.logger.error(
                this.localisationService.getText("bot-unable_to_find_ammo_item", generatedWeaponResult.chosenAmmoTpl),
            );

            return;
        }

        // Has an UBGL
        if (generatedWeaponResult.chosenUbglAmmoTpl) {
            this.addUbglGrenadesToBotInventory(weaponAndMods, generatedWeaponResult, inventory);
        }

        const inventoryMagGenModel = new InventoryMagGen(
            magWeights,
            magTemplate,
            weaponTemplate,
            ammoTemplate,
            inventory,
        );
        this.inventoryMagGenComponents
            .find((v) => v.canHandleInventoryMagGen(inventoryMagGenModel))
            .process(inventoryMagGenModel);

        // Add x stacks of bullets to SecuredContainer (bots use a magic mag packing skill to reload instantly)
        this.addAmmoToSecureContainer(
            this.botConfig.secureContainerAmmoStackCount,
            generatedWeaponResult.chosenAmmoTpl,
            ammoTemplate._props.StackMaxSize,
            inventory,
        );
    }

    /**
     * Add Grendaes for UBGL to bots vest and secure container
     * @param weaponMods Weapon array with mods
     * @param generatedWeaponResult result of weapon generation
     * @param inventory bot inventory to add grenades to
     */
    protected addUbglGrenadesToBotInventory(
        weaponMods: IItem[],
        generatedWeaponResult: IGenerateWeaponResult,
        inventory: PmcInventory,
    ): void {
        // Find ubgl mod item + get details of it from db
        const ubglMod = weaponMods.find((x) => x.slotId === "mod_launcher");
        const ubglDbTemplate = this.itemHelper.getItem(ubglMod._tpl)[1];

        // Define min/max of how many grenades bot will have
        const ubglMinMax: IGenerationData = {
            weights: { 1: 1, 2: 1 },
            whitelist: {},
        };

        // get ammo template from db
        const ubglAmmoDbTemplate = this.itemHelper.getItem(generatedWeaponResult.chosenUbglAmmoTpl)[1];

        // Add greandes to bot inventory
        const ubglAmmoGenModel = new InventoryMagGen(
            ubglMinMax,
            ubglDbTemplate,
            ubglDbTemplate,
            ubglAmmoDbTemplate,
            inventory,
        );
        this.inventoryMagGenComponents
            .find((v) => v.canHandleInventoryMagGen(ubglAmmoGenModel))
            .process(ubglAmmoGenModel);

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
    protected addAmmoToSecureContainer(
        stackCount: number,
        ammoTpl: string,
        stackSize: number,
        inventory: PmcInventory,
    ): void {
        for (let i = 0; i < stackCount; i++) {
            const id = this.hashUtil.generate();
            this.botGeneratorHelper.addItemWithChildrenToEquipmentSlot(
                [EquipmentSlots.SECURED_CONTAINER],
                id,
                ammoTpl,
                [{ _id: id, _tpl: ammoTpl, upd: { StackObjectsCount: stackSize } }],
                inventory,
            );
        }
    }

    /**
     * Get a weapons magazine tpl from a weapon template
     * @param weaponMods mods from a weapon template
     * @param weaponTemplate Weapon to get magazine tpl for
     * @param botRole the bot type we are getting the magazine for
     * @returns magazine tpl string
     */
    protected getMagazineTplFromWeaponTemplate(
        weaponMods: IItem[],
        weaponTemplate: ITemplateItem,
        botRole: string,
    ): string {
        const magazine = weaponMods.find((m) => m.slotId === this.modMagazineSlotId);
        if (!magazine) {
            // Edge case - magazineless chamber loaded weapons dont have magazines, e.g. mp18
            // return default mag tpl
            if (weaponTemplate._props.ReloadMode === "OnlyBarrel") {
                return this.botWeaponGeneratorHelper.getWeaponsDefaultMagazineTpl(weaponTemplate);
            }

            // log error if no magazine AND not a chamber loaded weapon (e.g. shotgun revolver)
            if (!weaponTemplate._props.isChamberLoad) {
                // Shouldn't happen
                this.logger.warning(
                    this.localisationService.getText("bot-weapon_missing_magazine_or_chamber", {
                        weaponId: weaponTemplate._id,
                        botRole: botRole,
                    }),
                );
            }

            const defaultMagTplId = this.botWeaponGeneratorHelper.getWeaponsDefaultMagazineTpl(weaponTemplate);
            this.logger.debug(
                `[${botRole}] Unable to find magazine for weapon: ${weaponTemplate._id} ${weaponTemplate._name}, using mag template default: ${defaultMagTplId}.`,
            );

            return defaultMagTplId;
        }

        return magazine._tpl;
    }

    /**
     * Finds and return a compatible ammo tpl based on the bots ammo weightings (x.json/inventory/equipment/ammo)
     * @param cartridgePool Dict of all cartridges keyed by type e.g. Caliber556x45NATO
     * @param weaponTemplate Weapon details from db we want to pick ammo for
     * @returns Ammo tpl that works with the desired gun
     */
    protected getWeightedCompatibleAmmo(
        cartridgePool: Record<string, Record<string, number>>,
        weaponTemplate: ITemplateItem,
    ): string {
        const desiredCaliber = this.getWeaponCaliber(weaponTemplate);

        const cartridgePoolForWeapon = cartridgePool[desiredCaliber];
        if (!cartridgePoolForWeapon || cartridgePoolForWeapon?.length === 0) {
            this.logger.debug(
                this.localisationService.getText("bot-no_caliber_data_for_weapon_falling_back_to_default", {
                    weaponId: weaponTemplate._id,
                    weaponName: weaponTemplate._name,
                    defaultAmmo: weaponTemplate._props.defAmmo,
                }),
            );

            // Immediately returns, default ammo is guaranteed to be compatible
            return weaponTemplate._props.defAmmo;
        }

        // Get cartridges the weapons first chamber allow
        const compatibleCartridgesInTemplate = this.getCompatibleCartridgesFromWeaponTemplate(weaponTemplate);
        if (!compatibleCartridgesInTemplate) {
            // No chamber data found in weapon, send default
            return weaponTemplate._props.defAmmo;
        }

        // Inner join the weapons allowed + passed in cartridge pool to get compatible cartridges
        const compatibleCartridges = {};
        for (const cartridge of Object.keys(cartridgePoolForWeapon)) {
            if (compatibleCartridgesInTemplate.includes(cartridge)) {
                compatibleCartridges[cartridge] = cartridgePoolForWeapon[cartridge];
            }
        }

        if (!compatibleCartridges) {
            // No compatible cartridges, use default
            return weaponTemplate._props.defAmmo;
        }

        return this.weightedRandomHelper.getWeightedValue<string>(compatibleCartridges);
    }

    /**
     * Get the cartridge ids from a weapon template that work with the weapon
     * @param weaponTemplate Weapon db template to get cartridges for
     * @returns Array of cartridge tpls
     */
    protected getCompatibleCartridgesFromWeaponTemplate(weaponTemplate: ITemplateItem): string[] {
        let cartridges = weaponTemplate._props.Chambers[0]?._props?.filters[0]?.Filter;
        if (!cartridges) {
            // Fallback to the magazine if possible, e.g. for revolvers
            //  Grab the magazines template
            const firstMagazine = weaponTemplate._props.Slots.find((slot) => slot._name === "mod_magazine");
            const magazineTemplate = this.itemHelper.getItem(firstMagazine._props.filters[0].Filter[0]);

            // Get the first slots array of cartridges
            cartridges = magazineTemplate[1]._props.Slots[0]?._props.filters[0].Filter;
            if (!cartridges) {
                // Normal magazines
                // None found, try the cartridges array
                cartridges = magazineTemplate[1]._props.Cartridges[0]?._props.filters[0].Filter;
            }
        }

        return cartridges;
    }

    /**
     * Get a weapons compatible cartridge caliber
     * @param weaponTemplate Weapon to look up caliber of
     * @returns caliber as string
     */
    protected getWeaponCaliber(weaponTemplate: ITemplateItem): string {
        if (weaponTemplate._props.Caliber) {
            return weaponTemplate._props.Caliber;
        }

        if (weaponTemplate._props.ammoCaliber) {
            // 9x18pmm has a typo, should be Caliber9x18PM
            return weaponTemplate._props.ammoCaliber === "Caliber9x18PMM"
                ? "Caliber9x18PM"
                : weaponTemplate._props.ammoCaliber;
        }

        if (weaponTemplate._props.LinkedWeapon) {
            const ammoInChamber = this.itemHelper.getItem(
                weaponTemplate._props.Chambers[0]._props.filters[0].Filter[0],
            );
            if (!ammoInChamber[0]) {
                return;
            }

            return ammoInChamber[1]._props.Caliber;
        }
    }

    /**
     * Fill existing magazines to full, while replacing their contents with specified ammo
     * @param weaponMods Weapon with children
     * @param magazine Magazine item
     * @param cartridgeTpl Cartridge to insert into magazine
     */
    protected fillExistingMagazines(weaponMods: IItem[], magazine: IItem, cartridgeTpl: string): void {
        const magazineTemplate = this.itemHelper.getItem(magazine._tpl)[1];
        if (!magazineTemplate) {
            this.logger.error(this.localisationService.getText("bot-unable_to_find_magazine_item", magazine._tpl));

            return;
        }
        // Magazine, usually
        const parentItem = this.itemHelper.getItem(magazineTemplate._parent)[1];

        // the revolver shotgun uses a magazine with chambers, not cartridges ("camora_xxx")
        // Exchange of the camora ammo is not necessary we could also just check for stackSize > 0 here
        // and remove the else
        if (this.botWeaponGeneratorHelper.magazineIsCylinderRelated(parentItem._name)) {
            this.fillCamorasWithAmmo(weaponMods, magazine._id, cartridgeTpl);
        } else {
            this.addOrUpdateMagazinesChildWithAmmo(weaponMods, magazine, cartridgeTpl, magazineTemplate);
        }
    }

    /**
     * Add desired ammo tpl as item to weaponmods array, placed as child to UBGL
     * @param weaponMods Weapon with children
     * @param ubglMod UBGL item
     * @param ubglAmmoTpl Grenade ammo tpl
     */
    protected fillUbgl(weaponMods: IItem[], ubglMod: IItem, ubglAmmoTpl: string): void {
        weaponMods.push({
            _id: this.hashUtil.generate(),
            _tpl: ubglAmmoTpl,
            parentId: ubglMod._id,
            slotId: "patron_in_weapon",
            upd: { StackObjectsCount: 1 },
        });
    }

    /**
     * Add cartridge item to weapon Item array, if it already exists, update
     * @param weaponWithMods Weapon items array to amend
     * @param magazine magazine item details we're adding cartridges to
     * @param chosenAmmoTpl cartridge to put into the magazine
     * @param newStackSize how many cartridges should go into the magazine
     * @param magazineTemplate magazines db template
     */
    protected addOrUpdateMagazinesChildWithAmmo(
        weaponWithMods: IItem[],
        magazine: IItem,
        chosenAmmoTpl: string,
        magazineTemplate: ITemplateItem,
    ): void {
        const magazineCartridgeChildItem = weaponWithMods.find(
            (m) => m.parentId === magazine._id && m.slotId === "cartridges",
        );
        if (magazineCartridgeChildItem) {
            // Delete the existing cartridge object and create fresh below
            weaponWithMods.splice(weaponWithMods.indexOf(magazineCartridgeChildItem), 1);
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
    protected fillCamorasWithAmmo(weaponMods: IItem[], magazineId: string, ammoTpl: string): void {
        // for CylinderMagazine we exchange the ammo in the "camoras".
        // This might not be necessary since we already filled the camoras with a random whitelisted and compatible ammo type,
        // but I'm not sure whether this is also used elsewhere
        const camoras = weaponMods.filter((x) => x.parentId === magazineId && x.slotId.startsWith("camora"));
        for (const camora of camoras) {
            camora._tpl = ammoTpl;
            if (camora.upd) {
                camora.upd.StackObjectsCount = 1;
            } else {
                camora.upd = { StackObjectsCount: 1 };
            }
        }
    }
}
