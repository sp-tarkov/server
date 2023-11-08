import { inject, injectable } from "tsyringe";

import { LauncherCallbacks } from "@spt-aki/callbacks/LauncherCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class LauncherStaticRouter extends StaticRouter {
    constructor(@inject("LauncherCallbacks") protected launcherCallbacks: LauncherCallbacks) {
        super([
            new RouteAction("/launcher/ping", (url: string, info: any, sessionID: string, output: string): any => {
                return this.launcherCallbacks.ping(url, info, sessionID);
            }),
            new RouteAction(
                "/launcher/server/connect",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.connect();
                }
            ),
            new RouteAction(
                "/launcher/profile/login",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.login(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/launcher/profile/register",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.register(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/launcher/profile/get",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.get(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/launcher/profile/change/username",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.changeUsername(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/launcher/profile/change/password",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.changePassword(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/launcher/profile/change/wipe",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.wipe(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/launcher/profile/remove",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.removeProfile(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/launcher/profile/compatibleTarkovVersion",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.getCompatibleTarkovVersion();
                }
            ),
            new RouteAction(
                "/launcher/server/version",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.getServerVersion();
                }
            ),
            new RouteAction(
                "/launcher/server/loadedServerMods",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.getLoadedServerMods();
                }
            ),
            new RouteAction(
                "/launcher/server/serverModsUsedByProfile",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.launcherCallbacks.getServerModsProfileUsed(url, info, sessionID);
                }
            ),
        ]);
    }
}
