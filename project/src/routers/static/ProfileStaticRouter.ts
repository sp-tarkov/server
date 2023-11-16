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
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.createProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/list",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getProfileData(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/savage/regenerate",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.regenerateScav(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/voice/change",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.changeVoice(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/change",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.changeNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/validate",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.validateNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/nickname/reserved",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getReservedNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/profile/status",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getProfileStatus(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/profile/settings",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getProfileSettings(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/search",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.searchFriend(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/info",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getMiniProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profiles",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.profileCallbacks.getAllMiniProfiles(url, info, sessionID);
                },
            ),
        ]);
    }
}
