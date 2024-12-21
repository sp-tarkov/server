import type { InventoryController } from "@spt/controllers/InventoryController";
import { QuestController } from "@spt/controllers/QuestController";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IInventoryBindRequestData } from "@spt/models/eft/inventory/IInventoryBindRequestData";
import type { IInventoryCreateMarkerRequestData } from "@spt/models/eft/inventory/IInventoryCreateMarkerRequestData";
import type { IInventoryDeleteMarkerRequestData } from "@spt/models/eft/inventory/IInventoryDeleteMarkerRequestData";
import type { IInventoryEditMarkerRequestData } from "@spt/models/eft/inventory/IInventoryEditMarkerRequestData";
import type { IInventoryExamineRequestData } from "@spt/models/eft/inventory/IInventoryExamineRequestData";
import type { IInventoryFoldRequestData } from "@spt/models/eft/inventory/IInventoryFoldRequestData";
import type { IInventoryMergeRequestData } from "@spt/models/eft/inventory/IInventoryMergeRequestData";
import type { IInventoryMoveRequestData } from "@spt/models/eft/inventory/IInventoryMoveRequestData";
import type { IInventoryReadEncyclopediaRequestData } from "@spt/models/eft/inventory/IInventoryReadEncyclopediaRequestData";
import type { IInventoryRemoveRequestData } from "@spt/models/eft/inventory/IInventoryRemoveRequestData";
import type { IInventorySortRequestData } from "@spt/models/eft/inventory/IInventorySortRequestData";
import type { IInventorySplitRequestData } from "@spt/models/eft/inventory/IInventorySplitRequestData";
import type { IInventorySwapRequestData } from "@spt/models/eft/inventory/IInventorySwapRequestData";
import type { IInventoryTagRequestData } from "@spt/models/eft/inventory/IInventoryTagRequestData";
import type { IInventoryToggleRequestData } from "@spt/models/eft/inventory/IInventoryToggleRequestData";
import type { IInventoryTransferRequestData } from "@spt/models/eft/inventory/IInventoryTransferRequestData";
import type { IOpenRandomLootContainerRequestData } from "@spt/models/eft/inventory/IOpenRandomLootContainerRequestData";
import type { IPinOrLockItemRequest } from "@spt/models/eft/inventory/IPinOrLockItemRequest";
import type { IRedeemProfileRequestData } from "@spt/models/eft/inventory/IRedeemProfileRequestData";
import type { ISetFavoriteItems } from "@spt/models/eft/inventory/ISetFavoriteItems";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import type { IFailQuestRequestData } from "@spt/models/eft/quests/IFailQuestRequestData";
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
