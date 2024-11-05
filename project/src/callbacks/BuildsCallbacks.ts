import { BuildController } from "@spt/controllers/BuildController";
import { ISetMagazineRequest } from "@spt/models/eft/builds/ISetMagazineRequest";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { IPresetBuildActionRequestData } from "@spt/models/eft/presetBuild/IPresetBuildActionRequestData";
import { IRemoveBuildRequestData } from "@spt/models/eft/presetBuild/IRemoveBuildRequestData";
import { IUserBuilds } from "@spt/models/eft/profile/ISptProfile";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class BuildsCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("BuildController") protected buildController: BuildController,
    ) {}

    /**
     * Handle client/builds/list
     */
    public getBuilds(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IUserBuilds> {
        return this.httpResponse.getBody(this.buildController.getUserBuilds(sessionID));
    }

    /**
     * Handle client/builds/magazine/save
     */
    public createMagazineTemplate(url: string, request: ISetMagazineRequest, sessionID: string): INullResponseData {
        this.buildController.createMagazineTemplate(sessionID, request);

        return this.httpResponse.nullResponse();
    }

    /**
     * Handle client/builds/weapon/save
     */
    public setWeapon(url: string, info: IPresetBuildActionRequestData, sessionID: string): INullResponseData {
        this.buildController.saveWeaponBuild(sessionID, info);

        return this.httpResponse.nullResponse();
    }

    /**
     * Handle client/builds/equipment/save
     */
    public setEquipment(url: string, info: IPresetBuildActionRequestData, sessionID: string): INullResponseData {
        this.buildController.saveEquipmentBuild(sessionID, info);

        return this.httpResponse.nullResponse();
    }

    /**
     * Handle client/builds/delete
     */
    public deleteBuild(url: string, info: IRemoveBuildRequestData, sessionID: string): INullResponseData {
        this.buildController.removeBuild(sessionID, info);

        return this.httpResponse.nullResponse();
    }
}
