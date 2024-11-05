import { HideoutCallbacks } from "@spt/callbacks/HideoutCallbacks";
import { InventoryCallbacks } from "@spt/callbacks/InventoryCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { ItemEventActions } from "@spt/models/enums/ItemEventActions";
import { inject, injectable } from "tsyringe";

@injectable()
export class InventoryItemEventRouter extends ItemEventRouterDefinition {
    constructor(
        @inject("InventoryCallbacks") protected inventoryCallbacks: InventoryCallbacks,
        @inject("HideoutCallbacks") protected hideoutCallbacks: HideoutCallbacks,
    ) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
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
            new HandledRoute(ItemEventActions.REDEEM_PROFILE_REWARD, false),
            new HandledRoute(ItemEventActions.SET_FAVORITE_ITEMS, false),
            new HandledRoute(ItemEventActions.QUEST_FAIL, false),
            new HandledRoute(ItemEventActions.PIN_LOCK, false),
        ];
    }

    public override async handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): Promise<IItemEventRouterResponse> {
        switch (url) {
            case ItemEventActions.MOVE:
                return this.inventoryCallbacks.moveItem(pmcData, body, sessionID, output);
            case ItemEventActions.REMOVE:
                return this.inventoryCallbacks.removeItem(pmcData, body, sessionID, output);
            case ItemEventActions.SPLIT:
                return this.inventoryCallbacks.splitItem(pmcData, body, sessionID, output);
            case ItemEventActions.MERGE:
                return this.inventoryCallbacks.mergeItem(pmcData, body, sessionID, output);
            case ItemEventActions.TRANSFER:
                return this.inventoryCallbacks.transferItem(pmcData, body, sessionID, output);
            case ItemEventActions.SWAP:
                return this.inventoryCallbacks.swapItem(pmcData, body, sessionID);
            case ItemEventActions.FOLD:
                return this.inventoryCallbacks.foldItem(pmcData, body, sessionID);
            case ItemEventActions.TOGGLE:
                return this.inventoryCallbacks.toggleItem(pmcData, body, sessionID);
            case ItemEventActions.TAG:
                return this.inventoryCallbacks.tagItem(pmcData, body, sessionID);
            case ItemEventActions.BIND:
                return this.inventoryCallbacks.bindItem(pmcData, body, sessionID, output);
            case ItemEventActions.UNBIND:
                return this.inventoryCallbacks.unbindItem(pmcData, body, sessionID, output);
            case ItemEventActions.EXAMINE:
                return this.inventoryCallbacks.examineItem(pmcData, body, sessionID, output);
            case ItemEventActions.READ_ENCYCLOPEDIA:
                return this.inventoryCallbacks.readEncyclopedia(pmcData, body, sessionID);
            case ItemEventActions.APPLY_INVENTORY_CHANGES:
                return this.inventoryCallbacks.sortInventory(pmcData, body, sessionID, output);
            case ItemEventActions.CREATE_MAP_MARKER:
                return this.inventoryCallbacks.createMapMarker(pmcData, body, sessionID, output);
            case ItemEventActions.DELETE_MAP_MARKER:
                return this.inventoryCallbacks.deleteMapMarker(pmcData, body, sessionID, output);
            case ItemEventActions.EDIT_MAP_MARKER:
                return this.inventoryCallbacks.editMapMarker(pmcData, body, sessionID, output);
            case ItemEventActions.OPEN_RANDOM_LOOT_CONTAINER:
                return this.inventoryCallbacks.openRandomLootContainer(pmcData, body, sessionID, output);
            case ItemEventActions.HIDEOUT_QTE_EVENT:
                return this.hideoutCallbacks.handleQTEEvent(pmcData, body, sessionID, output);
            case ItemEventActions.REDEEM_PROFILE_REWARD:
                return this.inventoryCallbacks.redeemProfileReward(pmcData, body, sessionID, output);
            case ItemEventActions.SET_FAVORITE_ITEMS:
                return this.inventoryCallbacks.setFavoriteItem(pmcData, body, sessionID, output);
            case ItemEventActions.QUEST_FAIL:
                return this.inventoryCallbacks.failQuest(pmcData, body, sessionID, output);
            case ItemEventActions.PIN_LOCK:
                return this.inventoryCallbacks.pinOrLock(pmcData, body, sessionID, output);
            default:
                throw new Error(`Unhandled event ${url} request: ${JSON.stringify(body)}`);
        }
    }
}
