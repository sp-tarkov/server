import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { IPreset } from "@spt/models/eft/common/IGlobals";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { HashUtil } from "@spt/utils/HashUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairAssortGenerator {
    protected generatedAssortItems: IItem[][] = [];
    protected ragfairConfig: IRagfairConfig;

    protected ragfairItemInvalidBaseTypes: string[] = [
        BaseClasses.LOOT_CONTAINER, // Safe, barrel cache etc
        BaseClasses.STASH, // Player inventory stash
        BaseClasses.SORTING_TABLE,
        BaseClasses.INVENTORY,
        BaseClasses.STATIONARY_CONTAINER,
        BaseClasses.POCKETS,
        BaseClasses.BUILT_IN_INSERTS,
    ];

    constructor(
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Get an array of arrays that can be sold on the flea
     * Each sub array contains item + children (if any)
     * @returns array of arrays
     */
    public getAssortItems(): IItem[][] {
        if (!this.assortsAreGenerated()) {
            this.generatedAssortItems = this.generateRagfairAssortItems();
        }

        return this.generatedAssortItems;
    }

    /**
     * Check internal generatedAssortItems array has objects
     * @returns true if array has objects
     */
    protected assortsAreGenerated(): boolean {
        return this.generatedAssortItems.length > 0;
    }

    /**
     * Generate an array of arrays (item + children) the flea can sell
     * @returns array of arrays (item + children)
     */
    protected generateRagfairAssortItems(): IItem[][] {
        const results: IItem[][] = [];

        /** Get cloned items from db */
        const dbItemsClone = this.itemHelper.getItems().filter((item) => item._type !== "Node");

        /** Store processed preset tpls so we dont add them when procesing non-preset items */
        const processedArmorItems: string[] = [];
        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getInactiveSeasonalEventItems();

        const presets = this.getPresetsToAdd();
        for (const preset of presets) {
            // Update Ids and clone
            const presetAndMods: IItem[] = this.itemHelper.replaceIDs(preset._items);
            this.itemHelper.remapRootItemId(presetAndMods);

            // Add presets base item tpl to the processed list so its skipped later on when processing items
            processedArmorItems.push(preset._items[0]._tpl);

            presetAndMods[0].parentId = "hideout";
            presetAndMods[0].slotId = "hideout";
            presetAndMods[0].upd = { StackObjectsCount: 99999999, UnlimitedCount: true, sptPresetId: preset._id };

            results.push(presetAndMods);
        }

        for (const item of dbItemsClone) {
            if (!this.itemHelper.isValidItem(item._id, this.ragfairItemInvalidBaseTypes)) {
                continue;
            }

            // Skip seasonal items when not in-season
            if (
                this.ragfairConfig.dynamic.removeSeasonalItemsWhenNotInEvent &&
                !seasonalEventActive &&
                seasonalItemTplBlacklist.includes(item._id)
            ) {
                continue;
            }

            if (processedArmorItems.includes(item._id)) {
                // Already processed
                continue;
            }

            const ragfairAssort = this.createRagfairAssortRootItem(item._id, item._id); // tplid and id must be the same so hideout recipe rewards work

            results.push([ragfairAssort]);
        }

        return results;
    }

    /**
     * Get presets from globals to add to flea
     * ragfairConfig.dynamic.showDefaultPresetsOnly decides if its all presets or just defaults
     * @returns IPreset array
     */
    protected getPresetsToAdd(): IPreset[] {
        return this.ragfairConfig.dynamic.showDefaultPresetsOnly
            ? Object.values(this.presetHelper.getDefaultPresets())
            : this.presetHelper.getAllPresets();
    }

    /**
     * Create a base assort item and return it with populated values + 999999 stack count + unlimited count = true
     * @param tplId tplid to add to item
     * @param id id to add to item
     * @returns Hydrated Item object
     */
    protected createRagfairAssortRootItem(tplId: string, id = this.hashUtil.generate()): IItem {
        return {
            _id: id,
            _tpl: tplId,
            parentId: "hideout",
            slotId: "hideout",
            upd: { StackObjectsCount: 99999999, UnlimitedCount: true },
        };
    }
}
