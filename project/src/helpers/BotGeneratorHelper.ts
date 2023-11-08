import { inject, injectable } from "tsyringe";

import { ApplicationContext } from "@spt-aki/context/ApplicationContext";
import { ContextVariableType } from "@spt-aki/context/ContextVariableType";
import { DurabilityLimitsHelper } from "@spt-aki/helpers/DurabilityLimitsHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { Item, Repairable, Upd } from "@spt-aki/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { IGetRaidConfigurationRequestData } from "@spt-aki/models/eft/match/IGetRaidConfigurationRequestData";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { EquipmentFilters, IBotConfig, IRandomisedResourceValues } from "@spt-aki/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt-aki/models/spt/config/IPmcConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class BotGeneratorHelper {
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("DurabilityLimitsHelper") protected durabilityLimitsHelper: DurabilityLimitsHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Adds properties to an item
     * e.g. Repairable / HasHinge / Foldable / MaxDurability
     * @param itemTemplate Item extra properties are being generated for
     * @param botRole Used by weapons to randomize the durability values. Null for non-equipped items
     * @returns Item Upd object with extra properties
     */
    public generateExtraPropertiesForItem(itemTemplate: ITemplateItem, botRole = null): { upd?: Upd } {
        // Get raid settings, if no raid, default to day
        const raidSettings = this.applicationContext
            .getLatestValue(ContextVariableType.RAID_CONFIGURATION)
            ?.getValue<IGetRaidConfigurationRequestData>();
        const raidIsNight = raidSettings?.timeVariant === "PAST";

        const itemProperties: Upd = {};

        if (itemTemplate._props.MaxDurability) {
            if (itemTemplate._props.weapClass) {
                // Is weapon
                itemProperties.Repairable = this.generateWeaponRepairableProperties(itemTemplate, botRole);
            } else if (itemTemplate._props.armorClass) {
                // Is armor
                itemProperties.Repairable = this.generateArmorRepairableProperties(itemTemplate, botRole);
            }
        }

        if (itemTemplate._props.HasHinge) {
            itemProperties.Togglable = { On: true };
        }

        if (itemTemplate._props.Foldable) {
            itemProperties.Foldable = { Folded: false };
        }

        if (itemTemplate._props.weapFireType?.length) {
            if (itemTemplate._props.weapFireType.includes("fullauto")) {
                itemProperties.FireMode = { FireMode: "fullauto" };
            } else {
                itemProperties.FireMode = { FireMode: this.randomUtil.getArrayValue(itemTemplate._props.weapFireType) };
            }
        }

        if (itemTemplate._props.MaxHpResource) {
            itemProperties.MedKit = {
                HpResource: this.getRandomizedResourceValue(
                    itemTemplate._props.MaxHpResource,
                    this.botConfig.lootItemResourceRandomization[botRole]?.meds
                ),
            };
        }

        if (itemTemplate._props.MaxResource && itemTemplate._props.foodUseTime) {
            itemProperties.FoodDrink = {
                HpPercent: this.getRandomizedResourceValue(
                    itemTemplate._props.MaxResource,
                    this.botConfig.lootItemResourceRandomization[botRole]?.food
                ),
            };
        }

        if (itemTemplate._parent === BaseClasses.FLASHLIGHT) {
            // Get chance from botconfig for bot type
            const lightLaserActiveChance = raidIsNight
                ? this.getBotEquipmentSettingFromConfig(botRole, "lightIsActiveNightChancePercent", 50)
                : this.getBotEquipmentSettingFromConfig(botRole, "lightIsActiveDayChancePercent", 25);
            itemProperties.Light = { IsActive: this.randomUtil.getChance100(lightLaserActiveChance), SelectedMode: 0 };
        } else if (itemTemplate._parent === BaseClasses.TACTICAL_COMBO) {
            // Get chance from botconfig for bot type, use 50% if no value found
            const lightLaserActiveChance = this.getBotEquipmentSettingFromConfig(
                botRole,
                "laserIsActiveChancePercent",
                50
            );
            itemProperties.Light = { IsActive: this.randomUtil.getChance100(lightLaserActiveChance), SelectedMode: 0 };
        }

        if (itemTemplate._parent === BaseClasses.NIGHTVISION) {
            // Get chance from botconfig for bot type
            const nvgActiveChance = raidIsNight
                ? this.getBotEquipmentSettingFromConfig(botRole, "nvgIsActiveChanceNightPercent", 90)
                : this.getBotEquipmentSettingFromConfig(botRole, "nvgIsActiveChanceDayPercent", 15);
            itemProperties.Togglable = { On: this.randomUtil.getChance100(nvgActiveChance) };
        }

        // Togglable face shield
        if (itemTemplate._props.HasHinge && itemTemplate._props.FaceShieldComponent) {
            // Get chance from botconfig for bot type, use 75% if no value found
            const faceShieldActiveChance = this.getBotEquipmentSettingFromConfig(
                botRole,
                "faceShieldIsActiveChancePercent",
                75
            );
            itemProperties.Togglable = { On: this.randomUtil.getChance100(faceShieldActiveChance) };
        }

        return Object.keys(itemProperties).length ? { upd: itemProperties } : {};
    }

    /**
     * Randomize the HpResource for bots e.g (245/400 resources)
     * @param maxResource Max resource value of medical items
     * @param randomizationValues Value provided from config
     * @returns Randomized value from maxHpResource
     */
    protected getRandomizedResourceValue(maxResource: number, randomizationValues: IRandomisedResourceValues): number {
        if (!randomizationValues) {
            return maxResource;
        }

        if (this.randomUtil.getChance100(randomizationValues.chanceMaxResourcePercent)) {
            return maxResource;
        }

        return this.randomUtil.getInt(
            this.randomUtil.getPercentOfValue(randomizationValues.resourcePercent, maxResource, 0),
            maxResource
        );
    }

    /**
     * Get the chance for the weapon attachment or helmet equipment to be set as activated
     * @param botRole role of bot with weapon/helmet
     * @param setting the setting of the weapon attachment/helmet equipment to be activated
     * @param defaultValue default value for the chance of activation if the botrole or bot equipment role is null
     * @returns Percent chance to be active
     */
    protected getBotEquipmentSettingFromConfig(
        botRole: string,
        setting: keyof EquipmentFilters,
        defaultValue: number
    ): number {
        if (!botRole) {
            return defaultValue;
        }
        const botEquipmentSettings = this.botConfig.equipment[this.getBotEquipmentRole(botRole)];
        if (!botEquipmentSettings) {
            this.logger.warning(
                this.localisationService.getText("bot-missing_equipment_settings", {
                    botRole: botRole,
                    setting: setting,
                    defaultValue: defaultValue,
                })
            );

            return defaultValue;
        }
        if (botEquipmentSettings[setting] === undefined || typeof botEquipmentSettings[setting] !== "number") {
            this.logger.warning(
                this.localisationService.getText("bot-missing_equipment_settings_property", {
                    botRole: botRole,
                    setting: setting,
                    defaultValue: defaultValue,
                })
            );

            return defaultValue;
        }

        return <number>botEquipmentSettings[setting];
    }

    /**
     * Create a repairable object for a weapon that containers durability + max durability properties
     * @param itemTemplate weapon object being generated for
     * @param botRole type of bot being generated for
     * @returns Repairable object
     */
    protected generateWeaponRepairableProperties(itemTemplate: ITemplateItem, botRole: string): Repairable {
        const maxDurability = this.durabilityLimitsHelper.getRandomizedMaxWeaponDurability(itemTemplate, botRole);
        const currentDurability = this.durabilityLimitsHelper.getRandomizedWeaponDurability(
            itemTemplate,
            botRole,
            maxDurability
        );

        return {
            Durability: currentDurability,
            MaxDurability: maxDurability,
        };
    }

    /**
     * Create a repairable object for an armor that containers durability + max durability properties
     * @param itemTemplate weapon object being generated for
     * @param botRole type of bot being generated for
     * @returns Repairable object
     */
    protected generateArmorRepairableProperties(itemTemplate: ITemplateItem, botRole: string): Repairable {
        let maxDurability: number;
        let currentDurability: number;
        if (parseInt(`${itemTemplate._props.armorClass}`) === 0) {
            maxDurability = itemTemplate._props.MaxDurability;
            currentDurability = itemTemplate._props.MaxDurability;
        } else {
            maxDurability = this.durabilityLimitsHelper.getRandomizedMaxArmorDurability(itemTemplate, botRole);
            currentDurability = this.durabilityLimitsHelper.getRandomizedArmorDurability(
                itemTemplate,
                botRole,
                maxDurability
            );
        }

        return {
            Durability: currentDurability,
            MaxDurability: maxDurability,
        };
    }

    /**
     * Can item be added to another item without conflict
     * @param items Items to check compatibilities with
     * @param tplToCheck Tpl of the item to check for incompatibilities
     * @param equipmentSlot Slot the item will be placed into
     * @returns false if no incompatibilities, also has incompatibility reason
     */
    public isItemIncompatibleWithCurrentItems(
        items: Item[],
        tplToCheck: string,
        equipmentSlot: string
    ): { incompatible: boolean; reason: string } {
        // Skip slots that have no incompatibilities
        if (["Scabbard", "Backpack", "SecureContainer", "Holster", "ArmBand"].includes(equipmentSlot)) {
            return { incompatible: false, reason: "" };
        }

        // TODO: Can probably be optimized to cache itemTemplates as items are added to inventory
        const equippedItems = items.map((i) => this.databaseServer.getTables().templates.items[i._tpl]);
        const item = this.itemHelper.getItem(tplToCheck);
        const itemToCheck = item[1];

        if (!item[0]) {
            this.logger.warning(
                this.localisationService.getText("bot-invalid_item_compatibility_check", {
                    itemTpl: tplToCheck,
                    slot: equipmentSlot,
                })
            );
        }

        if (!itemToCheck._props) {
            this.logger.warning(
                this.localisationService.getText("bot-compatibility_check_missing_props", {
                    id: itemToCheck._id,
                    name: itemToCheck._name,
                    slot: equipmentSlot,
                })
            );
        }

        // Does an equipped item have a property that blocks the desired item - check for prop "BlocksX" .e.g BlocksEarpiece / BlocksFaceCover
        let blockingItem = equippedItems.find((x) => x._props[`Blocks${equipmentSlot}`]);
        if (blockingItem) {
            //this.logger.warning(`1 incompatibility found between - ${itemToEquip[1]._name} and ${blockingItem._name} - ${equipmentSlot}`);
            return {
                incompatible: true,
                reason: `${tplToCheck} ${itemToCheck._name} in slot: ${equipmentSlot} blocked by: ${blockingItem._id} ${blockingItem._name}`,
            };
        }

        // Check if any of the current inventory templates have the incoming item defined as incompatible
        blockingItem = equippedItems.find((x) => x._props.ConflictingItems?.includes(tplToCheck));
        if (blockingItem) {
            //this.logger.warning(`2 incompatibility found between - ${itemToEquip[1]._name} and ${blockingItem._props.Name} - ${equipmentSlot}`);
            return {
                incompatible: true,
                reason: `${tplToCheck} ${itemToCheck._name} in slot: ${equipmentSlot} blocked by: ${blockingItem._id} ${blockingItem._name}`,
            };
        }

        // Check if the incoming item has any inventory items defined as incompatible
        const blockingInventoryItem = items.find((x) => itemToCheck._props.ConflictingItems?.includes(x._tpl));
        if (blockingInventoryItem) {
            //this.logger.warning(`3 incompatibility found between - ${itemToEquip[1]._name} and ${blockingInventoryItem._tpl} - ${equipmentSlot}`)
            return {
                incompatible: true,
                reason: `${tplToCheck} blocks existing item ${blockingInventoryItem._tpl} in slot ${blockingInventoryItem.slotId}`,
            };
        }

        return { incompatible: false, reason: "" };
    }

    /**
     * Convert a bots role to the equipment role used in config/bot.json
     * @param botRole Role to convert
     * @returns Equipment role (e.g. pmc / assault / bossTagilla)
     */
    public getBotEquipmentRole(botRole: string): string {
        return [this.pmcConfig.usecType.toLowerCase(), this.pmcConfig.bearType.toLowerCase()].includes(
            botRole.toLowerCase()
        )
            ? "pmc"
            : botRole;
    }
}

/** TODO - move into own class */
export class ExhaustableArray<T> {
    private pool: T[];

    constructor(private itemPool: T[], private randomUtil: RandomUtil, private jsonUtil: JsonUtil) {
        this.pool = this.jsonUtil.clone(itemPool);
    }

    public getRandomValue(): T {
        if (!this.pool?.length) {
            return null;
        }

        const index = this.randomUtil.getInt(0, this.pool.length - 1);
        const toReturn = this.jsonUtil.clone(this.pool[index]);
        this.pool.splice(index, 1);
        return toReturn;
    }

    public getFirstValue(): T {
        if (!this.pool?.length) {
            return null;
        }

        const toReturn = this.jsonUtil.clone(this.pool[0]);
        this.pool.splice(0, 1);
        return toReturn;
    }

    public hasValues(): boolean {
        if (this.pool?.length) {
            return true;
        }

        return false;
    }
}
