import { InsuranceCallbacks } from "@spt/callbacks/InsuranceCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class InsuranceItemEventRouter extends ItemEventRouterDefinition {
    constructor(
        @inject("InsuranceCallbacks") protected insuranceCallbacks: InsuranceCallbacks, // TODO: delay required
    ) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [new HandledRoute("Insure", false)];
    }

    public override async handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
    ): Promise<IItemEventRouterResponse> {
        switch (url) {
            case "Insure":
                return this.insuranceCallbacks.insure(pmcData, body, sessionID);
        }
    }
}
