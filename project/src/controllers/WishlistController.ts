import { inject, injectable } from "tsyringe";

import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IWishlistActionData } from "@spt-aki/models/eft/wishlist/IWishlistActionData";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";

@injectable()
export class WishlistController
{
    constructor(
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder
    )
    { }

    /** Handle AddToWishList */
    public addToWishList(pmcData: IPmcData, body: IWishlistActionData, sessionID: string): IItemEventRouterResponse
    {
        for (const item in pmcData.WishList)
        {
            // don't add the item
            if (pmcData.WishList[item] === body.templateId)
            {
                return this.eventOutputHolder.getOutput(sessionID);
            }
        }

        // add the item to the wishlist
        pmcData.WishList.push(body.templateId);
        return this.eventOutputHolder.getOutput(sessionID);
    }

    /** Handle RemoveFromWishList event */
    public removeFromWishList(pmcData: IPmcData, body: IWishlistActionData, sessionID: string): IItemEventRouterResponse
    {
        for (let i = 0; i < pmcData.WishList.length; i++)
        {
            if (pmcData.WishList[i] === body.templateId)
            {
                pmcData.WishList.splice(i, 1);
            }
        }

        return this.eventOutputHolder.getOutput(sessionID);
    }
}