import { inject, injectable } from "tsyringe";

import { InventoryHelper } from "../helpers/InventoryHelper";
import { PaymentHelper } from "../helpers/PaymentHelper";
import { PresetHelper } from "../helpers/PresetHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { WeightedRandomHelper } from "../helpers/WeightedRandomHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Item } from "../models/eft/common/tables/IItem";
import { IAddItemRequestData } from "../models/eft/inventory/IAddItemRequestData";
import { IInventoryBindRequestData } from "../models/eft/inventory/IInventoryBindRequestData";
import {
    IInventoryCreateMarkerRequestData
} from "../models/eft/inventory/IInventoryCreateMarkerRequestData";
import {
    IInventoryDeleteMarkerRequestData
} from "../models/eft/inventory/IInventoryDeleteMarkerRequestData";
import {
    IInventoryEditMarkerRequestData
} from "../models/eft/inventory/IInventoryEditMarkerRequestData";
import { IInventoryExamineRequestData } from "../models/eft/inventory/IInventoryExamineRequestData";
import { IInventoryFoldRequestData } from "../models/eft/inventory/IInventoryFoldRequestData";
import { IInventoryMergeRequestData } from "../models/eft/inventory/IInventoryMergeRequestData";
import { IInventoryMoveRequestData } from "../models/eft/inventory/IInventoryMoveRequestData";
import {
    IInventoryReadEncyclopediaRequestData
} from "../models/eft/inventory/IInventoryReadEncyclopediaRequestData";
import { IInventoryRemoveRequestData } from "../models/eft/inventory/IInventoryRemoveRequestData";
import { IInventorySortRequestData } from "../models/eft/inventory/IInventorySortRequestData";
import { IInventorySplitRequestData } from "../models/eft/inventory/IInventorySplitRequestData";
import { IInventorySwapRequestData } from "../models/eft/inventory/IInventorySwapRequestData";
import { IInventoryTagRequestData } from "../models/eft/inventory/IInventoryTagRequestData";
import { IInventoryToggleRequestData } from "../models/eft/inventory/IInventoryToggleRequestData";
import {
    IInventoryTransferRequestData
} from "../models/eft/inventory/IInventoryTransferRequestData";
import {
    IOpenRandomLootContainerRequestData
} from "../models/eft/inventory/IOpenRandomLootContainerRequestData";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { Traders } from "../models/enums/Traders";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { DatabaseServer } from "../servers/DatabaseServer";
import { FenceService } from "../services/FenceService";
import { LocalisationService } from "../services/LocalisationService";
import { RagfairOfferService } from "../services/RagfairOfferService";
import { HashUtil } from "../utils/HashUtil";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { RandomUtil } from "../utils/RandomUtil";

