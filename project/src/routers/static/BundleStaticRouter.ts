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
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.bundleCallbacks.getBundles(url, info, sessionID);
                },
            ),
        ]);
    }
}
