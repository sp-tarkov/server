import { GameController } from "@spt/controllers/GameController";
import { OnLoad } from "@spt/di/OnLoad";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { IUIDRequestData } from "@spt/models/eft/common/request/IUIDRequestData";
import { ICheckVersionResponse } from "@spt/models/eft/game/ICheckVersionResponse";
import { ICurrentGroupResponse } from "@spt/models/eft/game/ICurrentGroupResponse";
import { IGameConfigResponse } from "@spt/models/eft/game/IGameConfigResponse";
import { IGameEmptyCrcRequestData } from "@spt/models/eft/game/IGameEmptyCrcRequestData";
import { IGameKeepAliveResponse } from "@spt/models/eft/game/IGameKeepAliveResponse";
import { IGameLogoutResponseData } from "@spt/models/eft/game/IGameLogoutResponseData";
import { IGameModeRequestData } from "@spt/models/eft/game/IGameModeRequestData";
import { IGameModeResponse } from "@spt/models/eft/game/IGameModeResponse";
import { IGameStartResponse } from "@spt/models/eft/game/IGameStartResponse";
import { IGetRaidTimeRequest } from "@spt/models/eft/game/IGetRaidTimeRequest";
import { IGetRaidTimeResponse } from "@spt/models/eft/game/IGetRaidTimeResponse";
import { ISendSurveyOpinionRequest } from "@spt/models/eft/game/ISendSurveyOpinionRequest";
import { IServerDetails } from "@spt/models/eft/game/IServerDetails";
import { ISurveyResponseData } from "@spt/models/eft/game/ISurveyResponseData";
import { IVersionValidateRequestData } from "@spt/models/eft/game/IVersionValidateRequestData";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { SaveServer } from "@spt/servers/SaveServer";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { Watermark } from "@spt/utils/Watermark";
import { inject, injectable } from "tsyringe";

@injectable()
export class GameCallbacks implements OnLoad {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("Watermark") protected watermark: Watermark,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("GameController") protected gameController: GameController,
    ) {}

    public async onLoad(): Promise<void> {
        this.gameController.load();
    }

    public getRoute(): string {
        return "spt-game";
    }

    /**
     * Handle client/game/version/validate
     * @returns INullResponseData
     */
    public versionValidate(url: string, info: IVersionValidateRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle client/game/start
     * @returns IGameStartResponse
     */
    public gameStart(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGameStartResponse> {
        const today = new Date().toUTCString();
        const startTimeStampMS = Date.parse(today);
        this.gameController.gameStart(url, info, sessionID, startTimeStampMS);
        return this.httpResponse.getBody({ utc_time: startTimeStampMS / 1000 });
    }

    /**
     * Handle client/game/logout
     * Save profiles on game close
     * @returns IGameLogoutResponseData
     */
    public async gameLogout(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): Promise<IGetBodyResponseData<IGameLogoutResponseData>> {
        await this.saveServer.saveProfile(sessionID);
        return this.httpResponse.getBody({ status: "ok" });
    }

    /**
     * Handle client/game/config
     * @returns IGameConfigResponse
     */
    public getGameConfig(
        url: string,
        info: IGameEmptyCrcRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGameConfigResponse> {
        return this.httpResponse.getBody(this.gameController.getGameConfig(sessionID));
    }

    /**
     * Handle client/game/mode
     * @returns IGameModeResponse
     */
    public getGameMode(
        url: string,
        info: IGameModeRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGameModeResponse> {
        return this.httpResponse.getBody(this.gameController.getGameMode(sessionID, info));
    }

    /**
     * Handle client/server/list
     */
    public getServer(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IServerDetails[]> {
        return this.httpResponse.getBody(this.gameController.getServer(sessionID));
    }

    /**
     * Handle client/match/group/current
     */
    public getCurrentGroup(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ICurrentGroupResponse> {
        return this.httpResponse.getBody(this.gameController.getCurrentGroup(sessionID));
    }

    /**
     * Handle client/checkVersion
     */
    public validateGameVersion(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ICheckVersionResponse> {
        return this.httpResponse.getBody(this.gameController.getValidGameVersion(sessionID));
    }

    /**
     * Handle client/game/keepalive
     * @returns IGameKeepAliveResponse
     */
    public gameKeepalive(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGameKeepAliveResponse> {
        return this.httpResponse.getBody(this.gameController.getKeepAlive(sessionID));
    }

    /**
     * Handle singleplayer/settings/version
     * @returns string
     */
    public getVersion(url: string, info: IEmptyRequestData, sessionID: string): string {
        return this.httpResponse.noBody({ Version: this.watermark.getInGameVersionLabel() });
    }

    /**
     * Handle /client/report/send & /client/reports/lobby/send
     * @returns INullResponseData
     */
    public reportNickname(url: string, info: IUIDRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle singleplayer/settings/getRaidTime
     * @returns string
     */
    public getRaidTime(url: string, request: IGetRaidTimeRequest, sessionID: string): IGetRaidTimeResponse {
        return this.httpResponse.noBody(this.gameController.getRaidTime(sessionID, request));
    }

    /**
     * Handle /client/survey
     * @returns INullResponseData
     */
    public getSurvey(
        url: string,
        request: IEmptyRequestData,
        sessionId: string,
    ): INullResponseData | IGetBodyResponseData<ISurveyResponseData> {
        return this.httpResponse.getBody(this.gameController.getSurvey(sessionId));
    }

    /**
     * Handle client/survey/view
     * @returns INullResponseData
     */
    public getSurveyView(url: string, request: any, sessionId: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle client/survey/opinion
     * @returns INullResponseData
     */
    public sendSurveyOpinion(url: string, request: ISendSurveyOpinionRequest, sessionId: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }
}
