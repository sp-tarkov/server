import { inject, injectable } from "tsyringe";

import { BotCallbacks } from "@spt-aki/callbacks/BotCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";
import { Difficulties } from "@spt-aki/models/eft/common/tables/IBotType";

@injectable()
export class BotDynamicRouter extends DynamicRouter
{
    constructor(@inject("BotCallbacks") protected botCallbacks: BotCallbacks)
    {
        super([
            new RouteAction(
                "/singleplayer/settings/bot/limit/",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.botCallbacks.getBotLimit(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/difficulty/",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.botCallbacks.getBotDifficulty(url, info, sessionID);
                },
            ),
            new RouteAction(
<<<<<<< HEAD
                "/singleplayer/settings/bot/difficulties/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<Record<string, Difficulties>> =>
=======
                "/singleplayer/settings/bot/difficulties",
                (url: string, info: any, sessionID: string, output: string): any =>
>>>>>>> 3.9.0-DEV
                {
                    return this.botCallbacks.getAllBotDifficulties(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/maxCap",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.botCallbacks.getBotCap();
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/getBotBehaviours/",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.botCallbacks.getBotBehaviours();
                },
            ),
        ]);
    }
}
