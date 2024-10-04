import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairLinkedItemService {
    protected linkedItemsCache: Record<string, Set<string>> = {};

    constructor(
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PrimaryLogger") protected logger: ILogger,
    ) {}

    public getLinkedItems(linkedSearchId: string): Set<string> {
        if (Object.keys(this.linkedItemsCache).length === 0) {
            this.buildLinkedItemTable();
        }

        return this.linkedItemsCache[linkedSearchId];
    }

    /**
     * Use ragfair linked item service to get an array of items that can fit on or in designated itemtpl
     * @param itemTpl Item to get sub-items for
     * @returns ITemplateItem array
     */
    public getLinkedDbItems(itemTpl: string): ITemplateItem[] {
        const linkedItemsToWeaponTpls = this.getLinkedItems(itemTpl);
        return [...linkedItemsToWeaponTpls].reduce((result, linkedTpl) => {
            const itemDetails = this.itemHelper.getItem(linkedTpl);
            if (itemDetails[0]) {
                result.push(itemDetails[1]);
            } else {
                this.logger.warning(`Item ${itemTpl} has invalid linked item ${linkedTpl}`);
            }
            return result;
        }, []);
    }

    /**
     * Create Dictionary of every item and the items associated with it
     */
    protected buildLinkedItemTable(): void {
        const linkedItems: Record<string, any> = {};
        const getLinkedItems = (id: string) => {
            if (!(id in linkedItems)) {
                linkedItems[id] = new Set();
            }
            return linkedItems[id];
        };

        for (const item of Object.values(this.databaseService.getItems())) {
            const itemLinkedSet = getLinkedItems(item._id);

            // TODO - move into own protected function
            const applyLinkedItems = (items: string[]) => {
                for (const linkedItemId of items) {
                    itemLinkedSet.add(linkedItemId);
                    getLinkedItems(linkedItemId).add(item._id);
                }
            };

            applyLinkedItems(this.getFilters(item, "Slots"));
            applyLinkedItems(this.getFilters(item, "Chambers"));
            applyLinkedItems(this.getFilters(item, "Cartridges"));

            // Edge case, ensure ammo for revolves is included
            if (item._parent === BaseClasses.REVOLVER) {
                // Find magazine for revolver
                this.addRevolverCylinderAmmoToLinkedItems(item, applyLinkedItems);
            }
        }

        this.linkedItemsCache = linkedItems;
    }

    /**
     * Add ammo to revolvers linked item dictionary
     * @param cylinder Revolvers cylinder
     * @param applyLinkedItems
     */
    protected addRevolverCylinderAmmoToLinkedItems(
        cylinder: ITemplateItem,
        applyLinkedItems: (items: string[]) => void,
    ): void {
        const cylinderMod = cylinder._props.Slots?.find((x) => x._name === "mod_magazine");
        if (cylinderMod) {
            // Get the first cylinder filter tpl
            const cylinderTpl = cylinderMod._props.filters[0]?.Filter[0];
            if (cylinderTpl) {
                // Get db data for cylinder tpl, add found slots info (camora_xxx) to linked items on revolver weapon
                const cylinderItem = this.itemHelper.getItem(cylinderTpl)[1];
                applyLinkedItems(this.getFilters(cylinderItem, "Slots"));
            }
        }
    }

    /**
     * Scans a given slot type for filters and returns them as a Set
     * @param item
     * @param slot
     * @returns array of ids
     */
    protected getFilters(item: ITemplateItem, slot: string): string[] {
        if (!(slot in item._props && item._props[slot].length)) {
            // item slot doesnt exist
            return [];
        }

        const filters: string[] = [];
        for (const sub of item._props[slot]) {
            if (!("_props" in sub && "filters" in sub._props)) {
                // not a filter
                continue;
            }

            for (const filter of sub._props.filters) {
                for (const f of filter.Filter) {
                    filters.push(f);
                }
            }
        }

        return filters;
    }
}
