import { NotifierController } from "@spt/controllers/NotifierController";
import { Serializer } from "@spt/di/Serializer";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class NotifySerializer extends Serializer {
    constructor(
        @inject("NotifierController") protected notifierController: NotifierController,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
    ) {
        super();
    }

    public override async serialize(_sessionID: string, req: Request, _: any): Promise<Response> {
        const splittedUrl = req.url.split("/");
        const tmpSessionID = splittedUrl[splittedUrl.length - 1].split("?last_id")[0];

        /**
         * Take our array of JSON message objects and cast them to JSON strings, so that they can then
         *  be sent to client as NEWLINE separated strings... yup.
         */
        await this.notifierController
            .notifyAsync(tmpSessionID)
            .then((messages: any) => messages.map((message: any) => this.jsonUtil.serialize(message)).join("\n"))
            .then((text) => {
                return this.httpServerHelper.sendJson(text);
            });
    }

    public override canHandle(route: string): boolean {
        return route.toUpperCase() === "NOTIFY";
    }
}
