import { ILocationBase } from "../../eft/common/ILocationBase";
import { ILooseLoot } from "../../eft/common/ILooseLoot";
import { ILocationsBase } from "../../eft/common/tables/ILocationsBase";

export interface ILocations 
{
    bigmap?: ILocationData
    develop?: ILocationData
    // eslint-disable-next-line @typescript-eslint/naming-convention
    factory4_day?: ILocationData
    // eslint-disable-next-line @typescript-eslint/naming-convention
    factory4_night?: ILocationData
    hideout?: ILocationData
    interchange?: ILocationData
    laboratory?: ILocationData
    lighthouse?: ILocationData
    privatearea?: ILocationData
    rezervbase?: ILocationData
    shoreline?: ILocationData
    suburbs?: ILocationData
    tarkovstreets?: ILocationData
    terminal?: ILocationData
    town?: ILocationData
    woods?: ILocationData
    base?: ILocationsBase
}

export interface ILocationData
{
    base: ILocationBase
    looseLoot?: ILooseLoot
}