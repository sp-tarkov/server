import { inject, injectable } from "tsyringe";

import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";
import { ImageRouter } from "@spt-aki/routers/ImageRouter";

@injectable()
export class HttpDynamicRouter extends DynamicRouter {
    constructor(@inject("ImageRouter") protected imageRouter: ImageRouter) {
        super([
            new RouteAction(".jpg", (url: string, info: any, sessionID: string, output: string): any => {
                return this.imageRouter.getImage();
            }),
            new RouteAction(".png", (url: string, info: any, sessionID: string, output: string): any => {
                return this.imageRouter.getImage();
            }),
            new RouteAction(".ico", (url: string, info: any, sessionID: string, output: string): any => {
                return this.imageRouter.getImage();
            }),
        ]);
    }
}
