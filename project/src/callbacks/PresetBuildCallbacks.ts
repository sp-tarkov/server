import { inject, injectable } from "tsyringe";

import { PresetBuildController } from "../controllers/PresetBuildController";
import { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";
import { IPmcData } from "../models/eft/common/IPmcData";
import { IGetBodyResponseData } from "../models/eft/httpResponse/IGetBodyResponseData";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import {
    IPresetBuildActionRequestData
} from "../models/eft/presetBuild/IPresetBuildActionRequestData";
import { IUserBuilds } from "../models/eft/profile/IAkiProfile";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";

@injectable()
export class PresetBuildCallbacks
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("PresetBuildController") protected presetBuildController: PresetBuildController)
    { }

    /** Handle client/handbook/builds/my/list */
    public getHandbookUserlist(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IUserBuilds>
    {
        return this.httpResponse.getBody(this.presetBuildController.getUserBuilds(sessionID));
    }

    /** Handle SaveWeaponBuild event */
    public saveWeaponBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.presetBuildController.saveWeaponBuild(pmcData, body, sessionID);
    }

    /** Handle RemoveWeaponBuild event*/
    public removeWeaponBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.presetBuildController.removeWeaponBuild(pmcData, body, sessionID);
    }

    /** Handle SaveEquipmentBuild event */
    public saveEquipmentBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.presetBuildController.saveEquipmentBuild(pmcData, body, sessionID);
    }

    /** Handle RemoveEquipmentBuild event*/
    public removeEquipmentBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.presetBuildController.removeEquipmentBuild(pmcData, body, sessionID);
    }
}