import { inject, injectable } from "tsyringe";

import { RagfairCallbacks } from "@spt-aki/callbacks/RagfairCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt-aki/di/Router";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";

@injectable()
export class RagfairItemEventRouter extends ItemEventRouterDefinition
{
    constructor(@inject("RagfairCallbacks") protected ragfairCallbacks: RagfairCallbacks)
    {
        super();
    }

    public override getHandledRoutes(): HandledRoute[]
    {
        return [
            new HandledRoute("RagFairAddOffer", false),
            new HandledRoute("RagFairRemoveOffer", false),
            new HandledRoute("RagFairRenewOffer", false),
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
            case "RagFairAddOffer":
                return this.ragfairCallbacks.addOffer(pmcData, body, sessionID);
            case "RagFairRemoveOffer":
                return this.ragfairCallbacks.removeOffer(pmcData, body, sessionID);
            case "RagFairRenewOffer":
                return this.ragfairCallbacks.extendOffer(pmcData, body, sessionID);
        }
    }
}
