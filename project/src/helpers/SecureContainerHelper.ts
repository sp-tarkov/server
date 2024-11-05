import { ItemHelper } from "@spt/helpers/ItemHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { inject, injectable } from "tsyringe";

export interface IOwnerInventoryItems {
    from: IItem[];
    to: IItem[];
    sameInventory: boolean;
    isMail: boolean;
}

@injectable()
export class SecureContainerHelper {
    constructor(@inject("ItemHelper") protected itemHelper: ItemHelper) {}

    /**
     * Get an array of the item IDs (NOT tpls) inside a secure container
     * @param items Inventory items to look for secure container in
     * @returns Array of ids
     */
    public getSecureContainerItems(items: IItem[]): string[] {
        const secureContainer = items.find((x) => x.slotId === "SecuredContainer");

        // No container found, drop out
        if (!secureContainer) {
            return [];
        }

        const itemsInSecureContainer = this.itemHelper.findAndReturnChildrenByItems(items, secureContainer._id);

        // Return all items returned and exclude the secure container item itself
        return itemsInSecureContainer.filter((x) => x !== secureContainer._id);
    }
}
