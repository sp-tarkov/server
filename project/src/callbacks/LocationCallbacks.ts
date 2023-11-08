import { inject, injectable } from "tsyringe";

import { LocationController } from "@spt-aki/controllers/LocationController";
import { IEmptyRequestData } from "@spt-aki/models/eft/common/IEmptyRequestData";
import { ILocationBase } from "@spt-aki/models/eft/common/ILocationBase";
import { ILocationsGenerateAllResponse } from "@spt-aki/models/eft/common/ILocationsSourceDestinationBase";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { IGetLocationRequestData } from "@spt-aki/models/eft/location/IGetLocationRequestData";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";

@injectable()
export class LocationCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LocationController") protected locationController: LocationController
    ) {}

    /** Handle client/locations */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getLocationData(
        url: string,
        info: IEmptyRequestData,
        sessionID: string
    ): IGetBodyResponseData<ILocationsGenerateAllResponse> {
        return this.httpResponse.getBody(this.locationController.generateAll(sessionID));
    }

    /** Handle client/location/getLocalloot */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getLocation(
        url: string,
        info: IGetLocationRequestData,
        sessionID: string
    ): IGetBodyResponseData<ILocationBase> {
        return this.httpResponse.getBody(this.locationController.get(sessionID, info));
    }

    /** Handle client/location/getAirdropLoot */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getAirdropLoot(url: string, info: IEmptyRequestData, sessionID: string): string {
        return this.httpResponse.noBody(this.locationController.getAirdropLoot());
    }
}
