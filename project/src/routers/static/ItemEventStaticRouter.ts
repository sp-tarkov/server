import { inject, injectable } from "tsyringe";

import { ItemEventCallbacks } from "@spt-aki/callbacks/ItemEventCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class ItemEventStaticRouter extends StaticRouter 
{
    constructor(
        @inject("ItemEventCallbacks") protected itemEventCallbacks: ItemEventCallbacks
    ) 
    {
        super(
            [
                new RouteAction(
                    "/client/game/profile/items/moving",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.itemEventCallbacks.handleEvents(url, info, sessionID);
                    }
                )
            ]
        );
    }
}