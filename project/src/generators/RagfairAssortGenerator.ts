import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { IPreset } from "@spt-aki/models/eft/common/IGlobals";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SeasonalEventService } from "@spt-aki/services/SeasonalEventService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class RagfairAssortGenerator
{
    protected generatedAssortItems: Item[] = [];
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Get an array of unique items that can be sold on the flea
     * @returns array of unique items
     */
    public getAssortItems(): Item[]
    {
        if (!this.assortsAreGenerated())
        {
            this.generatedAssortItems = this.generateRagfairAssortItems();
        }

        return this.generatedAssortItems;
    }

    /**
     * Check internal generatedAssortItems array has objects
     * @returns true if array has objects
     */
    protected assortsAreGenerated(): boolean
    {
        return this.generatedAssortItems.length > 0;
    }

    /**
     * Generate an array of items the flea can sell
     * @returns array of unique items
     */
    protected generateRagfairAssortItems(): Item[]
    {
        const results: Item[] = [];
        const items = this.itemHelper.getItems().filter(item => item._type !== "Node");

        const presets = (this.ragfairConfig.dynamic.showDefaultPresetsOnly)
            ? Object.values(this.presetHelper.getDefaultPresets())
            : this.presetHelper.getAllPresets()

        const ragfairItemInvalidBaseTypes: string[] = [
            BaseClasses.LOOT_CONTAINER, // safe, barrel cache etc
            BaseClasses.STASH, // player inventory stash
            BaseClasses.SORTING_TABLE,
            BaseClasses.INVENTORY,
            BaseClasses.STATIONARY_CONTAINER,
            BaseClasses.POCKETS,
			BaseClasses.BUILT_IN_INSERTS,
            BaseClasses.ARMOR, // Handled by presets
            BaseClasses.VEST, // Handled by presets
            BaseClasses.HEADWEAR, // Handled by presets
        ];

        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getInactiveSeasonalEventItems();
        for (const item of items)
        {
            if (!this.itemHelper.isValidItem(item._id, ragfairItemInvalidBaseTypes))
            {
                continue;
            }

            if (
                this.ragfairConfig.dynamic.removeSeasonalItemsWhenNotInEvent && !seasonalEventActive
                && seasonalItemTplBlacklist.includes(item._id)
            )
            {
                continue;
            }

            results.push(this.createRagfairAssortItem(item._id, item._id)); // tplid and id must be the same so hideout recipe reworks work
        }

        for (const weapon of presets)
        {
            results.push(this.createRagfairAssortItem(weapon._items[0]._tpl, weapon._id)); // Preset id must be passed through to ensure flea shows presets
        }

        return results;
    }

    /**
     * Create a base assort item and return it with populated values + 999999 stack count + unlimited count = true
     * @param tplId tplid to add to item
     * @param id id to add to item
     * @returns hydrated Item object
     */
    protected createRagfairAssortItem(tplId: string, id = this.hashUtil.generate()): Item
    {
        return {
            _id: id,
            _tpl: tplId,
            parentId: "hideout",
            slotId: "hideout",
            upd: { StackObjectsCount: 99999999, UnlimitedCount: true },
        };
    }
}
