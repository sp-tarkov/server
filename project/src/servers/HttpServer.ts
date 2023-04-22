import http, { IncomingMessage, ServerResponse } from "http";
import { inject, injectable, injectAll } from "tsyringe";

import { ApplicationContext } from "../context/ApplicationContext";
import { ContextVariableType } from "../context/ContextVariableType";
import { HttpServerHelper } from "../helpers/HttpServerHelper";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { IHttpConfig } from "../models/spt/config/IHttpConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { LocalisationService } from "../services/LocalisationService";
import { ConfigServer } from "./ConfigServer";
import { DatabaseServer } from "./DatabaseServer";
import { IHttpListener } from "./http/IHttpListener";
import { WebSocketServer } from "./WebSocketServer";

@injectable()
export class HttpServer
{
    protected httpConfig: IHttpConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @injectAll("HttpListener") protected httpListeners: IHttpListener[],
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("WebSocketServer") protected webSocketServer: WebSocketServer
    )
    {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    /**
     * Handle server loading event
     */
    public load(): void
    {
        /* create server */
        const httpServer: http.Server = http.createServer((req, res) =>
        {
            this.handleRequest(req, res);
        });

        this.databaseServer.getTables().server.ip = this.httpConfig.ip;
        this.databaseServer.getTables().server.port = this.httpConfig.port;

        /* Config server to listen on a port */
        httpServer.listen(this.httpConfig.port, this.httpConfig.ip, () =>
        {
            this.logger.success(this.localisationService.getText("started_webserver_success", this.httpServerHelper.getBackendUrl()));
        });

        httpServer.on("error", (e: any) =>
        {
            /* server is already running or program using privileged port without root */
            if (process.platform === "linux" && !(process.getuid && process.getuid() === 0) && e.port < 1024)
            {
                this.logger.error(this.localisationService.getText("linux_use_priviledged_port_non_root"));
            }
            else
            {
                this.logger.error(this.localisationService.getText("port_already_in_use", e.port));
            }
        });

        // Setting up websocket
        this.webSocketServer.setupWebSocket(httpServer);
    }

    protected handleRequest(req: IncomingMessage, resp: ServerResponse): void
    {
        // Pull sessionId out of cookies and store inside app context
        const sessionId = this.getCookies(req)["PHPSESSID"];
        this.applicationContext.addValue(ContextVariableType.SESSION_ID, sessionId);

        // http.json logRequests boolean option to allow the user/server to choose to not log requests
        if (this.httpConfig.logRequests) 
        {
            this.logger.info(this.localisationService.getText("client_request", req.url));
        }
        
        for (const listener of this.httpListeners)
        {
            if (listener.canHandle(sessionId, req))
            {
                listener.handle(sessionId, req, resp);
                break;
            }
        }
    }

    protected getCookies(req: http.IncomingMessage): Record<string, string>
    {
        const found: Record<string, string> = {};
        const cookies = req.headers.cookie;

        if (cookies)
        {
            for (const cookie of cookies.split(";"))
            {
                const parts = cookie.split("=");

                found[parts.shift().trim()] = decodeURI(parts.join("="));
            }
        }

        return found;
    }
}