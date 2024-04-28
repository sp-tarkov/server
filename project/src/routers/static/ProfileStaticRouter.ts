import { inject, injectable } from "tsyringe";

import { ProfileCallbacks } from "@spt-aki/callbacks/ProfileCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt-aki/models/eft/httpResponse/INullResponseData";
import { GetProfileStatusResponseData } from "@spt-aki/models/eft/profile/GetProfileStatusResponseData";
import { ICreateProfileResponse } from "@spt-aki/models/eft/profile/ICreateProfileResponse";
import { IGetOtherProfileResponse } from "@spt-aki/models/eft/profile/IGetOtherProfileResponse";
import { ISearchFriendResponse } from "@spt-aki/models/eft/profile/ISearchFriendResponse";

@injectable()
export class ProfileStaticRouter extends StaticRouter
{
    constructor(@inject("ProfileCallbacks") protected profileCallbacks: ProfileCallbacks)
    {
        super([
            new RouteAction(
                "/client/game/profile/create",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ICreateProfileResponse>> =>
                {
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
                ): Promise<IGetBodyResponseData<IPmcData[]>> =>
                {
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
                ): Promise<IGetBodyResponseData<IPmcData[]>> =>
                {
                    return this.profileCallbacks.regenerateScav(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/voice/change",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.profileCallbacks.changeVoice(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/change",
                async (url: string, info: any, sessionID: string, output: string): Promise<IGetBodyResponseData<any>> =>
                {
                    return this.profileCallbacks.changeNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/validate",
                async (url: string, info: any, sessionID: string, output: string): Promise<IGetBodyResponseData<any>> =>
                {
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
                ): Promise<IGetBodyResponseData<string>> =>
                {
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
                ): Promise<IGetBodyResponseData<GetProfileStatusResponseData>> =>
                {
                    return this.profileCallbacks.getProfileStatus(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/profile/view",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetOtherProfileResponse>> =>
                {
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
                ): Promise<IGetBodyResponseData<string>> =>
                {
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
                ): Promise<IGetBodyResponseData<ISearchFriendResponse[]>> =>
                {
                    return this.profileCallbacks.searchFriend(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/info",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.profileCallbacks.getMiniProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profiles",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.profileCallbacks.getAllMiniProfiles(url, info, sessionID);
                },
            ),
        ]);
    }
}
