import { inject, injectable } from "tsyringe";
import { LocationCallbacks } from "@spt/callbacks/LocationCallbacks";
import { DynamicRouter, RouteAction } from "@spt/di/Router";
import { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";

@injectable()
export class LocationDynamicRouter extends DynamicRouter
{
    constructor(@inject("LocationCallbacks") protected locationCallbacks: LocationCallbacks)
    {
        super([
            new RouteAction(
                "/client/location/getLocalloot",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    _output: string,
                ): Promise<IGetBodyResponseData<ILocationBase>> =>
                {
                    return this.locationCallbacks.getLocation(url, info, sessionID);
                },
            ),
        ]);
    }

    public override getTopLevelRoute(): string
    {
        return "spt-loot";
    }
}
