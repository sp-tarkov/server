import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IAddToWishlistRequest } from "@spt/models/eft/wishlist/IAddToWishlistRequest";
import { IChangeWishlistItemCategoryRequest } from "@spt/models/eft/wishlist/IChangeWishlistItemCategoryRequest";
import { IRemoveFromWishlistRequest } from "@spt/models/eft/wishlist/IRemoveFromWishlistRequest";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { inject, injectable } from "tsyringe";

@injectable()
export class WishlistController {
    constructor(@inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder) {}

    /** Handle AddToWishList */
    public addToWishList(
        pmcData: IPmcData,
        request: IAddToWishlistRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        for (const itemId of Object.keys(request.items)) {
            pmcData.WishList[itemId] = request.items[itemId];
        }

        return this.eventOutputHolder.getOutput(sessionID);
    }

    /** Handle RemoveFromWishList event */
    public removeFromWishList(
        pmcData: IPmcData,
        request: IRemoveFromWishlistRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        for (const itemId of request.items) {
            delete pmcData.WishList[itemId];
        }

        return this.eventOutputHolder.getOutput(sessionID);
    }

    /** Handle changeWishlistItemCategory event */
    public changeWishlistItemCategory(
        pmcData: IPmcData,
        request: IChangeWishlistItemCategoryRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        pmcData.WishList[request.item] = request.category;

        return this.eventOutputHolder.getOutput(sessionID);
    }
}
