import { RagfairCallbacks } from "@spt/callbacks/RagfairCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import type { IGetItemPriceResult } from "@spt/models/eft/ragfair/IGetItemPriceResult";
import type { IGetOffersResult } from "@spt/models/eft/ragfair/IGetOffersResult";
import type { IRagfairOffer } from "@spt/models/eft/ragfair/IRagfairOffer";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairStaticRouter extends StaticRouter {
    constructor(@inject("RagfairCallbacks") protected ragfairCallbacks: RagfairCallbacks) {
        super([
            new RouteAction(
                "/client/ragfair/search",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetOffersResult>> => {
                    return this.ragfairCallbacks.search(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/ragfair/find",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetOffersResult>> => {
                    return this.ragfairCallbacks.search(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/ragfair/itemMarketPrice",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetItemPriceResult>> => {
                    return this.ragfairCallbacks.getMarketPrice(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/ragfair/offerfees",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.ragfairCallbacks.storePlayerOfferTaxAmount(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/reports/ragfair/send",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.ragfairCallbacks.sendReport(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/items/prices",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<Record<string, number>>> => {
                    return this.ragfairCallbacks.getFleaPrices(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/ragfair/offer/findbyid",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IRagfairOffer>> => {
                    return this.ragfairCallbacks.getFleaOfferById(url, info, sessionID);
                },
            ),
        ]);
    }
}
