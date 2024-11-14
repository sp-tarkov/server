import { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import zlib from "node:zlib";
import { Serializer } from "@spt/di/Serializer";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { HttpRouter } from "@spt/routers/HttpRouter";
import { IHttpListener } from "@spt/servers/http/IHttpListener";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { inject, injectAll, injectable } from "tsyringe";
import util from "node:util";

const zlibInflate = util.promisify(zlib.inflate);
const zlibDeflate = util.promisify(zlib.deflate);

@injectable()
export class SptHttpListener implements IHttpListener {
    constructor(
        @inject("HttpRouter") protected httpRouter: HttpRouter, // TODO: delay required
        @injectAll("Serializer") protected serializers: Serializer[],
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RequestsLogger") protected requestsLogger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
    ) {}

    public canHandle(_: string, req: IncomingMessage): boolean {
        return ["GET", "PUT", "POST"].includes(req.method);
    }

    public async handle(sessionId: string, req: IncomingMessage, resp: ServerResponse): Promise<void> {
        switch (req.method) {
            case "GET": {
                const response = await this.getResponse(sessionId, req, undefined);
                await this.sendResponse(sessionId, req, resp, undefined, response);
                break;
            }
            // these are handled almost identically.
            case "POST":
            case "PUT": {
                // Data can come in chunks. Notably, if someone saves their profile (which can be
                // kinda big), on a slow connection. We need to re-assemble the entire http payload
                // before processing it.

                const requestLength = Number.parseInt(req.headers["content-length"]);
                const buffer = Buffer.alloc(requestLength);
                let written = 0;

                req.on("data", (data: any) => {
                    data.copy(buffer, written, 0);
                    written += data.length;
                });

                req.on("end", async () => {
                    // Contrary to reasonable expectations, the content-encoding is _not_ actually used to
                    // determine if the payload is compressed. All PUT requests are, and POST requests without
                    // debug = 1 are as well. This should be fixed.
                    // let compressed = req.headers["content-encoding"] === "deflate";
                    const requestIsCompressed = req.headers.requestcompressed !== "0";
                    const requestCompressed = req.method === "PUT" || requestIsCompressed;

                    const value = requestCompressed ? await zlibInflate(buffer) : buffer;
                    if (!requestIsCompressed) {
                        this.logger.debug(value.toString(), true);
                    }

                    const response = await this.getResponse(sessionId, req, value);
                    await this.sendResponse(sessionId, req, resp, value, response);
                });

                break;
            }

            default: {
                this.logger.warning(`${this.localisationService.getText("unknown_request")}: ${req.method}`);
                break;
            }
        }
    }

    /**
     * Send HTTP response back to sender
     * @param sessionID Player id making request
     * @param req Incoming request
     * @param resp Outgoing response
     * @param body Buffer
     * @param output Server generated response data
     */
    public async sendResponse(
        sessionID: string,
        req: IncomingMessage,
        resp: ServerResponse,
        body: Buffer,
        output: string,
    ): Promise<void> {
        const bodyInfo = this.getBodyInfo(body);

        if (this.isDebugRequest(req)) {
            // Send only raw response without transformation
            this.sendJson(resp, output, sessionID);
            this.logRequest(req, output);

            return;
        }

        // Not debug, minority of requests need a serializer to do the job (IMAGE/BUNDLE/NOTIFY)
        const serialiser = this.serializers.find((x) => x.canHandle(output));
        if (serialiser) {
            await serialiser.serialize(sessionID, req, resp, bodyInfo);
        } else {
            // No serializer can handle the request (majority of requests dont), zlib the output and send response back
            await this.sendZlibJson(resp, output, sessionID);
        }

        this.logRequest(req, output);
    }

    /**
     * Is request flagged as debug enabled
     * @param req Incoming request
     * @returns True if request is flagged as debug
     */
    protected isDebugRequest(req: IncomingMessage): boolean {
        return req.headers.responsecompressed === "0";
    }

    /**
     * Log request if enabled
     * @param req Incoming message request
     * @param output Output string
     */
    protected logRequest(req: IncomingMessage, output: string): void {
        //
        if (globalThis.G_LOG_REQUESTS) {
            const log = new Response(req.method, output);
            this.requestsLogger.info(`RESPONSE=${this.jsonUtil.serialize(log)}`);
        }
    }

    public async getResponse(sessionID: string, req: IncomingMessage, body: Buffer): Promise<string> {
        const info = this.getBodyInfo(body, req.url);
        if (globalThis.G_LOG_REQUESTS) {
            // Parse quest info into object
            const data = typeof info === "object" ? info : this.jsonUtil.deserialize(info);

            const log = new Request(req.method, new RequestData(req.url, req.headers, data));
            this.requestsLogger.info(`REQUEST=${this.jsonUtil.serialize(log)}`);
        }

        let output = await this.httpRouter.getResponse(req, info, sessionID);
        /* route doesn't exist or response is not properly set up */
        if (!output) {
            this.logger.error(this.localisationService.getText("unhandled_response", req.url));
            this.logger.info(info);
            output = <string>(<unknown>this.httpResponse.getBody(undefined, 404, `UNHANDLED RESPONSE: ${req.url}`));
        }
        return output;
    }

    protected getBodyInfo(body: Buffer, requestUrl = undefined): any {
        const text = body ? body.toString() : "{}";
        const info = text ? this.jsonUtil.deserialize<any>(text, requestUrl) : {};
        return info;
    }

    public sendJson(resp: ServerResponse, output: string, sessionID: string): void {
        resp.writeHead(200, "OK", { "Content-Type": "application/json", "Set-Cookie": `PHPSESSID=${sessionID}` });
        resp.end(output);
    }

    public async sendZlibJson(resp: ServerResponse, output: string, sessionID: string): Promise<void> {
        const buf = await zlibDeflate(output);
        resp.end(buf);
    }
}

class RequestData {
    constructor(
        public url: string,
        public headers: IncomingHttpHeaders,
        public data?: any,
    ) {}
}

class Request {
    constructor(
        public type: string,
        public req: RequestData,
    ) {}
}

class Response {
    constructor(
        public type: string,
        public response: any,
    ) {}
}
