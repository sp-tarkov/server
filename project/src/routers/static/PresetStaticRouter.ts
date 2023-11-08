import { inject, injectable } from "tsyringe";

import { PresetBuildCallbacks } from "@spt-aki/callbacks/PresetBuildCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class PresetStaticRouter extends StaticRouter {
    constructor(@inject("PresetBuildCallbacks") protected presetCallbacks: PresetBuildCallbacks) {
        super([
            new RouteAction(
                "/client/handbook/builds/my/list",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.presetCallbacks.getHandbookUserlist(url, info, sessionID);
                }
            ),
        ]);
    }
}
