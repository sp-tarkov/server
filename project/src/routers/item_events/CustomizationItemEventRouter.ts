import { inject, injectable } from "tsyringe";

import { CustomizationCallbacks } from "@spt-aki/callbacks/CustomizationCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt-aki/di/Router";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";

@injectable()
export class CustomizationItemEventRouter extends ItemEventRouterDefinition
{
    constructor(
        @inject("CustomizationCallbacks") protected customizationCallbacks: CustomizationCallbacks, // TODO: delay required
    )
    {
        super();
    }

    public override getHandledRoutes(): HandledRoute[]
    {
        return [new HandledRoute("CustomizationWear", false), new HandledRoute("CustomizationBuy", false)];
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
            case "CustomizationWear":
                return this.customizationCallbacks.wearClothing(pmcData, body, sessionID);
            case "CustomizationBuy":
                return this.customizationCallbacks.buyClothing(pmcData, body, sessionID);
        }
    }
}
