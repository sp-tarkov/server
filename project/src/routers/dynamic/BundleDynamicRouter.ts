import { inject, injectable } from "tsyringe";

import { BundleCallbacks } from "@spt-aki/callbacks/BundleCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";

@injectable()
export class BundleDynamicRouter extends DynamicRouter {
    constructor(@inject("BundleCallbacks") protected bundleCallbacks: BundleCallbacks) {
        super([
            new RouteAction(
                ".bundle",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.bundleCallbacks.getBundle(url, info, sessionID);
                }
            ),
        ]);
    }
}
