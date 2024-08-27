import { QuestController } from "@spt/controllers/QuestController";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IInRaidConfig } from "@spt/models/spt/config/IInRaidConfig";
import { ILostOnDeathConfig } from "@spt/models/spt/config/ILostOnDeathConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";
import { ProfileHelper } from "./ProfileHelper";
import { QuestHelper } from "./QuestHelper";

@injectable()
export class InRaidHelper {
    protected lostOnDeathConfig: ILostOnDeathConfig;
    protected inRaidConfig: IInRaidConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("QuestController") protected questController: QuestController,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
    ) {
        this.lostOnDeathConfig = this.configServer.getConfig(ConfigTypes.LOST_ON_DEATH);
        this.inRaidConfig = this.configServer.getConfig(ConfigTypes.IN_RAID);
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
    public setInventory(
        sessionID: string,
        serverProfile: IPmcData,
        postRaidProfile: IPmcData,
        isSurvived: boolean,
    ): void {
        // Store insurance (as removeItem() removes insurance also)
        const insured = this.cloner.clone(serverProfile.InsuredItems);

        // Remove possible equipped items from before the raid
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.equipment, sessionID);
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.questRaidItems, sessionID);
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.sortingTable, sessionID);

        // Handle Removing of FIR status if did not survive.
        if (!isSurvived && !this.inRaidConfig.alwaysKeepFoundInRaidonRaidEnd) {
            this.removeSpawnedInSessionPropertyFromItems(postRaidProfile);
        }

        // Add the new items
        serverProfile.Inventory.items = [...postRaidProfile.Inventory.items, ...serverProfile.Inventory.items];
        serverProfile.Inventory.fastPanel = postRaidProfile.Inventory.fastPanel; // Quick access items bar
        serverProfile.InsuredItems = insured;
    }

    /**
     * Iterate over inventory items and remove the property that defines an item as Found in Raid
     * Only removes property if item had FiR when entering raid
     * @param postRaidProfile profile to update items for
     * @returns Updated profile with SpawnedInSession removed
     */
    public removeSpawnedInSessionPropertyFromItems(postRaidProfile: IPmcData): IPmcData {
        const dbItems = this.databaseService.getItems();
        const itemsToRemovePropertyFrom = postRaidProfile.Inventory.items.filter((item) => {
            // Has upd object + upd.SpawnedInSession property + not a quest item
            return (
                "upd" in item &&
                "SpawnedInSession" in item.upd &&
                !dbItems[item._tpl]._props.QuestItem &&
                !(
                    this.inRaidConfig.keepFiRSecureContainerOnDeath &&
                    this.itemHelper.itemIsInsideContainer(item, "SecuredContainer", postRaidProfile.Inventory.items)
                )
            );
        });

        for (const item of itemsToRemovePropertyFrom) {
            // biome-ignore lint/performance/noDelete: <explanation>
            delete item.upd.SpawnedInSession;
        }

        return postRaidProfile;
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
     * Deletes quest conditions from pickup tasks given a list of quest items being carried by a PMC.
     * @param carriedQuestItems Items carried by PMC at death, usually gotten from "CarriedQuestItems"
     * @param sessionId Current sessionId
     * @param pmcProfile Pre-raid profile that is being handled with raid information
     */
    public removePickupQuestConditions(carriedQuestItems: string[], sessionId: string, pmcProfile: IPmcData) {
        if (carriedQuestItems && this.lostOnDeathConfig.questItems) {
            const pmcQuests = this.questController.getClientQuests(sessionId);
            const pmcQuestIds = pmcQuests.map((a) => a._id);
            for (const item of carriedQuestItems) {
                const failedQuestId = this.questHelper.getFindItemConditionByQuestItem(item, pmcQuestIds, pmcQuests);
                this.profileHelper.removeQuestConditionFromProfile(pmcProfile, failedQuestId);
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
