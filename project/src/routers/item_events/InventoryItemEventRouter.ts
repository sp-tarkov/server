import { inject, injectable } from "tsyringe";

import { HideoutCallbacks } from "@spt-aki/callbacks/HideoutCallbacks";
import { InventoryCallbacks } from "@spt-aki/callbacks/InventoryCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt-aki/di/Router";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { ItemEventActions } from "@spt-aki/models/enums/ItemEventActions";

@injectable()
export class InventoryItemEventRouter extends ItemEventRouterDefinition
{
    constructor(
        @inject("InventoryCallbacks") protected inventoryCallbacks: InventoryCallbacks,
        @inject("HideoutCallbacks") protected hideoutCallbacks: HideoutCallbacks,
    )
    {
        super();
    }

    public override getHandledRoutes(): HandledRoute[]
    {
        return [
            new HandledRoute(ItemEventActions.MOVE, false),
            new HandledRoute(ItemEventActions.REMOVE, false),
            new HandledRoute(ItemEventActions.SPLIT, false),
            new HandledRoute(ItemEventActions.MERGE, false),
            new HandledRoute(ItemEventActions.TRANSFER, false),
            new HandledRoute(ItemEventActions.SWAP, false),
            new HandledRoute(ItemEventActions.FOLD, false),
            new HandledRoute(ItemEventActions.TOGGLE, false),
            new HandledRoute(ItemEventActions.TAG, false),
            new HandledRoute(ItemEventActions.BIND, false),
            new HandledRoute(ItemEventActions.UNBIND, false),
            new HandledRoute(ItemEventActions.EXAMINE, false),
            new HandledRoute(ItemEventActions.READ_ENCYCLOPEDIA, false),
            new HandledRoute(ItemEventActions.APPLY_INVENTORY_CHANGES, false),
            new HandledRoute(ItemEventActions.CREATE_MAP_MARKER, false),
            new HandledRoute(ItemEventActions.DELETE_MAP_MARKER, false),
            new HandledRoute(ItemEventActions.EDIT_MAP_MARKER, false),
            new HandledRoute(ItemEventActions.OPEN_RANDOM_LOOT_CONTAINER, false),
            new HandledRoute(ItemEventActions.HIDEOUT_QTE_EVENT, false),
        ];
    }

    public override handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
    ): IItemEventRouterResponse
    {
        switch (url)
        {
            case ItemEventActions.MOVE:
                return this.inventoryCallbacks.moveItem(pmcData, body, sessionID);
            case ItemEventActions.REMOVE:
                return this.inventoryCallbacks.removeItem(pmcData, body, sessionID);
            case ItemEventActions.SPLIT:
                return this.inventoryCallbacks.splitItem(pmcData, body, sessionID);
            case ItemEventActions.MERGE:
                return this.inventoryCallbacks.mergeItem(pmcData, body, sessionID);
            case ItemEventActions.TRANSFER:
                return this.inventoryCallbacks.transferItem(pmcData, body, sessionID);
            case ItemEventActions.SWAP:
                return this.inventoryCallbacks.swapItem(pmcData, body, sessionID);
            case ItemEventActions.FOLD:
                return this.inventoryCallbacks.foldItem(pmcData, body, sessionID);
            case ItemEventActions.TOGGLE:
                return this.inventoryCallbacks.toggleItem(pmcData, body, sessionID);
            case ItemEventActions.TAG:
                return this.inventoryCallbacks.tagItem(pmcData, body, sessionID);
            case ItemEventActions.BIND:
                return this.inventoryCallbacks.bindItem(pmcData, body, sessionID);
            case ItemEventActions.UNBIND:
                return this.inventoryCallbacks.unbindItem(pmcData, body, sessionID);
            case ItemEventActions.EXAMINE:
                return this.inventoryCallbacks.examineItem(pmcData, body, sessionID);
            case ItemEventActions.READ_ENCYCLOPEDIA:
                return this.inventoryCallbacks.readEncyclopedia(pmcData, body, sessionID);
            case ItemEventActions.APPLY_INVENTORY_CHANGES:
                return this.inventoryCallbacks.sortInventory(pmcData, body, sessionID);
            case ItemEventActions.CREATE_MAP_MARKER:
                return this.inventoryCallbacks.createMapMarker(pmcData, body, sessionID);
            case ItemEventActions.DELETE_MAP_MARKER:
                return this.inventoryCallbacks.deleteMapMarker(pmcData, body, sessionID);
            case ItemEventActions.EDIT_MAP_MARKER:
                return this.inventoryCallbacks.editMapMarker(pmcData, body, sessionID);
            case ItemEventActions.OPEN_RANDOM_LOOT_CONTAINER:
                return this.inventoryCallbacks.openRandomLootContainer(pmcData, body, sessionID);
            case ItemEventActions.HIDEOUT_QTE_EVENT:
                return this.hideoutCallbacks.handleQTEEvent(pmcData, body, sessionID);
            default:
                throw new Error(`Unhandled event ${url}`);
        }
    }
}
