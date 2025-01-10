import { GameCallbacks } from "@spt/callbacks/GameCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { ICheckVersionResponse } from "@spt/models/eft/game/ICheckVersionResponse";
import { ICurrentGroupResponse } from "@spt/models/eft/game/ICurrentGroupResponse";
import { IGameConfigResponse } from "@spt/models/eft/game/IGameConfigResponse";
import { IGameKeepAliveResponse } from "@spt/models/eft/game/IGameKeepAliveResponse";
import { IGameLogoutResponseData } from "@spt/models/eft/game/IGameLogoutResponseData";
import { IGameModeResponse } from "@spt/models/eft/game/IGameModeResponse";
import { IGameStartResponse } from "@spt/models/eft/game/IGameStartResponse";
import { IGetRaidTimeResponse } from "@spt/models/eft/game/IGetRaidTimeResponse";
import { ISendReportRequest } from "@spt/models/eft/game/ISendReportRequest";
import { IServerDetails } from "@spt/models/eft/game/IServerDetails";
import { ISurveyResponseData } from "@spt/models/eft/game/ISurveyResponseData";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class GameStaticRouter extends StaticRouter {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("GameCallbacks") protected gameCallbacks: GameCallbacks,
    ) {
        super([
            new RouteAction(
                "/client/game/config",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGameConfigResponse>> => {
                    return this.gameCallbacks.getGameConfig(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/mode",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGameModeResponse>> => {
                    return this.gameCallbacks.getGameMode(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/server/list",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IServerDetails[]>> => {
                    return this.gameCallbacks.getServer(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/match/group/current",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ICurrentGroupResponse>> => {
                    return this.gameCallbacks.getCurrentGroup(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/version/validate",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.gameCallbacks.versionValidate(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/start",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGameStartResponse>> => {
                    return this.gameCallbacks.gameStart(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/logout",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGameLogoutResponseData>> => {
                    return await this.gameCallbacks.gameLogout(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/checkVersion",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ICheckVersionResponse>> => {
                    return this.gameCallbacks.validateGameVersion(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/keepalive",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGameKeepAliveResponse>> => {
                    return this.gameCallbacks.gameKeepalive(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/version",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.gameCallbacks.getVersion(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/reports/lobby/send",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.gameCallbacks.reportNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/report/send",
                async (
                    url: string,
                    info: ISendReportRequest,
                    sessionID: string,
                    output: string,
                ): Promise<INullResponseData> => {
                    return this.gameCallbacks.reportNickname(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/getRaidTime",
                async (url: string, info: any, sessionID: string, output: string): Promise<IGetRaidTimeResponse> => {
                    return this.gameCallbacks.getRaidTime(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/survey",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<INullResponseData | IGetBodyResponseData<ISurveyResponseData>> => {
                    return this.gameCallbacks.getSurvey(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/survey/view",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.gameCallbacks.getSurveyView(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/survey/opinion",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.gameCallbacks.sendSurveyOpinion(url, info, sessionID);
                },
            ),
        ]);
    }
}
