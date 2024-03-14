import { inject, injectable } from "tsyringe";

import { ContainerHelper } from "@spt-aki/helpers/ContainerHelper";
import { DialogueHelper } from "@spt-aki/helpers/DialogueHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PaymentHelper } from "@spt-aki/helpers/PaymentHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { TraderAssortHelper } from "@spt-aki/helpers/TraderAssortHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Inventory } from "@spt-aki/models/eft/common/tables/IBotBase";
import { Item, Location, Upd } from "@spt-aki/models/eft/common/tables/IItem";
import { IAddItemDirectRequest } from "@spt-aki/models/eft/inventory/IAddItemDirectRequest";
import { AddItem } from "@spt-aki/models/eft/inventory/IAddItemRequestData";
import { IAddItemTempObject } from "@spt-aki/models/eft/inventory/IAddItemTempObject";
import { IAddItemsDirectRequest } from "@spt-aki/models/eft/inventory/IAddItemsDirectRequest";
import { IInventoryMergeRequestData } from "@spt-aki/models/eft/inventory/IInventoryMergeRequestData";
import { IInventoryMoveRequestData } from "@spt-aki/models/eft/inventory/IInventoryMoveRequestData";
import { IInventoryRemoveRequestData } from "@spt-aki/models/eft/inventory/IInventoryRemoveRequestData";
import { IInventorySplitRequestData } from "@spt-aki/models/eft/inventory/IInventorySplitRequestData";
import { IInventoryTransferRequestData } from "@spt-aki/models/eft/inventory/IInventoryTransferRequestData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { BackendErrorCodes } from "@spt-aki/models/enums/BackendErrorCodes";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { BonusType } from "@spt-aki/models/enums/BonusType";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IInventoryConfig, RewardDetails } from "@spt-aki/models/spt/config/IInventoryConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { FenceService } from "@spt-aki/services/FenceService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

export interface IOwnerInventoryItems
{
    /** Inventory items from source */
    from: Item[];
    /** Inventory items at destination */
    to: Item[];
    sameInventory: boolean;
    isMail: boolean;
}

