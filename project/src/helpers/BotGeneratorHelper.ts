import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { ContainerHelper } from "@spt/helpers/ContainerHelper";
import { DurabilityLimitsHelper } from "@spt/helpers/DurabilityLimitsHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { IInventory } from "@spt/models/eft/common/tables/IBotBase";
import { IItem, IUpd, IUpdRepairable } from "@spt/models/eft/common/tables/IItem";
import { IGrid, ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { IGetRaidConfigurationRequestData } from "@spt/models/eft/match/IGetRaidConfigurationRequestData";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ItemAddedResult } from "@spt/models/enums/ItemAddedResult";
import { IChooseRandomCompatibleModResult } from "@spt/models/spt/bots/IChooseRandomCompatibleModResult";
import { EquipmentFilters, IBotConfig, IRandomisedResourceValues } from "@spt/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotGeneratorHelper {
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("DurabilityLimitsHelper") protected durabilityLimitsHelper: DurabilityLimitsHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("ContainerHelper") protected containerHelper: ContainerHelper,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
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
    public generateExtraPropertiesForItem(itemTemplate: ITemplateItem, botRole?: string): { upd?: IUpd } {
        // Get raid settings, if no raid, default to day
        const raidSettings = this.applicationContext
            .getLatestValue(ContextVariableType.RAID_CONFIGURATION)
            ?.getValue<IGetRaidConfigurationRequestData>();
        const raidIsNight = raidSettings?.timeVariant === "PAST";

        const itemProperties: IUpd = {};

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
                    this.botConfig.lootItemResourceRandomization[botRole]?.meds,
                ),
            };
        }

        if (itemTemplate._props.MaxResource && itemTemplate._props.foodUseTime) {
            itemProperties.FoodDrink = {
                HpPercent: this.getRandomizedResourceValue(
                    itemTemplate._props.MaxResource,
                    this.botConfig.lootItemResourceRandomization[botRole]?.food,
                ),
            };
        }

        if (itemTemplate._parent === BaseClasses.FLASHLIGHT) {
            // Get chance from botconfig for bot type
            const lightLaserActiveChance = raidIsNight
                ? this.getBotEquipmentSettingFromConfig(botRole, "lightIsActiveNightChancePercent", 50)
                : this.getBotEquipmentSettingFromConfig(botRole, "lightIsActiveDayChancePercent", 25);
            itemProperties.Light = {
                IsActive: this.randomUtil.getChance100(lightLaserActiveChance),
                SelectedMode: 0,
            };
        } else if (itemTemplate._parent === BaseClasses.TACTICAL_COMBO) {
            // Get chance from botconfig for bot type, use 50% if no value found
            const lightLaserActiveChance = this.getBotEquipmentSettingFromConfig(
                botRole,
                "laserIsActiveChancePercent",
                50,
            );
            itemProperties.Light = {
                IsActive: this.randomUtil.getChance100(lightLaserActiveChance),
                SelectedMode: 0,
            };
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
                75,
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
            maxResource,
        );
    }

    /**
     * Get the chance for the weapon attachment or helmet equipment to be set as activated
     * @param botRole role of bot with weapon/helmet
     * @param setting the setting of the weapon attachment/helmet equipment to be activated
     * @param defaultValue default value for the chance of activation if the botrole or bot equipment role is undefined
     * @returns Percent chance to be active
     */
    protected getBotEquipmentSettingFromConfig(
        botRole: string | undefined,
        setting: keyof EquipmentFilters,
        defaultValue: number,
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
                }),
            );

            return defaultValue;
        }
        if (botEquipmentSettings[setting] === undefined || typeof botEquipmentSettings[setting] !== "number") {
            this.logger.warning(
                this.localisationService.getText("bot-missing_equipment_settings_property", {
                    botRole: botRole,
                    setting: setting,
                    defaultValue: defaultValue,
                }),
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
    protected generateWeaponRepairableProperties(itemTemplate: ITemplateItem, botRole?: string): IUpdRepairable {
        const maxDurability = this.durabilityLimitsHelper.getRandomizedMaxWeaponDurability(itemTemplate, botRole);
        const currentDurability = this.durabilityLimitsHelper.getRandomizedWeaponDurability(
            itemTemplate,
            botRole,
            maxDurability,
        );

        return { Durability: currentDurability, MaxDurability: maxDurability };
    }

    /**
     * Create a repairable object for an armor that containers durability + max durability properties
     * @param itemTemplate weapon object being generated for
     * @param botRole type of bot being generated for
     * @returns Repairable object
     */
    protected generateArmorRepairableProperties(itemTemplate: ITemplateItem, botRole?: string): IUpdRepairable {
        let maxDurability: number;
        let currentDurability: number;
        if (Number.parseInt(`${itemTemplate._props.armorClass}`) === 0) {
            maxDurability = itemTemplate._props.MaxDurability;
            currentDurability = itemTemplate._props.MaxDurability;
        } else {
            maxDurability = this.durabilityLimitsHelper.getRandomizedMaxArmorDurability(itemTemplate, botRole);
            currentDurability = this.durabilityLimitsHelper.getRandomizedArmorDurability(
                itemTemplate,
                botRole,
                maxDurability,
            );
        }

        return { Durability: currentDurability, MaxDurability: maxDurability };
    }

    /**
     * Can item be added to another item without conflict
     * @param itemsEquipped Items to check compatibilities with
     * @param tplToCheck Tpl of the item to check for incompatibilities
     * @param equipmentSlot Slot the item will be placed into
     * @returns false if no incompatibilities, also has incompatibility reason
     */
    public isItemIncompatibleWithCurrentItems(
        itemsEquipped: IItem[],
        tplToCheck: string,
        equipmentSlot: string,
    ): IChooseRandomCompatibleModResult {
        // Skip slots that have no incompatibilities
        if (["Scabbard", "Backpack", "SecureContainer", "Holster", "ArmBand"].includes(equipmentSlot)) {
            return { incompatible: false, found: false, reason: "" };
        }

        // TODO: Can probably be optimized to cache itemTemplates as items are added to inventory
        const equippedItemsDb = itemsEquipped.map((equippedItem) => this.itemHelper.getItem(equippedItem._tpl)[1]);
        const itemToEquipDb = this.itemHelper.getItem(tplToCheck);
        const itemToEquip = itemToEquipDb[1];

        if (!itemToEquipDb[0]) {
            this.logger.warning(
                this.localisationService.getText("bot-invalid_item_compatibility_check", {
                    itemTpl: tplToCheck,
                    slot: equipmentSlot,
                }),
            );

            return { incompatible: true, found: false, reason: `item: ${tplToCheck} does not exist in the database` };
        }

        if (!itemToEquip._props) {
            this.logger.warning(
                this.localisationService.getText("bot-compatibility_check_missing_props", {
                    id: itemToEquip._id,
                    name: itemToEquip._name,
                    slot: equipmentSlot,
                }),
            );

            return { incompatible: true, found: false, reason: `item: ${tplToCheck} does not have a _props field` };
        }

        // Does an equipped item have a property that blocks the desired item - check for prop "BlocksX" .e.g BlocksEarpiece / BlocksFaceCover
        let blockingItem = equippedItemsDb.find((item) => item._props[`Blocks${equipmentSlot}`]);
        if (blockingItem) {
            // this.logger.warning(`1 incompatibility found between - ${itemToEquip[1]._name} and ${blockingItem._name} - ${equipmentSlot}`);
            return {
                incompatible: true,
                found: false,
                reason: `${tplToCheck} ${itemToEquip._name} in slot: ${equipmentSlot} blocked by: ${blockingItem._id} ${blockingItem._name}`,
                slotBlocked: true,
            };
        }

        // Check if any of the current inventory templates have the incoming item defined as incompatible
        blockingItem = equippedItemsDb.find((x) => x._props.ConflictingItems?.includes(tplToCheck));
        if (blockingItem) {
            // this.logger.warning(`2 incompatibility found between - ${itemToEquip[1]._name} and ${blockingItem._props.Name} - ${equipmentSlot}`);
            return {
                incompatible: true,
                found: false,
                reason: `${tplToCheck} ${itemToEquip._name} in slot: ${equipmentSlot} blocked by: ${blockingItem._id} ${blockingItem._name}`,
                slotBlocked: true,
            };
        }

        // Does item being checked get blocked/block existing item
        if (itemToEquip._props.BlocksHeadwear) {
            const existingHeadwear = itemsEquipped.find((x) => x.slotId === "Headwear");
            if (existingHeadwear) {
                return {
                    incompatible: true,
                    found: false,
                    reason: `${tplToCheck} ${itemToEquip._name} is blocked by: ${existingHeadwear._tpl} in slot: ${existingHeadwear.slotId}`,
                    slotBlocked: true,
                };
            }
        }

        // Does item being checked get blocked/block existing item
        if (itemToEquip._props.BlocksFaceCover) {
            const existingFaceCover = itemsEquipped.find((item) => item.slotId === "FaceCover");
            if (existingFaceCover) {
                return {
                    incompatible: true,
                    found: false,
                    reason: `${tplToCheck} ${itemToEquip._name} is blocked by: ${existingFaceCover._tpl} in slot: ${existingFaceCover.slotId}`,
                    slotBlocked: true,
                };
            }
        }

        // Does item being checked get blocked/block existing item
        if (itemToEquip._props.BlocksEarpiece) {
            const existingEarpiece = itemsEquipped.find((item) => item.slotId === "Earpiece");
            if (existingEarpiece) {
                return {
                    incompatible: true,
                    found: false,
                    reason: `${tplToCheck} ${itemToEquip._name} is blocked by: ${existingEarpiece._tpl} in slot: ${existingEarpiece.slotId}`,
                    slotBlocked: true,
                };
            }
        }

        // Does item being checked get blocked/block existing item
        if (itemToEquip._props.BlocksArmorVest) {
            const existingArmorVest = itemsEquipped.find((item) => item.slotId === "ArmorVest");
            if (existingArmorVest) {
                return {
                    incompatible: true,
                    found: false,
                    reason: `${tplToCheck} ${itemToEquip._name} is blocked by: ${existingArmorVest._tpl} in slot: ${existingArmorVest.slotId}`,
                    slotBlocked: true,
                };
            }
        }

        // Check if the incoming item has any inventory items defined as incompatible
        const blockingInventoryItem = itemsEquipped.find((x) => itemToEquip._props.ConflictingItems?.includes(x._tpl));
        if (blockingInventoryItem) {
            // this.logger.warning(`3 incompatibility found between - ${itemToEquip[1]._name} and ${blockingInventoryItem._tpl} - ${equipmentSlot}`)
            return {
                incompatible: true,
                found: false,
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
            botRole.toLowerCase(),
        )
            ? "pmc"
            : botRole;
    }

    /**
     * Adds an item with all its children into specified equipmentSlots, wherever it fits.
     * @param equipmentSlots Slot to add item+children into
     * @param rootItemId Root item id to use as mod items parentid
     * @param rootItemTplId Root itms tpl id
     * @param itemWithChildren Item to add
     * @param inventory Inventory to add item+children into
     * @returns ItemAddedResult result object
     */
    public addItemWithChildrenToEquipmentSlot(
        equipmentSlots: string[],
        rootItemId: string,
        rootItemTplId: string,
        itemWithChildren: IItem[],
        inventory: IInventory,
        containersIdFull?: Set<string>,
    ): ItemAddedResult {
        /** Track how many containers are unable to be found */
        let missingContainerCount = 0;
        for (const equipmentSlotId of equipmentSlots) {
            if (containersIdFull?.has(equipmentSlotId)) {
                continue;
            }
            // Get container to put item into
            const container = inventory.items.find((item) => item.slotId === equipmentSlotId);
            if (!container) {
                missingContainerCount++;
                if (missingContainerCount === equipmentSlots.length) {
                    // Bot doesnt have any containers we want to add item to
                    this.logger.debug(
                        `Unable to add item: ${itemWithChildren[0]._tpl} to bot as it lacks the following containers: ${equipmentSlots.join(
                            ",",
                        )}`,
                    );

                    return ItemAddedResult.NO_CONTAINERS;
                }

                // No container of desired type found, skip to next container type
                continue;
            }

            // Get container details from db
            const containerTemplate = this.itemHelper.getItem(container._tpl);
            if (!containerTemplate[0]) {
                this.logger.warning(this.localisationService.getText("bot-missing_container_with_tpl", container._tpl));

                // Bad item, skip
                continue;
            }

            if (!containerTemplate[1]._props.Grids?.length) {
                // Container has no slots to hold items
                continue;
            }

            // Get x/y grid size of item
            const itemSize = this.inventoryHelper.getItemSize(rootItemTplId, rootItemId, itemWithChildren);

            // Iterate over each grid in the container and look for a big enough space for the item to be placed in
            let currentGridCount = 1;
            const totalSlotGridCount = containerTemplate[1]._props.Grids.length;
            for (const slotGrid of containerTemplate[1]._props.Grids) {
                // Grid is empty, skip or item size is bigger than grid
                if (
                    slotGrid._props.cellsH === 0 ||
                    slotGrid._props.cellsV === 0 ||
                    itemSize[0] * itemSize[1] > slotGrid._props.cellsV * slotGrid._props.cellsH
                ) {
                    continue;
                }

                // Can't put item type in grid, skip all grids as we're assuming they have the same rules
                if (!this.itemAllowedInContainer(slotGrid, rootItemTplId)) {
                    // Multiple containers, maybe next one allows item, only break out of loop for this containers grids
                    break;
                }

                // Get all root items in found container
                const existingContainerItems = inventory.items.filter(
                    (item) => item.parentId === container._id && item.slotId === slotGrid._name,
                );

                // Get root items in container we can iterate over to find out what space is free
                const containerItemsToCheck = existingContainerItems.filter((x) => x.slotId === slotGrid._name);
                for (const item of containerItemsToCheck) {
                    // Look for children on items, insert into array if found
                    // (used later when figuring out how much space weapon takes up)
                    const itemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(inventory.items, item._id);
                    if (itemWithChildren.length > 1) {
                        existingContainerItems.splice(existingContainerItems.indexOf(item), 1, ...itemWithChildren);
                    }
                }

                // Get rid of items free/used spots in current grid
                const slotGridMap = this.inventoryHelper.getContainerMap(
                    slotGrid._props.cellsH,
                    slotGrid._props.cellsV,
                    existingContainerItems,
                    container._id,
                );

                // Try to fit item into grid
                const findSlotResult = this.containerHelper.findSlotForItem(slotGridMap, itemSize[0], itemSize[1]);

                // Open slot found, add item to inventory
                if (findSlotResult.success) {
                    const parentItem = itemWithChildren.find((i) => i._id === rootItemId);

                    // Set items parent to container id
                    parentItem.parentId = container._id;
                    parentItem.slotId = slotGrid._name;
                    parentItem.location = {
                        x: findSlotResult.x,
                        y: findSlotResult.y,
                        r: findSlotResult.rotation ? 1 : 0,
                    };

                    inventory.items.push(...itemWithChildren);

                    return ItemAddedResult.SUCCESS;
                }

                // If we've checked all grids in container and reached this point, there's no space for item
                if (currentGridCount >= totalSlotGridCount) {
                    break;
                }

                currentGridCount++;
                // No space in this grid, move to next container grid and try again
            }

            // if we got to this point, the item couldnt be placed on the container
            if (containersIdFull) {
                // if the item was a one by one, we know it must be full. Or if the maps cant find a slot for a one by one
                if (itemSize[0] === 1 && itemSize[1] === 1) {
                    containersIdFull.add(equipmentSlotId);
                }
            }
        }

        return ItemAddedResult.NO_SPACE;
    }

    /**
     * Is the provided item allowed inside a container
     * @param slotGrid Items sub-grid we want to place item inside
     * @param itemTpl Item tpl being placed
     * @returns True if allowed
     */
    protected itemAllowedInContainer(slotGrid: IGrid, itemTpl: string): boolean {
        const propFilters = slotGrid._props.filters;
        const excludedFilter = propFilters[0]?.ExcludedFilter ?? [];
        const filter = propFilters[0]?.Filter ?? [];

        if (propFilters.length === 0) {
            // no filters, item is fine to add
            return true;
        }

        // Check if item base type is excluded
        if (excludedFilter || filter) {
            const itemDetails = this.itemHelper.getItem(itemTpl)[1];

            // if item to add is found in exclude filter, not allowed
            if (excludedFilter?.includes(itemDetails._parent)) {
                return false;
            }

            // If Filter array only contains 1 filter and its for basetype 'item', allow it
            if (filter?.length === 1 && filter.includes(BaseClasses.ITEM)) {
                return true;
            }

            // If allowed filter has something in it + filter doesnt have basetype 'item', not allowed
            if (filter?.length > 0 && !filter.includes(itemDetails._parent)) {
                return false;
            }
        }

        return true;
    }
}
