import { inject, injectable } from "tsyringe";

import { GameController } from "@spt-aki/controllers/GameController";
import { OnLoad } from "@spt-aki/di/OnLoad";
import { IEmptyRequestData } from "@spt-aki/models/eft/common/IEmptyRequestData";
import { ICheckVersionResponse } from "@spt-aki/models/eft/game/ICheckVersionResponse";
import { ICurrentGroupResponse } from "@spt-aki/models/eft/game/ICurrentGroupResponse";
import { IGameConfigResponse } from "@spt-aki/models/eft/game/IGameConfigResponse";
import { IGameEmptyCrcRequestData } from "@spt-aki/models/eft/game/IGameEmptyCrcRequestData";
import { IGameKeepAliveResponse } from "@spt-aki/models/eft/game/IGameKeepAliveResponse";
import { IGameLogoutResponseData } from "@spt-aki/models/eft/game/IGameLogoutResponseData";
import { IGameStartResponse } from "@spt-aki/models/eft/game/IGameStartResponse";
import { IGetRaidTimeRequest } from "@spt-aki/models/eft/game/IGetRaidTimeRequest";
import { IGetRaidTimeResponse } from "@spt-aki/models/eft/game/IGetRaidTimeResponse";
import { IReportNicknameRequestData } from "@spt-aki/models/eft/game/IReportNicknameRequestData";
import { IServerDetails } from "@spt-aki/models/eft/game/IServerDetails";
import { IVersionValidateRequestData } from "@spt-aki/models/eft/game/IVersionValidateRequestData";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt-aki/models/eft/httpResponse/INullResponseData";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { Watermark } from "@spt-aki/utils/Watermark";

@injectable()
export class GameCallbacks implements OnLoad
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("Watermark") protected watermark: Watermark,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("GameController") protected gameController: GameController,
    )
    {}

    public async onLoad(): Promise<void>
    {
        this.gameController.load();
    }

    public getRoute(): string
    {
        return "aki-game";
    }

    /**
     * Handle client/game/version/validate
     * @returns INullResponseData
     */
    public versionValidate(url: string, info: IVersionValidateRequestData, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle client/game/start
     * @returns IGameStartResponse
     */
    public gameStart(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IGameStartResponse>
    {
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
    public gameLogout(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGameLogoutResponseData>
    {
        this.saveServer.save();
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
    ): IGetBodyResponseData<IGameConfigResponse>
    {
        return this.httpResponse.getBody(this.gameController.getGameConfig(sessionID));
    }

    /**
     * Handle client/server/list
     */
    public getServer(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IServerDetails[]>
    {
        return this.httpResponse.getBody(this.gameController.getServer(sessionID));
    }

    /**
     * Handle client/match/group/current
     */
    public getCurrentGroup(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ICurrentGroupResponse>
    {
        return this.httpResponse.getBody(this.gameController.getCurrentGroup(sessionID));
    }

    /**
     * Handle client/checkVersion
     */
    public validateGameVersion(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ICheckVersionResponse>
    {
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
    ): IGetBodyResponseData<IGameKeepAliveResponse>
    {
        return this.httpResponse.getBody(this.gameController.getKeepAlive(sessionID));
    }

    /**
     * Handle singleplayer/settings/version
     * @returns string
     */
    public getVersion(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        return this.httpResponse.noBody({ Version: this.watermark.getInGameVersionLabel() });
    }

    public reportNickname(url: string, info: IReportNicknameRequestData, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle singleplayer/settings/getRaidTime
     * @returns string
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getRaidTime(url: string, request: IGetRaidTimeRequest, sessionID: string): IGetRaidTimeResponse
    {
        return this.httpResponse.noBody(this.gameController.getRaidTime(sessionID, request));
    }
}
