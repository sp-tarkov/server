import { inject, injectable } from "tsyringe";

import { IPmcData } from "../models/eft/common/IPmcData";
import { Item, Location, Upd } from "../models/eft/common/tables/IItem";
import { AddItem, IAddItemRequestData } from "../models/eft/inventory/IAddItemRequestData";
import { IAddItemTempObject } from "../models/eft/inventory/IAddItemTempObject";
import { IInventoryMergeRequestData } from "../models/eft/inventory/IInventoryMergeRequestData";
import { IInventoryMoveRequestData } from "../models/eft/inventory/IInventoryMoveRequestData";
import { IInventorySplitRequestData } from "../models/eft/inventory/IInventorySplitRequestData";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { BaseClasses } from "../models/enums/BaseClasses";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Traders } from "../models/enums/Traders";
import { IInventoryConfig, RewardDetails } from "../models/spt/config/IInventoryConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { FenceService } from "../services/FenceService";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { ContainerHelper } from "./ContainerHelper";
import { DialogueHelper } from "./DialogueHelper";
import { ItemHelper } from "./ItemHelper";
import { PaymentHelper } from "./PaymentHelper";
import { ProfileHelper } from "./ProfileHelper";
import { TraderAssortHelper } from "./TraderAssortHelper";

