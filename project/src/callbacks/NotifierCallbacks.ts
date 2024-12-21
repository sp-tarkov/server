import { NotifierController } from "@spt/controllers/NotifierController";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IUIDRequestData } from "@spt/models/eft/common/request/IUIDRequestData";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { INotifierChannel } from "@spt/models/eft/notifier/INotifier";
import type { ISelectProfileResponse } from "@spt/models/eft/notifier/ISelectProfileResponse";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class NotifierCallbacks {
    constructor(
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("NotifierController") protected notifierController: NotifierController,
    ) {}

    /**
     * If we don't have anything to send, it's ok to not send anything back
     * because notification requests can be long-polling. In fact, we SHOULD wait
     * until we actually have something to send because otherwise we'd spam the client
     * and the client would abort the connection due to spam.
     */
    public sendNotification(sessionID: string, req: any, resp: any, data: any): void {
        const splittedUrl = req.url.split("/");
        const tmpSessionID = splittedUrl[splittedUrl.length - 1].split("?last_id")[0];

        /**
         * Take our array of JSON message objects and cast them to JSON strings, so that they can then
         *  be sent to client as NEWLINE separated strings... yup.
         */
        this.notifierController
            .notifyAsync(tmpSessionID)
            .then((messages: any) => messages.map((message: any) => this.jsonUtil.serialize(message)).join("\n"))
            .then((text) => this.httpServerHelper.sendTextJson(resp, text));
    }

    /** Handle push/notifier/get */
    /** Handle push/notifier/getwebsocket */
    // TODO: removed from client?
    public getNotifier(url: string, info: any, sessionID: string): IGetBodyResponseData<any[]> {
        return this.httpResponse.emptyArrayResponse();
    }

    /** Handle client/notifier/channel/create */
    public createNotifierChannel(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<INotifierChannel> {
        return this.httpResponse.getBody(this.notifierController.getChannel(sessionID));
    }

    /**
     * Handle client/game/profile/select
     * @returns ISelectProfileResponse
     */
    public selectProfile(
        url: string,
        info: IUIDRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ISelectProfileResponse> {
        return this.httpResponse.getBody({ status: "ok" });
    }

    public notify(url: string, info: any, sessionID: string): string {
        return "NOTIFY";
    }
}
