import { LocationCallbacks } from "@spt/callbacks/LocationCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import type { ILocationsGenerateAllResponse } from "@spt/models/eft/common/ILocationsSourceDestinationBase";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { IGetAirdropLootResponse } from "@spt/models/eft/location/IGetAirdropLootResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class LocationStaticRouter extends StaticRouter {
    constructor(@inject("LocationCallbacks") protected locationCallbacks: LocationCallbacks) {
        super([
            new RouteAction(
                "/client/locations",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ILocationsGenerateAllResponse>> => {
                    return this.locationCallbacks.getLocationData(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/airdrop/loot",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetAirdropLootResponse>> => {
                    return this.locationCallbacks.getAirdropLoot(url, info, sessionID);
                },
            ),
        ]);
    }
}
