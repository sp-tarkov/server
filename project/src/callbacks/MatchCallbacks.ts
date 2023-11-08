import { inject, injectable } from "tsyringe";

import { MatchController } from "@spt-aki/controllers/MatchController";
import { IEmptyRequestData } from "@spt-aki/models/eft/common/IEmptyRequestData";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt-aki/models/eft/httpResponse/INullResponseData";
import { IAcceptGroupInviteRequest } from "@spt-aki/models/eft/match/IAcceptGroupInviteRequest";
import { IAcceptGroupInviteResponse } from "@spt-aki/models/eft/match/IAcceptGroupInviteResponse";
import { ICancelGroupInviteRequest } from "@spt-aki/models/eft/match/ICancelGroupInviteRequest";
import { ICreateGroupRequestData } from "@spt-aki/models/eft/match/ICreateGroupRequestData";
import { IEndOfflineRaidRequestData } from "@spt-aki/models/eft/match/IEndOfflineRaidRequestData";
import { IGetGroupStatusRequestData } from "@spt-aki/models/eft/match/IGetGroupStatusRequestData";
import { IGetProfileRequestData } from "@spt-aki/models/eft/match/IGetProfileRequestData";
import { IGetRaidConfigurationRequestData } from "@spt-aki/models/eft/match/IGetRaidConfigurationRequestData";
import { IJoinMatchRequestData } from "@spt-aki/models/eft/match/IJoinMatchRequestData";
import { IJoinMatchResult } from "@spt-aki/models/eft/match/IJoinMatchResult";
import { IPutMetricsRequestData } from "@spt-aki/models/eft/match/IPutMetricsRequestData";
import { IRemovePlayerFromGroupRequest } from "@spt-aki/models/eft/match/IRemovePlayerFromGroupRequest";
import { ISendGroupInviteRequest } from "@spt-aki/models/eft/match/ISendGroupInviteRequest";
import { ITransferGroupRequest } from "@spt-aki/models/eft/match/ITransferGroupRequest";
import { IUpdatePingRequestData } from "@spt-aki/models/eft/match/IUpdatePingRequestData";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class MatchCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("MatchController") protected matchController: MatchController,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer
    ) {}

    /** Handle client/match/updatePing */
    public updatePing(url: string, info: IUpdatePingRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    // Handle client/match/exit
    public exitMatch(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** Handle client/match/group/exit_from_menu */
    public exitToMenu(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    public startGroupSearch(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    public stopGroupSearch(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** Handle client/match/group/invite/send */
    public sendGroupInvite(
        url: string,
        info: ISendGroupInviteRequest,
        sessionID: string
    ): IGetBodyResponseData<string> {
        return this.httpResponse.getBody("2427943f23698ay9f2863735");
    }

    /** Handle client/match/group/invite/accept */
    public acceptGroupInvite(
        url: string,
        info: IAcceptGroupInviteRequest,
        sessionID: string
    ): IGetBodyResponseData<IAcceptGroupInviteResponse[]> {
        const result = [];
        result.push({});

        return this.httpResponse.getBody(result);
    }

    /** Handle client/match/group/invite/cancel */
    public cancelGroupInvite(
        url: string,
        info: ICancelGroupInviteRequest,
        sessionID: string
    ): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }
    /** Handle client/match/group/transfer */
    public transferGroup(url: string, info: ITransferGroupRequest, sessionID: string): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /** Handle client/match/group/invite/cancel-all */
    public cancelAllGroupInvite(url: string, info: any, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** @deprecated - not called on raid start/end or game start/exit */
    public putMetrics(url: string, info: IPutMetricsRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** Handle raid/profile/list */
    public getProfile(url: string, info: IGetProfileRequestData, sessionID: string): IGetBodyResponseData<IPmcData[]> {
        return this.httpResponse.getBody(this.matchController.getProfile(info));
    }

    // Handle client/match/available
    public serverAvailable(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<boolean> {
        const output = this.matchController.getEnabled();

        return this.httpResponse.getBody(output);
    }

    /** Handle match/group/start_game */
    public joinMatch(
        url: string,
        info: IJoinMatchRequestData,
        sessionID: string
    ): IGetBodyResponseData<IJoinMatchResult> {
        return this.httpResponse.getBody(this.matchController.joinMatch(info, sessionID));
    }

    /** Handle client/getMetricsConfig */
    public getMetrics(url: string, info: any, sessionID: string): IGetBodyResponseData<string> {
        return this.httpResponse.getBody(this.jsonUtil.serialize(this.databaseServer.getTables().match.metrics));
    }

    /**
     * @deprecated - not called on raid start/end or game start/exit
     * Handle client/match/group/status
     * @returns
     */
    public getGroupStatus(url: string, info: IGetGroupStatusRequestData, sessionID: string): IGetBodyResponseData<any> {
        return this.httpResponse.getBody(this.matchController.getGroupStatus(info));
    }

    /** Handle client/match/group/create */
    public createGroup(url: string, info: ICreateGroupRequestData, sessionID: string): IGetBodyResponseData<any> {
        return this.httpResponse.getBody(this.matchController.createGroup(sessionID, info));
    }

    /** Handle client/match/group/delete */
    public deleteGroup(url: string, info: any, sessionID: string): INullResponseData {
        this.matchController.deleteGroup(info);
        return this.httpResponse.nullResponse();
    }

    // Handle client/match/group/leave
    public leaveGroup(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /** Handle client/match/group/player/remove */
    public removePlayerFromGroup(
        url: string,
        info: IRemovePlayerFromGroupRequest,
        sessionID: string
    ): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** Handle client/match/offline/end */
    public endOfflineRaid(url: string, info: IEndOfflineRaidRequestData, sessionID: string): INullResponseData {
        this.matchController.endOfflineRaid(info, sessionID);
        return this.httpResponse.nullResponse();
    }

    /** Handle client/raid/configuration */
    public getRaidConfiguration(
        url: string,
        info: IGetRaidConfigurationRequestData,
        sessionID: string
    ): INullResponseData {
        this.matchController.startOfflineRaid(info, sessionID);
        return this.httpResponse.nullResponse();
    }
}
