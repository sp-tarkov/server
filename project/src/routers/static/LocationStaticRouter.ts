import { inject, injectable } from "tsyringe";

import { LocationCallbacks } from "@spt-aki/callbacks/LocationCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { ILocationsGenerateAllResponse } from "@spt-aki/models/eft/common/ILocationsSourceDestinationBase";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";

@injectable()
export class LocationStaticRouter extends StaticRouter
{
    constructor(@inject("LocationCallbacks") protected locationCallbacks: LocationCallbacks)
    {
        super([
            new RouteAction(
                "/client/locations",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ILocationsGenerateAllResponse>> =>
                {
                    return this.locationCallbacks.getLocationData(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/location/getAirdropLoot",
                async (url: string, info: any, sessionID: string, _output: string): Promise<string> =>
                {
                    return this.locationCallbacks.getAirdropLoot(url, info, sessionID);
                },
            ),
        ]);
    }
}
