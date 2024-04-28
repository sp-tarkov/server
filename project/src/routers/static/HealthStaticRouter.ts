import { inject, injectable } from "tsyringe";

import { HealthCallbacks } from "@spt-aki/callbacks/HealthCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";

@injectable()
export class HealthStaticRouter extends StaticRouter
{
    constructor(@inject("HealthCallbacks") protected healthCallbacks: HealthCallbacks)
    {
        super([
            new RouteAction(
                "/player/health/sync",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string>> =>
                {
                    return this.healthCallbacks.syncHealth(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/workout",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string>> =>
                {
                    return this.healthCallbacks.handleWorkoutEffects(url, info, sessionID);
                },
            ),
        ]);
    }
}
