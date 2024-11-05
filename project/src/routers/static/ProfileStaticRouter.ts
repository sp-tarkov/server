import { ProfileCallbacks } from "@spt/callbacks/ProfileCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { IGetProfileStatusResponseData } from "@spt/models/eft/profile/GetProfileStatusResponseData";
import { ICreateProfileResponse } from "@spt/models/eft/profile/ICreateProfileResponse";
import { IGetOtherProfileResponse } from "@spt/models/eft/profile/IGetOtherProfileResponse";
import { ISearchFriendResponse } from "@spt/models/eft/profile/ISearchFriendResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class ProfileStaticRouter extends StaticRouter {
    constructor(@inject("ProfileCallbacks") protected profileCallbacks: ProfileCallbacks) {
        super([
            new RouteAction(
                "/client/game/profile/create",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ICreateProfileResponse>> => {
                    return this.profileCallbacks.createProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/list",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IPmcData[]>> => {
                    return this.profileCallbacks.getProfileData(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/savage/regenerate",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IPmcData[]>> => {
                    return this.profileCallbacks.regenerateScav(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/voice/change",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.profileCallbacks.changeVoice(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/change",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any>> => {
                    return this.profileCallbacks.changeNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/validate",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any>> => {
                    return this.profileCallbacks.validateNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/reserved",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string>> => {
                    return this.profileCallbacks.getReservedNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/profile/status",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetProfileStatusResponseData>> => {
                    return this.profileCallbacks.getProfileStatus(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/profile/view",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetOtherProfileResponse>> => {
                    return this.profileCallbacks.getOtherProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/profile/settings",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> => {
                    return this.profileCallbacks.getProfileSettings(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/search",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ISearchFriendResponse[]>> => {
                    return this.profileCallbacks.searchFriend(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/info",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.profileCallbacks.getMiniProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profiles",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.profileCallbacks.getAllMiniProfiles(url, info, sessionID);
                },
            ),
        ]);
    }
}
