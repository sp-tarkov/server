import { inject, injectable } from "tsyringe";
import { LocationController } from "@spt/controllers/LocationController";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { ILocationsGenerateAllResponse } from "@spt/models/eft/common/ILocationsSourceDestinationBase";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { IGetLocationRequestData } from "@spt/models/eft/location/IGetLocationRequestData";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";

@injectable()
export class LocationCallbacks
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LocationController") protected locationController: LocationController,
    )
    {}

    /** Handle client/locations */
    public getLocationData(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ILocationsGenerateAllResponse>
    {
        return this.httpResponse.getBody(this.locationController.generateAll(sessionID));
    }

    /** Handle client/location/getLocalloot */
    public getLocation(
        url: string,
        info: IGetLocationRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ILocationBase>
    {
        return this.httpResponse.getBody(this.locationController.get(sessionID, info));
    }

    /** Handle client/location/getAirdropLoot */
    public getAirdropLoot(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        return this.httpResponse.noBody(this.locationController.getAirdropLoot());
    }
}
