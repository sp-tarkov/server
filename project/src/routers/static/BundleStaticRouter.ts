import { inject, injectable } from "tsyringe";

import { BundleCallbacks } from "@spt-aki/callbacks/BundleCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class BundleStaticRouter extends StaticRouter
{
    constructor(@inject("BundleCallbacks") protected bundleCallbacks: BundleCallbacks)
    {
        super([
            new RouteAction(
                "/singleplayer/bundles",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.bundleCallbacks.getBundles(url, info, sessionID);
                },
            ),
        ]);
    }
}
