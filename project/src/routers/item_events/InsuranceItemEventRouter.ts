import { inject, injectable } from "tsyringe";

import { InsuranceCallbacks } from "@spt-aki/callbacks/InsuranceCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt-aki/di/Router";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";

@injectable()
export class InsuranceItemEventRouter extends ItemEventRouterDefinition
{
    constructor(
        @inject("InsuranceCallbacks") protected insuranceCallbacks: InsuranceCallbacks, // TODO: delay required
    )
    {
        super();
    }

    public override getHandledRoutes(): HandledRoute[]
    {
        return [new HandledRoute("Insure", false)];
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
            case "Insure":
                return this.insuranceCallbacks.insure(pmcData, body, sessionID);
        }
    }
}
