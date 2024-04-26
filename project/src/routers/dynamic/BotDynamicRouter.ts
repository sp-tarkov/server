import { inject, injectable } from "tsyringe";

import { BotCallbacks } from "@spt-aki/callbacks/BotCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";

@injectable()
export class BotDynamicRouter extends DynamicRouter
{
    constructor(@inject("BotCallbacks") protected botCallbacks: BotCallbacks)
    {
        super([
            new RouteAction(
                "/singleplayer/settings/bot/limit/",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.botCallbacks.getBotLimit(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/difficulty/",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.botCallbacks.getBotDifficulty(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/difficulties",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.botCallbacks.getAllBotDifficulties(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/maxCap",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.botCallbacks.getBotCap();
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/getBotBehaviours/",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.botCallbacks.getBotBehaviours();
                },
            ),
        ]);
    }
}
