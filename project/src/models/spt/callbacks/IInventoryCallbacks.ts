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
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";

export interface IInventoryCallbacks {
    moveItem(pmcData: IPmcData, body: IInventoryMoveRequestData, sessionID: string): IItemEventRouterResponse;
    removeItem(pmcData: IPmcData, body: IInventoryRemoveRequestData, sessionID: string): IItemEventRouterResponse;
    splitItem(pmcData: IPmcData, body: IInventorySplitRequestData, sessionID: string): IItemEventRouterResponse;
    mergeItem(pmcData: IPmcData, body: IInventoryMergeRequestData, sessionID: string): IItemEventRouterResponse;
    transferItem(pmcData: IPmcData, body: IInventoryTransferRequestData, sessionID: string): IItemEventRouterResponse;
    swapItem(pmcData: IPmcData, body: IInventorySwapRequestData, sessionID: string): IItemEventRouterResponse;
    foldItem(pmcData: IPmcData, body: IInventoryFoldRequestData, sessionID: string): IItemEventRouterResponse;
    toggleItem(pmcData: IPmcData, body: IInventoryToggleRequestData, sessionID: string): IItemEventRouterResponse;
    tagItem(pmcData: IPmcData, body: IInventoryTagRequestData, sessionID: string): IItemEventRouterResponse;
    bindItem(pmcData: IPmcData, body: IInventoryBindRequestData, sessionID: string): IItemEventRouterResponse;
    examineItem(pmcData: IPmcData, body: IInventoryExamineRequestData, sessionID: string): IItemEventRouterResponse;
    readEncyclopedia(
        pmcData: IPmcData,
        body: IInventoryReadEncyclopediaRequestData,
        sessionID: string,
    ): IItemEventRouterResponse;
    sortInventory(pmcData: IPmcData, body: IInventorySortRequestData, sessionID: string): IItemEventRouterResponse;
    createMapMarker(
        pmcData: IPmcData,
        body: IInventoryCreateMarkerRequestData,
        sessionID: string,
    ): IItemEventRouterResponse;
    deleteMapMarker(
        pmcData: IPmcData,
        body: IInventoryDeleteMarkerRequestData,
        sessionID: string,
    ): IItemEventRouterResponse;
    editMapMarker(
        pmcData: IPmcData,
        body: IInventoryEditMarkerRequestData,
        sessionID: string,
    ): IItemEventRouterResponse;
}
