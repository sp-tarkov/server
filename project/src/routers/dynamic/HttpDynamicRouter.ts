import { DynamicRouter, RouteAction } from "@spt/di/Router";
import { ImageRouter } from "@spt/routers/ImageRouter";
import { inject, injectable } from "tsyringe";

@injectable()
export class HttpDynamicRouter extends DynamicRouter {
    constructor(@inject("ImageRouter") protected imageRouter: ImageRouter) {
        super([
            new RouteAction(
                ".jpg",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.imageRouter.getImage();
                },
            ),
            new RouteAction(
                ".png",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.imageRouter.getImage();
                },
            ),
            new RouteAction(
                ".ico",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.imageRouter.getImage();
                },
            ),
        ]);
    }
}
