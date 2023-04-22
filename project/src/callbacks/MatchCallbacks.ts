import { inject, injectable } from "tsyringe";

import { MatchController } from "../controllers/MatchController";
import { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";
import { IPmcData } from "../models/eft/common/IPmcData";
import { IGetBodyResponseData } from "../models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "../models/eft/httpResponse/INullResponseData";
import { IAcceptGroupInviteRequest } from "../models/eft/match/IAcceptGroupInviteRequest";
import { IAcceptGroupInviteResponse } from "../models/eft/match/IAcceptGroupInviteResponse";
import { ICancelGroupInviteRequest } from "../models/eft/match/ICancelGroupInviteRequest";
import { ICreateGroupRequestData } from "../models/eft/match/ICreateGroupRequestData";
import { IEndOfflineRaidRequestData } from "../models/eft/match/IEndOfflineRaidRequestData";
import { IGetGroupStatusRequestData } from "../models/eft/match/IGetGroupStatusRequestData";
import { IGetProfileRequestData } from "../models/eft/match/IGetProfileRequestData";
import {
    IGetRaidConfigurationRequestData
} from "../models/eft/match/IGetRaidConfigurationRequestData";
import { IJoinMatchRequestData } from "../models/eft/match/IJoinMatchRequestData";
import { IJoinMatchResult } from "../models/eft/match/IJoinMatchResult";
import { IPutMetricsRequestData } from "../models/eft/match/IPutMetricsRequestData";
import { IRemovePlayerFromGroupRequest } from "../models/eft/match/IRemovePlayerFromGroupRequest";
import { ISendGroupInviteRequest } from "../models/eft/match/ISendGroupInviteRequest";
import { IUpdatePingRequestData } from "../models/eft/match/IUpdatePingRequestData";
import { DatabaseServer } from "../servers/DatabaseServer";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { JsonUtil } from "../utils/JsonUtil";

@injectable()
export class MatchCallbacks
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("MatchController") protected matchController: MatchController,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer
    )
    { }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public updatePing(url: string, info: IUpdatePingRequestData, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public exitMatch(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public exitToMenu(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public startGroupSearch(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public stopGroupSearch(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public sendGroupInvite(url: string, info: ISendGroupInviteRequest, sessionID: string): IGetBodyResponseData<string>
    {
        return this.httpResponse.getBody("2427943f23698ay9f2863735");
    }

    /** Handle client/match/group/invite/accept */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public acceptGroupInvite(url: string, info: IAcceptGroupInviteRequest, sessionID: string): IGetBodyResponseData<IAcceptGroupInviteResponse[]>
    {
        const result = [];
        result.push({});

        return this.httpResponse.getBody(result);
    }

    /** Handle client/match/group/invite/cancel */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public cancelGroupInvite(url: string, info: ICancelGroupInviteRequest, sessionID: string): IGetBodyResponseData<boolean>
    {
        return this.httpResponse.getBody(true);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public cancelAllGroupInvite(url: string, info: any, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public putMetrics(url: string, info: IPutMetricsRequestData, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getProfile(url: string, info: IGetProfileRequestData, sessionID: string): IGetBodyResponseData<IPmcData[]>
    {
        return this.httpResponse.getBody(this.matchController.getProfile(info));
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public serverAvailable(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<any> | IGetBodyResponseData<true>
    {
        const output = this.matchController.getEnabled();

        if (output === false)
        {
            return this.httpResponse.getBody(null, 420, "Please play as PMC and go through the offline settings screen before pressing ready.");
        }

        return this.httpResponse.getBody(output);
    }

    public joinMatch(url: string, info: IJoinMatchRequestData, sessionID: string): IGetBodyResponseData<IJoinMatchResult[]>
    {
        return this.httpResponse.getBody(this.matchController.joinMatch(info, sessionID));
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getMetrics(url: string, info: any, sessionID: string): IGetBodyResponseData<string>
    {
        return this.httpResponse.getBody(this.jsonUtil.serialize(this.databaseServer.getTables().match.metrics));
    }

    /**
     * Handle client/match/group/status
     * @returns 
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getGroupStatus(url: string, info: IGetGroupStatusRequestData, sessionID: string): IGetBodyResponseData<any>
    {
        return this.httpResponse.getBody(this.matchController.getGroupStatus(info));
    }

    public createGroup(url: string, info: ICreateGroupRequestData, sessionID: string): IGetBodyResponseData<any>
    {
        return this.httpResponse.getBody(this.matchController.createGroup(sessionID, info));
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public deleteGroup(url: string, info: any, sessionID: string): INullResponseData
    {
        this.matchController.deleteGroup(info);
        return this.httpResponse.nullResponse();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public removePlayerFromGroup(url: string, info: IRemovePlayerFromGroupRequest, sessionID: string): INullResponseData
    {
        return this.httpResponse.nullResponse();
    }

    public endOfflineRaid(url: string, info: IEndOfflineRaidRequestData, sessionID: string): INullResponseData
    {
        this.matchController.endOfflineRaid(info, sessionID);
        return this.httpResponse.nullResponse();
    }

    public getRaidConfiguration(url: string, info: IGetRaidConfigurationRequestData, sessionID: string): INullResponseData
    {
        this.matchController.startOfflineRaid(info, sessionID);
        return this.httpResponse.nullResponse();
    }
}
