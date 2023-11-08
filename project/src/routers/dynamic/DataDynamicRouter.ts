import { inject, injectable } from "tsyringe";

import { DataCallbacks } from "@spt-aki/callbacks/DataCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";

@injectable()
export class DataDynamicRouter extends DynamicRouter {
    constructor(@inject("DataCallbacks") protected dataCallbacks: DataCallbacks) {
        super([
            new RouteAction(
                "/client/menu/locale/",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dataCallbacks.getLocalesMenu(url, info, sessionID);
                }
            ),
            new RouteAction("/client/locale/", (url: string, info: any, sessionID: string, output: string): any => {
                return this.dataCallbacks.getLocalesGlobal(url, info, sessionID);
            }),
            new RouteAction(
                "/client/items/prices/",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dataCallbacks.getItemPrices(url, info, sessionID);
                }
            ),
        ]);
    }
}
