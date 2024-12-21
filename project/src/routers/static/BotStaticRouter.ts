import { BotCallbacks } from "@spt/callbacks/BotCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import type { IBotBase } from "@spt/models/eft/common/tables/IBotBase";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotStaticRouter extends StaticRouter {
    constructor(@inject("BotCallbacks") protected botCallbacks: BotCallbacks) {
        super([
            new RouteAction(
                "/client/game/bot/generate",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IBotBase[]>> => {
                    return this.botCallbacks.generateBots(url, info, sessionID);
                },
            ),
        ]);
    }
}
