import { InventoryController } from "@spt/controllers/InventoryController";
import { QuestController } from "@spt/controllers/QuestController";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IInventoryBindRequestData } from "@spt/models/eft/inventory/IInventoryBindRequestData";
import { IInventoryCreateMarkerRequestData } from "@spt/models/eft/inventory/IInventoryCreateMarkerRequestData";
import { IInventoryDeleteMarkerRequestData } from "@spt/models/eft/inventory/IInventoryDeleteMarkerRequestData";
import { IInventoryEditMarkerRequestData } from "@spt/models/eft/inventory/IInventoryEditMarkerRequestData";
import { IInventoryExamineRequestData } from "@spt/models/eft/inventory/IInventoryExamineRequestData";
import { IInventoryFoldRequestData } from "@spt/models/eft/inventory/IInventoryFoldRequestData";
import { IInventoryMergeRequestData } from "@spt/models/eft/inventory/IInventoryMergeRequestData";
import { IInventoryMoveRequestData } from "@spt/models/eft/inventory/IInventoryMoveRequestData";
import { IInventoryReadEncyclopediaRequestData } from "@spt/models/eft/inventory/IInventoryReadEncyclopediaRequestData";
import { IInventoryRemoveRequestData } from "@spt/models/eft/inventory/IInventoryRemoveRequestData";
import { IInventorySortRequestData } from "@spt/models/eft/inventory/IInventorySortRequestData";
import { IInventorySplitRequestData } from "@spt/models/eft/inventory/IInventorySplitRequestData";
import { IInventorySwapRequestData } from "@spt/models/eft/inventory/IInventorySwapRequestData";
import { IInventoryTagRequestData } from "@spt/models/eft/inventory/IInventoryTagRequestData";
import { IInventoryToggleRequestData } from "@spt/models/eft/inventory/IInventoryToggleRequestData";
import { IInventoryTransferRequestData } from "@spt/models/eft/inventory/IInventoryTransferRequestData";
import { IOpenRandomLootContainerRequestData } from "@spt/models/eft/inventory/IOpenRandomLootContainerRequestData";
import { IPinOrLockItemRequest } from "@spt/models/eft/inventory/IPinOrLockItemRequest";
import { IRedeemProfileRequestData } from "@spt/models/eft/inventory/IRedeemProfileRequestData";
import { ISetFavoriteItems } from "@spt/models/eft/inventory/ISetFavoriteItems";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IFailQuestRequestData } from "@spt/models/eft/quests/IFailQuestRequestData";
import { inject, injectable } from "tsyringe";

@injectable()
export class InventoryCallbacks {
    constructor(
        @inject("InventoryController") protected inventoryController: InventoryController,
        @inject("QuestController") protected questController: QuestController,
    ) {}

    /** Handle client/game/profile/items/moving Move event */
    public moveItem(
        pmcData: IPmcData,
        body: IInventoryMoveRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.moveItem(pmcData, body, sessionID, output);

        return output;
    }

    /** Handle Remove event */
    public removeItem(
        pmcData: IPmcData,
        body: IInventoryRemoveRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.discardItem(pmcData, body, sessionID, output);

        return output;
    }

    /** Handle Split event */
    public splitItem(
        pmcData: IPmcData,
        body: IInventorySplitRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        return this.inventoryController.splitItem(pmcData, body, sessionID, output);
    }

    public mergeItem(
        pmcData: IPmcData,
        body: IInventoryMergeRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        return this.inventoryController.mergeItem(pmcData, body, sessionID, output);
    }

    public transferItem(
        pmcData: IPmcData,
        request: IInventoryTransferRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        return this.inventoryController.transferItem(pmcData, request, sessionID, output);
    }

    /** Handle Swap */
    // TODO: how is this triggered
    public swapItem(pmcData: IPmcData, body: IInventorySwapRequestData, sessionID: string): IItemEventRouterResponse {
        return this.inventoryController.swapItem(pmcData, body, sessionID);
    }

    public foldItem(pmcData: IPmcData, body: IInventoryFoldRequestData, sessionID: string): IItemEventRouterResponse {
        return this.inventoryController.foldItem(pmcData, body, sessionID);
    }

    public toggleItem(
        pmcData: IPmcData,
        body: IInventoryToggleRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.inventoryController.toggleItem(pmcData, body, sessionID);
    }

    public tagItem(pmcData: IPmcData, body: IInventoryTagRequestData, sessionID: string): IItemEventRouterResponse {
        return this.inventoryController.tagItem(pmcData, body, sessionID);
    }

    public bindItem(
        pmcData: IPmcData,
        body: IInventoryBindRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.bindItem(pmcData, body, sessionID);

        return output;
    }

    public unbindItem(
        pmcData: IPmcData,
        body: IInventoryBindRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.unbindItem(pmcData, body, sessionID, output);

        return output;
    }

    public examineItem(
        pmcData: IPmcData,
        body: IInventoryExamineRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        return this.inventoryController.examineItem(pmcData, body, sessionID, output);
    }

    /** Handle ReadEncyclopedia */
    public readEncyclopedia(
        pmcData: IPmcData,
        body: IInventoryReadEncyclopediaRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.inventoryController.readEncyclopedia(pmcData, body, sessionID);
    }

    /** Handle ApplyInventoryChanges */
    public sortInventory(
        pmcData: IPmcData,
        body: IInventorySortRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.sortInventory(pmcData, body, sessionID);

        return output;
    }

    public createMapMarker(
        pmcData: IPmcData,
        body: IInventoryCreateMarkerRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.createMapMarker(pmcData, body, sessionID, output);

        return output;
    }

    public deleteMapMarker(
        pmcData: IPmcData,
        body: IInventoryDeleteMarkerRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.deleteMapMarker(pmcData, body, sessionID, output);

        return output;
    }

    public editMapMarker(
        pmcData: IPmcData,
        body: IInventoryEditMarkerRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.editMapMarker(pmcData, body, sessionID, output);

        return output;
    }

    /** Handle OpenRandomLootContainer */
    public openRandomLootContainer(
        pmcData: IPmcData,
        body: IOpenRandomLootContainerRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.openRandomLootContainer(pmcData, body, sessionID, output);

        return output;
    }

    public redeemProfileReward(
        pmcData: IPmcData,
        body: IRedeemProfileRequestData,
        sessionId: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.redeemProfileReward(pmcData, body, sessionId);

        return output;
    }

    public setFavoriteItem(
        pmcData: IPmcData,
        body: ISetFavoriteItems,
        sessionId: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.inventoryController.setFavoriteItem(pmcData, body, sessionId);

        return output;
    }

    /**
     * TODO - MOVE INTO QUEST CODE
     * Handle game/profile/items/moving - QuestFail
     */
    public failQuest(
        pmcData: IPmcData,
        request: IFailQuestRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        return this.questController.failQuest(pmcData, request, sessionID, output);
    }

    public pinOrLock(
        pmcData: IPmcData,
        request: IPinOrLockItemRequest,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        return this.inventoryController.pinOrLock(pmcData, request, sessionID, output);
    }
}
