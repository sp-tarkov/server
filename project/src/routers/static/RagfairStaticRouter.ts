import { inject, injectable } from "tsyringe";

import { RagfairCallbacks } from "@spt-aki/callbacks/RagfairCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class RagfairStaticRouter extends StaticRouter
{
    constructor(@inject("RagfairCallbacks") protected ragfairCallbacks: RagfairCallbacks)
    {
        super([
            new RouteAction(
                "/client/ragfair/search",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.ragfairCallbacks.search(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/ragfair/find",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.ragfairCallbacks.search(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/ragfair/itemMarketPrice",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.ragfairCallbacks.getMarketPrice(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/ragfair/offerfees",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.ragfairCallbacks.storePlayerOfferTaxAmount(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/reports/ragfair/send",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.ragfairCallbacks.sendReport(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/items/prices",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.ragfairCallbacks.getFleaPrices(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/ragfair/offer/findbyid",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.ragfairCallbacks.getFleaOfferById(url, info, sessionID);
                },
            ),
        ]);
    }
}
