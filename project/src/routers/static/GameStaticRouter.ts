import { inject, injectable } from "tsyringe";

import { GameCallbacks } from "@spt-aki/callbacks/GameCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class GameStaticRouter extends StaticRouter 
{
    constructor(
        @inject("GameCallbacks") protected gameCallbacks: GameCallbacks
    ) 
    {
        super(
            [
                new RouteAction(
                    "/client/game/config",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.gameCallbacks.getGameConfig(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/server/list",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.gameCallbacks.getServer(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/current",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.gameCallbacks.getCurrentGroup(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/game/version/validate",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.gameCallbacks.versionValidate(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/game/start",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.gameCallbacks.gameStart(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/game/logout",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.gameCallbacks.gameLogout(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/checkVersion",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.gameCallbacks.validateGameVersion(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/game/keepalive",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.gameCallbacks.gameKeepalive(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/singleplayer/settings/version",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.gameCallbacks.getVersion(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/reports/lobby/send",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.gameCallbacks.reportNickname(url, info, sessionID);
                    }
                )
            ]
        );
    }
}