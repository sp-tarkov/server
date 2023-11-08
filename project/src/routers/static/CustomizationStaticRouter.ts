import { inject, injectable } from "tsyringe";

import { CustomizationCallbacks } from "@spt-aki/callbacks/CustomizationCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class CustomizationStaticRouter extends StaticRouter {
    constructor(@inject("CustomizationCallbacks") protected customizationCallbacks: CustomizationCallbacks) {
        super([
            new RouteAction(
                "/client/trading/customization/storage",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.customizationCallbacks.getSuits(url, info, sessionID);
                }
            ),
        ]);
    }
}
