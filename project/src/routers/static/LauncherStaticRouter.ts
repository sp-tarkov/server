import { LauncherCallbacks } from "@spt/callbacks/LauncherCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { inject, injectable } from "tsyringe";

@injectable()
export class LauncherStaticRouter extends StaticRouter {
    constructor(@inject("LauncherCallbacks") protected launcherCallbacks: LauncherCallbacks) {
        super([
            new RouteAction(
                "/launcher/ping",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.ping(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/server/connect",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.connect();
                },
            ),
            new RouteAction(
                "/launcher/profile/login",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.login(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/register",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return await this.launcherCallbacks.register(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/get",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.get(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/change/username",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.changeUsername(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/change/password",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.changePassword(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/change/wipe",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.wipe(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/remove",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return await this.launcherCallbacks.removeProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/launcher/profile/compatibleTarkovVersion",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.getCompatibleTarkovVersion();
                },
            ),
            new RouteAction(
                "/launcher/server/version",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.getServerVersion();
                },
            ),
            new RouteAction(
                "/launcher/server/loadedServerMods",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.getLoadedServerMods();
                },
            ),
            new RouteAction(
                "/launcher/server/serverModsUsedByProfile",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.launcherCallbacks.getServerModsProfileUsed(url, info, sessionID);
                },
            ),
        ]);
    }
}
