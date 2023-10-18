import { inject, injectable } from "tsyringe";

import { CustomizationCallbacks } from "@spt-aki/callbacks/CustomizationCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";

@injectable()
export class CustomizationDynamicRouter extends DynamicRouter 
{
    constructor(
        @inject("CustomizationCallbacks") protected customizationCallbacks: CustomizationCallbacks
    ) 
    {
        super(
            [
                new RouteAction(
                    "/client/trading/customization/",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.customizationCallbacks.getTraderSuits(url, info, sessionID);
                    }
                )

            ]
        );
    }
}