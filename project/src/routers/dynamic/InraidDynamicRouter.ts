import { inject, injectable } from "tsyringe";

import { InraidCallbacks } from "@spt-aki/callbacks/InraidCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";

@injectable()
export class InraidDynamicRouter extends DynamicRouter {
    constructor(@inject("InraidCallbacks") protected inraidCallbacks: InraidCallbacks) {
        super([
            new RouteAction(
                "/client/location/getLocalloot",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.inraidCallbacks.registerPlayer(url, info, sessionID);
                }
            ),
        ]);
    }

    public override getTopLevelRoute(): string {
        return "aki-name";
    }
}
