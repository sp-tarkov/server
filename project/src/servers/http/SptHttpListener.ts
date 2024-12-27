import util from "node:util";
import zlib from "node:zlib";
import type { HttpServerHelper } from "@project/src/helpers/HttpServerHelper";
import { Serializer } from "@spt/di/Serializer";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { HttpRouter } from "@spt/routers/HttpRouter";
import type { IHttpListener } from "@spt/servers/http/IHttpListener";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { inject, injectAll, injectable } from "tsyringe";

const zlibInflate = util.promisify(zlib.inflate);

@injectable()
export class SptHttpListener implements IHttpListener {
    constructor(
        @inject("HttpRouter") protected httpRouter: HttpRouter, // TODO: delay required
        @injectAll("Serializer") protected serializers: Serializer[],
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RequestsLogger") protected requestsLogger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
    ) {}

    public canHandle(_: string, req: Request): boolean {
        return ["GET", "PUT", "POST"].includes(req.method);
    }

    public async handle(sessionId: string, req: Request): Promise<Response> {
        switch (req.method) {
            case "GET": {
                const response = await this.getResponse(sessionId, req, undefined);
                return await this.sendResponse(sessionId, req, undefined, response);
            }
            // these are handled almost identically.
            case "POST":
            case "PUT": {
                // Data can come in chunks. Notably, if someone saves their profile (which can be
                // kinda big), on a slow connection. We need to re-assemble the entire http payload
                // before processing it.

                const reader = req.body?.getReader();
                if (!reader) {
                    throw new Error("Request body is not available");
                }

                const buffer = await this.processPOSTPUTChunks(reader); // Process chunks into a single buffer

                // Contrary to reasonable expectations, the content-encoding is _not_ actually used to
                // determine if the payload is compressed. All PUT requests are, and POST requests without
                // debug = 1 are as well. This should be fixed.
                // let compressed = req.headers["content-encoding"] === "deflate";
                const requestIsCompressed = req.headers.get("requestcompressed") !== "0"; // Check for compression header
                const isPutMethod = req.method === "PUT"; // Check if method is PUT

                // If the request is compressed, decompress it; otherwise, use the raw buffer
                const value = isPutMethod || requestIsCompressed ? await zlibInflate(buffer) : buffer;

                // If the request is not compressed, log the value for debugging
                if (!requestIsCompressed) {
                    this.logger.debug(value.toString(), true);
                }

                // Process the response and send it back
                const response = await this.getResponse(sessionId, req, value);
                return this.sendResponse(sessionId, req, value, response);
            }

            default: {
                this.logger.warning(`${this.localisationService.getText("unknown_request")}: ${req.method}`);
                break;
            }
        }
    }

    protected async processPOSTPUTChunks(reader: ReadableStreamDefaultReader): Promise<Buffer> {
        let totalDataLength = 0;
        const chunks: Uint8Array[] = [];

        let done = false;
        // Read all chunks from the stream and accumulate them in an array
        while (!done) {
            const readResult = await reader.read(); // Read the next chunk
            const isDoneReading = readResult.done;
            const value = readResult.value;

            done = isDoneReading;
            if (value) {
                chunks.push(value); // Store the chunk of data
                totalDataLength += value.length;
            }
        }

        const buffer = Buffer.alloc(totalDataLength);
        let offset = 0;
        for (const chunk of chunks) {
            buffer.set(chunk, offset); // Place each chunk in the buffer
            offset += chunk.length;
        }

        return buffer;
    }

    /**
     * Send HTTP response back to sender
     * @param sessionID Player id making request
     * @param req Incoming request
     * @param resp Outgoing response
     * @param body Buffer
     * @param output Server generated response data
     */
    public async sendResponse(sessionID: string, req: Request, body: Buffer, output: string): Promise<Response> {
        const bodyInfo = this.getBodyInfo(body);

        if (this.isDebugRequest(req)) {
            // Send only raw response without transformation
            this.logRequest(req, output);
            return this.httpServerHelper.sendJson(output, sessionID);
        }

        // Not debug, minority of requests need a serializer to do the job (IMAGE/BUNDLE/NOTIFY)
        const serialiser = this.serializers.find((x) => x.canHandle(output));

        this.logRequest(req, output);

        if (serialiser) {
            return await serialiser.serialize(sessionID, req, bodyInfo);
        }

        // No serializer can handle the request (majority of requests dont), zlib the output and send response back
        return await this.httpServerHelper.sendZlibJson(output, sessionID);
    }

    /**
     * Is request flagged as debug enabled
     * @param req Incoming request
     * @returns True if request is flagged as debug
     */
    protected isDebugRequest(req: Request): boolean {
        return req.headers.get("responsecompressed") === "0";
    }

    /**
     * Log request if enabled
     * @param req Incoming message request
     * @param output Output string
     */
    protected logRequest(req: Request, output: string): void {
        //
        if (globalThis.G_LOG_REQUESTS) {
            const log = new SPTResponse(req.method, output);
            this.requestsLogger.info(`RESPONSE=${this.jsonUtil.serialize(log)}`);
        }
    }

    public async getResponse(sessionID: string, req: Request, body: Buffer): Promise<string> {
        const path = new URL(req.url).pathname;
        const info = this.getBodyInfo(body, path);
        if (globalThis.G_LOG_REQUESTS) {
            // Parse quest info into object
            const data = typeof info === "object" ? info : this.jsonUtil.deserialize(info);

            const log = new SPTRequest(req.method, new SPTRequestData(path, req.headers, data));
            this.requestsLogger.info(`REQUEST=${this.jsonUtil.serialize(log)}`);
        }

        let output = await this.httpRouter.getResponse(req, info, sessionID);
        /* route doesn't exist or response is not properly set up */
        if (!output) {
            this.logger.error(this.localisationService.getText("unhandled_response", path));
            this.logger.info(info);
            output = <string>(<unknown>this.httpResponse.getBody(undefined, 404, `UNHANDLED RESPONSE: ${path}`));
        }
        return output;
    }

    protected getBodyInfo(body: Buffer, requestUrl?: string): any {
        const text = body ? body.toString() : "{}";
        const info = text ? this.jsonUtil.deserialize<any>(text, requestUrl) : {};
        return info;
    }
}

class SPTRequestData {
    constructor(
        public url: string,
        public headers: Headers,
        public data?: any,
    ) {}
}

class SPTRequest {
    constructor(
        public type: string,
        public req: SPTRequestData,
    ) {}
}

class SPTResponse {
    constructor(
        public type: string,
        public response: any,
    ) {}
}
