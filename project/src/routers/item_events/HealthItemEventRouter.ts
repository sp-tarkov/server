import { HealthCallbacks } from "@spt/callbacks/HealthCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class HealthItemEventRouter extends ItemEventRouterDefinition {
    constructor(
        @inject("HealthCallbacks") protected healthCallbacks: HealthCallbacks, // TODO: delay required
    ) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [
            new HandledRoute("Eat", false),
            new HandledRoute("Heal", false),
            new HandledRoute("RestoreHealth", false),
        ];
    }

    public override async handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
    ): Promise<IItemEventRouterResponse> {
        switch (url) {
            case "Eat":
                return this.healthCallbacks.offraidEat(pmcData, body, sessionID);
            case "Heal":
                return this.healthCallbacks.offraidHeal(pmcData, body, sessionID);
            case "RestoreHealth":
                return this.healthCallbacks.healthTreatment(pmcData, body, sessionID);
        }
    }
}
