import { inject, injectable } from "tsyringe";

import { MatchCallbacks } from "../../callbacks/MatchCallbacks";
import { RouteAction, StaticRouter } from "../../di/Router";

@injectable()
export class MatchStaticRouter extends StaticRouter 
{
    constructor(
        @inject("MatchCallbacks") protected matchCallbacks: MatchCallbacks
    ) 
    {
        super(
            [
                new RouteAction(
                    "/raid/profile/list", 
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.getProfile(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/available", 
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.serverAvailable(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/updatePing", 
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.updatePing(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/join",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.joinMatch(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/exit", 
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.exitMatch(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/create", 
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.createGroup(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/delete",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this. matchCallbacks.deleteGroup(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/status",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.getGroupStatus(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/start_game",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.joinMatch(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/exit_from_menu",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.exitToMenu(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/looking/start",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.startGroupSearch(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/looking/stop",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.stopGroupSearch(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/invite/send",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.sendGroupInvite(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/invite/accept",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.acceptGroupInvite(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/invite/cancel",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.cancelGroupInvite(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/invite/cancel-all",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.cancelAllGroupInvite(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/offline/end",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.endOfflineRaid(url, info, sessionID);
                      
                    }
                ),
                new RouteAction(
                    "/client/putMetrics",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.putMetrics(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/getMetricsConfig",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.getMetrics(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/raid/configuration",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.getRaidConfiguration(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/match/group/player/remove",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.matchCallbacks.removePlayerFromGroup(url, info, sessionID);
                    }
                )
            ]
        );
    }
}