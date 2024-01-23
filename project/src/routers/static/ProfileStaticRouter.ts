import { inject, injectable } from "tsyringe";

import { ProfileCallbacks } from "@spt-aki/callbacks/ProfileCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class ProfileStaticRouter extends StaticRouter
{
    constructor(@inject("ProfileCallbacks") protected profileCallbacks: ProfileCallbacks)
    {
        super([
            new RouteAction(
                "/client/game/profile/create",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.createProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/list",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getProfileData(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/savage/regenerate",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.regenerateScav(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/voice/change",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.changeVoice(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/change",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.changeNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/validate",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.validateNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/reserved",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getReservedNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/profile/status",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getProfileStatus(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/profile/view",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getOtherProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/profile/settings",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getProfileSettings(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/search",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.searchFriend(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/info",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getMiniProfile(url, info, sessionID);
                },
            ),
            new RouteAction("/launcher/profiles", (url: string, info: any, sessionID: string, output: string): any =>
            {
                return this.profileCallbacks.getAllMiniProfiles(url, info, sessionID);
            }),
        ]);
    }
}
