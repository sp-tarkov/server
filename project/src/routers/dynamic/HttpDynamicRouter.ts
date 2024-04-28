import { inject, injectable } from "tsyringe";

import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";
import { ImageRouter } from "@spt-aki/routers/ImageRouter";

@injectable()
export class HttpDynamicRouter extends DynamicRouter
{
    constructor(@inject("ImageRouter") protected imageRouter: ImageRouter)
    {
        super([
            new RouteAction(
                ".jpg",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.imageRouter.getImage();
                },
            ),
            new RouteAction(
                ".png",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.imageRouter.getImage();
                },
            ),
            new RouteAction(
                ".ico",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.imageRouter.getImage();
                },
            ),
        ]);
    }
}
