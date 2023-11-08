import { inject, injectable } from "tsyringe";

import { BotCallbacks } from "@spt-aki/callbacks/BotCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class BotStaticRouter extends StaticRouter {
    constructor(@inject("BotCallbacks") protected botCallbacks: BotCallbacks) {
        super([
            new RouteAction(
                "/client/game/bot/generate",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.botCallbacks.generateBots(url, info, sessionID);
                }
            ),
        ]);
    }
}
