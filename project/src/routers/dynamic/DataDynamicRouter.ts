import { inject, injectable } from "tsyringe";

import { DataCallbacks } from "@spt-aki/callbacks/DataCallbacks";
import { DynamicRouter, RouteAction } from "@spt-aki/di/Router";
import { IGetItemPricesResponse } from "@spt-aki/models/eft/game/IGetItemPricesResponse";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";

@injectable()
export class DataDynamicRouter extends DynamicRouter
{
    constructor(@inject("DataCallbacks") protected dataCallbacks: DataCallbacks)
    {
        super([
            new RouteAction(
                "/client/menu/locale/",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string>> =>
                {
                    return this.dataCallbacks.getLocalesMenu(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/locale/",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
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
                ): Promise<IGetBodyResponseData<IGetItemPricesResponse>> =>
                {
                    return this.dataCallbacks.getItemPrices(url, info, sessionID);
                },
            ),
        ]);
    }
}
