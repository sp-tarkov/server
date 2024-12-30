import { CustomizationCallbacks } from "@spt/callbacks/CustomizationCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class CustomizationItemEventRouter extends ItemEventRouterDefinition {
    constructor(
        @inject("CustomizationCallbacks") protected customizationCallbacks: CustomizationCallbacks, // TODO: delay required
    ) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [new HandledRoute("CustomizationBuy", false), new HandledRoute("CustomizationSet", false)];
    }

    public override async handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
    ): Promise<IItemEventRouterResponse> {
        switch (url) {
            case "CustomizationBuy":
                return this.customizationCallbacks.buyClothing(pmcData, body, sessionID);
            case "CustomizationSet":
                return this.customizationCallbacks.setClothing(pmcData, body, sessionID);
        }
    }
}
