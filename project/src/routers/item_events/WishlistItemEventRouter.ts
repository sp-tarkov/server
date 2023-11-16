import { inject, injectable } from "tsyringe";

import { WishlistCallbacks } from "@spt-aki/callbacks/WishlistCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt-aki/di/Router";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";

@injectable()
export class WishlistItemEventRouter extends ItemEventRouterDefinition
{
    constructor(@inject("WishlistCallbacks") protected wishlistCallbacks: WishlistCallbacks)
    {
        super();
    }

    public override getHandledRoutes(): HandledRoute[]
    {
        return [new HandledRoute("AddToWishList", false), new HandledRoute("RemoveFromWishList", false)];
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
            case "AddToWishList":
                return this.wishlistCallbacks.addToWishlist(pmcData, body, sessionID);
            case "RemoveFromWishList":
                return this.wishlistCallbacks.removeFromWishlist(pmcData, body, sessionID);
        }
    }
}
