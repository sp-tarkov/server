import { ProfileController } from "@spt/controllers/ProfileController";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import type { IGetMiniProfileRequestData } from "@spt/models/eft/launcher/IGetMiniProfileRequestData";
import type { IGetProfileStatusResponseData } from "@spt/models/eft/profile/GetProfileStatusResponseData";
import type { ICreateProfileResponse } from "@spt/models/eft/profile/ICreateProfileResponse";
import type { IGetOtherProfileRequest } from "@spt/models/eft/profile/IGetOtherProfileRequest";
import type { IGetOtherProfileResponse } from "@spt/models/eft/profile/IGetOtherProfileResponse";
import type { IGetProfileSettingsRequest } from "@spt/models/eft/profile/IGetProfileSettingsRequest";
import type { IProfileChangeNicknameRequestData } from "@spt/models/eft/profile/IProfileChangeNicknameRequestData";
import type { IProfileChangeVoiceRequestData } from "@spt/models/eft/profile/IProfileChangeVoiceRequestData";
import type { IProfileCreateRequestData } from "@spt/models/eft/profile/IProfileCreateRequestData";
import type { ISearchFriendRequestData } from "@spt/models/eft/profile/ISearchFriendRequestData";
import type { ISearchFriendResponse } from "@spt/models/eft/profile/ISearchFriendResponse";
import type { IValidateNicknameRequestData } from "@spt/models/eft/profile/IValidateNicknameRequestData";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

/** Handle profile related client events */
@injectable()
export class ProfileCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("ProfileController") protected profileController: ProfileController,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
    ) {}

    /**
     * Handle client/game/profile/create
     */
    public createProfile(
        url: string,
        info: IProfileCreateRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ICreateProfileResponse> {
        const id = this.profileController.createProfile(info, sessionID);
        return this.httpResponse.getBody({ uid: id });
    }

    /**
     * Handle client/game/profile/list
     * Get the complete player profile (scav + pmc character)
     */
    public getProfileData(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IPmcData[]> {
        return this.httpResponse.getBody(this.profileController.getCompleteProfile(sessionID));
    }

    /**
     * Handle client/game/profile/savage/regenerate
     * Handle the creation of a scav profile for player
     * Occurs post-raid and when profile first created immediately after character details are confirmed by player
     * @param url
     * @param info empty
     * @param sessionID Session id
     * @returns Profile object
     */
    public regenerateScav(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IPmcData[]> {
        return this.httpResponse.getBody([this.profileController.generatePlayerScav(sessionID)]);
    }

    /**
     * Handle client/game/profile/voice/change event
     */
    public changeVoice(url: string, info: IProfileChangeVoiceRequestData, sessionID: string): INullResponseData {
        this.profileController.changeVoice(info, sessionID);
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle client/game/profile/nickname/change event
     * Client allows player to adjust their profile name
     */
    public changeNickname(
        url: string,
        info: IProfileChangeNicknameRequestData,
        sessionID: string,
    ): IGetBodyResponseData<any> {
        const output = this.profileController.changeNickname(info, sessionID);

        if (output === "taken") {
            return this.httpResponse.getBody(undefined, 255, "The nickname is already in use");
        }

        if (output === "tooshort") {
            return this.httpResponse.getBody(undefined, 1, "The nickname is too short");
        }

        return this.httpResponse.getBody({ status: 0, nicknamechangedate: this.timeUtil.getTimestamp() });
    }

    /**
     * Handle client/game/profile/nickname/validate
     */
    public validateNickname(
        url: string,
        info: IValidateNicknameRequestData,
        sessionID: string,
    ): IGetBodyResponseData<any> {
        const output = this.profileController.validateNickname(info, sessionID);

        if (output === "taken") {
            return this.httpResponse.getBody(undefined, 255, "225 - ");
        }

        if (output === "tooshort") {
            return this.httpResponse.getBody(undefined, 256, "256 - ");
        }

        return this.httpResponse.getBody({ status: "ok" });
    }

    /**
     * Handle client/game/profile/nickname/reserved
     */
    public getReservedNickname(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<string> {
        return this.httpResponse.getBody("SPTarkov");
    }

    /**
     * Handle client/profile/status
     * Called when creating a character when choosing a character face/voice
     */
    public getProfileStatus(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetProfileStatusResponseData> {
        return this.httpResponse.getBody(this.profileController.getProfileStatus(sessionID));
    }

    /**
     * Handle client/profile/view
     * Called when viewing another players profile
     */
    public getOtherProfile(
        url: string,
        request: IGetOtherProfileRequest,
        sessionID: string,
    ): IGetBodyResponseData<IGetOtherProfileResponse> {
        return this.httpResponse.getBody(this.profileController.getOtherProfile(sessionID, request));
    }

    /**
     * Handle client/profile/settings
     */
    public getProfileSettings(
        url: string,
        info: IGetProfileSettingsRequest,
        sessionId: string,
    ): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(this.profileController.setChosenProfileIcon(sessionId, info));
    }

    /**
     * Handle client/game/profile/search
     */
    public searchFriend(
        url: string,
        info: ISearchFriendRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ISearchFriendResponse[]> {
        return this.httpResponse.getBody(this.profileController.getFriends(info, sessionID));
    }

    /**
     * Handle launcher/profile/info
     */
    public getMiniProfile(url: string, info: IGetMiniProfileRequestData, sessionID: string): string {
        return this.httpResponse.noBody(this.profileController.getMiniProfile(sessionID));
    }

    /**
     * Handle /launcher/profiles
     */
    public getAllMiniProfiles(url: string, info: IEmptyRequestData, sessionID: string): string {
        return this.httpResponse.noBody(this.profileController.getMiniProfiles());
    }
}
