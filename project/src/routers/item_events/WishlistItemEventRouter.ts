import { WishlistCallbacks } from "@spt/callbacks/WishlistCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class WishlistItemEventRouter extends ItemEventRouterDefinition {
    constructor(@inject("WishlistCallbacks") protected wishlistCallbacks: WishlistCallbacks) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [
            new HandledRoute("AddToWishList", false),
            new HandledRoute("RemoveFromWishList", false),
            new HandledRoute("ChangeWishlistItemCategory", false),
        ];
    }

    public override async handleItemEvent(
        url: string,
        pmcData: IPmcData,
        request: any,
        sessionID: string,
    ): Promise<IItemEventRouterResponse> {
        switch (url) {
            case "AddToWishList":
                return this.wishlistCallbacks.addToWishlist(pmcData, request, sessionID);
            case "RemoveFromWishList":
                return this.wishlistCallbacks.removeFromWishlist(pmcData, request, sessionID);
            case "ChangeWishlistItemCategory":
                return this.wishlistCallbacks.changeWishlistItemCategory(pmcData, request, sessionID);
        }
    }
}
