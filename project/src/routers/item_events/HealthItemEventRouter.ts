import { inject, injectable } from "tsyringe";

import { HealthCallbacks } from "@spt-aki/callbacks/HealthCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt-aki/di/Router";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";

@injectable()
export class HealthItemEventRouter extends ItemEventRouterDefinition
{
    constructor(
        @inject("HealthCallbacks") protected healthCallbacks: HealthCallbacks, // TODO: delay required
    )
    {
        super();
    }

    public override getHandledRoutes(): HandledRoute[]
    {
        return [
            new HandledRoute("Eat", false),
            new HandledRoute("Heal", false),
            new HandledRoute("RestoreHealth", false),
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
            case "Eat":
                return this.healthCallbacks.offraidEat(pmcData, body, sessionID);
            case "Heal":
                return this.healthCallbacks.offraidHeal(pmcData, body, sessionID);
            case "RestoreHealth":
                return this.healthCallbacks.healthTreatment(pmcData, body, sessionID);
        }
    }
}
