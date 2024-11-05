import { BundleCallbacks } from "@spt/callbacks/BundleCallbacks";
import { DynamicRouter, RouteAction } from "@spt/di/Router";
import { inject, injectable } from "tsyringe";

@injectable()
export class BundleDynamicRouter extends DynamicRouter {
    constructor(@inject("BundleCallbacks") protected bundleCallbacks: BundleCallbacks) {
        super([
            new RouteAction("/files/bundle", (url: string, info: any, sessionID: string, output: string): any => {
                return this.bundleCallbacks.getBundle(url, info, sessionID);
            }),
        ]);
    }
}
