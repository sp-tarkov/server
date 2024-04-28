import { inject, injectable } from "tsyringe";

import { CustomizationCallbacks } from "@spt-aki/callbacks/CustomizationCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";
import { ISuit } from "@spt-aki/models/eft/common/tables/ITrader";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";

@injectable()
export class CustomizationDynamicRouter extends DynamicRouter
{
    constructor(@inject("CustomizationCallbacks") protected customizationCallbacks: CustomizationCallbacks)
    {
        super([
            new RouteAction(
                "/client/trading/customization/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ISuit[]>> =>
                {
                    return this.customizationCallbacks.getTraderSuits(url, info, sessionID);
                },
            ),
        ]);
    }
}
