import { InraidCallbacks } from "@spt/callbacks/InraidCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class InraidStaticRouter extends StaticRouter {
    constructor(@inject("InraidCallbacks") protected inraidCallbacks: InraidCallbacks) {
        super([
            new RouteAction(
                "/raid/profile/scavsave",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.inraidCallbacks.saveProgress(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/raid/menu",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.inraidCallbacks.getRaidMenuSettings();
                },
            ),
            new RouteAction(
                "/singleplayer/scav/traitorscavhostile",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.inraidCallbacks.getTraitorScavHostileChance(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/bossconvert",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.inraidCallbacks.getBossConvertSettings(url, info, sessionID);
                },
            ),
        ]);
    }
}
