import { inject, injectable } from "tsyringe";

import { GameController } from "../controllers/GameController";
import { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";
import { ICheckVersionResponse } from "../models/eft/game/ICheckVersionResponse";
import { IGameConfigResponse } from "../models/eft/game/IGameConfigResponse";
import { IGameEmptyCrcRequestData } from "../models/eft/game/IGameEmptyCrcRequestData";
import { IGameKeepAliveResponse } from "../models/eft/game/IGameKeepAliveResponse";
import { IGameLogoutResponseData } from "../models/eft/game/IGameLogoutResponseData";
import { IGameStartResponse } from "../models/eft/game/IGameStartResponse";
import { IReportNicknameRequestData } from "../models/eft/game/IReportNicknameRequestData";
import { IServerDetails } from "../models/eft/game/IServerDetails";
import { IVersionValidateRequestData } from "../models/eft/game/IVersionValidateRequestData";
import { IGetBodyResponseData } from "../models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "../models/eft/httpResponse/INullResponseData";
import { SaveServer } from "../servers/SaveServer";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { Watermark } from "../utils/Watermark";

@injectable()
class GameCallbacks
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("Watermark") protected watermark: Watermark,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("GameController") protected gameController: GameController
    )
    {}

    /**
     * Handle client/game/version/validate
     * @returns INullResponseData
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        return this.httpResponse.getBody({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            utc_time: startTimeStampMS / 1000
        });
    }

    /**
     * Handle client/game/logout
     * Save profiles on game close
     * @returns IGameLogoutResponseData
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public gameLogout(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IGameLogoutResponseData>
    {
        this.saveServer.save();
        return this.httpResponse.getBody({
            status: "ok"
        });
    }

    /**
     * Handle client/game/config
     * @returns IGameConfigResponse
     */
    public getGameConfig(url: string, info: IGameEmptyCrcRequestData, sessionID: string): IGetBodyResponseData<IGameConfigResponse>
    {
        return this.httpResponse.getBody(this.gameController.getGameConfig(sessionID));
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getServer(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IServerDetails[]>
    {
        return this.httpResponse.getBody(this.gameController.getServer());
    }

    public getCurrentGroup(url: string, info: IEmptyRequestData, sessionID: string): any 
    {
        return this.httpResponse.getBody(this.gameController.getCurrentGroup(sessionID));
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public validateGameVersion(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ICheckVersionResponse>
    {
        return this.httpResponse.getBody(this.gameController.getValidGameVersion());
    }

    /**
     * Handle client/game/keepalive
     * @returns IGameKeepAliveResponse
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public gameKeepalive(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IGameKeepAliveResponse>
    {
        return this.httpResponse.getBody({
            msg: "OK",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            utc_time: new Date().getTime() / 1000
        });
    }

    /**
     * Handle singleplayer/settings/version
     * @returns string
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getVersion(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        return this.httpResponse.noBody({
            Version: this.watermark.getInGameVersionLabel()
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public reportNickname(url: string, info: IReportNicknameRequestData, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }
}

export { GameCallbacks };

