import { inject, injectable } from "tsyringe";

import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { IBarterScheme } from "@spt-aki/models/eft/common/tables/ITrader";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Money } from "@spt-aki/models/enums/Money";
import { Traders } from "@spt-aki/models/enums/Traders";
import { ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ItemFilterService } from "@spt-aki/services/ItemFilterService";
import { SeasonalEventService } from "@spt-aki/services/SeasonalEventService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class FenceBaseAssortGenerator
{
    protected traderConfig: ITraderConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /**
     * Create base fence assorts dynamically and store in memory
     */
    public generateFenceBaseAssorts(): void
    {
        const blockedSeasonalItems = this.seasonalEventService.getInactiveSeasonalEventItems();
        const baseFenceAssort = this.databaseServer.getTables().traders[Traders.FENCE].assort;

        for (const rootItemDb of this.itemHelper.getItems().filter((item) => this.isValidFenceItem(item)))
        {
            // Skip blacklisted items
            if (this.itemFilterService.isItemBlacklisted(rootItemDb._id))
            {
                continue;
            }

            // Invalid
            if (!this.itemHelper.isValidItem(rootItemDb._id))
            {
                continue;
            }

            // Item base type blacklisted
            if (this.traderConfig.fence.blacklist.length > 0)
            {
                if (
                    this.traderConfig.fence.blacklist.includes(rootItemDb._id)
                    || this.itemHelper.isOfBaseclasses(rootItemDb._id, this.traderConfig.fence.blacklist)
                )
                {
                    continue;
                }
            }

            // Only allow  rigs with no slots (carrier rigs)
            if (this.itemHelper.isOfBaseclass(rootItemDb._id, BaseClasses.VEST) && rootItemDb._props.Slots.length > 0)
            {
                continue;
            }

            // Skip seasonal event items when not in seasonal event
            if (this.traderConfig.fence.blacklistSeasonalItems && blockedSeasonalItems.includes(rootItemDb._id))
            {
                continue;
            }

            // Create item object in array
            const itemWithChildrenToAdd: Item[] = [{
                _id: this.hashUtil.generate(),
                _tpl: rootItemDb._id,
                parentId: "hideout",
                slotId: "hideout",
                upd: { StackObjectsCount: 9999999 },
            }];

            if (this.itemHelper.isOfBaseclass(rootItemDb._id, BaseClasses.AMMO_BOX))
            {
                this.itemHelper.addCartridgesToAmmoBox(itemWithChildrenToAdd, rootItemDb);
            }

            // Ensure IDs are unique
            this.itemHelper.remapRootItemId(itemWithChildrenToAdd);
            if (itemWithChildrenToAdd.length > 1)
            {
                this.itemHelper.reparentItemAndChildren(itemWithChildrenToAdd[0], itemWithChildrenToAdd);
                itemWithChildrenToAdd[0].parentId = "hideout";
            }

            // Create barter scheme (price)
            const barterSchemeToAdd: IBarterScheme = {
                count: Math.round(this.getItemPrice(rootItemDb._id, itemWithChildrenToAdd)),
                _tpl: Money.ROUBLES,
            };

            // Add barter data to base
            baseFenceAssort.barter_scheme[itemWithChildrenToAdd[0]._id] = [[barterSchemeToAdd]];

            // Add item to base
            baseFenceAssort.items.push(...itemWithChildrenToAdd);

            // Add loyalty data to base
            baseFenceAssort.loyal_level_items[itemWithChildrenToAdd[0]._id] = 1;
        }

        // Add all default presets to base fence assort
        const defaultPresets = Object.values(this.presetHelper.getDefaultPresets());
        for (const defaultPreset of defaultPresets)
        {
            // Skip presets we've already added
            if (baseFenceAssort.items.some((item) => item.upd && item.upd.sptPresetId === defaultPreset._id))
            {
                continue;
            }

            // Construct preset + mods
            const itemAndChildren: Item[] = this.itemHelper.replaceIDs(defaultPreset._items);

            // Find root item and add some properties to it
            for (let i = 0; i < itemAndChildren.length; i++)
            {
                const mod = itemAndChildren[i];

                // Build root Item info
                if (!("parentId" in mod))
                {
                    mod.parentId = "hideout";
                    mod.slotId = "hideout";
                    mod.upd = {
                        StackObjectsCount: 1,
                        sptPresetId: defaultPreset._id, // Store preset id here so we can check it later to prevent preset dupes
                    };

                    // Updated root item, exit loop
                    break;
                }
            }

            // Add constructed preset to assorts
            baseFenceAssort.items.push(...itemAndChildren);

            // Calculate preset price (root item + child items)
            const price = this.handbookHelper.getTemplatePriceForItems(itemAndChildren);
            const itemQualityModifier = this.itemHelper.getItemQualityModifierForOfferItems(itemAndChildren);

            // Multiply weapon+mods rouble price by quality modifier
            baseFenceAssort.barter_scheme[itemAndChildren[0]._id] = [[]];
            baseFenceAssort.barter_scheme[itemAndChildren[0]._id][0][0] = {
                _tpl: Money.ROUBLES,
                count: Math.round(price * itemQualityModifier),
            };

            baseFenceAssort.loyal_level_items[itemAndChildren[0]._id] = 1;
        }
    }

    protected getItemPrice(itemTpl: string, items: Item[]): number
    {
        return this.itemHelper.isOfBaseclass(itemTpl, BaseClasses.AMMO_BOX)
            ? this.getAmmoBoxPrice(items) * this.traderConfig.fence.itemPriceMult
            : this.handbookHelper.getTemplatePrice(itemTpl) * this.traderConfig.fence.itemPriceMult;
    }

    protected getAmmoBoxPrice(items: Item[]): number
    {
        let total = 0;
        for (const item of items)
        {
            if (this.itemHelper.isOfBaseclass(item._tpl, BaseClasses.AMMO))
            {
                total += this.handbookHelper.getTemplatePrice(item._tpl) * (item.upd.StackObjectsCount ?? 1);
            }
        }

        return total;
    }

    /**
     * Add soft inserts + armor plates to an armor
     * @param armor Armor item array to add mods into
     * @param itemDbDetails Armor items db template
     */
    protected addChildrenToArmorModSlots(armor: Item[], itemDbDetails: ITemplateItem): void
    {
        // Armor has no mods, make no additions
        const hasMods = itemDbDetails._props.Slots.length > 0;
        if (!hasMods)
        {
            return;
        }

        // Check for and add required soft inserts to armors
        const requiredSlots = itemDbDetails._props.Slots.filter((slot) => slot._required);
        const hasRequiredSlots = requiredSlots.length > 0;
        if (hasRequiredSlots)
        {
            for (const requiredSlot of requiredSlots)
            {
                const modItemDbDetails = this.itemHelper.getItem(requiredSlot._props.filters[0].Plate)[1];
                const plateTpl = requiredSlot._props.filters[0].Plate; // `Plate` property appears to be the 'default' item for slot
                if (plateTpl === "")
                {
                    // Some bsg plate properties are empty, skip mod
                    continue;
                }

                const mod: Item = {
                    _id: this.hashUtil.generate(),
                    _tpl: plateTpl,
                    parentId: armor[0]._id,
                    slotId: requiredSlot._name,
                    upd: {
                        Repairable: {
                            Durability: modItemDbDetails._props.MaxDurability,
                            MaxDurability: modItemDbDetails._props.MaxDurability,
                        },
                    },
                };

                armor.push(mod);
            }
        }

        // Check for and add plate items
        const plateSlots = itemDbDetails._props.Slots.filter((slot) =>
            this.itemHelper.isRemovablePlateSlot(slot._name)
        );
        if (plateSlots.length > 0)
        {
            for (const plateSlot of plateSlots)
            {
                const plateTpl = plateSlot._props.filters[0].Plate;
                if (!plateTpl)
                {
                    // Bsg data lacks a default plate, skip adding mod
                    continue;
                }
                const modItemDbDetails = this.itemHelper.getItem(plateTpl)[1];
                armor.push({
                    _id: this.hashUtil.generate(),
                    _tpl: plateSlot._props.filters[0].Plate, // `Plate` property appears to be the 'default' item for slot
                    parentId: armor[0]._id,
                    slotId: plateSlot._name,
                    upd: {
                        Repairable: {
                            Durability: modItemDbDetails._props.MaxDurability,
                            MaxDurability: modItemDbDetails._props.MaxDurability,
                        },
                    },
                });
            }
        }
    }

    /**
     * Check if item is valid for being added to fence assorts
     * @param item Item to check
     * @returns true if valid fence item
     */
    protected isValidFenceItem(item: ITemplateItem): boolean
    {
        if (item._type === "Item")
        {
            return true;
        }

        return false;
    }
}
