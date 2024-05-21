import { inject, injectable } from "tsyringe";
import { WishlistController } from "@spt/controllers/WishlistController";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IWishlistActionData } from "@spt/models/eft/wishlist/IWishlistActionData";

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
    public removeFromWishlist(
        pmcData: IPmcData,
        body: IWishlistActionData,
        sessionID: string,
    ): IItemEventRouterResponse
    {
        return this.wishlistController.removeFromWishList(pmcData, body, sessionID);
    }
}
