import { inject, injectable } from "tsyringe";

import { PresetBuildController } from "@spt-aki/controllers/PresetBuildController";
import { IEmptyRequestData } from "@spt-aki/models/eft/common/IEmptyRequestData";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IPresetBuildActionRequestData } from "@spt-aki/models/eft/presetBuild/IPresetBuildActionRequestData";
import { IRemoveBuildRequestData } from "@spt-aki/models/eft/presetBuild/IRemoveBuildRequestData";
import { IUserBuilds } from "@spt-aki/models/eft/profile/IAkiProfile";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";

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

    /** Handle removeBuild event*/
    public removeBuild(pmcData: IPmcData, body: IRemoveBuildRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.presetBuildController.removeBuild(pmcData, body, sessionID);
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