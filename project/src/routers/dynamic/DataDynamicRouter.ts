import { DataCallbacks } from "@spt/callbacks/DataCallbacks";
import { DynamicRouter, RouteAction } from "@spt/di/Router";
import type { IGetItemPricesResponse } from "@spt/models/eft/game/IGetItemPricesResponse";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class DataDynamicRouter extends DynamicRouter {
    constructor(@inject("DataCallbacks") protected dataCallbacks: DataCallbacks) {
        super([
            new RouteAction(
                "/client/menu/locale/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string>> => {
                    return this.dataCallbacks.getLocalesMenu(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/locale/",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.dataCallbacks.getLocalesGlobal(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/items/prices/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetItemPricesResponse>> => {
                    return this.dataCallbacks.getItemPrices(url, info, sessionID);
                },
            ),
        ]);
    }
}
