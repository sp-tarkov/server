import { IncomingMessage, ServerResponse } from "http";
import { inject, injectable } from "tsyringe";

import { NotifierController } from "../../controllers/NotifierController";
import { Serializer } from "../../di/Serializer";
import { HttpServerHelper } from "../../helpers/HttpServerHelper";
import { JsonUtil } from "../../utils/JsonUtil";

@injectable()
export class NotifySerializer extends Serializer
{

    constructor(
        @inject("NotifierController") protected notifierController: NotifierController,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper
    )
    {
        super();
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public override serialize(_sessionID: string, req: IncomingMessage, resp: ServerResponse, _: any): void
    {
        const splittedUrl = req.url.split("/");
        const tmpSessionID = splittedUrl[splittedUrl.length - 1].split("?last_id")[0];

        /**
         * Take our array of JSON message objects and cast them to JSON strings, so that they can then
         *  be sent to client as NEWLINE separated strings... yup.
         */
        this.notifierController.notifyAsync(tmpSessionID)
            .then((messages: any) => messages.map((message: any) => this.jsonUtil.serialize(message)).join("\n"))
            .then((text) => this.httpServerHelper.sendTextJson(resp, text));
    }

    public override canHandle(route: string): boolean
    {
        return route.toUpperCase() === "NOTIFY";
    }
}