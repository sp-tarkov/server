import { inject, injectable } from "tsyringe";

import { MatchCallbacks } from "@spt-aki/callbacks/MatchCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class MatchStaticRouter extends StaticRouter
{
    constructor(@inject("MatchCallbacks") protected matchCallbacks: MatchCallbacks)
    {
        super([
            new RouteAction("/raid/profile/list", (url: string, info: any, sessionID: string, output: string): any =>
            {
                return this.matchCallbacks.getProfile(url, info, sessionID);
            }),
            new RouteAction(
                "/client/match/available",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.serverAvailable(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/updatePing",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.updatePing(url, info, sessionID);
                },
            ),
            new RouteAction("/client/match/join", (url: string, info: any, sessionID: string, output: string): any =>
            {
                return this.matchCallbacks.joinMatch(url, info, sessionID);
            }),
            new RouteAction("/client/match/exit", (url: string, info: any, sessionID: string, output: string): any =>
            {
                return this.matchCallbacks.exitMatch(url, info, sessionID);
            }),
            new RouteAction(
                "/client/match/group/create",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.createGroup(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/delete",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.deleteGroup(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/leave",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.leaveGroup(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/status",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.getGroupStatus(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/start_game",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.joinMatch(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/exit_from_menu",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.exitToMenu(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/looking/start",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.startGroupSearch(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/looking/stop",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.stopGroupSearch(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/invite/send",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.sendGroupInvite(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/invite/accept",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.acceptGroupInvite(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/invite/cancel",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.cancelGroupInvite(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/invite/cancel-all",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.cancelAllGroupInvite(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/transfer",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.transferGroup(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/offline/end",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.endOfflineRaid(url, info, sessionID);
                },
            ),
            new RouteAction("/client/putMetrics", (url: string, info: any, sessionID: string, output: string): any =>
            {
                return this.matchCallbacks.putMetrics(url, info, sessionID);
            }),
            new RouteAction(
                "/client/getMetricsConfig",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.getMetrics(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/raid/configuration",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.getRaidConfiguration(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/raid/configuration-by-profile",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.getConfigurationByProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/player/remove",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.matchCallbacks.removePlayerFromGroup(url, info, sessionID);
                },
            ),
        ]);
    }
}
