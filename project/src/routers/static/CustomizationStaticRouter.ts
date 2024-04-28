import { inject, injectable } from "tsyringe";

import { CustomizationCallbacks } from "@spt-aki/callbacks/CustomizationCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { IGetSuitsResponse } from "@spt-aki/models/eft/customization/IGetSuitsResponse";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";

@injectable()
export class CustomizationStaticRouter extends StaticRouter
{
    constructor(@inject("CustomizationCallbacks") protected customizationCallbacks: CustomizationCallbacks)
    {
        super([
            new RouteAction(
                "/client/trading/customization/storage",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetSuitsResponse>> =>
                {
                    return this.customizationCallbacks.getSuits(url, info, sessionID);
                },
            ),
        ]);
    }
}
