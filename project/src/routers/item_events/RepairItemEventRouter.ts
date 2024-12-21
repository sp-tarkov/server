import { RepairCallbacks } from "@spt/callbacks/RepairCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class RepairItemEventRouter extends ItemEventRouterDefinition {
    constructor(@inject("RepairCallbacks") protected repairCallbacks: RepairCallbacks) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [new HandledRoute("Repair", false), new HandledRoute("TraderRepair", false)];
    }

    public override async handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
    ): Promise<IItemEventRouterResponse> {
        switch (url) {
            case "Repair":
                return this.repairCallbacks.repair(pmcData, body, sessionID);
            case "TraderRepair":
                return this.repairCallbacks.traderRepair(pmcData, body, sessionID);
        }
    }
}
