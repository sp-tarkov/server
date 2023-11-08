import { inject, injectable } from "tsyringe";

import { IPreset } from "@spt-aki/models/eft/common/IGlobals";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class PresetHelper {
    protected lookup: Record<string, string[]> = {};
    protected defaultPresets: Record<string, IPreset>;

    constructor(
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer
    ) {}

    public hydratePresetStore(input: Record<string, string[]>): void {
        this.lookup = input;
    }

    public getDefaultPresets(): Record<string, IPreset> {
        if (!this.defaultPresets) {
            this.defaultPresets = Object.values(this.databaseServer.getTables().globals.ItemPresets)
                .filter((x) => x._encyclopedia !== undefined)
                .reduce((acc, cur) => {
                    acc[cur._id] = cur;
                    return acc;
                }, {});
        }

        return this.defaultPresets;
    }

    public isPreset(id: string): boolean {
        return id in this.databaseServer.getTables().globals.ItemPresets;
    }

    public hasPreset(templateId: string): boolean {
        return templateId in this.lookup;
    }

    public getPreset(id: string): IPreset {
        return this.jsonUtil.clone(this.databaseServer.getTables().globals.ItemPresets[id]);
    }

    public getPresets(templateId: string): IPreset[] {
        if (!this.hasPreset(templateId)) {
            return [];
        }

        const presets = [];
        const ids = this.lookup[templateId];

        for (const id of ids) {
            presets.push(this.getPreset(id));
        }

        return presets;
    }

    /**
     * Get the default preset for passed in weapon id
     * @param templateId Weapon id to get preset for
     * @returns Null if no default preset, otherwise IPreset
     */
    public getDefaultPreset(templateId: string): IPreset {
        if (!this.hasPreset(templateId)) {
            return null;
        }

        const allPresets = this.getPresets(templateId);

        for (const preset of allPresets) {
            if ("_encyclopedia" in preset) {
                return preset;
            }
        }

        return allPresets[0];
    }

    public getBaseItemTpl(presetId: string): string {
        if (this.isPreset(presetId)) {
            const preset = this.getPreset(presetId);

            for (const item of preset._items) {
                if (preset._parent === item._id) {
                    return item._tpl;
                }
            }
        }

        return "";
    }
}
