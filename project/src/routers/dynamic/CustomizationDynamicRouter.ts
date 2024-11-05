import { CustomizationCallbacks } from "@spt/callbacks/CustomizationCallbacks";
import { DynamicRouter, RouteAction } from "@spt/di/Router";
import { ISuit } from "@spt/models/eft/common/tables/ITrader";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class CustomizationDynamicRouter extends DynamicRouter {
    constructor(@inject("CustomizationCallbacks") protected customizationCallbacks: CustomizationCallbacks) {
        super([
            new RouteAction(
                "/client/trading/customization/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ISuit[]>> => {
                    return this.customizationCallbacks.getTraderSuits(url, info, sessionID);
                },
            ),
        ]);
    }
}
