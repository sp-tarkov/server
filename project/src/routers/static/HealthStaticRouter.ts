import { HealthCallbacks } from "@spt/callbacks/HealthCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class HealthStaticRouter extends StaticRouter {
    constructor(@inject("HealthCallbacks") protected healthCallbacks: HealthCallbacks) {
        super([
            new RouteAction(
                "/client/hideout/workout",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string>> => {
                    return this.healthCallbacks.handleWorkoutEffects(url, info, sessionID);
                },
            ),
        ]);
    }
}
