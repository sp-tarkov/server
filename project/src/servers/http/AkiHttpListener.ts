import { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "http";
import { inject, injectAll, injectable } from "tsyringe";
import zlib from "zlib";

import { Serializer } from "../../di/Serializer";
import { ILogger } from "../../models/spt/utils/ILogger";
import { HttpRouter } from "../../routers/HttpRouter";
import { LocalisationService } from "../../services/LocalisationService";
import { HttpResponseUtil } from "../../utils/HttpResponseUtil";
import { JsonUtil } from "../../utils/JsonUtil";
import { HttpBufferHandler } from "./HttpBufferHandler";
import { IHttpListener } from "./IHttpListener";

@injectable()
export class AkiHttpListener implements IHttpListener
{

    constructor(
        @inject("HttpRouter") protected httpRouter: HttpRouter, // TODO: delay required
        @injectAll("Serializer") protected serializers: Serializer[],
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RequestsLogger") protected requestsLogger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("HttpBufferHandler") protected httpBufferHandler: HttpBufferHandler
    )
    {
    }

    public canHandle(_: string, req: IncomingMessage): boolean 
    {
        return req.method === "GET" || req.method === "PUT" || req.method === "POST";
    }

    public handle(sessionId: string, req: IncomingMessage, resp: ServerResponse): void
    {
        // TODO: cleanup into interface IVerbHandler
        switch (req.method)
        {
            case "GET":
            {
                const response = this.getResponse(sessionId, req, null);
                this.sendResponse(sessionId, req, resp, null, response);
                break;
            }
            case "POST":
            {
                req.on("data", (data: any) =>
                {
                    const value = (req.headers["debug"] === "1") ? data.toString() : zlib.inflateSync(data);
                    const response = this.getResponse(sessionId, req, value);
                    this.sendResponse(sessionId, req, resp, value, response);
                });
                break;
            }
            case "PUT":
            {
                req.on("data", (data) =>
                {
                    // receive data
                    if ("expect" in req.headers)
                    {
                        const requestLength = parseInt(req.headers["content-length"]);
                            
                        if (!this.httpBufferHandler.putInBuffer(req.headers.sessionid, data, requestLength))
                        {
                            resp.writeContinue();
                        }
                    }
                });
                    
                req.on("end", async () =>
                {
                    const data = this.httpBufferHandler.getFromBuffer(sessionId);
                    this.httpBufferHandler.resetBuffer(sessionId);
                    
                    let value = zlib.inflateSync(data);
                    if (!value)
                    {
                        value = data;
                    }
                    const response = this.getResponse(sessionId, req, value);
                    this.sendResponse(sessionId, req, resp, value, response);
                });
                break;
            }
            default:
            {

                this.logger.warning(this.localisationService.getText("unknown_request"));
                break;
            }
        }
    }

    public sendResponse(sessionID: string, req: IncomingMessage, resp: ServerResponse, body: Buffer, output: string): void
    {
        const info = this.getBodyInfo(body);
        let handled = false;

        // Check if this is a debug request, if so just send the raw response without transformation.
        if (req.headers["debug"] === "1") 
        {
            this.sendJson(resp, output, sessionID);
        }

        // Attempt to use one of our serializers to do the job
        for (const serializer of this.serializers)
        {
            if (serializer.canHandle(output))
            {
                serializer.serialize(sessionID, req, resp, info);
                handled = true;
                break;
            }
        }
        // If no serializer can handle the request we zlib the output and send it
        if (!handled)
        {
            this.sendZlibJson(resp, output, sessionID);
        }

        if (globalThis.G_LOG_REQUESTS)
        {
            let data: any;
            try
            {
                data = JSON.parse(output);
            }
            catch (e)
            {
                data = output;
            }
            const log = new Response(req.method, data);
            this.requestsLogger.info(`RESPONSE=${this.jsonUtil.serialize(log)}`);
        }
    }
    
    public getResponse(sessionID: string, req: IncomingMessage, body: Buffer): string
    {
        const info = this.getBodyInfo(body, req.url);
        if (globalThis.G_LOG_REQUESTS)
        {
            // Parse quest info into object
            const data = (typeof info === "object")
                ? info
                : JSON.parse(info);

            const log = new Request(req.method, new RequestData(req.url, req.headers, data));
            this.requestsLogger.info(`REQUEST=${this.jsonUtil.serialize(log)}`);
        }
        
        let output = this.httpRouter.getResponse(req, info, sessionID);
        /* route doesn't exist or response is not properly set up */
        if (!output)
        {
            this.logger.error(this.localisationService.getText("unhandled_response", req.url));
            this.logger.info(info);
            output = <string><unknown> this.httpResponse.getBody(null, 404, `UNHANDLED RESPONSE: ${req.url}`);
        }
        return output;
    }

    protected  getBodyInfo(body: Buffer, requestUrl = null): any
    {
        const text = (body) ? body.toString() : "{}";
        const info = (text) ? this.jsonUtil.deserialize<any>(text, requestUrl) : {};
        return info;
    }

    public sendJson(resp: ServerResponse, output: string, sessionID: string): void
    {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        resp.writeHead(200, "OK", { "Content-Type": "application/json", "Set-Cookie": `PHPSESSID=${sessionID}` });
        resp.end(output);
    }

    public sendZlibJson(resp: ServerResponse, output: string, sessionID: string): void
    {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        resp.writeHead(200, "OK", { "Content-Type": "application/json", "Set-Cookie": `PHPSESSID=${sessionID}` });
        zlib.deflate(output, (_, buf) => resp.end(buf));
    }

}

class RequestData
{
    constructor(
        public url: string,
        public headers: IncomingHttpHeaders,
        public data?: any
    )
    {}
}

class Request
{
    constructor(
        public type: string,
        public req: RequestData
    )
    {} 
}

class Response 
{
    constructor(
        public type: string,
        public response: any
    )
    {}
}