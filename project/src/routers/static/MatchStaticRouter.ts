import { inject, injectable } from "tsyringe";
import { MatchCallbacks } from "@spt/callbacks/MatchCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { IGroupCharacter } from "@spt/models/eft/match/IGroupCharacter";
import { IMatchGroupCurrentResponse } from "@spt/models/eft/match/IMatchGroupCurrentResponse";
import { IMatchGroupStatusResponse } from "@spt/models/eft/match/IMatchGroupStatusResponse";
import { IProfileStatusResponse } from "@spt/models/eft/match/IProfileStatusResponse";

@injectable()
export class MatchStaticRouter extends StaticRouter
{
    constructor(@inject("MatchCallbacks") protected matchCallbacks: MatchCallbacks)
    {
        super([
            new RouteAction(
                "/client/match/available",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> =>
                {
                    return this.matchCallbacks.serverAvailable(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/updatePing",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.matchCallbacks.updatePing(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/join",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IProfileStatusResponse>> =>
                {
                    return this.matchCallbacks.joinMatch(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/exit",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.matchCallbacks.exitMatch(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/delete",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> =>
                {
                    return this.matchCallbacks.deleteGroup(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/leave",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> =>
                {
                    return this.matchCallbacks.leaveGroup(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/status",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IMatchGroupStatusResponse>> =>
                {
                    return this.matchCallbacks.getGroupStatus(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/start_game",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IProfileStatusResponse>> =>
                {
                    return this.matchCallbacks.joinMatch(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/exit_from_menu",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.matchCallbacks.exitToMenu(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/current",
                async (
                    url: string,
                    info: IEmptyRequestData,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IMatchGroupCurrentResponse>> =>
                {
                    return this.matchCallbacks.groupCurrent(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/looking/start",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.matchCallbacks.startGroupSearch(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/looking/stop",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.matchCallbacks.stopGroupSearch(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/invite/send",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string>> =>
                {
                    return this.matchCallbacks.sendGroupInvite(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/invite/accept",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGroupCharacter[]>> =>
                {
                    return this.matchCallbacks.acceptGroupInvite(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/invite/decline",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any>> =>
                {
                    return this.matchCallbacks.declineGroupInvite(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/invite/cancel",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> =>
                {
                    return this.matchCallbacks.cancelGroupInvite(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/invite/cancel-all",
                async (
                    url: string,
                    info: IEmptyRequestData,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> =>
                {
                    return this.matchCallbacks.cancelAllGroupInvite(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/transfer",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> =>
                {
                    return this.matchCallbacks.transferGroup(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/raid/ready",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> =>
                {
                    return this.matchCallbacks.raidReady(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/raid/not-ready",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> =>
                {
                    return this.matchCallbacks.notRaidReady(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/offline/end",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.matchCallbacks.endOfflineRaid(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/putMetrics",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.matchCallbacks.putMetrics(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/getMetricsConfig",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string>> =>
                {
                    return this.matchCallbacks.getMetrics(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/raid/configuration",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.matchCallbacks.getRaidConfiguration(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/raid/configuration-by-profile",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.matchCallbacks.getConfigurationByProfile(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/player/remove",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> =>
                {
                    return this.matchCallbacks.removePlayerFromGroup(url, info, sessionID);
                },
            ),
        ]);
    }
}
