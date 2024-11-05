import { WishlistController } from "@spt/controllers/WishlistController";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IAddToWishlistRequest } from "@spt/models/eft/wishlist/IAddToWishlistRequest";
import { IChangeWishlistItemCategoryRequest } from "@spt/models/eft/wishlist/IChangeWishlistItemCategoryRequest";
import { IRemoveFromWishlistRequest } from "@spt/models/eft/wishlist/IRemoveFromWishlistRequest";
import { inject, injectable } from "tsyringe";

@injectable()
export class WishlistCallbacks {
    constructor(@inject("WishlistController") protected wishlistController: WishlistController) {}

    /** Handle AddToWishList event */
    public addToWishlist(
        pmcData: IPmcData,
        request: IAddToWishlistRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.wishlistController.addToWishList(pmcData, request, sessionID);
    }

    /** Handle RemoveFromWishList event */
    public removeFromWishlist(
        pmcData: IPmcData,
        request: IRemoveFromWishlistRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.wishlistController.removeFromWishList(pmcData, request, sessionID);
    }

    /** Handle ChangeWishlistItemCategory */
    changeWishlistItemCategory(
        pmcData: IPmcData,
        request: IChangeWishlistItemCategoryRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.wishlistController.changeWishlistItemCategory(pmcData, request, sessionID);
    }
}
