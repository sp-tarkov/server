import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ILostOnDeathConfig } from "@spt/models/spt/config/ILostOnDeathConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class InRaidHelper {
    protected lostOnDeathConfig: ILostOnDeathConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.lostOnDeathConfig = this.configServer.getConfig(ConfigTypes.LOST_ON_DEATH);
    }

    /**
     * @deprecated
     * Reset the skill points earned in a raid to 0, ready for next raid
     * @param profile Profile to update
     */
    protected resetSkillPointsEarnedDuringRaid(profile: IPmcData): void {
        for (const skill of profile.Skills.Common) {
            skill.PointsEarnedDuringSession = 0.0;
        }
    }

    /**
     * Update a players inventory post-raid
     * Remove equipped items from pre-raid
     * Add new items found in raid to profile
     * Store insurance items in profile
     * @param sessionID Session id
     * @param serverProfile Profile to update
     * @param postRaidProfile Profile returned by client after a raid
     */
    public setInventory(sessionID: string, serverProfile: IPmcData, postRaidProfile: IPmcData): void {
        // Store insurance (as removeItem() removes insurance also)
        const insured = this.cloner.clone(serverProfile.InsuredItems);

        // Remove possible equipped items from before the raid
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.equipment, sessionID);
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.questRaidItems, sessionID);
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.sortingTable, sessionID);

        // Add the new items
        serverProfile.Inventory.items = [...postRaidProfile.Inventory.items, ...serverProfile.Inventory.items];
        serverProfile.Inventory.fastPanel = postRaidProfile.Inventory.fastPanel; // Quick access items bar
        serverProfile.InsuredItems = insured;
    }

    /**
     * Clear PMC inventory of all items except those that are exempt
     * Used post-raid to remove items after death
     * @param pmcData Player profile
     * @param sessionId Session id
     */
    public deleteInventory(pmcData: IPmcData, sessionId: string): void {
        // Get inventory item ids to remove from players profile
        const itemIdsToDeleteFromProfile = this.getInventoryItemsLostOnDeath(pmcData).map((item) => item._id);
        for (const itemIdToDelete of itemIdsToDeleteFromProfile) {
            // Items inside containers are handled as part of function
            this.inventoryHelper.removeItem(pmcData, itemIdToDelete, sessionId);
        }

        // Remove contents of fast panel
        pmcData.Inventory.fastPanel = {};
    }

    /**
     * Remove FiR status from designated container
     * @param sessionId Session id
     * @param pmcData Player profile
     * @param secureContainerSlotId Container slot id to find items for and remove FiR from
     */
    public removeFiRStatusFromItemsInContainer(
        sessionId: string,
        pmcData: IPmcData,
        secureContainerSlotId: string,
    ): void {
        if (!pmcData.Inventory.items.some((item) => item.slotId === secureContainerSlotId)) {
            return;
        }

        const itemsInsideContainer = [];
        for (const inventoryItem of pmcData.Inventory.items.filter((item) => item.upd && item.slotId !== "hideout")) {
            if (this.itemHelper.itemIsInsideContainer(inventoryItem, secureContainerSlotId, pmcData.Inventory.items)) {
                itemsInsideContainer.push(inventoryItem);
            }
        }

        for (const item of itemsInsideContainer) {
            if (item.upd.SpawnedInSession) {
                item.upd.SpawnedInSession = false;
            }
        }
    }

    /**
     * Get an array of items from a profile that will be lost on death
     * @param pmcProfile Profile to get items from
     * @returns Array of items lost on death
     */
    protected getInventoryItemsLostOnDeath(pmcProfile: IPmcData): Item[] {
        const inventoryItems = pmcProfile.Inventory.items ?? [];
        const equipmentRootId = pmcProfile?.Inventory?.equipment;
        const questRaidItemContainerId = pmcProfile?.Inventory?.questRaidItems;

        return inventoryItems.filter((item) => {
            // Keep items flagged as kept after death
            if (this.isItemKeptAfterDeath(pmcProfile, item)) {
                return false;
            }

            // Remove normal items or quest raid items
            if (item.parentId === equipmentRootId || item.parentId === questRaidItemContainerId) {
                return true;
            }

            // Pocket items are lost on death
            if (item.slotId.startsWith("pocket")) {
                return true;
            }

            return false;
        });
    }

    /**
     * Does the provided items slotId mean its kept on the player after death
     * @pmcData Player profile
     * @itemToCheck Item to check should be kept
     * @returns true if item is kept after death
     */
    protected isItemKeptAfterDeath(pmcData: IPmcData, itemToCheck: Item): boolean {
        // Use pocket slotId's otherwise it deletes the root pocket item.
        const pocketSlots = ["pocket1", "pocket2", "pocket3", "pocket4"];

        // Base inventory items are always kept
        if (!itemToCheck.parentId) {
            return true;
        }

        // Is item equipped on player
        if (itemToCheck.parentId === pmcData.Inventory.equipment) {
            // Check slot id against config, true = delete, false = keep, undefined = delete
            const discard: boolean = this.lostOnDeathConfig.equipment[itemToCheck.slotId];
            if (typeof discard === "boolean" && discard === true) {
                // Lost on death
                return false;
            }

            return true;
        }

        // Should we keep items in pockets on death
        if (!this.lostOnDeathConfig.equipment.PocketItems && pocketSlots.includes(itemToCheck.slotId)) {
            return true;
        }

        // Is quest item + quest item not lost on death
        if (itemToCheck.parentId === pmcData.Inventory.questRaidItems && !this.lostOnDeathConfig.questItems) {
            return true;
        }

        // special slots are always kept after death
        if (itemToCheck.slotId?.includes("SpecialSlot") && this.lostOnDeathConfig.specialSlotItems) {
            return true;
        }

        // All other cases item is lost
        return false;
    }
}
