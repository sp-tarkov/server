import { inject, injectable } from "tsyringe";

import { WishlistController } from "@spt-aki/controllers/WishlistController";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IWishlistActionData } from "@spt-aki/models/eft/wishlist/IWishlistActionData";

@injectable()
export class WishlistCallbacks
{
    constructor(@inject("WishlistController") protected wishlistController: WishlistController)
    {}

    /** Handle AddToWishList event */
    public addToWishlist(pmcData: IPmcData, body: IWishlistActionData, sessionID: string): IItemEventRouterResponse
    {
        return this.wishlistController.addToWishList(pmcData, body, sessionID);
    }

    /** Handle RemoveFromWishList event */
    public removeFromWishlist(pmcData: IPmcData, body: IWishlistActionData, sessionID: string): IItemEventRouterResponse
    {
        return this.wishlistController.removeFromWishList(pmcData, body, sessionID);
    }
}
