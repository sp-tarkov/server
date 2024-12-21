import type { InraidCallbacks } from "@spt/callbacks/InraidCallbacks";
import { DynamicRouter, RouteAction } from "@spt/di/Router";
import type { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class InraidDynamicRouter extends DynamicRouter {
    constructor(@inject("InraidCallbacks") protected inraidCallbacks: InraidCallbacks) {
        super([
            new RouteAction(
                "/client/location/getLocalloot",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.inraidCallbacks.registerPlayer(url, info, sessionID);
                },
            ),
        ]);
    }

    public override getTopLevelRoute(): string {
        return "spt-name";
    }
}
