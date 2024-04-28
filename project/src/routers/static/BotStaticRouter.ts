import { inject, injectable } from "tsyringe";

import { BotCallbacks } from "@spt-aki/callbacks/BotCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { IBotBase } from "@spt-aki/models/eft/common/tables/IBotBase";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";

@injectable()
export class BotStaticRouter extends StaticRouter
{
    constructor(@inject("BotCallbacks") protected botCallbacks: BotCallbacks)
    {
        super([
            new RouteAction(
                "/client/game/bot/generate",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IBotBase[]>> =>
                {
                    return this.botCallbacks.generateBots(url, info, sessionID);
                },
            ),
        ]);
    }
}
