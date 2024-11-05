import { ItemEventCallbacks } from "@spt/callbacks/ItemEventCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class ItemEventStaticRouter extends StaticRouter {
    constructor(@inject("ItemEventCallbacks") protected itemEventCallbacks: ItemEventCallbacks) {
        super([
            new RouteAction(
                "/client/game/profile/items/moving",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IItemEventRouterResponse>> => {
                    return this.itemEventCallbacks.handleEvents(url, info, sessionID);
                },
            ),
        ]);
    }
}
