import { CustomizationCallbacks } from "@spt/callbacks/CustomizationCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IGetSuitsResponse } from "@spt/models/eft/customization/IGetSuitsResponse";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class CustomizationStaticRouter extends StaticRouter {
    constructor(@inject("CustomizationCallbacks") protected customizationCallbacks: CustomizationCallbacks) {
        super([
            new RouteAction(
                "/client/trading/customization/storage",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetSuitsResponse>> => {
                    return this.customizationCallbacks.getSuits(url, info, sessionID);
                },
            ),
        ]);
    }
}
