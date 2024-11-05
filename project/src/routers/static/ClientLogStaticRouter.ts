import { ClientLogCallbacks } from "@spt/callbacks/ClientLogCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class ClientLogStaticRouter extends StaticRouter {
    constructor(@inject("ClientLogCallbacks") protected clientLogCallbacks: ClientLogCallbacks) {
        super([
            new RouteAction(
                "/singleplayer/log",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.clientLogCallbacks.clientLog(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/release",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.clientLogCallbacks.releaseNotes();
                },
            ),
            new RouteAction(
                "/singleplayer/enableBSGlogging",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.clientLogCallbacks.bsgLogging();
                },
            ),
        ]);
    }
}