@injectable()
export class InventoryHelper
{
    protected inventoryConfig: IInventoryConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
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
    )
    {
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
    ): void
    {
        // Check all items fit into inventory before adding
        if (!this.canPlaceItemsInInventory(sessionId, request.itemsWithModsToAdd))
        {
            // No space, exit
            this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText("inventory-no_stash_space"),
                BackendErrorCodes.NOTENOUGHSPACE,
            );

            return;
        }

        for (const itemToAdd of request.itemsWithModsToAdd)
        {
            const addItemRequest: IAddItemDirectRequest = {
                itemWithModsToAdd: itemToAdd,
                foundInRaid: request.foundInRaid,
                useSortingTable: request.useSortingTable,
                callback: request.callback,
            };

            // Add to player inventory
            this.addItemToStash(sessionId, addItemRequest, pmcData, output);
            if (output.warnings.length > 0)
            {
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
    ): void
    {
        const itemWithModsToAddClone = this.jsonUtil.clone(request.itemWithModsToAdd);

        // Get stash layouts ready for use
        const stashFS2D = this.getStashSlotMap(pmcData, sessionId);
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
        if (output.warnings.length > 0)
        {
            // Failed to place, error out
            return;
        }

        // Apply/remove FiR to item + mods
        this.setFindInRaidStatusForItem(itemWithModsToAddClone, request.foundInRaid);

        // Remove trader properties from root item
        this.removeTraderRagfairRelatedUpdProperties(itemWithModsToAddClone[0].upd);

        // Run callback
        try
        {
            if (typeof request.callback === "function")
            {
                request.callback(itemWithModsToAddClone[0].upd.StackObjectsCount);
            }
        }
        catch (err)
        {
            // Callback failed
            const message = typeof err?.message === "string"
                ? err.message
                : this.localisationService.getText("http-unknown_error");

            this.httpResponse.appendErrorToOutput(output, message);

            return;
        }

        // Add item + mods to output and profile inventory
        output.profileChanges[sessionId].items.new.push(...itemWithModsToAddClone);
        pmcData.Inventory.items.push(...itemWithModsToAddClone);

        this.logger.debug(
            `Added ${itemWithModsToAddClone[0].upd?.StackObjectsCount ?? 1} item: ${
                itemWithModsToAddClone[0]._tpl
            } with: ${itemWithModsToAddClone.length - 1} mods to inventory`,
        );
    }

    /**
     * Set FiR status for an item + its children
     * @param itemWithChildren An item
     * @param foundInRaid Item was found in raid
     */
    protected setFindInRaidStatusForItem(itemWithChildren: Item[], foundInRaid: boolean): void
    {
        for (const item of itemWithChildren)
        {
            // Ensure item has upd object
            this.itemHelper.addUpdObjectToItem(item);

            if (foundInRaid)
            {
                item.upd.SpawnedInSession = foundInRaid;
            }
            else
            {
                if (delete item.upd.SpawnedInSession)
                {
                    delete item.upd.SpawnedInSession;
                }
            }
        }
    }

    /**
     * Remove properties from a Upd object used by a trader/ragfair that are unnecessary to a player
     * @param upd Object to update
     */
    protected removeTraderRagfairRelatedUpdProperties(upd: Upd): void
    {
        if (upd.UnlimitedCount !== undefined)
        {
            delete upd.UnlimitedCount;
        }

        if (upd.BuyRestrictionCurrent !== undefined)
        {
            delete upd.BuyRestrictionCurrent;
        }

        if (upd.BuyRestrictionMax !== undefined)
        {
            delete upd.BuyRestrictionMax;
        }
    }

    /**
     * Can all probided items be added into player inventory
     * @param sessionId Player id
     * @param itemsWithChildren array of items with children to try and fit
     * @returns True all items fit
     */
    public canPlaceItemsInInventory(sessionId: string, itemsWithChildren: Item[][]): boolean
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionId);

        const stashFS2D = this.jsonUtil.clone(this.getStashSlotMap(pmcData, sessionId));
        for (const itemWithChildren of itemsWithChildren)
        {
            if (this.canPlaceItemInContainer(stashFS2D, itemWithChildren))
            {
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
    public canPlaceItemsInContainer(containerFS2D: number[][], itemsWithChildren: Item[][]): boolean
    {
        for (const itemWithChildren of itemsWithChildren)
        {
            if (this.canPlaceItemInContainer(containerFS2D, itemWithChildren))
            {
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
    public canPlaceItemInContainer(containerFS2D: number[][], itemWithChildren: Item[]): boolean
    {
        // Get x/y size of item
        const rootItem = itemWithChildren[0];
        const itemSize = this.getItemSize(rootItem._tpl, rootItem._id, itemWithChildren);

        // Look for a place to slot item into
        const findSlotResult = this.containerHelper.findSlotForItem(containerFS2D, itemSize[0], itemSize[1]);
        if (findSlotResult.success)
        {
            try
            {
                this.containerHelper.fillContainerMapWithItem(
                    containerFS2D,
                    findSlotResult.x,
                    findSlotResult.y,
                    itemSize[0],
                    itemSize[1],
                    findSlotResult.rotation,
                );
            }
            catch (err)
            {
                const errorText = (typeof err === "string") ? ` -> ${err}` : err.message;
                this.logger.error(`Unable to fit item into inventory: ${errorText}`);

                return false;
            }

            // Success! exit
            return;
        }

        return true;
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
        itemWithChildren: Item[],
        containerId: string,
        desiredSlotId = "hideout",
    ): void
    {
        // Get x/y size of item
        const rootItemAdded = itemWithChildren[0];
        const itemSize = this.getItemSize(rootItemAdded._tpl, rootItemAdded._id, itemWithChildren);

        // Look for a place to slot item into
        const findSlotResult = this.containerHelper.findSlotForItem(containerFS2D, itemSize[0], itemSize[1]);
        if (findSlotResult.success)
        {
            try
            {
                this.containerHelper.fillContainerMapWithItem(
                    containerFS2D,
                    findSlotResult.x,
                    findSlotResult.y,
                    itemSize[0],
                    itemSize[1],
                    findSlotResult.rotation,
                );
            }
            catch (err)
            {
                const errorText = (typeof err === "string") ? ` -> ${err}` : err.message;
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
     * @param itemWithChildren Item to place
     * @param playerInventory
     * @param useSortingTable Should sorting table to be used if main stash has no space
     * @param output output to send back to client
     */
    protected placeItemInInventory(
        stashFS2D: number[][],
        sortingTableFS2D: number[][],
        itemWithChildren: Item[],
        playerInventory: Inventory,
        useSortingTable: boolean,
        output: IItemEventRouterResponse,
    ): void
    {
        // Get x/y size of item
        const rootItem = itemWithChildren[0];
        const itemSize = this.getItemSize(rootItem._tpl, rootItem._id, itemWithChildren);

        // Look for a place to slot item into
        const findSlotResult = this.containerHelper.findSlotForItem(stashFS2D, itemSize[0], itemSize[1]);
        if (findSlotResult.success)
        {
            try
            {
                this.containerHelper.fillContainerMapWithItem(
                    stashFS2D,
                    findSlotResult.x,
                    findSlotResult.y,
                    itemSize[0],
                    itemSize[1],
                    findSlotResult.rotation,
                );
            }
            catch (err)
            {
                const errorText = (typeof err === "string") ? ` -> ${err}` : err.message;
                this.logger.error(this.localisationService.getText("inventory-fill_container_failed", errorText));

                this.httpResponse.appendErrorToOutput(
                    output,
                    this.localisationService.getText("inventory-no_stash_space"),
                );

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
        if (useSortingTable)
        {
            const findSortingSlotResult = this.containerHelper.findSlotForItem(
                sortingTableFS2D,
                itemSize[0],
                itemSize[1],
            );

            try
            {
                this.containerHelper.fillContainerMapWithItem(
                    sortingTableFS2D,
                    findSortingSlotResult.x,
                    findSortingSlotResult.y,
                    itemSize[0],
                    itemSize[1],
                    findSortingSlotResult.rotation,
                );
            }
            catch (err)
            {
                const errorText = typeof err === "string" ? ` -> ${err}` : "";
                this.logger.error(this.localisationService.getText("inventory-fill_container_failed", errorText));

                this.httpResponse.appendErrorToOutput(
                    output,
                    this.localisationService.getText("inventory-no_stash_space"),
                );

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
        }
        else
        {
            this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText("inventory-no_stash_space"),
                BackendErrorCodes.NOTENOUGHSPACE,
            );

            return;
        }
    }

    /**
     * Split an items stack size based on its StackMaxSize value
     * @param assortItems Items to add to inventory
     * @param requestItem Details of purchased item to add to inventory
     * @param result Array split stacks are appended to
     */
    protected splitStackIntoSmallerChildStacks(
        assortItems: Item[],
        requestItem: AddItem,
        result: IAddItemTempObject[],
    ): void
    {
        for (const item of assortItems)
        {
            // Iterated item matches root item
            if (item._id === requestItem.item_id)
            {
                // Get item details from db
                const itemDetails = this.itemHelper.getItem(item._tpl)[1];
                const itemToAdd: IAddItemTempObject = {
                    itemRef: item,
                    count: requestItem.count,
                    isPreset: !!requestItem.sptIsPreset,
                };

                // Split stacks if the size is higher than allowed by items StackMaxSize property
                let maxStackCount = 1;
                if (requestItem.count > itemDetails._props.StackMaxSize)
                {
                    let remainingCountOfItemToAdd = requestItem.count;
                    const calc = requestItem.count
                        - (Math.floor(requestItem.count / itemDetails._props.StackMaxSize)
                            * itemDetails._props.StackMaxSize);

                    maxStackCount = (calc > 0)
                        ? maxStackCount + Math.floor(remainingCountOfItemToAdd / itemDetails._props.StackMaxSize)
                        : Math.floor(remainingCountOfItemToAdd / itemDetails._props.StackMaxSize);

                    // Iterate until totalCountOfPurchasedItem is 0
                    for (let i = 0; i < maxStackCount; i++)
                    {
                        // Keep splitting items into stacks until none left
                        if (remainingCountOfItemToAdd > 0)
                        {
                            const newChildItemToAdd = this.jsonUtil.clone(itemToAdd);
                            if (remainingCountOfItemToAdd > itemDetails._props.StackMaxSize)
                            {
                                // Reduce total count of item purchased by stack size we're going to add to inventory
                                remainingCountOfItemToAdd -= itemDetails._props.StackMaxSize;
                                newChildItemToAdd.count = itemDetails._props.StackMaxSize;
                            }
                            else
                            {
                                newChildItemToAdd.count = remainingCountOfItemToAdd;
                            }

                            result.push(newChildItemToAdd);
                        }
                    }
                }
                else
                {
                    // Item count is within allowed stack size, just add it
                    result.push(itemToAdd);
                }
            }
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
    public removeItem(
        profile: IPmcData,
        itemId: string,
        sessionID: string,
        output: IItemEventRouterResponse = undefined,
    ): void
    {
        if (!itemId)
        {
            this.logger.warning("No itemId supplied, unable to remove item from inventory");

            return;
        }

        // Get children of item, they get deleted too
        const itemToRemoveWithChildren = this.itemHelper.findAndReturnChildrenByItems(profile.Inventory.items, itemId);
        const inventoryItems = profile.Inventory.items;
        const insuredItems = profile.InsuredItems;

        // We have output object, inform client of item deletion
        if (output)
        {
            output.profileChanges[sessionID].items.del.push({ _id: itemId });
        }

        for (const childId of itemToRemoveWithChildren)
        {
            // We expect that each inventory item and each insured item has unique "_id", respective "itemId".
            // Therefore we want to use a NON-Greedy function and escape the iteration as soon as we find requested item.
            const inventoryIndex = inventoryItems.findIndex((item) => item._id === childId);
            if (inventoryIndex > -1)
            {
                inventoryItems.splice(inventoryIndex, 1);
            }

            if (inventoryIndex === -1)
            {
                this.logger.warning(
                    `Unable to remove item with Id: ${childId} as it was not found in inventory ${profile._id}`,
                );
            }

            const insuredIndex = insuredItems.findIndex((item) => item.itemId === childId);
            if (insuredIndex > -1)
            {
                insuredItems.splice(insuredIndex, 1);
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
        output: IItemEventRouterResponse = undefined,
    ): void
    {
        const fullProfile = this.profileHelper.getFullProfile(sessionId);

        // Iterate over all dialogs and look for mesasage with key from request, that has item (and maybe its children) we want to remove
        const dialogs = Object.values(fullProfile.dialogues);
        for (const dialog of dialogs)
        {
            const messageWithReward = dialog.messages.find((x) => x._id === removeRequest.fromOwner.id);
            if (messageWithReward)
            {
                // Find item + any possible children and remove them from mails items array
                const itemWithChildern = this.itemHelper.findAndReturnChildrenAsItems(
                    messageWithReward.items.data,
                    removeRequest.item,
                );
                for (const itemToDelete of itemWithChildern)
                {
                    // Get index of item to remove from reward array + remove it
                    const indexOfItemToRemove = messageWithReward.items.data.indexOf(itemToDelete);
                    if (indexOfItemToRemove === -1)
                    {
                        this.logger.error(
                            `Unable to remove item: ${removeRequest.item} from mail: ${removeRequest.fromOwner.id} as item could not be found, restart client immediately to prevent data corruption`,
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
        output: IItemEventRouterResponse = undefined,
    ): IItemEventRouterResponse
    {
        if (!itemId)
        {
            return output;
        }

        // Goal is to keep removing items until we can remove part of an items stack
        const itemsToReduce = this.itemHelper.findAndReturnChildrenAsItems(pmcData.Inventory.items, itemId);
        let remainingCount = countToRemove;
        for (const itemToReduce of itemsToReduce)
        {
            const itemStackSize = this.itemHelper.getItemStackSize(itemToReduce);

            // Remove whole stack
            if (remainingCount >= itemStackSize)
            {
                remainingCount -= itemStackSize;
                this.removeItem(pmcData, itemToReduce._id, sessionID, output);
            }
            else
            {
                itemToReduce.upd.StackObjectsCount -= remainingCount;
                remainingCount = 0;
                if (output)
                {
                    output.profileChanges[sessionID].items.change.push(itemToReduce);
                }
            }

            if (remainingCount === 0)
            {
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
    public getItemSize(itemTpl: string, itemID: string, inventoryItems: Item[]): number[]
    {
        // -> Prepares item Width and height returns [sizeX, sizeY]
        return this.getSizeByInventoryItemHash(itemTpl, itemID, this.getInventoryItemHash(inventoryItems));
    }

    // note from 2027: there IS a thing i didn't explore and that is Merges With Children
    // -> Prepares item Width and height returns [sizeX, sizeY]
    protected getSizeByInventoryItemHash(
        itemTpl: string,
        itemID: string,
        inventoryItemHash: InventoryHelper.InventoryItemHash,
    ): number[]
    {
        const toDo = [itemID];
        const result = this.itemHelper.getItem(itemTpl);
        const tmpItem = result[1];

        // Invalid item or no object
        if (!(result[0] && result[1]))
        {
            this.logger.error(this.localisationService.getText("inventory-invalid_item_missing_from_db", itemTpl));
        }

        // Item found but no _props property
        if (tmpItem && !tmpItem._props)
        {
            this.localisationService.getText("inventory-item_missing_props_property", {
                itemTpl: itemTpl,
                itemName: tmpItem?._name,
            });
        }

        // No item object or getItem() returned false
        if (!(tmpItem && result[0]))
        {
            // return default size of 1x1
            this.logger.error(this.localisationService.getText("inventory-return_default_size", itemTpl));

            return [1, 1];
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
        const skipThisItems: string[] = [
            BaseClasses.BACKPACK,
            BaseClasses.SEARCHABLE_ITEM,
            BaseClasses.SIMPLE_CONTAINER,
        ];
        const rootFolded = rootItem.upd?.Foldable && rootItem.upd.Foldable.Folded === true;

        // The item itself is collapsible
        if (foldableWeapon && (foldedSlot === undefined || foldedSlot === "") && rootFolded)
        {
            outX -= tmpItem._props.SizeReduceRight;
        }

        if (!skipThisItems.includes(tmpItem._parent))
        {
            while (toDo.length > 0)
            {
                if (toDo[0] in inventoryItemHash.byParentId)
                {
                    for (const item of inventoryItemHash.byParentId[toDo[0]])
                    {
                        // Filtering child items outside of mod slots, such as those inside containers, without counting their ExtraSize attribute
                        if (item.slotId.indexOf("mod_") < 0)
                        {
                            continue;
                        }

                        toDo.push(item._id);

                        // If the barrel is folded the space in the barrel is not counted
                        const itemResult = this.itemHelper.getItem(item._tpl);
                        if (!itemResult[0])
                        {
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

                        if (foldableWeapon && foldedSlot === item.slotId && (rootFolded || childFolded))
                        {
                            continue;
                        }

                        if (childFoldable && rootFolded && childFolded)
                        {
                            continue;
                        }

                        // Calculating child ExtraSize
                        if (itm._props.ExtraSizeForceAdd === true)
                        {
                            forcedUp += itm._props.ExtraSizeUp;
                            forcedDown += itm._props.ExtraSizeDown;
                            forcedLeft += itm._props.ExtraSizeLeft;
                            forcedRight += itm._props.ExtraSizeRight;
                        }
                        else
                        {
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
    protected getBlankContainerMap(containerH: number, containerY: number): number[][]
    {
        return Array(containerY).fill(0).map(() => Array(containerH).fill(0));
    }

    /**
     * @param containerH Horizontal size of container
     * @param containerV Vertical size of container
     * @param itemList
     * @param containerId Id of the container
     * @returns Two-dimensional representation of container
     */
    public getContainerMap(containerH: number, containerV: number, itemList: Item[], containerId: string): number[][]
    {
        const container2D: number[][] = this.getBlankContainerMap(containerH, containerV);
        const inventoryItemHash = this.getInventoryItemHash(itemList);
        const containerItemHash = inventoryItemHash.byParentId[containerId];

        if (!containerItemHash)
        {
            // No items in the container
            return container2D;
        }

        for (const item of containerItemHash)
        {
            if (!("location" in item))
            {
                continue;
            }

            const tmpSize = this.getSizeByInventoryItemHash(item._tpl, item._id, inventoryItemHash);
            const iW = tmpSize[0]; // x
            const iH = tmpSize[1]; // y
            const fH =
                ((item.location as Location).r === 1 || (item.location as Location).r === "Vertical"
                        || (item.location as Location).rotation === "Vertical")
                    ? iW
                    : iH;
            const fW =
                ((item.location as Location).r === 1 || (item.location as Location).r === "Vertical"
                        || (item.location as Location).rotation === "Vertical")
                    ? iH
                    : iW;
            const fillTo = (item.location as Location).x + fW;

            for (let y = 0; y < fH; y++)
            {
                try
                {
                    container2D[(item.location as Location).y + y].fill(1, (item.location as Location).x, fillTo);
                }
                catch (e)
                {
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

    protected getInventoryItemHash(inventoryItem: Item[]): InventoryHelper.InventoryItemHash
    {
        const inventoryItemHash: InventoryHelper.InventoryItemHash = { byItemId: {}, byParentId: {} };
        for (const item of inventoryItem)
        {
            inventoryItemHash.byItemId[item._id] = item;

            if (!("parentId" in item))
            {
                continue;
            }

            if (!(item.parentId in inventoryItemHash.byParentId))
            {
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
    ): IOwnerInventoryItems
    {
        let isSameInventory = false;
        const pmcItems = this.profileHelper.getPmcProfile(sessionId).Inventory.items;
        const scavData = this.profileHelper.getScavProfile(sessionId);
        let fromInventoryItems = pmcItems;
        let fromType = "pmc";

        if (request.fromOwner)
        {
            if (request.fromOwner.id === scavData._id)
            {
                fromInventoryItems = scavData.Inventory.items;
                fromType = "scav";
            }
            else if (request.fromOwner.type.toLocaleLowerCase() === "mail")
            {
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
        if (request.toOwner?.id === scavData._id)
        {
            toInventoryItems = scavData.Inventory.items;
            toType = "scav";
        }

        // From and To types match, same inventory
        if (fromType === toType)
        {
            isSameInventory = true;
        }

        return {
            from: fromInventoryItems,
            to: toInventoryItems,
            sameInventory: isSameInventory,
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
    protected getStashSlotMap(pmcData: IPmcData, sessionID: string): number[][]
    {
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
    public getContainerSlotMap(containerTpl: string): number[][]
    {
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
    protected getSortingTableSlotMap(pmcData: IPmcData): number[][]
    {
        return this.getContainerMap(10, 45, pmcData.Inventory.items, pmcData.Inventory.sortingTable);
    }

    /**
     * Get Players Stash Size
     * @param sessionID Players id
     * @returns Array of 2 values, horizontal and vertical stash size
     */
    protected getPlayerStashSize(sessionID: string): Record<number, number>
    {
        const profile = this.profileHelper.getPmcProfile(sessionID);
        const stashRowBonus = profile.Bonuses.find((bonus) => bonus.type === BonusType.STASH_ROWS);

        // this sets automatically a stash size from items.json (its not added anywhere yet cause we still use base stash)
        const stashTPL = this.getStashType(sessionID);
        if (!stashTPL)
        {
            this.logger.error(this.localisationService.getText("inventory-missing_stash_size"));
        }

        const stashItemResult = this.itemHelper.getItem(stashTPL);
        if (!stashItemResult[0])
        {
            this.logger.error(this.localisationService.getText("inventory-stash_not_found", stashTPL));

            return;
        }

        const stashItemDetails = stashItemResult[1];
        const firstStashItemGrid = stashItemDetails._props.Grids[0];

        const stashH = firstStashItemGrid._props.cellsH !== 0 ? firstStashItemGrid._props.cellsH : 10;
        let stashV = firstStashItemGrid._props.cellsV !== 0 ? firstStashItemGrid._props.cellsV : 66;

        // Player has a bonus, apply to vertical size
        if (stashRowBonus)
        {
            stashV += stashRowBonus.value;
        }

        return [stashH, stashV];
    }

    /**
     * Get the players stash items tpl
     * @param sessionID Player id
     * @returns Stash tpl
     */
    protected getStashType(sessionID: string): string
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const stashObj = pmcData.Inventory.items.find((item) => item._id === pmcData.Inventory.stash);
        if (!stashObj)
        {
            this.logger.error(this.localisationService.getText("inventory-unable_to_find_stash"));
        }

        return stashObj?._tpl;
    }

    /**
     * Internal helper function to transfer an item from one profile to another.
     * @param fromItems Inventory of the source (can be non-player)
     * @param toItems Inventory of the destination
     * @param body Move request
     */
    public moveItemToProfile(fromItems: Item[], toItems: Item[], body: IInventoryMoveRequestData): void
    {
        this.handleCartridges(fromItems, body);
        // Get all children item has, they need to move with item
        const idsToMove = this.itemHelper.findAndReturnChildrenByItems(fromItems, body.item);
        for (const itemId of idsToMove)
        {
            const itemToMove = fromItems.find((x) => x._id === itemId);
            if (!itemToMove)
            {
                this.logger.error(`Unable to find item to move: ${itemId}`);
            }

            // Only adjust the values for parent item, not children (their values are already correctly tied to parent)
            if (itemId === body.item)
            {
                itemToMove.parentId = body.to.id;
                itemToMove.slotId = body.to.container;

                if (body.to.location)
                {
                    // Update location object
                    itemToMove.location = body.to.location;
                }
                else
                {
                    // No location in request, delete it
                    if (itemToMove.location)
                    {
                        delete itemToMove.location;
                    }
                }
            }

            toItems.push(itemToMove);
            fromItems.splice(fromItems.indexOf(itemToMove), 1);
        }
    }

    /**
     * Internal helper function to move item within the same profile_f.
     * @param pmcData profile to edit
     * @param inventoryItems
     * @param moveRequest
     * @returns True if move was successful
     */
    public moveItemInternal(
        pmcData: IPmcData,
        inventoryItems: Item[],
        moveRequest: IInventoryMoveRequestData,
    ): { success: boolean; errorMessage?: string; }
    {
        this.handleCartridges(inventoryItems, moveRequest);

        // Find item we want to 'move'
        const matchingInventoryItem = inventoryItems.find((x) => x._id === moveRequest.item);
        if (!matchingInventoryItem)
        {
            const errorMesage = `Unable to move item: ${moveRequest.item}, cannot find in inventory`;
            this.logger.error(errorMesage);

            return { success: false, errorMessage: errorMesage };
        }

        this.logger.debug(
            `${moveRequest.Action} item: ${moveRequest.item} from slotid: ${matchingInventoryItem.slotId} to container: ${moveRequest.to.container}`,
        );

        // don't move shells from camora to cartridges (happens when loading shells into mts-255 revolver shotgun)
        if (matchingInventoryItem.slotId.includes("camora_") && moveRequest.to.container === "cartridges")
        {
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

        this.updateFastPanelBinding(pmcData, matchingInventoryItem);

        if ("location" in moveRequest.to)
        {
            matchingInventoryItem.location = moveRequest.to.location;
        }
        else
        {
            if (matchingInventoryItem.location)
            {
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
    protected updateFastPanelBinding(pmcData: IPmcData, itemBeingMoved: Item): void
    {
        // Find matching itemid in fast panel
        for (const itemKey in pmcData.Inventory.fastPanel)
        {
            if (pmcData.Inventory.fastPanel[itemKey] === itemBeingMoved._id)
            {
                // Get moved items parent
                const itemParent = pmcData.Inventory.items.find((x) => x._id === itemBeingMoved.parentId);

                // Empty out id if item is moved to a container other than pocket/rig
                if (itemParent && !(itemParent.slotId?.startsWith("Pockets") || itemParent.slotId === "TacticalVest"))
                {
                    pmcData.Inventory.fastPanel[itemKey] = "";
                }

                break;
            }
        }
    }

    /**
     * Internal helper function to handle cartridges in inventory if any of them exist.
     */
    protected handleCartridges(items: Item[], body: IInventoryMoveRequestData): void
    {
        // -> Move item to different place - counts with equipping filling magazine etc
        if (body.to.container === "cartridges")
        {
            let tmpCounter = 0;

            for (const itemAmmo in items)
            {
                if (body.to.id === items[itemAmmo].parentId)
                {
                    tmpCounter++;
                }
            }
            // wrong location for first cartridge
            body.to.location = tmpCounter;
        }
    }

    /**
     * Get details for how a random loot container should be handled, max rewards, possible reward tpls
     * @param itemTpl Container being opened
     * @returns Reward details
     */
    public getRandomLootContainerRewardDetails(itemTpl: string): RewardDetails
    {
        return this.inventoryConfig.randomLootContainers[itemTpl];
    }

    public getInventoryConfig(): IInventoryConfig
    {
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
    public isItemInStash(pmcData: IPmcData, itemToCheck: Item): boolean
    {
        let container = itemToCheck;

        while ("parentId" in container)
        {
            if (container.parentId === pmcData.Inventory.stash && container.slotId === "hideout")
            {
                return true;
            }

            container = pmcData.Inventory.items.find((item) => item._id === container.parentId);
            if (!container)
            {
                break;
            }
        }
        return false;
    }
}

namespace InventoryHelper
{
    export interface InventoryItemHash
    {
        byItemId: Record<string, Item>;
        byParentId: Record<string, Item[]>;
    }
}
