import { inject, injectable } from "tsyringe";

import { IPreset } from "@spt-aki/models/eft/common/IGlobals";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { ItemHelper } from "./ItemHelper";

@injectable()
export class PresetHelper
{
    protected lookup: Record<string, string[]> = {};
    protected defaultEquipmentPresets: Record<string, IPreset>;
    protected defaultWeaponPresets: Record<string, IPreset>;

    constructor(
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
    )
    {}

    public hydratePresetStore(input: Record<string, string[]>): void
    {
        this.lookup = input;
    }

    /**
     * Get default weapon and equipment presets
     * @returns Dictionary
     */
    public getDefaultPresets(): Record<string, IPreset>
    {
        const weapons = this.getDefaultWeaponPresets();
        const equipment = this.getDefaultEquipmentPresets();

        return Object.assign({}, weapons, equipment);
    }

    /**
     * Get default weapon presets
     * @returns Dictionary
     */
    public getDefaultWeaponPresets(): Record<string, IPreset>
    {
        if (!this.defaultWeaponPresets)
        {
            this.defaultWeaponPresets = Object.values(this.databaseServer.getTables().globals.ItemPresets).filter((
                preset,
            ) => preset._encyclopedia !== undefined
                && this.itemHelper.isOfBaseclass(preset._encyclopedia, BaseClasses.WEAPON)
            ).reduce((acc, cur) =>
            {
                acc[cur._id] = cur;
                return acc;
            }, {});
        }

        return this.defaultWeaponPresets;
    }

    /**
     * Get default equipment presets
     * @returns Dictionary
     */
    public getDefaultEquipmentPresets(): Record<string, IPreset>
    {
        if (!this.defaultEquipmentPresets)
        {
            this.defaultEquipmentPresets = Object.values(this.databaseServer.getTables().globals.ItemPresets).filter((
                preset,
            ) => preset._encyclopedia !== undefined && this.itemHelper.armorItemCanHoldMods(preset._encyclopedia))
                .reduce((acc, cur) =>
                {
                    acc[cur._id] = cur;
                    return acc;
                }, {});
        }

        return this.defaultEquipmentPresets;
    }

    public isPreset(id: string): boolean
    {
        return id in this.databaseServer.getTables().globals.ItemPresets;
    }

    public hasPreset(templateId: string): boolean
    {
        return templateId in this.lookup;
    }

    public getPreset(id: string): IPreset
    {
        return this.jsonUtil.clone(this.databaseServer.getTables().globals.ItemPresets[id]);
    }

    public getAllPresets(): IPreset[]
    {
        return this.jsonUtil.clone(Object.values(this.databaseServer.getTables().globals.ItemPresets));
    }

    public getPresets(templateId: string): IPreset[]
    {
        if (!this.hasPreset(templateId))
        {
            return [];
        }

        const presets = [];
        const ids = this.lookup[templateId];

        for (const id of ids)
        {
            presets.push(this.getPreset(id));
        }

        return presets;
    }

    /**
     * Get the default preset for passed in item id
     * @param templateId Item id to get preset for
     * @returns Null if no default preset, otherwise IPreset
     */
    public getDefaultPreset(templateId: string): IPreset
    {
        if (!this.hasPreset(templateId))
        {
            return null;
        }

        const allPresets = this.getPresets(templateId);

        for (const preset of allPresets)
        {
            if ("_encyclopedia" in preset)
            {
                return preset;
            }
        }

        return allPresets[0];
    }

    public getBaseItemTpl(presetId: string): string
    {
        if (this.isPreset(presetId))
        {
            const preset = this.getPreset(presetId);

            for (const item of preset._items)
            {
                if (preset._parent === item._id)
                {
                    return item._tpl;
                }
            }
        }

        return "";
    }

    /**
     * Return the price of the preset for the given item tpl, or for the tpl itself if no preset exists
     * @param tpl The item template to get the price of
     * @returns The price of the given item preset, or base item if no preset exists
     */
    public getDefaultPresetOrItemPrice(tpl: string): number
    {
        // Get default preset if it exists
        const defaultPreset = this.getDefaultPreset(tpl);

        // Bundle up tpls we want price for
        const tpls = defaultPreset ? defaultPreset._items.map((item) => item._tpl) : [tpl];

        // Get price of tpls
        return this.itemHelper.getItemAndChildrenPrice(tpls);
    }
}
