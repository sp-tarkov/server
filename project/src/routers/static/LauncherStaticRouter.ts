import { inject, injectable } from "tsyringe";

import { LauncherCallbacks } from "@spt-aki/callbacks/LauncherCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class LauncherStaticRouter extends StaticRouter
{
    constructor(@inject("LauncherCallbacks") protected launcherCallbacks: LauncherCallbacks)
    {
        super([
            new RouteAction(
                "/launcher/ping",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.ping(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/server/connect",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.connect();
                },
            ),
            new RouteAction(
                "/launcher/profile/login",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.login(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/register",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.register(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/get",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.get(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/change/username",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.changeUsername(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/change/password",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.changePassword(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/change/wipe",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.wipe(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/remove",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.removeProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/compatibleTarkovVersion",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.getCompatibleTarkovVersion();
                },
            ),
            new RouteAction(
                "/launcher/server/version",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.getServerVersion();
                },
            ),
            new RouteAction(
                "/launcher/server/loadedServerMods",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.getLoadedServerMods();
                },
            ),
            new RouteAction(
                "/launcher/server/serverModsUsedByProfile",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.launcherCallbacks.getServerModsProfileUsed(url, info, sessionID);
                },
            ),
        ]);
    }
}
