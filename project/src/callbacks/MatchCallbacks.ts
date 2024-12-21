import { MatchController } from "@spt/controllers/MatchController";
import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IMetrics } from "@spt/models/eft/common/tables/IMatch";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import type { IEndLocalRaidRequestData } from "@spt/models/eft/match/IEndLocalRaidRequestData";
import type { IGetRaidConfigurationRequestData } from "@spt/models/eft/match/IGetRaidConfigurationRequestData";
import type { IGroupCharacter } from "@spt/models/eft/match/IGroupCharacter";
import type { IMatchGroupCurrentResponse } from "@spt/models/eft/match/IMatchGroupCurrentResponse";
import type { IMatchGroupInviteSendRequest } from "@spt/models/eft/match/IMatchGroupInviteSendRequest";
import type { IMatchGroupPlayerRemoveRequest } from "@spt/models/eft/match/IMatchGroupPlayerRemoveRequest";
import type { IMatchGroupStartGameRequest } from "@spt/models/eft/match/IMatchGroupStartGameRequest";
import type { IMatchGroupStatusRequest } from "@spt/models/eft/match/IMatchGroupStatusRequest";
import type { IMatchGroupStatusResponse } from "@spt/models/eft/match/IMatchGroupStatusResponse";
import type { IMatchGroupTransferRequest } from "@spt/models/eft/match/IMatchGroupTransferRequest";
import type { IProfileStatusResponse } from "@spt/models/eft/match/IProfileStatusResponse";
import type { IPutMetricsRequestData } from "@spt/models/eft/match/IPutMetricsRequestData";
import type { IRequestIdRequest } from "@spt/models/eft/match/IRequestIdRequest";
import type { IStartLocalRaidRequestData } from "@spt/models/eft/match/IStartLocalRaidRequestData";
import type { IStartLocalRaidResponseData } from "@spt/models/eft/match/IStartLocalRaidResponseData";
import type { IUpdatePingRequestData } from "@spt/models/eft/match/IUpdatePingRequestData";
import { DatabaseService } from "@spt/services/DatabaseService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class MatchCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("MatchController") protected matchController: MatchController,
        @inject("DatabaseService") protected databaseService: DatabaseService,
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
    public exitFromMenu(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** Handle client/match/group/current */
    public groupCurrent(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IMatchGroupCurrentResponse> {
        return this.httpResponse.getBody({ squad: [] });
    }

    /** Handle client/match/group/looking/start */
    public startGroupSearch(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** Handle client/match/group/looking/stop */
    public stopGroupSearch(url: string, info: IEmptyRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** Handle client/match/group/invite/send */
    public sendGroupInvite(
        url: string,
        info: IMatchGroupInviteSendRequest,
        sessionID: string,
    ): IGetBodyResponseData<string> {
        return this.httpResponse.getBody("2427943f23698ay9f2863735");
    }

    /** Handle client/match/group/invite/accept */
    public acceptGroupInvite(
        url: string,
        info: IRequestIdRequest,
        sessionId: string,
    ): IGetBodyResponseData<IGroupCharacter[]> {
        const result = [];
        result.push({});

        return this.httpResponse.getBody(result);
    }

    /** Handle client/match/group/invite/decline */
    public declineGroupInvite(url: string, info: IRequestIdRequest, sessionId: string): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /** Handle client/match/group/invite/cancel */
    public cancelGroupInvite(url: string, info: IRequestIdRequest, sessionID: string): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /** Handle client/match/group/transfer */
    public transferGroup(
        url: string,
        info: IMatchGroupTransferRequest,
        sessionId: string,
    ): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /** Handle client/match/group/invite/cancel-all */
    public cancelAllGroupInvite(
        url: string,
        info: IEmptyRequestData,
        sessionId: string,
    ): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /** Handle client/putMetrics */
    public putMetrics(url: string, request: IPutMetricsRequestData, sessionId: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** Handle client/analytics/event-disconnect */
    public eventDisconnect(url: string, request: IPutMetricsRequestData, sessionId: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    // Handle client/match/available
    public serverAvailable(url: string, info: IEmptyRequestData, sessionId: string): IGetBodyResponseData<boolean> {
        const output = this.matchController.getEnabled();

        return this.httpResponse.getBody(output);
    }

    /** Handle match/group/start_game */
    public joinMatch(
        url: string,
        info: IMatchGroupStartGameRequest,
        sessionID: string,
    ): IGetBodyResponseData<IProfileStatusResponse> {
        return this.httpResponse.getBody(this.matchController.joinMatch(info, sessionID));
    }

    /** Handle client/getMetricsConfig */
    public getMetrics(url: string, info: any, sessionID: string): IGetBodyResponseData<IMetrics> {
        return this.httpResponse.getBody(this.databaseService.getMatch().metrics);
    }

    /**
     * Called periodically while in a group
     * Handle client/match/group/status
     * @returns
     */
    public getGroupStatus(
        url: string,
        info: IMatchGroupStatusRequest,
        sessionID: string,
    ): IGetBodyResponseData<IMatchGroupStatusResponse> {
        return this.httpResponse.getBody(this.matchController.getGroupStatus(info));
    }

    /** Handle client/match/group/delete */
    public deleteGroup(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<boolean> {
        this.matchController.deleteGroup(info);
        return this.httpResponse.getBody(true);
    }

    // Handle client/match/group/leave
    public leaveGroup(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /** Handle client/match/group/player/remove */
    public removePlayerFromGroup(
        url: string,
        info: IMatchGroupPlayerRemoveRequest,
        sessionID: string,
    ): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /** Handle client/match/local/start */
    public startLocalRaid(
        url: string,
        info: IStartLocalRaidRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IStartLocalRaidResponseData> {
        return this.httpResponse.getBody(this.matchController.startLocalRaid(sessionID, info));
    }

    /** Handle client/match/local/end */
    public endLocalRaid(url: string, info: IEndLocalRaidRequestData, sessionID: string): INullResponseData {
        this.matchController.endLocalRaid(sessionID, info);
        return this.httpResponse.nullResponse();
    }

    /** Handle client/raid/configuration */
    public getRaidConfiguration(
        url: string,
        info: IGetRaidConfigurationRequestData,
        sessionID: string,
    ): INullResponseData {
        this.matchController.configureOfflineRaid(info, sessionID);
        return this.httpResponse.nullResponse();
    }

    /** Handle client/raid/configuration-by-profile */
    public getConfigurationByProfile(
        url: string,
        info: IGetRaidConfigurationRequestData,
        sessionID: string,
    ): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** Handle client/match/group/raid/ready */
    public raidReady(url: string, info: IEmptyRequestData, sessionId: string): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /** Handle client/match/group/raid/not-ready */
    public notRaidReady(url: string, info: IEmptyRequestData, sessionId: string): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }
}