@injectable()
export class InventoryController
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("HttpResponseUtil") protected httpResponseUtil: HttpResponseUtil
    )
    {}

    /**
    * Move Item
    * change location of item with parentId and slotId
    * transfers items from one profile to another if fromOwner/toOwner is set in the body.
    * otherwise, move is contained within the same profile_f.
     * @param pmcData Profile
     * @param moveRequest Move request data
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public moveItem(pmcData: IPmcData, moveRequest: IInventoryMoveRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);

        if (output.warnings.length > 0)
        {
            return output;
        }

        const items = this.inventoryHelper.getOwnerInventoryItems(moveRequest, sessionID);
        if (items.sameInventory)
        {
            // Dont move items from trader to profile, this can happen when editing a traders preset weapons
            if (moveRequest.fromOwner?.type === "Trader" && !items.isMail)
            {
                return this.httpResponseUtil.appendErrorToOutput(output, this.localisationService.getText("inventory-edit_trader_item"), 228);
            }

            this.inventoryHelper.moveItemInternal(pmcData, items.from, moveRequest);
        }
        else
        {
            this.inventoryHelper.moveItemToProfile(items.from, items.to, moveRequest);
        }
        return output;
    }

    /**
    * Remove Item from Profile
    * Deep tree item deletion, also removes items from insurance list
    */
    public removeItem(pmcData: IPmcData, itemId: string, sessionID: string, output: IItemEventRouterResponse = undefined): IItemEventRouterResponse
    {
        return this.inventoryHelper.removeItem(pmcData, itemId, sessionID, output);
    }

    /**
     * Implements functionality "Discard" from Main menu (Stash etc.)
     * Removes item from PMC Profile
     */
    public discardItem(pmcData: IPmcData, body: IInventoryRemoveRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.inventoryHelper.removeItem(pmcData, body.item, sessionID, this.eventOutputHolder.getOutput(sessionID));
    }

    /**
    * Split Item
    * spliting 1 item-stack into 2 separate items ...
    */
    public splitItem(pmcData: IPmcData, body: IInventorySplitRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);
        let location = body.container.location;

        const items = this.inventoryHelper.getOwnerInventoryItems(body, sessionID);

        if (!("location" in body.container) && body.container.container === "cartridges")
        {
            let tmpCounter = 0;

            for (const itemAmmo in items.to)
            {
                if (items.to[itemAmmo].parentId === body.container.id)
                {
                    tmpCounter++;
                }
            }

            location = tmpCounter; // wrong location for first cartrige
        }

        // The item being merged is possible from three different sources: pmc, scav, or mail.
        for (const item of items.from)
        {
            if (item._id && item._id === body.item)
            {
                item.upd.StackObjectsCount -= body.count;

                const newItemId = this.hashUtil.generate();

                output.profileChanges[sessionID].items.new.push({
                    "_id": newItemId,
                    "_tpl": item._tpl,
                    "upd": { "StackObjectsCount": body.count }
                });

                items.to.push({
                    "_id": newItemId,
                    "_tpl": item._tpl,
                    "parentId": body.container.id,
                    "slotId": body.container.container,
                    "location": location,
                    "upd": { "StackObjectsCount": body.count }
                });

                return output;
            }
        }

        return {
            warnings: [],
            profileChanges: {}
        };
    }

    /**
     * Merge Item
     * merges 2 items into one, deletes item from `body.item` and adding number of stacks into `body.with`
     */
    public mergeItem(pmcData: IPmcData, body: IInventoryMergeRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);
        const items = this.inventoryHelper.getOwnerInventoryItems(body, sessionID);

        for (const key in items.to)
        {
            if (items.to[key]._id === body.with)
            {
                for (const key2 in items.from)
                {
                    if (items.from[key2]._id && items.from[key2]._id === body.item)
                    {
                        let stackItem0 = 1;
                        let stackItem1 = 1;

                        if (!(items.to[key].upd?.StackObjectsCount))
                        {
                            items.to[key].upd = { "StackObjectsCount": 1 };
                        }
                        else if (!(items.from[key2].upd?.StackObjectsCount))
                        {
                            items.from[key2].upd = { "StackObjectsCount": 1 };
                        }

                        if (items.to[key].upd !== undefined)
                        {
                            stackItem0 = items.to[key].upd.StackObjectsCount;
                        }

                        if ("upd" in items.from[key2])
                        {
                            stackItem1 = items.from[key2].upd.StackObjectsCount;
                        }

                        if (stackItem0 === 1)
                        {
                            Object.assign(items.to[key], { "upd": { "StackObjectsCount": 1 } });
                        }

                        items.to[key].upd.StackObjectsCount = stackItem0 + stackItem1;
                        output.profileChanges[sessionID].items.del.push({ _id: items.from[key2]._id });
                        items.from.splice(parseInt(key2), 1);
                        return output;
                    }
                }
            }
        }

        return {
            warnings: [],
            profileChanges: {}
        };
    }

    /**
    * Transfer item
    * Used to take items from scav inventory into stash or to insert ammo into mags (shotgun ones) and reloading weapon by clicking "Reload"
    */
    public transferItem(pmcData: IPmcData, body: IInventoryTransferRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);
        let itemFrom = null;
        let itemTo = null;

        for (const iterItem of pmcData.Inventory.items)
        {
            if (iterItem._id === body.item)
            {
                itemFrom = iterItem;
            }
            else if (iterItem._id === body.with)
            {
                itemTo = iterItem;
            }

            if (itemFrom !== null && itemTo !== null)
            {
                break;
            }
        }

        if (itemFrom !== null && itemTo !== null)
        {
            let stackFrom = 1;

            if ("upd" in itemFrom)
            {
                stackFrom = itemFrom.upd.StackObjectsCount;
            }
            else
            {
                Object.assign(itemFrom, { "upd": { "StackObjectsCount": 1 } });
            }

            if (stackFrom > body.count)
            {
                itemFrom.upd.StackObjectsCount = stackFrom - body.count;
            }
            else
            {
                // Moving a full stack onto a smaller stack
                itemFrom.upd.StackObjectsCount = stackFrom - 1;
            }

            let stackTo = 1;

            if ("upd" in itemTo)
            {
                stackTo = itemTo.upd.StackObjectsCount;
            }
            else
            {
                Object.assign(itemTo, { "upd": { "StackObjectsCount": 1 } });
            }

            itemTo.upd.StackObjectsCount = stackTo + body.count;
        }

        return output;
    }

    /**
    * Swap Item
    * its used for "reload" if you have weapon in hands and magazine is somewhere else in rig or backpack in equipment
    */
    public swapItem(pmcData: IPmcData, body: IInventorySwapRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);

        for (const iterItem of pmcData.Inventory.items)
        {
            if (iterItem._id === body.item)
            {
                iterItem.parentId = body.to.id;         // parentId
                iterItem.slotId = body.to.container;    // slotId
                iterItem.location = body.to.location;    // location
            }

            if (iterItem._id === body.item2)
            {
                iterItem.parentId = body.to2.id;
                iterItem.slotId = body.to2.container;
                delete iterItem.location;
            }
        }
        return output;
    }

    /**
    * Give Item
    * its used for "add" item like gifts etc.
    */
    public addItem(pmcData: IPmcData, body: IAddItemRequestData, output: IItemEventRouterResponse, sessionID: string, callback: any, foundInRaid = false, addUpd = null): IItemEventRouterResponse
    {
        return this.inventoryHelper.addItem(pmcData, body, output, sessionID, callback, foundInRaid, addUpd);
    }

    /**
     * Handles folding of Weapons
     */
    public foldItem(pmcData: IPmcData, body: IInventoryFoldRequestData, sessionID: string): IItemEventRouterResponse
    {
        // Fix for folding weapons while on they're in the Scav inventory
        if (body.fromOwner
            && body.fromOwner.type === "Profile"
            && body.fromOwner.id !== pmcData._id)
        {
            pmcData = this.profileHelper.getScavProfile(sessionID);
        }

        for (const item of pmcData.Inventory.items)
        {
            if (item._id && item._id === body.item)
            {
                item.upd.Foldable = { "Folded": body.value };
                return this.eventOutputHolder.getOutput(sessionID);
            }
        }

        return {
            warnings: [],
            profileChanges: {}
        };
    }

    /**
     * Toggles "Toggleable" items like night vision goggles and face shields.
     */
    public toggleItem(pmcData: IPmcData, body: IInventoryToggleRequestData, sessionID: string): IItemEventRouterResponse
    {
        // Fix for toggling items while on they're in the Scav inventory
        if (body.fromOwner && body.fromOwner.type === "Profile" && body.fromOwner.id !== pmcData._id)
        {
            pmcData = this.profileHelper.getScavProfile(sessionID);
        }

        for (const item of pmcData.Inventory.items)
        {
            if (item._id && item._id === body.item)
            {
                item.upd.Togglable = { On: body.value };
                return this.eventOutputHolder.getOutput(sessionID);
            }
        }

        //return "";
        return {
            warnings: [],
            profileChanges: {}
        };
    }

    /**
     * Add a tag to an inventory item
     * @param pmcData profile with item to add tag to
     * @param body tag request data
     * @param sessionID session id
     * @returns client response object
     */
    public tagItem(pmcData: IPmcData, body: IInventoryTagRequestData, sessionID: string): IItemEventRouterResponse
    {
        for (const item of pmcData.Inventory.items)
        {
            if (item._id === body.item)
            {
                if ("upd" in item)
                {
                    item.upd.Tag = { Color: body.TagColor, Name: body.TagName };
                }
                else
                {
                    item.upd = { Tag: { Color: body.TagColor, Name: body.TagName } };
                }

                return this.eventOutputHolder.getOutput(sessionID);
            }
        }

        return {
            warnings: [],
            profileChanges: {}
        };
    }

    /**
     * Bind an inventory item to the quick access menu at bottom of player screen
     * @param pmcData Player profile
     * @param bindRequest Reqeust object
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public bindItem(pmcData: IPmcData, bindRequest: IInventoryBindRequestData, sessionID: string): IItemEventRouterResponse
    {
        for (const index in pmcData.Inventory.fastPanel)
        {
            if (pmcData.Inventory.fastPanel[index] === bindRequest.item)
            {
                pmcData.Inventory.fastPanel[index] = "";
            }
        }

        pmcData.Inventory.fastPanel[bindRequest.index] = bindRequest.item;

        return this.eventOutputHolder.getOutput(sessionID);
    }


    /**
     * Handles examining an item
     * @param pmcData player profile
     * @param body request object
     * @param sessionID session id
     * @returns response
     */
    public examineItem(pmcData: IPmcData, body: IInventoryExamineRequestData, sessionID: string): IItemEventRouterResponse
    {
        let itemId = "";
        if ("fromOwner" in body)
        {
            try
            {
                itemId = this.getExaminedItemTpl(body);
            }
            catch
            {
                this.logger.error(this.localisationService.getText("inventory-examine_item_does_not_exist", body.item));
            }
            
            // get hideout item
            if (body.fromOwner.type === "HideoutProduction")
            {
                itemId = body.item;
            }
        }

        if (!itemId)
        {
            // item template
            if (body.item in this.databaseServer.getTables().templates.items)
            {
                itemId = body.item;
            }
        }

        if (!itemId)
        {
            // player inventory
            const target = pmcData.Inventory.items.find((item) =>
            {
                return body.item === item._id;
            });

            if (target)
            {
                itemId = target._tpl;
            }
        }

        if (itemId)
        {
            // item found
            const item = this.databaseServer.getTables().templates.items[itemId];

            pmcData.Info.Experience += item._props.ExamineExperience;
            pmcData.Encyclopedia[itemId] = true;
        }

        return this.eventOutputHolder.getOutput(sessionID);
    }

    /**
     * Get the tplid of an item from the examine request object
     * @param body response request
     * @returns tplid
     */
    protected getExaminedItemTpl(body: IInventoryExamineRequestData): string
    {
        if (this.presetHelper.isPreset(body.item))
        {
            return this.presetHelper.getBaseItemTpl(body.item);
        }
        else if (body.fromOwner.id === Traders.FENCE)
        {
            // get tpl from fence assorts
            return this.fenceService.getRawFenceAssorts().items.find(x => x._id === body.item)._tpl;
        }
        else if (body.fromOwner.type === "Trader") // not fence
        {
            // get tpl from trader assort
            return this.databaseServer.getTables().traders[body.fromOwner.id].assort.items.find(item => item._id === body.item)._tpl;
        }
        else if (body.fromOwner.type === "RagFair")
        {
            // try to get tplid from items.json first
            const item = this.databaseServer.getTables().templates.items[body.item];
            if (item)
            {
                return item._id;
            }

            // try alternate way of getting offer if first approach fails
            let offer = this.ragfairOfferService.getOfferByOfferId(body.item);
            if (!offer)
            {
                offer = this.ragfairOfferService.getOfferByOfferId(body.fromOwner.id);
            }

            // try find examine item inside offer items array
            const matchingItem = offer.items.find(x => x._id === body.item);
            if (matchingItem)
            {
                return matchingItem._tpl;
            } 

            // unable to find item in database or ragfair
            throw new Error(this.localisationService.getText("inventory-unable_to_find_item", body.item));
        }
    }

    public readEncyclopedia(pmcData: IPmcData, body: IInventoryReadEncyclopediaRequestData, sessionID: string): IItemEventRouterResponse
    {
        for (const id of body.ids)
        {
            pmcData.Encyclopedia[id] = true;
        }

        return this.eventOutputHolder.getOutput(sessionID);
    }

    /**
     * Handle ApplyInventoryChanges
     * Sorts supplied items.
     * @param pmcData Player profile
     * @param request sort request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public sortInventory(pmcData: IPmcData, request: IInventorySortRequestData, sessionID: string): IItemEventRouterResponse
    {
        let items = pmcData.Inventory.items;

        // handle changed items
        if (request.changedItems)
        {
            for (const target of request.changedItems)
            {
                // remove unsorted items
                let updatedItem: Item = undefined;

                items = items.filter((item) =>
                {
                    if (item._id === target._id)
                    {
                        updatedItem = this.jsonUtil.clone(item);
                    }
                    return item._id !== target._id;
                });

                if (typeof (updatedItem._tpl) !== "string")
                {
                    updatedItem = target;
                }
                else if (typeof (target.location) !== "undefined")
                {
                    updatedItem.location = target.location;
                    updatedItem.slotId = target.slotId;
                }

                // fix currency StackObjectsCount when single stack
                if (this.paymentHelper.isMoneyTpl(updatedItem._tpl))
                {
                    updatedItem.upd = (updatedItem.upd || {});
                    if (!updatedItem.upd.StackObjectsCount)
                    {
                        updatedItem.upd.StackObjectsCount = 1;
                    }
                }

                // add sorted items
                items.push(updatedItem);
            }
        }

        // handle deleted items
        if ("deletedItems" in request)
        {
            // This data is not found inside client 17566 - ApplyInventoryChangesCommand.cs
            throw new Error("looks like this data is used, uh oh");

            // for (const target of body.deletedItems)
            // {
            //     // remove items
            //     items = items.filter((item) =>
            //     {
            //         return item._id !== target._id;
            //     });
            // }
        }

        pmcData.Inventory.items = items;
        return this.eventOutputHolder.getOutput(sessionID);
    }

    /**
     * Add note to a map
     * @param pmcData Player profile
     * @param request Add marker request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public createMapMarker(pmcData: IPmcData, request: IInventoryCreateMarkerRequestData, sessionID: string): IItemEventRouterResponse
    {
        // Get map from inventory
        const mapItem = pmcData.Inventory.items.find(i => i._id === request.item);

        // add marker
        mapItem.upd.Map = mapItem.upd.Map || { Markers: [] };
        request.mapMarker.Note = this.sanitiseMapMarkerText(request.mapMarker.Note);
        mapItem.upd.Map.Markers.push(request.mapMarker);

        // sync with client
        const output = this.eventOutputHolder.getOutput(sessionID);
        output.profileChanges[sessionID].items.change.push(mapItem);

        return output;
    }

    /**
     * Delete a map marker
     * @param pmcData Player profile
     * @param request Delete marker request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public deleteMapMarker(pmcData: IPmcData, request: IInventoryDeleteMarkerRequestData, sessionID: string): IItemEventRouterResponse
    {
        // Get map from inventory
        const mapItem = pmcData.Inventory.items.find(i => i._id === request.item);

        // remove marker
        const markers = mapItem.upd.Map.Markers.filter((marker) =>
        {
            return marker.X !== request.X && marker.Y !== request.Y;
        });
        mapItem.upd.Map.Markers = markers;

        // sync with client
        const output = this.eventOutputHolder.getOutput(sessionID);
        output.profileChanges[sessionID].items.change.push(mapItem);
        return output;
    }

    /**
     * Edit an existing map marker
     * @param pmcData Player profile
     * @param request Edit marker request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public editMapMarker(pmcData: IPmcData, request: IInventoryEditMarkerRequestData, sessionID: string): IItemEventRouterResponse
    {
        // Get map from inventory
        const mapItem = pmcData.Inventory.items.find(i => i._id === request.item);

        // edit marker
        const indexOfExistingNote = mapItem.upd.Map.Markers.findIndex(m => m.X === request.X && m.Y === request.Y);
        request.mapMarker.Note = this.sanitiseMapMarkerText(request.mapMarker.Note);
        mapItem.upd.Map.Markers[indexOfExistingNote] = request.mapMarker;

        // sync with client
        const output = this.eventOutputHolder.getOutput(sessionID);
        output.profileChanges[sessionID].items.change.push(mapItem);

        return output;
    }

    /**
     * Strip out characters from note string that are not: letter/numbers/unicode/spaces
     * @param mapNoteText Marker text to sanitise
     * @returns Sanitised map marker text
     */
    protected sanitiseMapMarkerText(mapNoteText: string): string
    {
        return mapNoteText.replace(/[^\p{L}\d ]/gu, "");
    }

    /**
     * Handle event fired when a container is unpacked (currently only the halloween pumpkin)
     * @param pmcData Profile data
     * @param body open loot container request data
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public openRandomLootContainer(pmcData: IPmcData, body: IOpenRandomLootContainerRequestData, sessionID: string): IItemEventRouterResponse
    {
        const openedItem = pmcData.Inventory.items.find(x => x._id === body.item);
        const rewardContainerDetails = this.inventoryHelper.getRandomLootContainerRewardDetails(openedItem._tpl);

        const newItemRequest: IAddItemRequestData = {
            tid: "RandomLootContainer",
            items: []
        };

        // Get random items and add to newItemRequest
        for (let index = 0; index < rewardContainerDetails.rewardCount; index++)
        {
            // Pick random reward from pool, add to request object
            const chosenRewardItemTpl = this.weightedRandomHelper.getWeightedInventoryItem(rewardContainerDetails.rewardTplPool);
            const existingItemInRequest = newItemRequest.items.find(x => x.item_id === chosenRewardItemTpl);
            if (existingItemInRequest)
            {
                // Exists in request already, increment count
                existingItemInRequest.count++;
            }
            else
            {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                newItemRequest.items.push({item_id: chosenRewardItemTpl, count: 1});
            }
        }

        const output = this.eventOutputHolder.getOutput(sessionID);

        // Find and delete opened item from player inventory
        this.inventoryHelper.removeItem(pmcData, body.item, sessionID, output);

        // Add random reward items to player inventory
        this.inventoryHelper.addItem(pmcData, newItemRequest, output, sessionID, null, rewardContainerDetails.foundInRaid);

        return output;
    }
}