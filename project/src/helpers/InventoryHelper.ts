import { ContainerHelper } from "@spt/helpers/ContainerHelper";
import { DialogueHelper } from "@spt/helpers/DialogueHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PaymentHelper } from "@spt/helpers/PaymentHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { TraderAssortHelper } from "@spt/helpers/TraderAssortHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IInventory } from "@spt/models/eft/common/tables/IBotBase";
import { IItem, IItemLocation, IUpd } from "@spt/models/eft/common/tables/IItem";
import { IAddItemDirectRequest } from "@spt/models/eft/inventory/IAddItemDirectRequest";
import { IAddItemsDirectRequest } from "@spt/models/eft/inventory/IAddItemsDirectRequest";
import { IInventoryMergeRequestData } from "@spt/models/eft/inventory/IInventoryMergeRequestData";
import { IInventoryMoveRequestData } from "@spt/models/eft/inventory/IInventoryMoveRequestData";
import { IInventoryRemoveRequestData } from "@spt/models/eft/inventory/IInventoryRemoveRequestData";
import { IInventorySplitRequestData } from "@spt/models/eft/inventory/IInventorySplitRequestData";
import { IInventoryTransferRequestData } from "@spt/models/eft/inventory/IInventoryTransferRequestData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { BackendErrorCodes } from "@spt/models/enums/BackendErrorCodes";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { BonusType } from "@spt/models/enums/BonusType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IInventoryConfig, IRewardDetails } from "@spt/models/spt/config/IInventoryConfig";
import { IOwnerInventoryItems } from "@spt/models/spt/inventory/IOwnerInventoryItems";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { FenceService } from "@spt/services/FenceService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class InventoryHelper {
    protected inventoryConfig: IInventoryConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("TraderAssortHelper") protected traderAssortHelper: TraderAssortHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ContainerHelper") protected containerHelper: ContainerHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.inventoryConfig = this.configServer.getConfig(ConfigTypes.INVENTORY);
    }

    /**
     * Add multiple items to player stash (assuming they all fit)
     * @param sessionId Session id
     * @param request IAddItemsDirectRequest request
     * @param pmcData Player profile
     * @param output Client response object
     */
    public addItemsToStash(
        sessionId: string,
        request: IAddItemsDirectRequest,
        pmcData: IPmcData,
        output: IItemEventRouterResponse,
    ): void {
        // Check all items fit into inventory before adding
        if (!this.canPlaceItemsInInventory(sessionId, request.itemsWithModsToAdd)) {
            // No space, exit
            this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText("inventory-no_stash_space"),
                BackendErrorCodes.NOTENOUGHSPACE,
            );

            return;
        }

        for (const itemToAdd of request.itemsWithModsToAdd) {
            const addItemRequest: IAddItemDirectRequest = {
                itemWithModsToAdd: itemToAdd,
                foundInRaid: request.foundInRaid,
                useSortingTable: request.useSortingTable,
                callback: request.callback,
            };

            // Add to player inventory
            this.addItemToStash(sessionId, addItemRequest, pmcData, output);
            if (output.warnings.length > 0) {
                return;
            }
        }
    }

    /**
     * Add whatever is passed in `request.itemWithModsToAdd` into player inventory (if it fits)
     * @param sessionId Session id
     * @param request addItemDirect request
     * @param pmcData Player profile
     * @param output Client response object
     */
    public addItemToStash(
        sessionId: string,
        request: IAddItemDirectRequest,
        pmcData: IPmcData,
        output: IItemEventRouterResponse,
    ): void {
        const itemWithModsToAddClone = this.cloner.clone(request.itemWithModsToAdd);

        // Get stash layouts ready for use
        const stashFS2D = this.getStashSlotMap(pmcData, sessionId);
        if (!stashFS2D) {
            this.logger.error(`Unable to get stash map for players: ${sessionId} stash`);

            return;
        }
        const sortingTableFS2D = this.getSortingTableSlotMap(pmcData);

        // Find empty slot in stash for item being added - adds 'location' + parentid + slotId properties to root item
        this.placeItemInInventory(
            stashFS2D,
            sortingTableFS2D,
            itemWithModsToAddClone,
            pmcData.Inventory,
            request.useSortingTable,
            output,
        );
        if (output.warnings.length > 0) {
            // Failed to place, error out
            return;
        }

        // Apply/remove FiR to item + mods
        this.setFindInRaidStatusForItem(itemWithModsToAddClone, request.foundInRaid);

        // Remove trader properties from root item
        this.removeTraderRagfairRelatedUpdProperties(itemWithModsToAddClone[0].upd);

        // Run callback
        try {
            if (typeof request.callback === "function") {
                request.callback(itemWithModsToAddClone[0].upd.StackObjectsCount);
            }
        } catch (err) {
            // Callback failed
            const message: string =
                typeof err?.message === "string" ? err.message : this.localisationService.getText("http-unknown_error");

            this.httpResponse.appendErrorToOutput(output, message);

            return;
        }

        // Add item + mods to output and profile inventory
        output.profileChanges[sessionId].items.new.push(...itemWithModsToAddClone);
        pmcData.Inventory.items.push(...itemWithModsToAddClone);

        this.logger.debug(
            `Added ${itemWithModsToAddClone[0].upd?.StackObjectsCount ?? 1} item: ${itemWithModsToAddClone[0]._tpl
            } with: ${itemWithModsToAddClone.length - 1} mods to inventory`,
        );
    }

    /**
     * Set FiR status for an item + its children
     * @param itemWithChildren An item
     * @param foundInRaid Item was found in raid
     */
    protected setFindInRaidStatusForItem(itemWithChildren: IItem[], foundInRaid: boolean): void {
        for (const item of itemWithChildren) {
            // Ensure item has upd object
            this.itemHelper.addUpdObjectToItem(item);

            if (!item.upd) {
                item.upd = {};
            }

            if (foundInRaid) {
                item.upd.SpawnedInSession = foundInRaid;
            } else {
                item.upd.SpawnedInSession = false;
            }
        }
    }

    /**
     * Remove properties from a Upd object used by a trader/ragfair that are unnecessary to a player
     * @param upd Object to update
     */
    protected removeTraderRagfairRelatedUpdProperties(upd: IUpd): void {
        if (upd.UnlimitedCount !== undefined) {
            // biome-ignore lint/performance/noDelete: Delete is fine here since we're attempting to remove this fully here.
            delete upd.UnlimitedCount;
        }

        if (upd.BuyRestrictionCurrent !== undefined) {
            // biome-ignore lint/performance/noDelete: Delete is fine here since we're attempting to remove this fully here.
            delete upd.BuyRestrictionCurrent;
        }

        if (upd.BuyRestrictionMax !== undefined) {
            // biome-ignore lint/performance/noDelete: Delete is fine here since we're attempting to remove this fully here.
            delete upd.BuyRestrictionMax;
        }
    }

    /**
     * Can all provided items be added into player inventory
     * @param sessionId Player id
     * @param itemsWithChildren array of items with children to try and fit
     * @returns True all items fit
     */
    public canPlaceItemsInInventory(sessionId: string, itemsWithChildren: IItem[][]): boolean {
        const pmcData = this.profileHelper.getPmcProfile(sessionId);

        const stashFS2D = this.cloner.clone(this.getStashSlotMap(pmcData, sessionId));
        if (!stashFS2D) {
            this.logger.error(`Unable to get stash map for players: ${sessionId} stash`);

            return false;
        }
        for (const itemWithChildren of itemsWithChildren) {
            if (!this.canPlaceItemInContainer(stashFS2D, itemWithChildren)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Do the provided items all fit into the grid
     * @param containerFS2D Container grid to fit items into
     * @param itemsWithChildren items to try and fit into grid
     * @returns True all fit
     */
    public canPlaceItemsInContainer(containerFS2D: number[][], itemsWithChildren: IItem[][]): boolean {
        for (const itemWithChildren of itemsWithChildren) {
            if (!this.canPlaceItemInContainer(containerFS2D, itemWithChildren)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Does an item fit into a container grid
     * @param containerFS2D Container grid
     * @param itemWithChildren item to check fits
     * @returns True it fits
     */
    public canPlaceItemInContainer(containerFS2D: number[][], itemWithChildren: IItem[]): boolean {
        // Get x/y size of item
        const rootItem = itemWithChildren[0];
        const itemSize = this.getItemSize(rootItem._tpl, rootItem._id, itemWithChildren);

        // Look for a place to slot item into
        const findSlotResult = this.containerHelper.findSlotForItem(containerFS2D, itemSize[0], itemSize[1]);
        if (findSlotResult.success) {
            try {
                this.containerHelper.fillContainerMapWithItem(
                    containerFS2D,
                    findSlotResult.x,
                    findSlotResult.y,
                    itemSize[0],
                    itemSize[1],
                    findSlotResult.rotation,
                );
            } catch (err) {
                const errorText: string = typeof err === "string" ? ` -> ${err}` : err.message;
                this.logger.error(
                    this.localisationService.getText("inventory-unable_to_fit_item_into_inventory", errorText),
                );

                return false;
            }

            // Success! exit
            return true;
        }

        return false;
    }

    /**
     * Find a free location inside a container to fit the item
     * @param containerFS2D Container grid to add item to
     * @param itemWithChildren Item to add to grid
     * @param containerId Id of the container we're fitting item into
     * @param desiredSlotId slot id value to use, default is "hideout"
     */
    public placeItemInContainer(
        containerFS2D: number[][],
        itemWithChildren: IItem[],
        containerId: string,
        desiredSlotId = "hideout",
    ): void {
        // Get x/y size of item
        const rootItemAdded = itemWithChildren[0];
        const itemSize = this.getItemSize(rootItemAdded._tpl, rootItemAdded._id, itemWithChildren);

        // Look for a place to slot item into
        const findSlotResult = this.containerHelper.findSlotForItem(containerFS2D, itemSize[0], itemSize[1]);
        if (findSlotResult.success) {
            try {
                this.containerHelper.fillContainerMapWithItem(
                    containerFS2D,
                    findSlotResult.x,
                    findSlotResult.y,
                    itemSize[0],
                    itemSize[1],
                    findSlotResult.rotation,
                );
            } catch (err) {
                const errorText: string = typeof err === "string" ? ` -> ${err}` : err.message;
                this.logger.error(this.localisationService.getText("inventory-fill_container_failed", errorText));

                return;
            }
            // Store details for object, incuding container item will be placed in
            rootItemAdded.parentId = containerId;
            rootItemAdded.slotId = desiredSlotId;
            rootItemAdded.location = {
                x: findSlotResult.x,
                y: findSlotResult.y,
                r: findSlotResult.rotation ? 1 : 0,
                rotation: findSlotResult.rotation,
            };

            // Success! exit
            return;
        }
    }

    /**
     * Find a location to place an item into inventory and place it
     * @param stashFS2D 2-dimensional representation of the container slots
     * @param sortingTableFS2D 2-dimensional representation of the sorting table slots
     * @param itemWithChildren Item to place with children
     * @param playerInventory Players inventory
     * @param useSortingTable Should sorting table to be used if main stash has no space
     * @param output output to send back to client
     */
    protected placeItemInInventory(
        stashFS2D: number[][],
        sortingTableFS2D: number[][],
        itemWithChildren: IItem[],
        playerInventory: IInventory,
        useSortingTable: boolean,
        output: IItemEventRouterResponse,
    ): void {
        // Get x/y size of item
        const rootItem = itemWithChildren[0];
        const itemSize = this.getItemSize(rootItem._tpl, rootItem._id, itemWithChildren);

        // Look for a place to slot item into
        const findSlotResult = this.containerHelper.findSlotForItem(stashFS2D, itemSize[0], itemSize[1]);
        if (findSlotResult.success) {
            try {
                this.containerHelper.fillContainerMapWithItem(
                    stashFS2D,
                    findSlotResult.x,
                    findSlotResult.y,
                    itemSize[0],
                    itemSize[1],
                    findSlotResult.rotation,
                );
            } catch (err) {
                handleContainerPlacementError(err, output);

                return;
            }
            // Store details for object, incuding container item will be placed in
            rootItem.parentId = playerInventory.stash;
            rootItem.slotId = "hideout";
            rootItem.location = {
                x: findSlotResult.x,
                y: findSlotResult.y,
                r: findSlotResult.rotation ? 1 : 0,
                rotation: findSlotResult.rotation,
            };

            // Success! exit
            return;
        }

        // Space not found in main stash, use sorting table
        if (useSortingTable) {
            const findSortingSlotResult = this.containerHelper.findSlotForItem(
                sortingTableFS2D,
                itemSize[0],
                itemSize[1],
            );

            try {
                this.containerHelper.fillContainerMapWithItem(
                    sortingTableFS2D,
                    findSortingSlotResult.x,
                    findSortingSlotResult.y,
                    itemSize[0],
                    itemSize[1],
                    findSortingSlotResult.rotation,
                );
            } catch (err) {
                handleContainerPlacementError(err, output);

                return;
            }

            // Store details for object, incuding container item will be placed in
            itemWithChildren[0].parentId = playerInventory.sortingTable;
            itemWithChildren[0].location = {
                x: findSortingSlotResult.x,
                y: findSortingSlotResult.y,
                r: findSortingSlotResult.rotation ? 1 : 0,
                rotation: findSortingSlotResult.rotation,
            };
        } else {
            this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText("inventory-no_stash_space"),
                BackendErrorCodes.NOTENOUGHSPACE,
            );

            return;
        }

        function handleContainerPlacementError(err: any, output: IItemEventRouterResponse): void {
            const errorText = typeof err === "string" ? ` -> ${err}` : err.message;
            this.logger.error(this.localisationService.getText("inventory-fill_container_failed", errorText));

            this.httpResponse.appendErrorToOutput(output, this.localisationService.getText("inventory-no_stash_space"));
        }
    }

    /**
     * Handle Remove event
     * Remove item from player inventory + insured items array
     * Also deletes child items
     * @param profile Profile to remove item from (pmc or scav)
     * @param itemId Items id to remove
     * @param sessionID Session id
     * @param output OPTIONAL - IItemEventRouterResponse
     */
    public removeItem(profile: IPmcData, itemId: string, sessionID: string, output?: IItemEventRouterResponse): void {
        if (!itemId) {
            this.logger.warning(this.localisationService.getText("inventory-unable_to_remove_item_no_id_given"));

            return;
        }

        // Get children of item, they get deleted too
        const itemAndChildrenToRemove = this.itemHelper.findAndReturnChildrenAsItems(profile.Inventory.items, itemId);
        if (itemAndChildrenToRemove.length === 0) {
            this.logger.debug(
                this.localisationService.getText("inventory-unable_to_remove_item_id_not_found", {
                    childId: itemId,
                    profileId: profile._id,
                }),
            );

            return;
        }
        const inventoryItems = profile.Inventory.items;
        const insuredItems = profile.InsuredItems;

        // We have output object, inform client of root item deletion, not children
        if (output) {
            output.profileChanges[sessionID].items.del.push({ _id: itemId });
        }

        for (const item of itemAndChildrenToRemove) {
            // We expect that each inventory item and each insured item has unique "_id", respective "itemId".
            // Therefore we want to use a NON-Greedy function and escape the iteration as soon as we find requested item.
            const inventoryIndex = inventoryItems.findIndex((inventoryItem) => inventoryItem._id === item._id);
            if (inventoryIndex !== -1) {
                inventoryItems.splice(inventoryIndex, 1);
            } else {
                this.logger.warning(
                    this.localisationService.getText("inventory-unable_to_remove_item_id_not_found", {
                        childId: item._id,
                        profileId: profile._id,
                    }),
                );
            }

            const insuredItemIndex = insuredItems.findIndex((insuredItem) => insuredItem.itemId === item._id);
            if (insuredItemIndex !== -1) {
                insuredItems.splice(insuredItemIndex, 1);
            }
        }
    }

    /**
     * Delete desired item from a player profiles mail
     * @param sessionId Session id
     * @param removeRequest Remove request
     * @param output OPTIONAL - IItemEventRouterResponse
     */
    public removeItemAndChildrenFromMailRewards(
        sessionId: string,
        removeRequest: IInventoryRemoveRequestData,
        output?: IItemEventRouterResponse,
    ): void {
        const fullProfile = this.profileHelper.getFullProfile(sessionId);

        // Iterate over all dialogs and look for mesasage with key from request, that has item (and maybe its children) we want to remove
        const dialogs = Object.values(fullProfile.dialogues);
        for (const dialog of dialogs) {
            const messageWithReward = dialog.messages.find((message) => message._id === removeRequest.fromOwner.id);
            if (messageWithReward) {
                // Find item + any possible children and remove them from mails items array
                const itemWithChildern = this.itemHelper.findAndReturnChildrenAsItems(
                    messageWithReward.items.data,
                    removeRequest.item,
                );
                for (const itemToDelete of itemWithChildern) {
                    // Get index of item to remove from reward array + remove it
                    const indexOfItemToRemove = messageWithReward.items.data.indexOf(itemToDelete);
                    if (indexOfItemToRemove === -1) {
                        this.logger.error(
                            this.localisationService.getText("inventory-unable_to_remove_item_restart_immediately", {
                                item: removeRequest.item,
                                mailId: removeRequest.fromOwner.id,
                            }),
                        );

                        continue;
                    }
                    messageWithReward.items.data.splice(indexOfItemToRemove, 1);
                }

                // Flag message as having no rewards if all removed
                const hasRewardItemsRemaining = messageWithReward?.items.data?.length > 0;
                messageWithReward.hasRewards = hasRewardItemsRemaining;
                messageWithReward.rewardCollected = !hasRewardItemsRemaining;
            }
        }
    }

    /**
     * Find item by id in player inventory and remove x of its count
     * @param pmcData player profile
     * @param itemId Item id to decrement StackObjectsCount of
     * @param countToRemove Number of item to remove
     * @param sessionID Session id
     * @param output IItemEventRouterResponse
     * @returns IItemEventRouterResponse
     */
    public removeItemByCount(
        pmcData: IPmcData,
        itemId: string,
        countToRemove: number,
        sessionID: string,
        output?: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        if (!itemId) {
            return output;
        }

        // Goal is to keep removing items until we can remove part of an items stack
        const itemsToReduce = this.itemHelper.findAndReturnChildrenAsItems(pmcData.Inventory.items, itemId);
        let remainingCount = countToRemove;
        for (const itemToReduce of itemsToReduce) {
            const itemStackSize = this.itemHelper.getItemStackSize(itemToReduce);

            // Remove whole stack
            if (remainingCount >= itemStackSize) {
                remainingCount -= itemStackSize;
                this.removeItem(pmcData, itemToReduce._id, sessionID, output);
            } else {
                itemToReduce.upd.StackObjectsCount -= remainingCount;
                remainingCount = 0;
                if (output) {
                    output.profileChanges[sessionID].items.change.push(itemToReduce);
                }
            }

            if (remainingCount === 0) {
                // Desired count of item has been removed / we ran out of items to remove
                break;
            }
        }

        return output;
    }

    /**
     * Get the height and width of an item - can have children that alter size
     * @param itemTpl Item to get size of
     * @param itemID Items id to get size of
     * @param inventoryItems
     * @returns [width, height]
     */
    public getItemSize(itemTpl: string, itemID: string, inventoryItems: IItem[]): number[] {
        // -> Prepares item Width and height returns [sizeX, sizeY]
        return this.getSizeByInventoryItemHash(itemTpl, itemID, this.getInventoryItemHash(inventoryItems));
    }

    /**
     * Calculates the size of an item including attachements
     * takes into account if item is folded
     * @param itemTpl Items template id
     * @param itemID Items id
     * @param inventoryItemHash Hashmap of inventory items
     * @returns An array representing the [width, height] of the item
     */
    protected getSizeByInventoryItemHash(
        itemTpl: string,
        itemID: string,
        inventoryItemHash: InventoryHelper.InventoryItemHash,
    ): number[] {
        const toDo = [itemID];
        const result = this.itemHelper.getItem(itemTpl);
        const tmpItem = result[1];

        // Invalid item or no object
        if (!(result[0] && result[1])) {
            this.logger.error(this.localisationService.getText("inventory-invalid_item_missing_from_db", itemTpl));
        }

        // Item found but no _props property
        if (tmpItem && !tmpItem._props) {
            this.localisationService.getText("inventory-item_missing_props_property", {
                itemTpl: itemTpl,
                itemName: tmpItem?._name,
            });
        }

        // No item object or getItem() returned false
        if (!(tmpItem && result[0])) {
            // return default size of 1x1
            this.logger.error(this.localisationService.getText("inventory-return_default_size", itemTpl));

            return [1, 1]; // Invalid input data, return defaults
        }

        const rootItem = inventoryItemHash.byItemId[itemID];
        const foldableWeapon = tmpItem._props.Foldable;
        const foldedSlot = tmpItem._props.FoldedSlot;

        let sizeUp = 0;
        let sizeDown = 0;
        let sizeLeft = 0;
        let sizeRight = 0;

        let forcedUp = 0;
        let forcedDown = 0;
        let forcedLeft = 0;
        let forcedRight = 0;
        let outX = tmpItem._props.Width;
        const outY = tmpItem._props.Height;

        // Item types to ignore
        const skipThisItems: string[] = [
            BaseClasses.BACKPACK,
            BaseClasses.SEARCHABLE_ITEM,
            BaseClasses.SIMPLE_CONTAINER,
        ];
        const rootFolded = rootItem.upd?.Foldable && rootItem.upd.Foldable.Folded === true;

        // The item itself is collapsible
        if (foldableWeapon && (foldedSlot === undefined || foldedSlot === "") && rootFolded) {
            outX -= tmpItem._props.SizeReduceRight;
        }

        // Calculate size contribution from child items/attachments
        if (!skipThisItems.includes(tmpItem._parent)) {
            while (toDo.length > 0) {
                if (toDo[0] in inventoryItemHash.byParentId) {
                    for (const item of inventoryItemHash.byParentId[toDo[0]]) {
                        // Filtering child items outside of mod slots, such as those inside containers, without counting their ExtraSize attribute
                        if (item.slotId.indexOf("mod_") < 0) {
                            continue;
                        }

                        toDo.push(item._id);

                        // If the barrel is folded the space in the barrel is not counted
                        const itemResult = this.itemHelper.getItem(item._tpl);
                        if (!itemResult[0]) {
                            this.logger.error(
                                this.localisationService.getText(
                                    "inventory-get_item_size_item_not_found_by_tpl",
                                    item._tpl,
                                ),
                            );
                        }

                        const itm = itemResult[1];
                        const childFoldable = itm._props.Foldable;
                        const childFolded = item.upd?.Foldable && item.upd.Foldable.Folded === true;

                        if (foldableWeapon && foldedSlot === item.slotId && (rootFolded || childFolded)) {
                            continue;
                        }

                        if (childFoldable && rootFolded && childFolded) {
                            continue;
                        }

                        // Calculating child ExtraSize
                        if (itm._props.ExtraSizeForceAdd === true) {
                            forcedUp += itm._props.ExtraSizeUp;
                            forcedDown += itm._props.ExtraSizeDown;
                            forcedLeft += itm._props.ExtraSizeLeft;
                            forcedRight += itm._props.ExtraSizeRight;
                        } else {
                            sizeUp = sizeUp < itm._props.ExtraSizeUp ? itm._props.ExtraSizeUp : sizeUp;
                            sizeDown = sizeDown < itm._props.ExtraSizeDown ? itm._props.ExtraSizeDown : sizeDown;
                            sizeLeft = sizeLeft < itm._props.ExtraSizeLeft ? itm._props.ExtraSizeLeft : sizeLeft;
                            sizeRight = sizeRight < itm._props.ExtraSizeRight ? itm._props.ExtraSizeRight : sizeRight;
                        }
                    }
                }

                toDo.splice(0, 1);
            }
        }

        return [
            outX + sizeLeft + sizeRight + forcedLeft + forcedRight,
            outY + sizeUp + sizeDown + forcedUp + forcedDown,
        ];
    }

    /**
     * Get a blank two-dimentional representation of a container
     * @param containerH Horizontal size of container
     * @param containerY Vertical size of container
     * @returns Two-dimensional representation of container
     */
    protected getBlankContainerMap(containerH: number, containerY: number): number[][] {
        return Array(containerY)
            .fill(0)
            .map(() => Array(containerH).fill(0));
    }

    /**
     * Get a 2d mapping of a container with what grid slots are filled
     * @param containerH Horizontal size of container
     * @param containerV Vertical size of container
     * @param itemList Players inventory items
     * @param containerId Id of the container
     * @returns Two-dimensional representation of container
     */
    public getContainerMap(containerH: number, containerV: number, itemList: IItem[], containerId: string): number[][] {
        // Create blank 2d map of container
        const container2D = this.getBlankContainerMap(containerH, containerV);

        // Get all items in players inventory keyed by their parentId and by ItemId
        const inventoryItemHash = this.getInventoryItemHash(itemList);

        // Get subset of items that belong to the desired container
        const containerItemHash = inventoryItemHash.byParentId[containerId];

        if (!containerItemHash) {
            // No items in container, exit early
            return container2D;
        }

        // Check each item in container
        for (const item of containerItemHash) {
            const itemLocation = item?.location as IItemLocation;
            if (!itemLocation) {
                // item has no location property
                this.logger.error(`Unable to find 'location' property on item with id: ${item._id}, skipping`);

                continue;
            }

            // Get x/y size of item
            const tmpSize = this.getSizeByInventoryItemHash(item._tpl, item._id, inventoryItemHash);
            const iW = tmpSize[0]; // x
            const iH = tmpSize[1]; // y
            const fH = this.isVertical(itemLocation) ? iW : iH;
            const fW = this.isVertical(itemLocation) ? iH : iW;

            // Find the ending x coord of container
            const fillTo = itemLocation.x + fW;

            for (let y = 0; y < fH; y++) {
                try {
                    const containerRow = container2D[itemLocation.y + y];
                    if (!containerRow) {
                        this.logger.error(`Unable to find container: ${containerId} row line: ${itemLocation.y + y}`);
                    }
                    // Fill the corresponding cells in the container map to show the slot is taken
                    containerRow.fill(1, itemLocation.x, fillTo);
                } catch (e) {
                    this.logger.error(
                        this.localisationService.getText("inventory-unable_to_fill_container", {
                            id: item._id,
                            error: e,
                        }),
                    );
                }
            }
        }

        return container2D;
    }

    protected isVertical(itemLocation: IItemLocation): boolean {
        return itemLocation.r === 1 || itemLocation.r === "Vertical" || itemLocation.rotation === "Vertical";
    }

    protected getInventoryItemHash(inventoryItem: IItem[]): InventoryHelper.InventoryItemHash {
        const inventoryItemHash: InventoryHelper.InventoryItemHash = { byItemId: {}, byParentId: {} };
        for (const item of inventoryItem) {
            inventoryItemHash.byItemId[item._id] = item;

            if (!("parentId" in item)) {
                continue;
            }

            if (!(item.parentId in inventoryItemHash.byParentId)) {
                inventoryItemHash.byParentId[item.parentId] = [];
            }
            inventoryItemHash.byParentId[item.parentId].push(item);
        }
        return inventoryItemHash;
    }

    /**
     * Return the inventory that needs to be modified (scav/pmc etc)
     * Changes made to result apply to character inventory
     * Based on the item action, determine whose inventories we should be looking at for from and to.
     * @param request Item interaction request
     * @param sessionId Session id / playerid
     * @returns OwnerInventoryItems with inventory of player/scav to adjust
     */
    public getOwnerInventoryItems(
        request:
            | IInventoryMoveRequestData
            | IInventorySplitRequestData
            | IInventoryMergeRequestData
            | IInventoryTransferRequestData,
        sessionId: string,
    ): IOwnerInventoryItems {
        const pmcItems = this.profileHelper.getPmcProfile(sessionId).Inventory.items;
        const scavProfile = this.profileHelper.getScavProfile(sessionId);
        let fromInventoryItems = pmcItems;
        let fromType = "pmc";

        if (request.fromOwner) {
            if (request.fromOwner.id === scavProfile._id) {
                fromInventoryItems = scavProfile.Inventory.items;
                fromType = "scav";
            } else if (request.fromOwner.type.toLocaleLowerCase() === "mail") {
                // Split requests dont use 'use' but 'splitItem' property
                const item = "splitItem" in request ? request.splitItem : request.item;
                fromInventoryItems = this.dialogueHelper.getMessageItemContents(request.fromOwner.id, sessionId, item);
                fromType = "mail";
            }
        }

        // Don't need to worry about mail for destination because client doesn't allow
        // users to move items back into the mail stash.
        let toInventoryItems = pmcItems;
        let toType = "pmc";

        // Destination is scav inventory, update values
        if (request.toOwner?.id === scavProfile._id) {
            toInventoryItems = scavProfile.Inventory.items;
            toType = "scav";
        }

        // From and To types match, same inventory
        const movingToSameInventory = fromType === toType;

        return {
            from: fromInventoryItems,
            to: toInventoryItems,
            sameInventory: movingToSameInventory,
            isMail: fromType === "mail",
        };
    }

    /**
     * Get a two dimensional array to represent stash slots
     * 0 value = free, 1 = taken
     * @param pmcData Player profile
     * @param sessionID session id
     * @returns 2-dimensional array
     */
    protected getStashSlotMap(pmcData: IPmcData, sessionID: string): number[][] {
        const playerStashSize = this.getPlayerStashSize(sessionID);
        return this.getContainerMap(
            playerStashSize[0],
            playerStashSize[1],
            pmcData.Inventory.items,
            pmcData.Inventory.stash,
        );
    }

    /**
     * Get a blank two-dimensional array representation of a container
     * @param containerTpl Container to get data for
     * @returns blank two-dimensional array
     */
    public getContainerSlotMap(containerTpl: string): number[][] {
        const containerTemplate = this.itemHelper.getItem(containerTpl)[1];

        const containerH = containerTemplate._props.Grids[0]._props.cellsH;
        const containerV = containerTemplate._props.Grids[0]._props.cellsV;

        return this.getBlankContainerMap(containerH, containerV);
    }

    /**
     * Get a two-dimensional array representation of the players sorting table
     * @param pmcData Player profile
     * @returns two-dimensional array
     */
    protected getSortingTableSlotMap(pmcData: IPmcData): number[][] {
        return this.getContainerMap(10, 45, pmcData.Inventory.items, pmcData.Inventory.sortingTable);
    }

    /**
     * Get Players Stash Size
     * @param sessionID Players id
     * @returns Array of 2 values, horizontal and vertical stash size
     */
    protected getPlayerStashSize(sessionID: string): Record<number, number> {
        const profile = this.profileHelper.getPmcProfile(sessionID);
        const stashRowBonus = profile.Bonuses.find((bonus) => bonus.type === BonusType.STASH_ROWS);

        // this sets automatically a stash size from items.json (its not added anywhere yet cause we still use base stash)
        const stashTPL = this.getStashType(sessionID);
        if (!stashTPL) {
            this.logger.error(this.localisationService.getText("inventory-missing_stash_size"));
        }

        const stashItemResult = this.itemHelper.getItem(stashTPL);
        if (!stashItemResult[0]) {
            this.logger.error(this.localisationService.getText("inventory-stash_not_found", stashTPL));

            return;
        }

        const stashItemDetails = stashItemResult[1];
        const firstStashItemGrid = stashItemDetails._props.Grids[0];

        const stashH = firstStashItemGrid._props.cellsH !== 0 ? firstStashItemGrid._props.cellsH : 10;
        let stashV = firstStashItemGrid._props.cellsV !== 0 ? firstStashItemGrid._props.cellsV : 66;

        // Player has a bonus, apply to vertical size
        if (stashRowBonus) {
            stashV += stashRowBonus.value;
        }

        return [stashH, stashV];
    }

    /**
     * Get the players stash items tpl
     * @param sessionID Player id
     * @returns Stash tpl
     */
    protected getStashType(sessionID: string): string {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const stashObj = pmcData.Inventory.items.find((item) => item._id === pmcData.Inventory.stash);
        if (!stashObj) {
            this.logger.error(this.localisationService.getText("inventory-unable_to_find_stash"));
        }

        return stashObj?._tpl;
    }

    /**
     * Internal helper function to transfer an item + children from one profile to another.
     * @param sourceItems Inventory of the source (can be non-player)
     * @param toItems Inventory of the destination
     * @param request Move request
     */
    public moveItemToProfile(sourceItems: IItem[], toItems: IItem[], request: IInventoryMoveRequestData): void {
        this.handleCartridges(sourceItems, request);

        // Get all children item has, they need to move with item
        const idsToMove = this.itemHelper.findAndReturnChildrenByItems(sourceItems, request.item);
        for (const itemId of idsToMove) {
            const itemToMove = sourceItems.find((item) => item._id === itemId);
            if (!itemToMove) {
                this.logger.error(this.localisationService.getText("inventory-unable_to_find_item_to_move", itemId));
                continue;
            }

            // Only adjust the values for parent item, not children (their values are already correctly tied to parent)
            if (itemId === request.item) {
                itemToMove.parentId = request.to.id;
                itemToMove.slotId = request.to.container;

                if (request.to.location) {
                    // Update location object
                    itemToMove.location = request.to.location;
                } else {
                    // No location in request, delete it
                    if (itemToMove.location) {
                        // biome-ignore lint/performance/noDelete: Delete is fine here as we're trying to remove the entire data property.
                        delete itemToMove.location;
                    }
                }
            }

            toItems.push(itemToMove);
            sourceItems.splice(sourceItems.indexOf(itemToMove), 1);
        }
    }

    /**
     * Internal helper function to move item within the same profile_f.
     * @param pmcData profile to edit
     * @param inventoryItems
     * @param moveRequest client move request
     * @returns True if move was successful
     */
    public moveItemInternal(
        pmcData: IPmcData,
        inventoryItems: IItem[],
        moveRequest: IInventoryMoveRequestData,
    ): { success: boolean; errorMessage?: string } {
        this.handleCartridges(inventoryItems, moveRequest);

        // Find item we want to 'move'
        const matchingInventoryItem = inventoryItems.find((item) => item._id === moveRequest.item);
        if (!matchingInventoryItem) {
            const errorMesage = `Unable to move item: ${moveRequest.item}, cannot find in inventory`;
            this.logger.error(errorMesage);

            return { success: false, errorMessage: errorMesage };
        }

        this.logger.debug(
            `${moveRequest.Action} item: ${moveRequest.item} from slotid: ${matchingInventoryItem.slotId} to container: ${moveRequest.to.container}`,
        );

        // Don't move shells from camora to cartridges (happens when loading shells into mts-255 revolver shotgun)
        if (matchingInventoryItem.slotId?.includes("camora_") && moveRequest.to.container === "cartridges") {
            this.logger.warning(
                this.localisationService.getText("inventory-invalid_move_to_container", {
                    slotId: matchingInventoryItem.slotId,
                    container: moveRequest.to.container,
                }),
            );

            return { success: true };
        }

        // Edit items details to match its new location
        matchingInventoryItem.parentId = moveRequest.to.id;
        matchingInventoryItem.slotId = moveRequest.to.container;

        // Ensure fastpanel dict updates when item was moved out of fast-panel-accessible slot
        this.updateFastPanelBinding(pmcData, matchingInventoryItem);

        // Item has location propery, ensure its value is handled
        if ("location" in moveRequest.to) {
            matchingInventoryItem.location = moveRequest.to.location;
        } else {
            // Moved from slot with location to one without, clean up
            if (matchingInventoryItem.location) {
                // biome-ignore lint/performance/noDelete: Delete is fine here as we're trying to remove the entire data property.
                delete matchingInventoryItem.location;
            }
        }

        return { success: true };
    }

    /**
     * Update fast panel bindings when an item is moved into a container that doesnt allow quick slot access
     * @param pmcData Player profile
     * @param itemBeingMoved item being moved
     */
    protected updateFastPanelBinding(pmcData: IPmcData, itemBeingMoved: IItem): void {
        // Find matching _id in fast panel
        const fastPanelSlot = Object.entries(pmcData.Inventory.fastPanel).find(
            ([itemId]) => itemId === itemBeingMoved._id,
        );
        if (!fastPanelSlot) {
            return;
        }

        // Get moved items parent (should be container item was put into)
        const itemParent = pmcData.Inventory.items.find((item) => item._id === itemBeingMoved.parentId);
        if (!itemParent) {
            return;
        }

        // Reset fast panel value if item was moved to a container other than pocket/rig (cant be used from fastpanel)
        const wasMovedToFastPanelAccessibleContainer = ["pockets", "tacticalvest"].includes(
            itemParent?.slotId?.toLowerCase() ?? "",
        );
        if (!wasMovedToFastPanelAccessibleContainer) {
            pmcData.Inventory.fastPanel[fastPanelSlot[0]] = "";
        }
    }

    /**
     * Internal helper function to handle cartridges in inventory if any of them exist.
     */
    protected handleCartridges(items: IItem[], request: IInventoryMoveRequestData): void {
        // Not moving item into a cartridge slot, skip
        if (request.to.container !== "cartridges") {
            return;
        }

        // Get a count of cartridges in existing magazine
        const cartridgeCount = items.filter((item) => item.parentId === request.to.id).length;

        request.to.location = cartridgeCount;
    }

    /**
     * Get details for how a random loot container should be handled, max rewards, possible reward tpls
     * @param itemTpl Container being opened
     * @returns Reward details
     */
    public getRandomLootContainerRewardDetails(itemTpl: string): IRewardDetails {
        return this.inventoryConfig.randomLootContainers[itemTpl];
    }

    public getInventoryConfig(): IInventoryConfig {
        return this.inventoryConfig;
    }

    /**
     * Recursively checks if the given item is
     * inside the stash, that is it has the stash as
     * ancestor with slotId=hideout
     * @param pmcData Player profile
     * @param itemToCheck Item to look for
     * @returns True if item exists inside stash
     */
    public isItemInStash(pmcData: IPmcData, itemToCheck: IItem): boolean {
        // Create recursive helper function
        const isParentInStash = (itemId: string): boolean => {
            // Item not found / has no parent
            const item = pmcData.Inventory.items.find((item) => item._id === itemId);
            if (!item || !item.parentId) {
                return false;
            }

            // Root level. Items parent is the stash with slotId "hideout"
            if (item.parentId === pmcData.Inventory.stash && item.slotId === "hideout") {
                return true;
            }

            // Recursive case: Check the items parent
            return isParentInStash(item.parentId);
        };

        // Start recursive check
        return isParentInStash(itemToCheck._id);
    }

    public validateInventoryUsesMongoIds(itemsToValidate: IItem[]) {
        for (const item of itemsToValidate) {
            if (!this.hashUtil.isValidMongoId(item._id)) {
                throw new Error(
                    `This profile is not compatible with 3.10.0, It contains an item with the ID: ${item._id} that is not compatible. Loading of SPT has been halted, use another profile or create a new one.`,
                );
            }
        }
    }

    /**
     * Does the provided item have a root item with the provided id
     * @param pmcData Profile with items
     * @param item Item to check
     * @param rootId Root item id to check for
     * @returns True when item has rootId, false when not
     */
    public doesItemHaveRootId(pmcData: IPmcData, item: IItem, rootId: string) {
        let currentItem = item;
        while (currentItem) {
            // If we've found the equipment root ID, return true
            if (currentItem._id === rootId) {
                return true;
            }

            // Otherwise get the parent item
            currentItem = pmcData.Inventory.items.find((item) => item._id === currentItem.parentId);
        }

        return false;
    }
}

namespace InventoryHelper {
    export interface InventoryItemHash {
        byItemId: Record<string, IItem>;
        byParentId: Record<string, IItem[]>;
    }
}
