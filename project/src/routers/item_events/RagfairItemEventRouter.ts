import { RagfairCallbacks } from "@spt/callbacks/RagfairCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairItemEventRouter extends ItemEventRouterDefinition {
    constructor(@inject("RagfairCallbacks") protected ragfairCallbacks: RagfairCallbacks) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [
            new HandledRoute("RagFairAddOffer", false),
            new HandledRoute("RagFairRemoveOffer", false),
            new HandledRoute("RagFairRenewOffer", false),
        ];
    }

    public override async handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
    ): Promise<IItemEventRouterResponse> {
        switch (url) {
            case "RagFairAddOffer":
                return this.ragfairCallbacks.addOffer(pmcData, body, sessionID);
            case "RagFairRemoveOffer":
                return this.ragfairCallbacks.removeOffer(pmcData, body, sessionID);
            case "RagFairRenewOffer":
                return this.ragfairCallbacks.extendOffer(pmcData, body, sessionID);
        }
    }
}
