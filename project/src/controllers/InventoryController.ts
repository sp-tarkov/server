import { inject, injectable } from "tsyringe";

import { LootGenerator } from "@spt-aki/generators/LootGenerator";
import { HideoutHelper } from "@spt-aki/helpers/HideoutHelper";
import { InventoryHelper } from "@spt-aki/helpers/InventoryHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PaymentHelper } from "@spt-aki/helpers/PaymentHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { QuestHelper } from "@spt-aki/helpers/QuestHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { IAddItemsDirectRequest } from "@spt-aki/models/eft/inventory/IAddItemsDirectRequest";
import { IInventoryBindRequestData } from "@spt-aki/models/eft/inventory/IInventoryBindRequestData";
import { IInventoryCreateMarkerRequestData } from "@spt-aki/models/eft/inventory/IInventoryCreateMarkerRequestData";
import { IInventoryDeleteMarkerRequestData } from "@spt-aki/models/eft/inventory/IInventoryDeleteMarkerRequestData";
import { IInventoryEditMarkerRequestData } from "@spt-aki/models/eft/inventory/IInventoryEditMarkerRequestData";
import { IInventoryExamineRequestData } from "@spt-aki/models/eft/inventory/IInventoryExamineRequestData";
import { IInventoryFoldRequestData } from "@spt-aki/models/eft/inventory/IInventoryFoldRequestData";
import { IInventoryMergeRequestData } from "@spt-aki/models/eft/inventory/IInventoryMergeRequestData";
import { IInventoryMoveRequestData } from "@spt-aki/models/eft/inventory/IInventoryMoveRequestData";
import { IInventoryReadEncyclopediaRequestData } from "@spt-aki/models/eft/inventory/IInventoryReadEncyclopediaRequestData";
import { IInventoryRemoveRequestData } from "@spt-aki/models/eft/inventory/IInventoryRemoveRequestData";
import { IInventorySortRequestData } from "@spt-aki/models/eft/inventory/IInventorySortRequestData";
import { IInventorySplitRequestData } from "@spt-aki/models/eft/inventory/IInventorySplitRequestData";
import { IInventorySwapRequestData } from "@spt-aki/models/eft/inventory/IInventorySwapRequestData";
import { IInventoryTagRequestData } from "@spt-aki/models/eft/inventory/IInventoryTagRequestData";
import { IInventoryToggleRequestData } from "@spt-aki/models/eft/inventory/IInventoryToggleRequestData";
import { IInventoryTransferRequestData } from "@spt-aki/models/eft/inventory/IInventoryTransferRequestData";
import { IOpenRandomLootContainerRequestData } from "@spt-aki/models/eft/inventory/IOpenRandomLootContainerRequestData";
import { IRedeemProfileRequestData } from "@spt-aki/models/eft/inventory/IRedeemProfileRequestData";
import { ISetFavoriteItems } from "@spt-aki/models/eft/inventory/ISetFavoriteItems";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IAkiProfile } from "@spt-aki/models/eft/profile/IAkiProfile";
import { BackendErrorCodes } from "@spt-aki/models/enums/BackendErrorCodes";
import { SkillTypes } from "@spt-aki/models/enums/SkillTypes";
import { Traders } from "@spt-aki/models/enums/Traders";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { FenceService } from "@spt-aki/services/FenceService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { PlayerService } from "@spt-aki/services/PlayerService";
import { RagfairOfferService } from "@spt-aki/services/RagfairOfferService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class InventoryController
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("HideoutHelper") protected hideoutHelper: HideoutHelper,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("LootGenerator") protected lootGenerator: LootGenerator,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("HttpResponseUtil") protected httpResponseUtil: HttpResponseUtil,
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
     * @param output Client response
     */
    public moveItem(
        pmcData: IPmcData,
        moveRequest: IInventoryMoveRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void
    {
        if (output.warnings.length > 0)
        {
            return;
        }

        // Changes made to result apply to character inventory
        const ownerInventoryItems = this.inventoryHelper.getOwnerInventoryItems(moveRequest, sessionID);
        if (ownerInventoryItems.sameInventory)
        {
            // Dont move items from trader to profile, this can happen when editing a traders preset weapons
            if (moveRequest.fromOwner?.type === "Trader" && !ownerInventoryItems.isMail)
            {
                this.appendTraderExploitErrorResponse(output);
                return;
            }

            // Check for item in inventory before allowing internal transfer
            const originalItemLocation = ownerInventoryItems.from.find((item) => item._id === moveRequest.item);
            if (!originalItemLocation)
            {
                // Internal item move but item never existed, possible dupe glitch
                this.appendTraderExploitErrorResponse(output);
                return;
            }

            const originalLocationSlotId = originalItemLocation?.slotId;

            const moveResult = this.inventoryHelper.moveItemInternal(pmcData, ownerInventoryItems.from, moveRequest);
            if (!moveResult.success)
            {
                this.httpResponseUtil.appendErrorToOutput(output, moveResult.errorMessage);
                return;
            }

            // Item is moving into or out of place of fame dogtag slot
            if (moveRequest.to.container.startsWith("dogtag") || originalLocationSlotId?.startsWith("dogtag"))
            {
                this.hideoutHelper.applyPlaceOfFameDogtagBonus(pmcData);
            }
        }
        else
        {
            this.inventoryHelper.moveItemToProfile(ownerInventoryItems.from, ownerInventoryItems.to, moveRequest);
        }
    }

    /**
     * Get a event router response with inventory trader message
     * @param output Item event router response
     * @returns Item event router response
     */
    protected appendTraderExploitErrorResponse(output: IItemEventRouterResponse): void
    {
        this.httpResponseUtil.appendErrorToOutput(
            output,
            this.localisationService.getText("inventory-edit_trader_item"),
            <BackendErrorCodes>228,
        );
    }

    /**
     * Handle Remove event
     * Implements functionality "Discard" from Main menu (Stash etc.)
     * Removes item from PMC Profile
     */
    public discardItem(
        pmcData: IPmcData,
        request: IInventoryRemoveRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void
    {
        if (request.fromOwner?.type === "Mail")
        {
            this.inventoryHelper.removeItemAndChildrenFromMailRewards(sessionID, request, output);

            return;
        }

        const profileToRemoveItemFrom = (!request.fromOwner || request.fromOwner.id === pmcData._id)
            ? pmcData
            : this.profileHelper.getFullProfile(sessionID).characters.scav;

        this.inventoryHelper.removeItem(profileToRemoveItemFrom, request.item, sessionID, output);
    }

    /**
     * Split Item
     * spliting 1 stack into 2
     * @param pmcData Player profile (unused, getOwnerInventoryItems() gets profile)
     * @param request Split request
     * @param sessionID Session/player id
     * @param output Client response
     * @returns IItemEventRouterResponse
     */
    public splitItem(
        pmcData: IPmcData,
        request: IInventorySplitRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse
    {
        // Changes made to result apply to character inventory
        const inventoryItems = this.inventoryHelper.getOwnerInventoryItems(request, sessionID);

        // Handle cartridge edge-case
        if (!request.container.location && request.container.container === "cartridges")
        {
            const matchingItems = inventoryItems.to.filter((x) => x.parentId === request.container.id);
            request.container.location = matchingItems.length; // Wrong location for first cartridge
        }

        // The item being merged has three possible sources: pmc, scav or mail, getOwnerInventoryItems() handles getting correct one
        const itemToSplit = inventoryItems.from.find((x) => x._id === request.splitItem);
        if (!itemToSplit)
        {
            const errorMessage = `Unable to split stack as source item: ${request.splitItem} cannot be found`;
            this.logger.error(errorMessage);

            return this.httpResponseUtil.appendErrorToOutput(output, errorMessage);
        }

        // Create new upd object that retains properties of original upd + new stack count size
        const updatedUpd = this.jsonUtil.clone(itemToSplit.upd);
        updatedUpd.StackObjectsCount = request.count;

        // Remove split item count from source stack
        itemToSplit.upd.StackObjectsCount -= request.count;

        // Inform client of change
        output.profileChanges[sessionID].items.new.push({
            _id: request.newItem,
            _tpl: itemToSplit._tpl,
            upd: updatedUpd,
        });

        // Update player inventory
        inventoryItems.to.push({
            _id: request.newItem,
            _tpl: itemToSplit._tpl,
            parentId: request.container.id,
            slotId: request.container.container,
            location: request.container.location,
            upd: updatedUpd,
        });

        return output;
    }

    /**
     * Fully merge 2 inventory stacks together into one stack (merging where both stacks remain is called 'transfer')
     * Deletes item from `body.item` and adding number of stacks into `body.with`
     * @param pmcData Player profile (unused, getOwnerInventoryItems() gets profile)
     * @param body Merge request
     * @param sessionID Player id
     * @param output Client response
     * @returns IItemEventRouterResponse
     */
    public mergeItem(
        pmcData: IPmcData,
        body: IInventoryMergeRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse
    {
        // Changes made to result apply to character inventory
        const inventoryItems = this.inventoryHelper.getOwnerInventoryItems(body, sessionID);

        // Get source item (can be from player or trader or mail)
        const sourceItem = inventoryItems.from.find((x) => x._id === body.item);
        if (!sourceItem)
        {
            const errorMessage = `Unable to merge stacks as source item: ${body.with} cannot be found`;
            this.logger.error(errorMessage);

            this.httpResponseUtil.appendErrorToOutput(output, errorMessage);

            return output;
        }

        // Get item being merged into
        const destinationItem = inventoryItems.to.find((x) => x._id === body.with);
        if (!destinationItem)
        {
            const errorMessage = `Unable to merge stacks as destination item: ${body.with} cannot be found`;
            this.logger.error(errorMessage);

            this.httpResponseUtil.appendErrorToOutput(output, errorMessage);

            return output;
        }

        if (!(destinationItem.upd?.StackObjectsCount))
        {
            // No stackcount on destination, add one
            destinationItem.upd = { StackObjectsCount: 1 };
        }

        if (!sourceItem.upd)
        {
            sourceItem.upd = { StackObjectsCount: 1 };
        }
        else if (!sourceItem.upd.StackObjectsCount)
        {
            // Items pulled out of raid can have no stackcount if the stack should be 1
            sourceItem.upd.StackObjectsCount = 1;
        }

        // Remove FiR status from destination stack when source stack has no FiR but destination does
        if (!sourceItem.upd.SpawnedInSession && destinationItem.upd.SpawnedInSession)
        {
            delete destinationItem.upd.SpawnedInSession;
        }

        destinationItem.upd.StackObjectsCount += sourceItem.upd.StackObjectsCount; // Add source stackcount to destination
        output.profileChanges[sessionID].items.del.push({ _id: sourceItem._id }); // Inform client source item being deleted

        const indexOfItemToRemove = inventoryItems.from.findIndex((x) => x._id === sourceItem._id);
        if (indexOfItemToRemove === -1)
        {
            const errorMessage = `Unable to find item: ${sourceItem._id} to remove from sender inventory`;
            this.logger.error(errorMessage);

            this.httpResponseUtil.appendErrorToOutput(output, errorMessage);

            return output;
        }
        inventoryItems.from.splice(indexOfItemToRemove, 1); // remove source item from 'from' inventory

        return output;
    }

    /**
     * TODO: Adds no data to output to send to client, is this by design?
     * Transfer items from one stack into another while keeping original stack
     * Used to take items from scav inventory into stash or to insert ammo into mags (shotgun ones) and reloading weapon by clicking "Reload"
     * @param pmcData Player profile
     * @param body Transfer request
     * @param sessionID Session id
     * @param output Client response
     * @returns IItemEventRouterResponse
     */
    public transferItem(
        pmcData: IPmcData,
        body: IInventoryTransferRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse
    {
        const inventoryItems = this.inventoryHelper.getOwnerInventoryItems(body, sessionID);
        const sourceItem = inventoryItems.from.find((item) => item._id == body.item);
        const destinationItem = inventoryItems.to.find((item) => item._id == body.with);

        if (sourceItem === null)
        {
            const errorMessage = `Unable to transfer stack, cannot find source: ${body.item}`;
            this.logger.error(errorMessage);

            this.httpResponseUtil.appendErrorToOutput(output, errorMessage);

            return output;
        }

        if (destinationItem === null)
        {
            const errorMessage = `Unable to transfer stack, cannot find destination: ${body.with} `;
            this.logger.error(errorMessage);

            this.httpResponseUtil.appendErrorToOutput(output, errorMessage);

            return output;
        }

        if (!sourceItem.upd)
        {
            sourceItem.upd = { StackObjectsCount: 1 };
        }

        const sourceStackCount = sourceItem.upd.StackObjectsCount;
        if (sourceStackCount > body.count)
        {
            // Source items stack count greater than new desired count
            sourceItem.upd.StackObjectsCount = sourceStackCount - body.count;
        }
        else
        {
            // Moving a full stack onto a smaller stack
            sourceItem.upd.StackObjectsCount = sourceStackCount - 1;
        }

        if (!destinationItem.upd)
        {
            destinationItem.upd = { StackObjectsCount: 1 };
        }
        const destinationStackCount = destinationItem.upd.StackObjectsCount;
        destinationItem.upd.StackObjectsCount = destinationStackCount + body.count;

        return output;
    }

    /**
     * Swap Item
     * its used for "reload" if you have weapon in hands and magazine is somewhere else in rig or backpack in equipment
     * Also used to swap items using quick selection on character screen
     */
    public swapItem(pmcData: IPmcData, request: IInventorySwapRequestData, sessionID: string): IItemEventRouterResponse
    {
        const itemOne = pmcData.Inventory.items.find((x) => x._id === request.item);
        if (!itemOne)
        {
            this.logger.error(`Unable to find item: ${request.item} to swap positions with: ${request.item2}`);
        }

        const itemTwo = pmcData.Inventory.items.find((x) => x._id === request.item2);
        if (!itemTwo)
        {
            this.logger.error(`Unable to find item: ${request.item2} to swap positions with: ${request.item}`);
        }

        // to.id is the parentid
        itemOne.parentId = request.to.id;

        // to.container is the slotid
        itemOne.slotId = request.to.container;

        // Request object has location data, add it in, otherwise remove existing location from object
        if (request.to.location)
        {
            itemOne.location = request.to.location;
        }
        else
        {
            delete itemOne.location;
        }

        itemTwo.parentId = request.to2.id;
        itemTwo.slotId = request.to2.container;
        if (request.to2.location)
        {
            itemTwo.location = request.to2.location;
        }
        else
        {
            delete itemTwo.location;
        }

        // Client already informed of inventory locations, nothing for us to do
        return this.eventOutputHolder.getOutput(sessionID);
    }

    /**
     * Handles folding of Weapons
     */
    public foldItem(pmcData: IPmcData, request: IInventoryFoldRequestData, sessionID: string): IItemEventRouterResponse
    {
        // May need to reassign to scav profile
        let playerData = pmcData;

        // We may be folding data on scav profile, get that profile instead
        if (request.fromOwner && request.fromOwner.type === "Profile" && request.fromOwner.id !== playerData._id)
        {
            playerData = this.profileHelper.getScavProfile(sessionID);
        }

        const itemToFold = playerData.Inventory.items.find((item) => item?._id === request.item);
        if (!itemToFold)
        {
            // Item not found
            this.logger.warning(`Unable to fold item: ${request.item}. Not found`);
            return { warnings: [], profileChanges: {} };
        }

        // Item may not have upd object
        if (!itemToFold.upd)
        {
            itemToFold.upd = {};
        }

        itemToFold.upd.Foldable = { Folded: request.value };

        return this.eventOutputHolder.getOutput(sessionID);
    }

    /**
     * Toggles "Toggleable" items like night vision goggles and face shields.
     * @param pmcData player profile
     * @param body Toggle request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public toggleItem(pmcData: IPmcData, body: IInventoryToggleRequestData, sessionID: string): IItemEventRouterResponse
    {
        // May need to reassign to scav profile
        let playerData = pmcData;

        // Fix for toggling items while on they're in the Scav inventory
        if (body.fromOwner && body.fromOwner.type === "Profile" && body.fromOwner.id !== playerData._id)
        {
            playerData = this.profileHelper.getScavProfile(sessionID);
        }

        const itemToToggle = playerData.Inventory.items.find((x) => x._id === body.item);
        if (itemToToggle)
        {
            if (!itemToToggle.upd)
            {
                this.logger.warning(
                    this.localisationService.getText("inventory-item_to_toggle_missing_upd", itemToToggle._id),
                );
                itemToToggle.upd = {};
            }

            itemToToggle.upd.Togglable = { On: body.value };

            return this.eventOutputHolder.getOutput(sessionID);
        }

        this.logger.warning(this.localisationService.getText("inventory-unable_to_toggle_item_not_found", body.item));

        return { warnings: [], profileChanges: {} };
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
        // TODO - replace with single .find() call
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

        return { warnings: [], profileChanges: {} };
    }

    /**
     * Bind an inventory item to the quick access menu at bottom of player screen
     * Handle bind event
     * @param pmcData Player profile
     * @param bindRequest Reqeust object
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public bindItem(pmcData: IPmcData, bindRequest: IInventoryBindRequestData, sessionID: string): void
    {
        // TODO - replace with single .find() call
        for (const index in pmcData.Inventory.fastPanel)
        {
            // Find item with existing item in it and remove existing binding, you cant have same item bound to more than 1 slot
            if (pmcData.Inventory.fastPanel[index] === bindRequest.item)
            {
                pmcData.Inventory.fastPanel[index] = "";

                break;
            }
        }

        // Create link between fast panel slot and requested item
        pmcData.Inventory.fastPanel[bindRequest.index] = bindRequest.item;
    }

    /**
     * Unbind an inventory item from quick access menu at bottom of player screen
     * Handle unbind event
     * @param pmcData Player profile
     * @param bindRequest Request object
     * @param sessionID Session id
     * @param output Client response
     */
    public unbindItem(
        pmcData: IPmcData,
        request: IInventoryBindRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void
    {
        // Remove kvp from requested fast panel index
        delete pmcData.Inventory.fastPanel[request.index];
    }

    /**
     * Handles examining an item
     * @param pmcData player profile
     * @param body request object
     * @param sessionID session id
     * @param output Client response
     * @returns response
     */
    public examineItem(
        pmcData: IPmcData,
        body: IInventoryExamineRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse
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
            const fullProfile = this.profileHelper.getFullProfile(sessionID);
            this.flagItemsAsInspectedAndRewardXp([itemId], fullProfile);
        }

        return output;
    }

    protected flagItemsAsInspectedAndRewardXp(itemTpls: string[], fullProfile: IAkiProfile): void
    {
        for (const itemTpl of itemTpls)
        {
            // item found
            const item = this.databaseServer.getTables().templates.items[itemTpl];
            if (!item)
            {
                this.logger.warning(`Unable to find item with id ${itemTpl}, skipping inspection`);
                return;
            }

            fullProfile.characters.pmc.Info.Experience += item._props.ExamineExperience;
            fullProfile.characters.pmc.Encyclopedia[itemTpl] = false;

            fullProfile.characters.scav.Info.Experience += item._props.ExamineExperience;
            fullProfile.characters.scav.Encyclopedia[itemTpl] = false;
        }

        // TODO: update this with correct calculation using values from globals json
        this.profileHelper.addSkillPointsToPlayer(
            fullProfile.characters.pmc,
            SkillTypes.INTELLECT,
            0.05 * itemTpls.length,
        );
    }

    /**
     * Get the tplid of an item from the examine request object
     * @param request Response request
     * @returns tplId
     */
    protected getExaminedItemTpl(request: IInventoryExamineRequestData): string
    {
        if (this.presetHelper.isPreset(request.item))
        {
            return this.presetHelper.getBaseItemTpl(request.item);
        }

        if (request.fromOwner.id === Traders.FENCE)
        {
            // Get tpl from fence assorts
            return this.fenceService.getRawFenceAssorts().items.find((x) => x._id === request.item)._tpl;
        }

        if (request.fromOwner.type === "Trader")
        {
            // Not fence
            // get tpl from trader assort
            return this.databaseServer.getTables().traders[request.fromOwner.id].assort.items.find((item) =>
                item._id === request.item
            )._tpl;
        }

        if (request.fromOwner.type === "RagFair")
        {
            // Try to get tplid from items.json first
            const item = this.itemHelper.getItem(request.item);
            if (item[0])
            {
                return item[1]._id;
            }

            // Try alternate way of getting offer if first approach fails
            let offer = this.ragfairOfferService.getOfferByOfferId(request.item);
            if (!offer)
            {
                offer = this.ragfairOfferService.getOfferByOfferId(request.fromOwner.id);
            }

            // Try find examine item inside offer items array
            const matchingItem = offer.items.find((offerItem) => offerItem._id === request.item);
            if (matchingItem)
            {
                return matchingItem._tpl;
            }

            // Unable to find item in database or ragfair
            throw new Error(this.localisationService.getText("inventory-unable_to_find_item", request.item));
        }
    }

    public readEncyclopedia(
        pmcData: IPmcData,
        body: IInventoryReadEncyclopediaRequestData,
        sessionID: string,
    ): IItemEventRouterResponse
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
     */
    public sortInventory(pmcData: IPmcData, request: IInventorySortRequestData, sessionID: string): void
    {
        for (const change of request.changedItems)
        {
            const inventoryItem = pmcData.Inventory.items.find((x) => x._id === change._id);
            if (!inventoryItem)
            {
                this.logger.error(
                    `Unable to find inventory item: ${change._id} to auto-sort, YOU MUST RELOAD YOUR GAME`,
                );

                continue;
            }

            inventoryItem.parentId = change.parentId;
            inventoryItem.slotId = change.slotId;
            if (change.location)
            {
                inventoryItem.location = change.location;
            }
            else
            {
                delete inventoryItem.location;
            }
        }
    }

    /**
     * Add note to a map
     * @param pmcData Player profile
     * @param request Add marker request
     * @param sessionID Session id
     * @param output Client response
     * @returns IItemEventRouterResponse
     */
    public createMapMarker(
        pmcData: IPmcData,
        request: IInventoryCreateMarkerRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void
    {
        // Get map from inventory
        const mapItem = pmcData.Inventory.items.find((i) => i._id === request.item);

        // add marker
        mapItem.upd.Map = mapItem.upd.Map || { Markers: [] };
        request.mapMarker.Note = this.sanitiseMapMarkerText(request.mapMarker.Note);
        mapItem.upd.Map.Markers.push(request.mapMarker);

        // sync with client
        output.profileChanges[sessionID].items.change.push(mapItem);
    }

    /**
     * Delete a map marker
     * @param pmcData Player profile
     * @param request Delete marker request
     * @param sessionID Session id
     * @param output Client response
     */
    public deleteMapMarker(
        pmcData: IPmcData,
        request: IInventoryDeleteMarkerRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void
    {
        // Get map from inventory
        const mapItem = pmcData.Inventory.items.find((i) => i._id === request.item);

        // remove marker
        const markers = mapItem.upd.Map.Markers.filter((marker) =>
        {
            return marker.X !== request.X && marker.Y !== request.Y;
        });
        mapItem.upd.Map.Markers = markers;

        // sync with client
        output.profileChanges[sessionID].items.change.push(mapItem);
    }

    /**
     * Edit an existing map marker
     * @param pmcData Player profile
     * @param request Edit marker request
     * @param sessionID Session id
     * @param output Client response
     */
    public editMapMarker(
        pmcData: IPmcData,
        request: IInventoryEditMarkerRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void
    {
        // Get map from inventory
        const mapItem = pmcData.Inventory.items.find((i) => i._id === request.item);

        // edit marker
        const indexOfExistingNote = mapItem.upd.Map.Markers.findIndex((m) => m.X === request.X && m.Y === request.Y);
        request.mapMarker.Note = this.sanitiseMapMarkerText(request.mapMarker.Note);
        mapItem.upd.Map.Markers[indexOfExistingNote] = request.mapMarker;

        // sync with client
        output.profileChanges[sessionID].items.change.push(mapItem);
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
     * Handle OpenRandomLootContainer event
     * Handle event fired when a container is unpacked (currently only the halloween pumpkin)
     * @param pmcData Profile data
     * @param body Open loot container request data
     * @param sessionID Session id
     * @param output Client response
     */
    public openRandomLootContainer(
        pmcData: IPmcData,
        body: IOpenRandomLootContainerRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void
    {
        /** Container player opened in their inventory */
        const openedItem = pmcData.Inventory.items.find((item) => item._id === body.item);
        const containerDetailsDb = this.itemHelper.getItem(openedItem._tpl);
        const isSealedWeaponBox = containerDetailsDb[1]._name.includes("event_container_airdrop");

        let foundInRaid = openedItem.upd?.SpawnedInSession;
        const rewards: Item[][] = [];
        if (isSealedWeaponBox)
        {
            const containerSettings = this.inventoryHelper.getInventoryConfig().sealedAirdropContainer;
            rewards.push(...this.lootGenerator.getSealedWeaponCaseLoot(containerSettings));

            if (containerSettings.foundInRaid)
            {
                foundInRaid = containerSettings.foundInRaid;
            }
        }
        else
        {
            const rewardContainerDetails = this.inventoryHelper.getRandomLootContainerRewardDetails(openedItem._tpl);
            rewards.push(...this.lootGenerator.getRandomLootContainerLoot(rewardContainerDetails));

            if (rewardContainerDetails.foundInRaid)
            {
                foundInRaid = rewardContainerDetails.foundInRaid;
            }
        }

        const addItemsRequest: IAddItemsDirectRequest = {
            itemsWithModsToAdd: rewards,
            foundInRaid: foundInRaid,
            callback: null,
            useSortingTable: true,
        };
        this.inventoryHelper.addItemsToStash(sessionID, addItemsRequest, pmcData, output);
        if (output.warnings.length > 0)
        {
            return;
        }

        // Find and delete opened container item from player inventory
        this.inventoryHelper.removeItem(pmcData, body.item, sessionID, output);
    }

    public redeemProfileReward(pmcData: IPmcData, request: IRedeemProfileRequestData, sessionId: string): void
    {
        const fullProfile = this.profileHelper.getFullProfile(sessionId);
        for (const event of request.events)
        {
            // Hard coded to `SYSTEM` for now
            // TODO: make this dynamic
            const dialog = fullProfile.dialogues["59e7125688a45068a6249071"];
            const mail = dialog.messages.find((x) => x._id === event.MessageId);
            const mailEvent = mail.profileChangeEvents.find((x) => x._id === event.EventId);

            switch (mailEvent.Type)
            {
                case "TraderSalesSum":
                    pmcData.TradersInfo[mailEvent.entity].salesSum = mailEvent.value;
                    this.logger.success(`Set trader ${mailEvent.entity}: Sales Sum to: ${mailEvent.value}`);
                    break;
                case "TraderStanding":
                    pmcData.TradersInfo[mailEvent.entity].standing = mailEvent.value;
                    this.logger.success(`Set trader ${mailEvent.entity}: Standing to: ${mailEvent.value}`);
                    break;
                case "ProfileLevel":
                    pmcData.Info.Experience = mailEvent.value;
                    pmcData.Info.Level = this.playerService.calculateLevel(pmcData);
                    this.logger.success(`Set profile xp to: ${mailEvent.value}`);
                    break;
                case "SkillPoints":
                {
                    const profileSkill = pmcData.Skills.Common.find((x) => x.Id === mailEvent.entity);
                    profileSkill.Progress = mailEvent.value;
                    this.logger.success(`Set profile skill: ${mailEvent.entity} to: ${mailEvent.value}`);
                    break;
                }
                case "ExamineAllItems":
                {
                    const itemsToInspect = this.itemHelper.getItems().filter((x) => x._type !== "Node");
                    this.flagItemsAsInspectedAndRewardXp(itemsToInspect.map((x) => x._id), fullProfile);
                    this.logger.success(`Flagged ${itemsToInspect.length} items as examined`);
                    break;
                }
                case "UnlockTrader":
                    pmcData.TradersInfo[mailEvent.entity].unlocked = true;
                    this.logger.success(`Trader ${mailEvent.entity} Unlocked`);
                    break;
                default:
                    this.logger.success(`Unhandled profile reward event: ${mailEvent.Type}`);
                    break;
            }
        }
    }

    public setFavoriteItem(pmcData: IPmcData, request: ISetFavoriteItems, sessionId: string): void
    {
        if (!pmcData.Inventory.favoriteItems)
        {
            pmcData.Inventory.favoriteItems = [];
        }

        for (const itemId of request.items)
        {
            // If id already exists in array, we're removing it
            const indexOfItemAlreadyFavorited = pmcData.Inventory.favoriteItems.findIndex((x) => x === itemId);
            if (indexOfItemAlreadyFavorited > -1)
            {
                pmcData.Inventory.favoriteItems.splice(indexOfItemAlreadyFavorited, 1);
            }
            else
            {
                pmcData.Inventory.favoriteItems.push(itemId);
            }
        }
    }
}
