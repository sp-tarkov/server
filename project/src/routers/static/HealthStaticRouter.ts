import { inject, injectable } from "tsyringe";

import { HealthCallbacks } from "@spt-aki/callbacks/HealthCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class HealthStaticRouter extends StaticRouter {
    constructor(@inject("HealthCallbacks") protected healthCallbacks: HealthCallbacks) {
        super([
            new RouteAction(
                "/player/health/sync",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.healthCallbacks.syncHealth(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/hideout/workout",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.healthCallbacks.handleWorkoutEffects(url, info, sessionID);
                }
            ),
        ]);
    }
}
