import { BotCallbacks } from "@spt/callbacks/BotCallbacks";
import { DynamicRouter, RouteAction } from "@spt/di/Router";
import { IDifficulties } from "@spt/models/eft/common/tables/IBotType";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotDynamicRouter extends DynamicRouter {
    constructor(@inject("BotCallbacks") protected botCallbacks: BotCallbacks) {
        super([
            new RouteAction(
                "/singleplayer/settings/bot/limit/",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.botCallbacks.getBotLimit(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/difficulty/",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.botCallbacks.getBotDifficulty(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/difficulties",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<Record<string, IDifficulties>> => {
                    return this.botCallbacks.getAllBotDifficulties(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/maxCap",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.botCallbacks.getBotCap(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/bot/getBotBehaviours/",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.botCallbacks.getBotBehaviours();
                },
            ),
        ]);
    }
}
