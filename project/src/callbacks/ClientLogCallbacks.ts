import { ClientLogController } from "@spt-aki/controllers/ClientLogController";
import { INullResponseData } from "@spt-aki/models/eft/httpResponse/INullResponseData";
import { IClientLogRequest } from "@spt-aki/models/spt/logging/IClientLogRequest";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

/** Handle client logging related events */
@injectable()
export class ClientLogCallbacks
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ClientLogController") protected clientLogController: ClientLogController
    ) 
    { }

    /**
     * Handle /singleplayer/log
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public clientLog(url: string, info: IClientLogRequest, sessionID: string): INullResponseData
    {
        this.clientLogController.clientLog(info);
        return this.httpResponse.nullResponse();
    }
}