export interface OwnerInventoryItems
{
    from: Item[]
    to: Item[]
    sameInventory: boolean,
    isMail: boolean
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
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.inventoryConfig = this.configServer.getConfig(ConfigTypes.INVENTORY);
    }

    /**
     * BUG: Passing the same item multiple times with a count of 1 will cause multiples of that item to be added (e.g. x3 separate objects of tar cola with count of 1 = 9 tarcolas being added to inventory)
     * @param pmcData Profile to add items to
     * @param request request data to add items
     * @param output response to send back to client
     * @param sessionID Session id
     * @param callback Code to execute later (function)
     * @param foundInRaid Will results added to inventory be set as found in raid
     * @param addUpd Additional upd properties for items being added to inventory
     * @returns IItemEventRouterResponse
     */
    public addItem(pmcData: IPmcData, request: IAddItemRequestData, output: IItemEventRouterResponse, sessionID: string, callback: { (): void }, foundInRaid = false, addUpd = null): IItemEventRouterResponse
    {
        const itemLib: Item[] = []; // TODO: what is the purpose of this property
        const itemsToAdd: IAddItemTempObject[] = [];

        for (const requestItem of request.items)
        {
            if (requestItem.item_id in this.databaseServer.getTables().globals.ItemPresets)
            {
                const presetItems = this.jsonUtil.clone(this.databaseServer.getTables().globals.ItemPresets[requestItem.item_id]._items);
                itemLib.push(...presetItems);
                requestItem.isPreset = true;
                requestItem.item_id = presetItems[0]._id;
            }
            else if (this.paymentHelper.isMoneyTpl(requestItem.item_id))
            {
                itemLib.push({ _id: requestItem.item_id, _tpl: requestItem.item_id });
            }
            else if (request.tid === Traders.FENCE)
            {
                const fenceItems = this.fenceService.getRawFenceAssorts().items;
                const itemIndex = fenceItems.findIndex(i => i._id === requestItem.item_id);

                if (itemIndex === -1)
                {
                    this.logger.debug(`Tried to buy item ${requestItem.item_id} from fence that no longer exists`);
                    const message = this.localisationService.getText("ragfair-offer_no_longer_exists");
                    return this.httpResponse.appendErrorToOutput(output, message);
                }
                
                // handle when item being bought is a preset
                const item = fenceItems[itemIndex];
                if (item.upd?.sptPresetId)
                {
                    const presetItems = this.jsonUtil.clone(this.databaseServer.getTables().globals.ItemPresets[item.upd.sptPresetId]._items);
                    itemLib.push(...presetItems);
                    requestItem.isPreset = true;
                    requestItem.item_id = presetItems[0]._id;
                    addUpd = item.upd; // Must persist the fence upd properties (e.g. durability/currentHp)
                }
                else
                {
                    addUpd = item.upd; // Must persist the fence upd properties (e.g. durability/currentHp)
                    itemLib.push({ _id: requestItem.item_id, _tpl: item._tpl });
                }
            }
            else if (request.tid === "RandomLootContainer")
            {
                itemLib.push({ _id: requestItem.item_id, _tpl: requestItem.item_id });
            }
            else
            {
                // Only grab the relevant trader items and add unique values
                const traderItems = this.traderAssortHelper.getAssort(sessionID, request.tid).items;
                const relevantItems = this.itemHelper.findAndReturnChildrenAsItems(traderItems, requestItem.item_id);
                const toAdd = relevantItems.filter(traderItem => !itemLib.some(item => traderItem._id === item._id));
                itemLib.push(...toAdd);
            }

            // Split stacks into allowed sizes if needed
            // e.g. when buying 300 ammo from flea but max stack size is 50
            this.splitStackIntoSmallerStacks(itemLib, requestItem, itemsToAdd);
        }

        // Find an empty slot in stash for each of the items being added
        let stashFS2D = this.getStashSlotMap(pmcData, sessionID);

        for (const itemToAdd of itemsToAdd)
        {
            const itemSize = this.getItemSize(itemToAdd.itemRef._tpl, itemToAdd.itemRef._id, itemLib);
            const findSlotResult = this.containerHelper.findSlotForItem(stashFS2D, itemSize[0], itemSize[1]);

            if (findSlotResult.success)
            {
                /* Fill in the StashFS_2D with an imaginary item, to simulate it already being added
                * so the next item to search for a free slot won't find the same one */
                const itemSizeX = findSlotResult.rotation ? itemSize[1] : itemSize[0];
                const itemSizeY = findSlotResult.rotation ? itemSize[0] : itemSize[1];

                try
                {
                    stashFS2D = this.containerHelper.fillContainerMapWithItem(stashFS2D, findSlotResult.x, findSlotResult.y, itemSizeX, itemSizeY, false); // TODO: rotation not passed in, bad?
                }
                catch (err)
                {
                    const errorText = typeof err === "string" ? ` -> ${err}` : "";
                    this.logger.error(this.localisationService.getText("inventory-fill_container_failed", errorText));

                    return this.httpResponse.appendErrorToOutput(output, this.localisationService.getText("inventory-no_stash_space"));
                }

                itemToAdd.location = {
                    x: findSlotResult.x,
                    y: findSlotResult.y,
                    r: findSlotResult.rotation ? 1 : 0,
                    rotation: findSlotResult.rotation };
            }
            else
            {
                return this.httpResponse.appendErrorToOutput(output, this.localisationService.getText("inventory-no_stash_space"));
            }
        }

        // Successfully found slot for every item, run callback, catch if it fails (e.g. payMoney() might fail)
        try
        {
            if (typeof callback === "function")
            {
                callback();
            }
        }
        catch (err)
        {
            const message = typeof err === "string"
                ? err
                : this.localisationService.getText("http-unknown_error");

            return this.httpResponse.appendErrorToOutput(output, message);
        }

        // Update UPD properties and add to output.profileChanges/pmcData.Inventory.items arrays
        for (const itemToAdd of itemsToAdd)
        {
            let idForItemToAdd = this.hashUtil.generate();
            const toDo: string[][] = [[itemToAdd.itemRef._id, idForItemToAdd]]; // WHAT IS THIS?!
            let upd: Upd = { StackObjectsCount: itemToAdd.count };

            // If item being added is preset, load preset's upd data too.
            if (itemToAdd.isPreset)
            {
                for (const updID in itemToAdd.itemRef.upd)
                {
                    upd[updID] = itemToAdd.itemRef.upd[updID];
                }
            }

            // Item has buff, add to item being sent to player
            if (itemToAdd.itemRef.upd?.Buff)
            {
                upd.Buff = this.jsonUtil.clone(itemToAdd.itemRef.upd.Buff);
            }

            // add ragfair upd properties
            if (addUpd)
            {
                upd = { ...addUpd, ...upd };
            }

            // Hideout items need to be marked as found in raid
            // Or in case people want all items to be marked as found in raid
            if (foundInRaid || this.inventoryConfig.newItemsMarkedFound)
            {
                upd.SpawnedInSession = true;
            }
            
            // Remove invalid property prior to adding to inventory
            if (upd.UnlimitedCount)
            {
                delete upd.UnlimitedCount;
            }

            output.profileChanges[sessionID].items.new.push({
                _id: idForItemToAdd,
                _tpl: itemToAdd.itemRef._tpl,
                parentId: pmcData.Inventory.stash,
                slotId: "hideout",
                location: { x: itemToAdd.location.x, y: itemToAdd.location.y, r: itemToAdd.location.rotation ? 1 : 0 },
                upd: upd
            });

            pmcData.Inventory.items.push({
                _id: idForItemToAdd,
                _tpl: itemToAdd.itemRef._tpl,
                parentId: pmcData.Inventory.stash,
                slotId: "hideout",
                location: { x: itemToAdd.location.x, y: itemToAdd.location.y, r: itemToAdd.location.rotation ? 1 : 0 },
                upd: this.jsonUtil.clone(upd) // Clone upd to prevent multi-purchases of same item referencing same upd object in memory
            });

            if (this.itemHelper.isOfBaseclass(itemToAdd.itemRef._tpl, BaseClasses.AMMO_BOX))
            {
                this.hydrateAmmoBoxWithAmmo(pmcData, itemToAdd, toDo[0][1], sessionID, output);
            }

            while (toDo.length > 0)
            {
                for (const tmpKey in itemLib)
                {
                    if (itemLib[tmpKey].parentId && itemLib[tmpKey].parentId === toDo[0][0])
                    {
                        idForItemToAdd = this.hashUtil.generate();

                        const slotID = itemLib[tmpKey].slotId;

                        // if it is from ItemPreset, load preset's upd data too.
                        if (itemToAdd.isPreset)
                        {
                            upd = { "StackObjectsCount": itemToAdd.count };

                            for (const updID in itemLib[tmpKey].upd)
                            {
                                upd[updID] = itemLib[tmpKey].upd[updID];
                            }

                            if (foundInRaid || this.inventoryConfig.newItemsMarkedFound)
                            {
                                upd.SpawnedInSession = true;
                            }
                        }

                        if (slotID === "hideout")
                        {
                            output.profileChanges[sessionID].items.new.push({
                                _id: idForItemToAdd,
                                _tpl: itemLib[tmpKey]._tpl,
                                parentId: toDo[0][1],
                                slotId: slotID,
                                location: {
                                    x: itemToAdd.location.x,
                                    y: itemToAdd.location.y,
                                    r: "Horizontal" },
                                upd: upd
                            });

                            pmcData.Inventory.items.push({
                                _id: idForItemToAdd,
                                _tpl: itemLib[tmpKey]._tpl,
                                parentId: toDo[0][1],
                                slotId: itemLib[tmpKey].slotId,
                                location: {
                                    x: itemToAdd.location.x,
                                    y: itemToAdd.location.y,
                                    r: "Horizontal" },
                                upd: upd
                            });
                        }
                        else
                        {
                            const itemLocation = {};

                            if (itemLib[tmpKey]["location"] !== undefined)
                            {
                                itemLocation["location"] = itemLib[tmpKey]["location"];
                            }

                            output.profileChanges[sessionID].items.new.push({
                                _id: idForItemToAdd,
                                _tpl: itemLib[tmpKey]._tpl,
                                parentId: toDo[0][1],
                                slotId: slotID,
                                ...itemLocation,
                                upd: upd
                            });

                            pmcData.Inventory.items.push({
                                _id: idForItemToAdd,
                                _tpl: itemLib[tmpKey]._tpl,
                                parentId: toDo[0][1],
                                slotId: itemLib[tmpKey].slotId,
                                ...itemLocation,
                                upd: upd
                            });
                        }

                        toDo.push([itemLib[tmpKey]._id, idForItemToAdd]);
                    }
                }

                toDo.splice(0, 1);
            }
        }

        return output;
    }

    /**
     * Add ammo to ammo boxes
     * @param itemToAdd Item to check is ammo box
     * @param parentId Ammo box parent id
     * @param output IItemEventRouterResponse object
     * @param sessionID Session id
     * @param pmcData Profile to add ammobox to
     */
    protected hydrateAmmoBoxWithAmmo(pmcData: IPmcData, itemToAdd: IAddItemTempObject, parentId: string, sessionID: string, output: IItemEventRouterResponse): void
    {
        const itemInfo = this.itemHelper.getItem(itemToAdd.itemRef._tpl)[1];
        const stackSlots = itemInfo._props.StackSlots;
        if (stackSlots !== undefined)
        {
            // Cartridge info seems to be an array of size 1 for some reason... (See AmmoBox constructor in client code)
            let maxCount = stackSlots[0]._max_count;
            const ammoTpl = stackSlots[0]._props.filters[0].Filter[0];
            const ammoStackMaxSize = this.itemHelper.getItem(ammoTpl)[1]._props.StackMaxSize;
            const ammos = [];
            let location = 0;

            // Place stacks in ammo box no larger than StackMaxSize, prevents player when opening item getting stack of ammo > StackMaxSize
            while (maxCount > 0)
            {
                const ammoStackSize = maxCount <= ammoStackMaxSize ? maxCount : ammoStackMaxSize;
                ammos.push({
                    _id: this.hashUtil.generate(),
                    _tpl: ammoTpl,
                    parentId: parentId,
                    slotId: "cartridges",
                    location: location,
                    upd: { "StackObjectsCount": ammoStackSize }
                });

                location++;
                maxCount -= ammoStackMaxSize;
            }

            for (const item of [output.profileChanges[sessionID].items.new, pmcData.Inventory.items])
            {
                item.push(...ammos);
            }
        }
    }

    /**
     * 
     * @param assortItems Items to add to inventory
     * @param requestItem Details of purchased item to add to inventory
     * @param result Array split stacks are added to
     */
    protected splitStackIntoSmallerStacks(assortItems: Item[], requestItem: AddItem, result: IAddItemTempObject[]): void
    {
        for (const item of assortItems)
        {
            if (item._id === requestItem.item_id)
            {
                // Get item details from db
                const itemDetails = this.itemHelper.getItem(item._tpl)[1];
                const itemToAdd: IAddItemTempObject = {
                    itemRef: item,
                    count: requestItem.count,
                    isPreset: requestItem.isPreset };

                // Split stacks if the size is higher than allowed by items StackMaxSize property
                let maxStackCount = 1;
                if (requestItem.count > itemDetails._props.StackMaxSize)
                {
                    let remainingCountOfItemToAdd = requestItem.count;
                    const calc = requestItem.count - (Math.floor(requestItem.count / itemDetails._props.StackMaxSize) * itemDetails._props.StackMaxSize);

                    maxStackCount = (calc > 0)
                        ? maxStackCount + Math.floor(remainingCountOfItemToAdd / itemDetails._props.StackMaxSize)
                        : Math.floor(remainingCountOfItemToAdd / itemDetails._props.StackMaxSize);

                    // Iterate until totalCountOfPurchasedItem is 0
                    for (let i = 0; i < maxStackCount; i++)
                    {
                        // Keep splitting items into stacks until none left
                        if (remainingCountOfItemToAdd > 0)
                        {
                            const newItemToAdd = this.jsonUtil.clone(itemToAdd);
                            if (remainingCountOfItemToAdd > itemDetails._props.StackMaxSize)
                            {
                                // Reduce total count of item purchased by stack size we're going to add to inventory
                                remainingCountOfItemToAdd -= itemDetails._props.StackMaxSize;
                                newItemToAdd.count = itemDetails._props.StackMaxSize;
                            }
                            else
                            {
                                newItemToAdd.count = remainingCountOfItemToAdd;
                            }

                            result.push(newItemToAdd);
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
     * Remove item from player inventory
     * @param pmcData Profile to remove item from
     * @param itemId Items id to remove
     * @param sessionID Session id
     * @param output Existing IItemEventRouterResponse object to append data to, creates new one by default if not supplied
     * @returns IItemEventRouterResponse
     */
    public removeItem(pmcData: IPmcData, itemId: string, sessionID: string, output: IItemEventRouterResponse = undefined): IItemEventRouterResponse
    {
        if (!itemId)
            return output;

        const childIds = this.itemHelper.findAndReturnChildrenByItems(pmcData.Inventory.items, itemId);
        const inventoryItems = pmcData.Inventory.items;
        const insuredItems = pmcData.InsuredItems;

        if (output)
            output.profileChanges[sessionID].items.del.push({ "_id": itemId });

        for (const childId of childIds)
        {
            // We expect that each inventory item and each insured item has unique "_id", respective "itemId".
            // Therefore we want to use a NON-Greedy function and escape the iteration as soon as we find requested item.
            const inventoryIndex = inventoryItems.findIndex(item => item._id === childId);
            if (inventoryIndex > -1)
            {
                inventoryItems.splice(inventoryIndex, 1);
            }

            const insuredIndex = insuredItems.findIndex(item => item.itemId === childId);
            if (insuredIndex > -1)
            {
                insuredItems.splice(insuredIndex, 1);
            }
        }

        return output;
    }

    public removeItemByCount(pmcData: IPmcData, itemId: string, count: number, sessionID: string, output: IItemEventRouterResponse = undefined): IItemEventRouterResponse
    {
        if (!itemId)
            return output;

        const itemsToReduce = this.itemHelper.findAndReturnChildrenAsItems(pmcData.Inventory.items, itemId);
        let remainingCount = count;
        for (const itemToReduce of itemsToReduce)
        {
            const itemCount = this.itemHelper.getItemStackSize(itemToReduce);

            // remove whole stack
            if (remainingCount >= itemCount)
            {
                remainingCount -= itemCount;
                this.removeItem(pmcData, itemToReduce._id, sessionID, output);
            }
            else
            {
                itemToReduce.upd.StackObjectsCount -= remainingCount;
                remainingCount = 0;
                if (output)
                    output.profileChanges[sessionID].items.change.push(itemToReduce);
            }

            if (remainingCount === 0)
                break;
        }

        return output;
    }

    /* Calculate Size of item input
     * inputs Item template ID, Item Id, InventoryItem (item from inventory having _id and _tpl)
     * outputs [width, height]
     */
    public getItemSize(itemTpl: string, itemID: string, inventoryItem: Item[]): number[]
    {
        // -> Prepares item Width and height returns [sizeX, sizeY]
        return this.getSizeByInventoryItemHash(itemTpl, itemID, this.getInventoryItemHash(inventoryItem));
    }

    // note from 2027: there IS a thing i didn't explore and that is Merges With Children
    // -> Prepares item Width and height returns [sizeX, sizeY]
    protected getSizeByInventoryItemHash(itemTpl: string, itemID: string, inventoryItemHash: InventoryHelper.InventoryItemHash): number[]
    {
        const toDo = [itemID];
        const result = this.itemHelper.getItem(itemTpl);
        const tmpItem = result[1];

        // Invalid item or no object
        if (!(result[0] && result[1]))
        {
            this.logger.error(this.localisationService.getText("inventory-invalid_item_missing_from_db", itemTpl));
        }

        // item found but no _props property
        if (tmpItem && !tmpItem._props)
        {
            this.logger.error(`Item ${itemTpl} ${tmpItem?._name} is missing a props field, a size for it cannot be acquired`);
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
            BaseClasses.SIMPLE_CONTAINER
        ];
        const rootFolded = rootItem.upd?.Foldable && rootItem.upd.Foldable.Folded === true;

        //The item itself is collapsible
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
                        //Filtering child items outside of mod slots, such as those inside containers, without counting their ExtraSize attribute
                        if (item.slotId.indexOf("mod_") < 0)
                        {
                            continue;
                        }

                        toDo.push(item._id);

                        // If the barrel is folded the space in the barrel is not counted
                        const itemResult = this.itemHelper.getItem(item._tpl);
                        if (!itemResult[0])
                        {
                            this.logger.error(`getSizeByInventoryItemHash() Item with tpl: ${item._tpl} not found`);
                        }

                        const itm = itemResult[1];
                        const childFoldable = itm._props.Foldable;
                        const childFolded = item.upd?.Foldable && item.upd.Foldable.Folded === true;

                        if (foldableWeapon && foldedSlot === item.slotId && (rootFolded || childFolded))
                        {
                            continue;
                        }
                        else if (childFoldable && rootFolded && childFolded)
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
            outY + sizeUp + sizeDown + forcedUp + forcedDown
        ];
    }

    protected getInventoryItemHash(inventoryItem: Item[]): InventoryHelper.InventoryItemHash
    {
        const inventoryItemHash: InventoryHelper.InventoryItemHash = {
            "byItemId": {},
            "byParentId": {}
        };

        for (let i = 0; i < inventoryItem.length; i++)
        {
            const item = inventoryItem[i];
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

    public getContainerMap(containerW: number, containerH: number, itemList: Item[], containerId: string): number[][]
    {
        const container2D: number[][] = Array(containerH).fill(0).map(() => Array(containerW).fill(0));
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
            const fH = (((item.location as Location).r === 1 || (item.location as Location).r  === "Vertical" || (item.location as Location).rotation === "Vertical") ? iW : iH);
            const fW = (((item.location as Location).r === 1 || (item.location as Location).r === "Vertical" || (item.location as Location).rotation === "Vertical") ? iH : iW);
            const fillTo = (item.location as Location).x + fW;

            for (let y = 0; y < fH; y++)
            {
                try
                {
                    container2D[(item.location as Location).y + y].fill(1, (item.location as Location).x, fillTo);
                }
                catch (e)
                {
                    this.logger.error(this.localisationService.getText("inventory-unable_to_fill_container", {id: item._id, error: e}));
                }
            }
        }

        return container2D;
    }

    /**
     * Based on the item action, determine whose inventories we should be looking at for from and to.
     */
    public getOwnerInventoryItems(body: IInventoryMoveRequestData | IInventorySplitRequestData | IInventoryMergeRequestData, sessionID: string): OwnerInventoryItems
    {
        let isSameInventory = false;
        const pmcItems = this.profileHelper.getPmcProfile(sessionID).Inventory.items;
        const scavData = this.profileHelper.getScavProfile(sessionID);
        let fromInventoryItems = pmcItems;
        let fromType = "pmc";

        if ("fromOwner" in body)
        {
            if (body.fromOwner.id === scavData._id)
            {
                fromInventoryItems = scavData.Inventory.items;
                fromType = "scav";
            }
            else if (body.fromOwner.type.toLocaleLowerCase() === "mail")
            {
                fromInventoryItems = this.dialogueHelper.getMessageItemContents(body.fromOwner.id, sessionID, body.item);
                fromType = "mail";
            }
        }

        // Don't need to worry about mail for destination because client doesn't allow
        // users to move items back into the mail stash.
        let toInventoryItems = pmcItems;
        let toType = "pmc";

        if ("toOwner" in body && body.toOwner.id === scavData._id)
        {
            toInventoryItems = scavData.Inventory.items;
            toType = "scav";
        }

        if (fromType === toType)
        {
            isSameInventory = true;
        }

        return {
            from: fromInventoryItems,
            to: toInventoryItems,
            sameInventory: isSameInventory,
            isMail: fromType === "mail"
        };
    }

    /**
     * Made a 2d array table with 0 - free slot and 1 - used slot
     * @param {Object} pmcData
     * @param {string} sessionID
     * @returns Array
     */
    protected getStashSlotMap(pmcData: IPmcData, sessionID: string): number[][]
    {
        const playerStashSize = this.getPlayerStashSize(sessionID);
        return this.getContainerMap(playerStashSize[0], playerStashSize[1], pmcData.Inventory.items, pmcData.Inventory.stash);
    }

    protected getStashType(sessionID: string): string
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const stashObj = pmcData.Inventory.items.find(item => item._id === pmcData.Inventory.stash);
        if (!stashObj)
        {
            this.logger.error(this.localisationService.getText("inventory-unable_to_find_stash"));

            return "";
        }
        return stashObj._tpl;
    }


    /* Get Player Stash Proper Size
        * input: null
        * output: [stashSizeWidth, stashSizeHeight]
        * */
    protected getPlayerStashSize(sessionID: string): Record<number, number>
    {
        //this sets automatically a stash size from items.json (its not added anywhere yet cause we still use base stash)
        const stashTPL = this.getStashType(sessionID);
        const stashX = this.databaseServer.getTables().templates.items[stashTPL]._props.Grids[0]._props.cellsH !== 0
            ? this.databaseServer.getTables().templates.items[stashTPL]._props.Grids[0]._props.cellsH
            : 10;
        const stashY = this.databaseServer.getTables().templates.items[stashTPL]._props.Grids[0]._props.cellsV !== 0
            ? this.databaseServer.getTables().templates.items[stashTPL]._props.Grids[0]._props.cellsV
            : 66;
        return [stashX, stashY];
    }

    /**
    * Internal helper function to transfer an item from one profile to another.
    * fromProfileData: Profile of the source.
    * toProfileData: Profile of the destination.
    * body: Move request
    */
    public moveItemToProfile(fromItems: Item[], toItems: Item[], body: IInventoryMoveRequestData): void
    {
        this.handleCartridges(fromItems, body);

        const idsToMove = this.itemHelper.findAndReturnChildrenByItems(fromItems, body.item);

        for (const itemId of idsToMove)
        {
            for (const itemIndex in fromItems)
            {
                if (fromItems[itemIndex]._id && fromItems[itemIndex]._id === itemId)
                {
                    if (itemId === body.item)
                    {
                        fromItems[itemIndex].parentId = body.to.id;
                        fromItems[itemIndex].slotId = body.to.container;

                        if ("location" in body.to)
                        {
                            fromItems[itemIndex].location = body.to.location;
                        }
                        else
                        {
                            if (fromItems[itemIndex].location)
                            {
                                delete fromItems[itemIndex].location;
                            }
                        }
                    }
                    toItems.push(fromItems[itemIndex]);
                    fromItems.splice(parseInt(itemIndex), 1);
                }
            }
        }
    }

    /**
    * Internal helper function to move item within the same profile_f.
    */
    public moveItemInternal(pmcData: IPmcData, inventoryItems: Item[], moveRequest: IInventoryMoveRequestData): void
    {
        this.handleCartridges(inventoryItems, moveRequest);

        for (const inventoryItem of inventoryItems)
        {
            // Find item we want to 'move'
            if (inventoryItem._id && inventoryItem._id === moveRequest.item)
            {
                this.logger.debug(`${moveRequest.Action} item: ${moveRequest.item} from slotid: ${inventoryItem.slotId} to container: ${moveRequest.to.container}`);

                // don't move shells from camora to cartridges (happens when loading shells into mts-255 revolver shotgun)
                if (inventoryItem.slotId.includes("camora_") && moveRequest.to.container === "cartridges")
                {
                    this.logger.warning(this.localisationService.getText("inventory-invalid_move_to_container", {slotId: inventoryItem.slotId, container: moveRequest.to.container}));
                    return;
                }

                // Edit items details to match its new location
                inventoryItem.parentId = moveRequest.to.id;
                inventoryItem.slotId = moveRequest.to.container;

                this.updateFastPanelBinding(pmcData, inventoryItem);

                if ("location" in moveRequest.to)
                {
                    inventoryItem.location = moveRequest.to.location;
                    
                }
                else
                {
                    if (inventoryItem.location)
                    {
                        delete inventoryItem.location;
                    }
                }
                return;
            }
        }
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
                const itemParent = pmcData.Inventory.items.find(x => x._id === itemBeingMoved.parentId);
                
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
}

namespace InventoryHelper
{
    export interface InventoryItemHash
    {
        byItemId: Record<string, Item>
        byParentId: Record<string, Item[]>
    }
}