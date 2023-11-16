import { inject, injectable } from "tsyringe";

import { LocationCallbacks } from "@spt-aki/callbacks/LocationCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class LocationStaticRouter extends StaticRouter
{
    constructor(@inject("LocationCallbacks") protected locationCallbacks: LocationCallbacks)
    {
        super([
            new RouteAction(
                "/client/locations",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.locationCallbacks.getLocationData(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/location/getAirdropLoot",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, _output: string): any =>
                {
                    return this.locationCallbacks.getAirdropLoot(url, info, sessionID);
                },
            ),
        ]);
    }
}
