import { InraidController } from "@spt/controllers/InraidController";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { IRegisterPlayerRequestData } from "@spt/models/eft/inRaid/IRegisterPlayerRequestData";
import { IScavSaveRequestData } from "@spt/models/eft/inRaid/IScavSaveRequestData";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

/**
 * Handle client requests
 */
@injectable()
export class InraidCallbacks {
    constructor(
        @inject("InraidController") protected inraidController: InraidController,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
    ) {}

    /**
     * Handle client/location/getLocalloot
     * Store active map in profile + applicationContext
     * @param url
     * @param info register player request
     * @param sessionID Session id
     * @returns Null http response
     */
    public registerPlayer(url: string, info: IRegisterPlayerRequestData, sessionID: string): INullResponseData {
        this.inraidController.addPlayer(sessionID, info);
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle raid/profile/scavsave
     * @param url
     * @param info Save progress request
     * @param sessionID Session id
     * @returns Null http response
     */
    public saveProgress(url: string, info: IScavSaveRequestData, sessionID: string): INullResponseData {
        this.inraidController.savePostRaidProfileForScav(info, sessionID);
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle singleplayer/settings/raid/menu
     * @returns JSON as string
     */
    public getRaidMenuSettings(): string {
        return this.httpResponse.noBody(this.inraidController.getInraidConfig().raidMenuSettings);
    }

    public getTraitorScavHostileChance(url: string, info: IEmptyRequestData, sessionId: string): string {
        return this.httpResponse.noBody(this.inraidController.getTraitorScavHostileChance(url, sessionId));
    }

    public getBossConvertSettings(url: string, info: IEmptyRequestData, sessionId: string): string {
        return this.httpResponse.noBody(this.inraidController.getBossConvertSettings(url, sessionId));
    }
}
